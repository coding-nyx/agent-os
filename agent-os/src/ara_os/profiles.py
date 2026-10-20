from __future__ import annotations

import json
import uuid

import yaml

from . import config, runtime
from .catalog import PRESETS
from .launchers import record_default_profile
from .store import Problem, change, create, get, listing, transaction, remove


def data_token(id: str) -> str:
    return config.private_file("data-token-" + id)


def resolve_model_connection(profile: dict) -> dict | None:
    owner = profile.get("_runtime_target", {})
    if owner.get("machine_id", "local") == "local" and config.coordinator_only():
        return None
    if owner.get("machine_id", "local") != "local":
        return owner.get("model_connection") or None
    # Native CLI and dashboard controls both own this file. Application metadata is
    # a display-name cache, never authority for model selection or wire protocol.
    try:
        target = runtime.home(profile) / "config.yaml"
        cfg = yaml.safe_load(target.read_text())
        if not isinstance(cfg, dict):
            return None
        m = cfg.get("model")
        model_name = (m.get("default") or m.get("model")) if isinstance(m, dict) else m
        if not isinstance(model_name, str) or not model_name.strip():
            return None
        model_name = model_name.strip()
        provider_name = m.get("provider", "native") if isinstance(m, dict) else "native"
        base_url = m.get("base_url", "") if isinstance(m, dict) else ""
        api_mode = m.get("api_mode", "chat_completions") if isinstance(m, dict) else "chat_completions"
        cached = profile.get("model_connection")
        cached = cached if isinstance(cached, dict) else {}
        same_endpoint = cached.get("model") == model_name and cached.get("base_url", "") == base_url
        same_provider = cached.get("provider") == provider_name or provider_name == "ara-connection"
        name = (cached.get("name") if same_endpoint and same_provider else None) or provider_name
        return {"name": name, "provider": provider_name, "base_url": base_url,
                "model": model_name, "api_mode": api_mode}
    except (OSError, ValueError, TypeError, yaml.YAMLError):
        # Missing/unreadable native configuration must not resurrect stale metadata.
        return None


async def provision(profile: dict):
    workspace = config.STATE / "workspaces" / profile["native_name"]
    workspace.mkdir(parents=True, exist_ok=True)
    initial = {"mcp_servers": {"ara-data": {"url": config.API_URL + "/api/v1/mcp/" + profile["id"],
        "headers": {"Authorization": "Bearer " + data_token(profile["id"])}}},
        "terminal": {"cwd": str(workspace)}, "display": {"skin": "ara"}}
    await runtime.call({"operation": "create", "profiles": [{"name": profile["native_name"], "soul": profile["soul"], "description": profile["description"], "clone_from": profile.get("clone_from"), "ara_config": initial} ]})
    target = runtime.home(profile) / "config.yaml"
    native = (yaml.safe_load(target.read_text()) or {}) if target.exists() else {}
    policy = profile.get("learning", "off")
    native.setdefault("auxiliary", {}).setdefault("background_review", {})["enabled"] = policy != "off"
    native.setdefault("memory", {})["write_approval"] = policy != "automatic"
    native.setdefault("skills", {})["write_approval"] = policy != "automatic"
    native["mcp_servers"] = {**native.get("mcp_servers", {}), "ara-data": {
        "url": config.API_URL + "/api/v1/mcp/" + profile["id"],
        "headers": {"Authorization": "Bearer " + data_token(profile["id"])}
    }}
    workspace = config.STATE / "workspaces" / profile["native_name"]
    workspace.mkdir(parents=True, exist_ok=True)
    native["terminal"] = {**native.get("terminal", {}), "cwd": str(workspace)}
    native.setdefault("display", {})["skin"] = "ara"
    skins = target.parent / "skins"; skins.mkdir(exist_ok=True)
    (skins / "ara.yaml").write_text(yaml.safe_dump({"name": "ara", "description": "ARA Agent OS",
        "branding": {"agent_name": "ARA Agent OS", "welcome": "Welcome to ARA Agent OS. Type a message or /help.",
            "goodbye": "See you in your workspace.", "response_label": " Ara ", "prompt_symbol": "❯", "help_header": "Agent OS commands"}}))
    # Templates carry no borrowed model credentials. Provider setup is explicit.
    native.setdefault("model", {"provider": "auto", "default": ""})
    target.write_text(yaml.safe_dump(native, sort_keys=False))
    target.chmod(0o600)
    with transaction() as session:
        ready = change(session, profile["id"], {"provision_state": "ready"})
    record_default_profile(config.STATE, ready)
    from .agent_configuration import apply_preset_identity
    return apply_preset_identity(ready)


async def create_profile(name: str, preset: str, soul: str | None = None, source: dict | None = None, *, node_only=False):
    if preset not in {p["id"] for p in PRESETS} | {"custom"}:
        raise Problem("unknown_preset", "Choose an installed preset or custom agent.")
    template = next((p for p in PRESETS if p["id"] == preset), PRESETS[0])
    id = str(uuid.uuid4())
    with transaction() as session:
        profile = create(session, "profile", {"name": name, "preset": preset, "description": template["role"],
            "module": template["module"], "soul": soul or template["soul"], "native_name": "ara-" + id[:8],
            "enabled": True, "bindings": [], "learning": "off", "provision_state": "pending", "owner_machine": "local",
            "configuration": dict(source.get("configuration", {})) if source else {},
            "logical_profile_id": source.get("logical_profile_id", source["id"]) if source else id,
            "clone_from": source["native_name"] if source else None}, id=id)
    try:
        if config.coordinator_only() or node_only:
            from .native_definition import digest
            from .definitions import publish
            manifest = {"contract": "ara-definition/1", "files": {"SOUL.md": profile["soul"]}, "config": {},
                "excluded": ["credentials", "memory", "sessions", "channels", "schedules", "machine paths", "tool grants"]}
            manifest["revision"] = digest(manifest)
            with transaction() as session:
                publish(session, profile, manifest, owner="definition")
                return change(session, id, {"deployments": [], "execution_placement": None, "provision_state": "definition_ready"})
        return await provision(profile)
    except Problem as exc:
        with transaction() as session:
            return change(session, id, {"provision_state": "blocked", "provision_error": exc.detail})


async def seed():
    if config.coordinator_only():
        with transaction() as session:
            if not any(m["id"] == "local" for m in listing(session, "machine")):
                create(session, "machine", {"name": "Coordinator", "role": "coordinator", "state": "local", "endpoint": config.API_URL}, id="local")
            existing_presets = {p["preset"] for p in listing(session, "profile")}
        for preset in PRESETS:
            if preset["id"] not in existing_presets:
                await create_profile(preset["name"], preset["id"])
        return
    config.RUNTIME_HOME.mkdir(parents=True, exist_ok=True)
    (config.STATE / "workspaces").mkdir(parents=True, exist_ok=True)
    if not (config.RUNTIME_HOME / "config.yaml").exists():
        (config.RUNTIME_HOME / "config.yaml").write_text(yaml.safe_dump({"model": {"provider": "auto", "default": ""}}))
    with transaction() as session:
        receipt_dir = config.STATE / "import-receipts"
        for path in receipt_dir.glob("*.json"):
            receipt = json.loads(path.read_text()); id = receipt.pop("id")
            from .store import Entity
            if session.get(Entity, id) is None:
                create(session, "profile", receipt, id=id)
            path.unlink()
        existing = listing(session, "profile")
        machines = listing(session, "machine")
        if not machines:
            create(session, "machine", {"name": "This machine", "role": "host", "state": "local", "endpoint": config.API_URL}, id="local")
    for profile in existing:
        if profile.get("provision_state") == "definition_ready":
            continue  # Node-only definitions never acquire a host runtime on restart.
        record_default_profile(config.STATE, profile)
        if not (config.STATE / ("data-token-" + profile["id"])).exists():
            await provision(profile)
        elif profile.get("provision_state") == "ready":
            from .agent_configuration import apply_preset_identity
            apply_preset_identity(profile)
    existing_presets = {p["preset"] for p in existing}
    for preset in PRESETS:
        if preset["id"] not in existing_presets:
            await create_profile(preset["name"], preset["id"])


async def set_learning(profile: dict, policy: str):
    if policy not in {"off", "review", "automatic"}:
        raise Problem("invalid_policy", "Choose off, review or automatic.")
    cfg = await runtime.native_http("GET", "/api/config", profile=profile)
    cfg = cfg.get("config", cfg)
    aux = cfg.setdefault("auxiliary", {})
    aux.setdefault("background_review", {})["enabled"] = policy != "off"
    cfg.setdefault("skills", {})["write_approval"] = policy != "automatic"
    cfg.setdefault("memory", {})["write_approval"] = policy != "automatic"
    await runtime.native_http("PUT", "/api/config", {"config": cfg, "profile": profile["native_name"]}, profile)
    with transaction() as session:
        return change(session, profile["id"], {"learning": policy})


async def delete_profile(id: str):
    import shutil
    with transaction() as session:
        profile = get(session, id, "profile")
        if profile.get("preset") == "ara":
            raise Problem("cannot_delete_orchestrator", "Ara is the system orchestrator and cannot be deleted.", 400)
        change(session, id, {"enabled": False, "pending_delete": True})
    if runtime.home(profile).is_dir():
        stopped = await runtime.call({"operation": "instance-lifecycle", "action": "stop"}, profile)
        if stopped["state"] != "stopped":
            raise Problem("native_stop_pending", "Agent paused. Native shutdown is still pending; retry deletion once its work has stopped", 409)
    with transaction() as session:
        for run in listing(session, "run"):
            if run.get("profile_id") == id:
                remove(session, run["id"], "run")
        for srun in listing(session, "swarm_run"):
            if srun.get("profile_id") == id:
                remove(session, srun["id"], "swarm_run")
        for ch in listing(session, "channel"):
            if ch.get("profile_id") == id:
                remove(session, ch["id"], "channel")
        for other in listing(session, "profile"):
            targets = other.get("delegation_targets") or []
            if id in targets:
                change(session, other["id"], {"delegation_targets": [t for t in targets if t != id]})
        remove(session, id, "profile")

    native_name = profile.get("native_name")
    if native_name:
        rt_dir = config.RUNTIME_HOME / "profiles" / native_name
        if rt_dir.exists():
            shutil.rmtree(rt_dir, ignore_errors=True)
        ws_dir = config.STATE / "workspaces" / native_name
        if ws_dir.exists():
            shutil.rmtree(ws_dir, ignore_errors=True)
    dt_file = config.STATE / f"data-token-{id}"
    if dt_file.exists():
        dt_file.unlink(missing_ok=True)

    return {"status": "deleted", "id": id, "name": profile.get("name")}


async def bind(profile: dict, bindings: list[dict]):
    if not isinstance(bindings, list) or len(bindings) > 200 or any(not isinstance(b, dict) or not isinstance(b.get("dataset_id"), str) for b in bindings):
        raise Problem("invalid_binding", "Bind a list of dataset IDs and read/write permissions.")
    if len({b["dataset_id"] for b in bindings}) != len(bindings):
        raise Problem("duplicate_binding", "Choose one permission per dataset.")
    with transaction() as session:
        has_gateway = any(c.get("profile_id") == profile["id"] and c.get("state") == "enabled" for c in listing(session, "channel"))
        for binding in bindings:
            dataset = get(session, binding["dataset_id"], "dataset")
            if dataset["module"] in {"notebook", "emotional"} and has_gateway:
                raise Problem("private_channel_scope_unverified", "Use a separate private instance for notebook access until per-channel data scoping is certified.", 409)
            if binding.get("access") not in {"read", "write"}:
                raise Problem("invalid_access", "Dataset access must be read or write.")
        return change(session, profile["id"], {"bindings": bindings})
