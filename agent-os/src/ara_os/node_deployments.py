"""Node-local deployment reconciliation and fail-closed managed-agent disablement."""
from __future__ import annotations

import asyncio
import fcntl
import hashlib
import json
import os
import re
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

import yaml

from . import config, runtime, instances


def marker(name):
    return config.STATE / "node-deployments" / (hashlib.sha256(str(name).encode()).hexdigest() + ".json")


def is_disabled(name):
    path = marker(name)
    if not path.exists():
        return False
    try:
        return json.loads(path.read_text()).get("enabled") is not True
    except (OSError, ValueError):
        return True


def authorized(name, profile_id, generation):
    try:
        record = json.loads(marker(name).read_text())
    except (OSError, ValueError):
        return False
    return (record.get("enabled") is True and record.get("profile_id") == profile_id and
            record.get("generation") == generation and record.get("state") == "active")


def save(path, value):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        os.chmod(stream.name, 0o600)
        json.dump(value, stream)
        staged = stream.name
    os.replace(staged, path)


@asynccontextmanager
async def locked(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.with_suffix(".lock").open("a") as lock:
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                await asyncio.sleep(.05)
        yield


def configure(home, binding):
    path = home / "config.yaml"
    if home.is_symlink() or path.is_symlink():
        raise ValueError("Linked native deployment configurations are not supported")
    with (home / ".ara-policy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        before = path.read_bytes()
        cfg = yaml.safe_load(before) or {}
        from .node_mcp import configuration as local_tools
        deployment = {k: binding[k] for k in ("profile_id", "enabled", "generation")}
        tools = local_tools(binding["native_name"])
        if (cfg.get("ara") or {}).get("deployment") == deployment and (cfg.get("mcp_servers") or {}).get("ara-node") == tools:
            return
        cfg.setdefault("ara", {})["deployment"] = deployment
        cfg.setdefault("mcp_servers", {})["ara-node"] = tools
        with tempfile.NamedTemporaryFile(mode="w", dir=home, delete=False) as stream:
            os.chmod(stream.name, 0o600)
            yaml.safe_dump(cfg, stream, sort_keys=False)
            staged = Path(stream.name)
        try:
            if path.read_bytes() != before:
                raise ValueError("Native configuration changed during deployment; retrying on the next poll")
            os.replace(staged, path)
        finally:
            staged.unlink(missing_ok=True)


def readiness(home):
    try:
        return _readiness(home)
    except (OSError, ValueError, TypeError, AttributeError, yaml.YAMLError):
        return {"model_configured": False, "swarm_enabled": False,
                "error": "Native profile configuration could not be read; inspect it on the execution machine"}


def _readiness(home):
    if not (home / "config.yaml").is_file():
        return {"model_configured": False, "swarm_enabled": False}
    cfg = yaml.safe_load((home / "config.yaml").read_text()) or {}
    model = cfg.get("model") or {}
    preferences = home / ".ara-preferences.json"
    context_ready = json.loads(preferences.read_text()).get("context_ready") if preferences.is_file() else None
    selected = (model.get("default") or model.get("model")) if isinstance(model, dict) else model
    selected = selected.strip() if isinstance(selected, str) else None
    return {"model_configured": bool(selected), "model_connection": {
                "model": selected, "provider": model.get("provider", "native") if isinstance(model, dict) else "native"} if selected else None,
            "swarm_enabled": (cfg.get("ara") or {}).get("swarm", {}).get("enabled") is True,
            "swarm_config": (cfg.get("ara") or {}).get("swarm", {}), "context_ready": context_ready}


def runtime_observation(status, model_configured):
    """Keep native failures visible even when model setup is also incomplete."""
    state = status["state"]
    return {"runtime_state": "setup_required" if not model_configured and state in {"running", "installed"} else state,
            "runtime_reason": status.get("reason"), "runtime_detail": status.get("detail"),
            **({"state": "error", "error": status.get("detail") or status.get("reason") or "Native runtime unavailable"}
               if state == "error" else {})}


async def revoke(bindings):
    """Persist admission revocation before slow native drain/provision operations."""
    from . import swarm_runner
    from .cua import policy as computer_policy
    for binding in bindings:
        if binding["enabled"]:
            continue
        name = binding["native_name"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
            continue
        path = marker(name)
        previous = json.loads(path.read_text()) if path.exists() else {}
        if previous.get("profile_id") not in {None, binding["profile_id"]}:
            continue
        row = instances.by_name(name)
        if not previous and (not row or row.get("logical_agent_id") != binding["profile_id"]):
            continue  # A desired tombstone cannot adopt an unrelated standalone agent.
        if previous.get("generation") == binding["generation"] and previous.get("runtime_state") == "stopped":
            continue
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        metadata = {k: v for k, v in binding.items() if k != "definition"}
        save(path, {**previous, **metadata, "enabled": False, "state": "disabled", "runtime_state": "stopping"})
        if row:
            instances.write(row["instance_id"], {"enabled": False, "generation": binding["generation"], "state": "stopping"})
        for task in swarm_runner.journal().pending():
            if task["request"].get("native_name") == name:
                swarm_runner.journal().cancel(task["id"])
        computer_policy.update({})
        if runtime.home({"native_name": name}).is_dir():
            try:
                state = await runtime.call({"operation": "instance-lifecycle", "action": "stop"}, {"native_name": name})
                if row:
                    instances.write(row["instance_id"], {"state": state["state"]})
                save(path, {**previous, **metadata, "enabled": False, "state": "disabled", "runtime_state": state["state"]})
            except Exception:
                pass  # Keep stopping visible and retry; never claim an unconfirmed stop.


async def reconcile(bindings, *, provision=True):
    from .swarm_policy import DEFAULTS
    from .native_definition import apply, status as definition_status
    receipts = []
    offered = {b["native_name"] for b in bindings}
    bindings = list(bindings)
    for path in (config.STATE / "node-deployments").glob("*.json"):
        record = json.loads(path.read_text())
        if record.get("native_name") not in offered and record.get("enabled"):
            bindings.append({**record, "enabled": False,
                "generation": hashlib.sha256((record["generation"] + ":removed").encode()).hexdigest()})
    await revoke(bindings)
    for binding in sorted(bindings, key=lambda b: bool(b["enabled"])):
        name = binding["native_name"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
            raise ValueError("Invalid deployed native profile name")
        path, home = marker(name), runtime.home({"native_name": name})
        if not binding["enabled"]:
            previous = json.loads(path.read_text()) if path.exists() else {}
            receipts.append({**{k: binding[k] for k in ("profile_id", "native_name", "instance_id", "generation")},
                **readiness(home), "state": "disabled", "runtime_state": previous.get("runtime_state", "stopping")})
            continue
        if not provision:
            continue
        async with locked(path):
            previous = json.loads(path.read_text()) if path.exists() else {}
            result = {k: binding[k] for k in ("profile_id", "native_name", "instance_id", "generation")}
            try:
                if previous.get("profile_id") not in {None, binding["profile_id"]}:
                    raise ValueError("This native profile belongs to another agent")
                registered = instances.by_name(name)
                if registered:
                    result["owner_epoch"] = registered.get("owner_epoch")
                if registered and registered.get("local_paused"):
                    result.update(state="disabled", runtime_state="paused", error="Paused by the node operator; start it locally to resume")
                    receipts.append(result)
                    continue
                if registered and registered["instance_id"] != binding["instance_id"]:
                    raise ValueError("Existing standalone instance requires explicit adoption by instance ID")
                manifest = binding.get("definition")
                if not manifest:
                    if home.is_dir() and previous.get("profile_id") == binding["profile_id"]:
                        # Upgrade a previously managed native owner without
                        # fabricating its definition from the coordinator's seed.
                        row = instances.register(name, id=binding["instance_id"], logical_agent_id=binding["profile_id"],
                            machine_id=binding.get("machine_id"), enabled=True)
                        instances.write(row["instance_id"], {"generation": binding["generation"]})
                        state = await runtime.call({"operation": "instance-lifecycle", "action": "status"}, {"native_name": name})
                        result.update(state="active", owner_epoch=row["owner_epoch"], runtime_state=state["state"],
                            definition_sync={"state": "unpublished"}, **readiness(home))
                        result.update(runtime_observation(state, result["model_configured"]))
                        save(path, {**result, "enabled": True})
                        receipts.append(result)
                        continue
                    raise ValueError("Publish the agent definition before deploying this instance")
                if (previous.get("generation") == binding["generation"] and previous.get("enabled") and
                        (previous.get("definition_revision") == manifest["revision"] or
                         (previous.get("definition_sync") or {}).get("offered_revision") == manifest["revision"]) and home.is_dir()):
                    result.update({k: previous.get(k) for k in ("definition_revision", "definition_sync", "runtime_state")})
                    result.update(state="active", **readiness(home))
                    await asyncio.to_thread(configure, home, binding)
                    status = await runtime.call({"operation": "instance-lifecycle", "action": "status"}, {"native_name": name})
                    result.update(runtime_observation(status, result["model_configured"]))
                    if (result.get("definition_sync") or {}).get("state") != "conflict":
                        result["definition_sync"] = await asyncio.to_thread(definition_status, home) or result.get("definition_sync")
                    receipts.append(result)
                    continue
                new = not home.is_dir()
                if not new and not previous and not registered:
                    raise ValueError("An existing native profile needs explicit adoption; deploy under a new native name")
                save(path, {**result, "enabled": False, "state": "pending"})
                row = instances.register(name, id=binding["instance_id"], logical_agent_id=binding["profile_id"],
                    machine_id=binding.get("machine_id"), enabled=False)
                result["owner_epoch"] = row["owner_epoch"]
                instances.write(row["instance_id"], {"generation": binding["generation"], "state": "installed"})
                if new:
                    workspace = config.STATE / "workspaces" / name
                    workspace.mkdir(parents=True, exist_ok=True)
                    async with asyncio.timeout(90):
                        await runtime.call({"operation": "create", "profiles": [{"name": name, "start_paused": True,
                            "soul": manifest["files"].get("SOUL.md", "Work within explicit grants."),
                            "description": binding.get("description", "Deployed ARA agent"),
                            "ara_config": {"terminal": {"backend": "local", "cwd": str(workspace)}, "ara": {"swarm": dict(DEFAULTS)}}}]})
                sync = await asyncio.to_thread(apply, home, manifest, initial=new)
                result.update(definition_sync=sync, definition_revision=sync.get("revision"))
                if sync["state"] == "conflict":
                    result["error"] = "Definition has local edits to review: " + ", ".join(sync["conflicts"])[:500]
                await asyncio.to_thread(configure, home, binding)
                current = json.loads(path.read_text())
                if current.get("generation") != binding["generation"]:
                    raise ValueError("Deployment changed during provisioning; waiting for its latest generation")
                result.update(state="active", **readiness(home))
                state = await runtime.call({"operation": "instance-lifecycle", "action": "start"}, {"native_name": name})
                current = json.loads(path.read_text())
                if current.get("generation") != binding["generation"]:
                    await runtime.call({"operation": "instance-lifecycle", "action": "stop"}, {"native_name": name})
                    raise ValueError("Deployment revoked while native runtime was starting")
                result.update(runtime_observation(state, result["model_configured"]))
                save(path, {**result, "enabled": True})
                instances.write(row["instance_id"], {"enabled": True, "state": result["runtime_state"],
                    "definition_revision": result.get("definition_revision"), "generation": binding["generation"]})
            except Exception as exc:
                result.update(state="error", runtime_state="error", error=getattr(exc, "detail", str(exc))[:1000])
                current = json.loads(path.read_text()) if path.exists() else previous
                if current.get("profile_id") in {None, binding["profile_id"]} and current.get("generation") in {None, binding["generation"]}:
                    save(path, {**result, "enabled": False, "attempted": time.time()})
                    registered = instances.by_name(name)
                    if registered and registered.get("logical_agent_id") == binding["profile_id"]:
                        instances.write(registered["instance_id"], {"enabled": False, "state": "error"})
            receipts.append(result)
    return [r for r in receipts if r["native_name"] in offered]
