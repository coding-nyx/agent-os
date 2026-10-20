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

from . import config, runtime


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
        cfg.setdefault("ara", {})["deployment"] = {k: binding[k] for k in ("profile_id", "enabled", "generation")}
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
    if not (home / "config.yaml").is_file():
        return {"model_configured": False, "swarm_enabled": False}
    cfg = yaml.safe_load((home / "config.yaml").read_text()) or {}
    model = cfg.get("model") or {}
    return {"model_configured": bool(model.get("default")) if isinstance(model, dict) else bool(model),
            "swarm_enabled": (cfg.get("ara") or {}).get("swarm", {}).get("enabled") is True}


async def reconcile(bindings):
    from . import swarm_runner
    from .cua import policy as computer_policy
    from .swarm_policy import DEFAULTS
    receipts = []
    # Apply stops before provisioning work for any other selected agent.
    for binding in sorted(bindings, key=lambda b: bool(b["enabled"])):
        name = binding["native_name"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
            raise ValueError("Invalid deployed native profile name")
        path = marker(name)
        home = runtime.home({"native_name": name})
        async with locked(path):
            previous = json.loads(path.read_text()) if path.exists() else {}
            result = {"profile_id": binding["profile_id"], "generation": binding.get("generation", "legacy")}
            try:
                if previous.get("profile_id") not in {None, binding["profile_id"]}:
                    raise ValueError("This node profile belongs to another agent; choose a different native name")
                current = (previous.get("generation") == result["generation"] and
                           previous.get("enabled") is binding["enabled"] and
                           previous.get("state") in {"active", "disabled"})
                if current and (not binding["enabled"] or home.is_dir()):
                    receipts.append({**result, "state": previous["state"], **readiness(home)})
                    continue
                if previous.get("state") == "error" and previous.get("generation") == result["generation"] and previous.get("attempted", 0) > time.time() - 30:
                    receipts.append({**result, "state": "error", "error": previous.get("error")})
                    continue
                # Admission is disabled durably before touching native configuration.
                save(path, {**result, "enabled": False, "state": "pending"})
                if not binding["enabled"]:
                    for task in swarm_runner.journal().pending():
                        if task["request"].get("native_name") == name:
                            swarm_runner.journal().cancel(task["id"])
                    computer_policy.update({})  # Interrupt pending managed desktop operations.
                    if home.is_dir():
                        configure(home, binding)
                    result.update(state="disabled", **readiness(home))
                else:
                    if not home.is_dir():
                        workspace = config.STATE / "workspaces" / name
                        workspace.mkdir(parents=True, exist_ok=True)
                        async with asyncio.timeout(60):
                            await runtime.call({"operation": "create", "profiles": [{"name": name,
                                "soul": binding.get("soul") or "Work within explicit task and tool grants.",
                                "description": binding.get("description") or "Deployed ARA agent",
                                "ara_config": {"terminal": {"backend": "local", "cwd": str(workspace)},
                                               "ara": {"swarm": dict(DEFAULTS)}}}]})
                    configure(home, binding)
                    result.update(state="active", **readiness(home))
                save(path, {**result, "enabled": binding["enabled"]})
            except Exception as exc:
                result.update(state="error", error=getattr(exc, "detail", str(exc))[:1000])
                # Preserve ownership on collisions; never disable another agent.
                if previous.get("profile_id") in {None, binding["profile_id"]}:
                    save(path, {**result, "enabled": False, "attempted": time.time()})
            receipts.append(result)
    return receipts
