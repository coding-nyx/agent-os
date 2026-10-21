from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from . import __version__, config, domains, mcp, profiles, runs, runtime
from .catalog import MODULES, PRESETS
from .store import Entity, Event, Problem, change, create, engine, event, get, initialize, listing, transaction, wire, remove

log = logging.getLogger("ara")
runtime_machine = ContextVar("runtime_machine", default=None)


@asynccontextmanager
async def lifespan(app):
    app.state.ready = False

    async def prepare():
        while not app.state.ready:
            try:
                await asyncio.to_thread(initialize)
                await profiles.seed()
                app.state.ready = True
            except SQLAlchemyError:
                log.warning("PostgreSQL unavailable; retrying initialization in five seconds")
                await asyncio.sleep(5)
            except Problem as exc:
                app.state.initialization_error = {"code": exc.code, "detail": exc.detail}
                log.error("Initialization needs intervention: %s", exc.code)
                return
            except Exception:
                app.state.initialization_error = {"code": "initialization_failed", "detail": "Inspect the local service logs before retrying setup."}
                log.exception("Initialization failed")
                return

    preparation = asyncio.create_task(prepare())
    from .swarms import supervise
    supervisor = asyncio.create_task(supervise())
    # Keep static UI and diagnostics reachable while storage recovers.
    yield
    preparation.cancel()
    supervisor.cancel()
    tasks = list(runs.TASKS.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(preparation, supervisor, *tasks, return_exceptions=True)


app = FastAPI(title="ARA Agent OS", version=__version__, lifespan=lifespan)


@app.exception_handler(Problem)
async def problem_handler(request, exc):
    return JSONResponse({"error": {"code": exc.code, "detail": exc.detail, "action": exc.action}}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse({"error": {"code": "validation_error", "detail": "; ".join(e["msg"] for e in exc.errors())}}, status_code=422)


@app.exception_handler(IntegrityError)
async def conflict_handler(request, exc):
    return JSONResponse({"error": {"code": "concurrent_operation", "detail": "This item changed concurrently. Reload or retry with the same operation ID."}}, status_code=409)


@app.exception_handler(SQLAlchemyError)
async def storage_handler(request, exc):
    log.exception("Storage operation failed")
    return JSONResponse({"error": {"code": "storage_unavailable", "detail": "Storage is unavailable. This operation has not been confirmed saved."}}, status_code=503)


@app.middleware("http")
async def boundary(request: Request, call_next):
    if not trusted_host(request.headers.get("host", "")):
        return JSONResponse({"error": {"code": "untrusted_host", "detail": "Use the configured Agent OS address."}}, 403)
    origin = request.headers.get("origin", "")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        from urllib.parse import urlsplit
        if urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"error": {"code": "origin_mismatch", "detail": "Use the connected Agent OS application to change state."}}, 403)
    if request.url.path.startswith("/api/v1/cua/") and request.url.path != "/api/v1/cua/session":
        expected = "Bearer " + config.private_file("computer-operator-token")
        if not hmac.compare_digest(request.headers.get("authorization", ""), expected):
            return JSONResponse({"error": {"code": "computer_auth_required", "detail": "Open System Control in the local dashboard."}}, 401)
    scope_token = runtime_machine.set(request.query_params.get("machine_id"))
    try:
        response = await call_next(request)
    except Exception:
        id = uuid.uuid4().hex[:12]
        log.exception("Unhandled operation %s", id)
        return JSONResponse({"error": {"code": "unexpected_failure", "detail": "This operation stopped unexpectedly. Existing data is retained.", "reference": id}}, 500)
    finally:
        runtime_machine.reset(scope_token)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/v1/cua/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def is_network_exposed():
    import ipaddress
    bind = os.environ.get("ARA_HOST")
    if bind:
        if bind.lower() == "localhost":
            return False
        try:
            return not ipaddress.ip_address(bind).is_loopback
        except ValueError:
            return True
    try:
        net_file = config.STATE / "network.json"
        if net_file.is_file():
            return bool(json.loads(net_file.read_text()).get("exposed", False))
    except Exception:
        pass
    return False


def trusted_host(value):
    from urllib.parse import urlsplit
    import ipaddress
    try:
        host = urlsplit("//" + value).hostname
        if not host:
            return False
        if host in {"localhost", "127.0.0.1", "::1", urlsplit(config.API_URL).hostname}:
            return True
        if is_network_exposed():
            if host.endswith(".ts.net") or host.endswith(".local"):
                return True
            try:
                ip = ipaddress.ip_address(host)
                if ip.is_loopback or ip.is_private or ip in ipaddress.ip_network("100.64.0.0/10"):
                    return True
            except ValueError:
                pass
        return False
    except ValueError:
        return False


class DatasetBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    module: str
    schema_: dict | None = Field(default=None, alias="schema")


class RecordBody(BaseModel):
    payload: dict
    operation_id: str = Field(min_length=1, max_length=120)


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    preset: str = "ara"
    soul: str | None = Field(default=None, max_length=100000)
    machine_ids: list[str] | None = Field(default=None, max_length=128)


class PatchBody(BaseModel):
    values: dict
    revision: int = Field(ge=1, le=2147483647)


def find(id, kind=None):
    with transaction() as session:
        return get(session, id, kind)


def runtime_profile(id):
    from .runtime_commands import selected
    return selected(find(id, "profile"), runtime_machine.get())


@app.get("/api/v1/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        database = "ready"
    except SQLAlchemyError:
        database = "unavailable"
    ready = bool(getattr(app.state, "ready", False))
    return JSONResponse({"product": "ARA Agent OS", "version": __version__, "database": database,
            "runtime": "installed" if config.RUNTIME_PYTHON.exists() else "missing", "local_only": not is_network_exposed(),
            "ready": ready, "initialization_error": getattr(app.state, "initialization_error", None)}, status_code=200 if ready and database == "ready" else 503)


@app.get("/api/v1/capabilities")
def capabilities():
    return {"api_version": 1, "modules": [m["id"] for m in MODULES], "native_runtime": config.RUNTIME_PYTHON.exists(),
            "voice": {"capture": "browser_and_native_stt", "playback": "browser_or_native_tts"},
            "profile_import": {"node": ["native", "openclaw"], "web": False},
            "concurrent_instances": "isolated_native_homes", "remote_channel_bridge": "not_certified",
            "provider_oauth": "native_flows", "scope": "single_user_local_prototype"}


@app.get("/api/v1/catalog")
def catalog():
    return {"modules": MODULES, "presets": PRESETS}


@app.get("/api/v1/network/status")
def network_status(request: Request):
    import socket
    import subprocess
    import shutil
    net_file = config.STATE / "network.json"
    configured_exposed = False
    if net_file.is_file():
        try:
            configured_exposed = bool(json.loads(net_file.read_text()).get("exposed", False))
        except Exception:
            pass
    current_host = os.environ.get("ARA_HOST", "0.0.0.0" if configured_exposed else "127.0.0.1")
    is_exposed = current_host in {"0.0.0.0", "::"} or configured_exposed
    port = request.url.port or 8787
    localhost_url = f"http://127.0.0.1:{port}"
    lan_ip = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    lan_url = f"http://{lan_ip}:{port}" if lan_ip else None
    ts_info = {"available": False}
    ts_bin = shutil.which("tailscale")
    if ts_bin:
        try:
            out = subprocess.check_output([ts_bin, "status", "--json"], text=True, timeout=2)
            data = json.loads(out)
            self_node = data.get("Self", {})
            ips = self_node.get("TailscaleIPs", [])
            ts_ip = ips[0] if ips else None
            dns_name = self_node.get("DNSName", "").rstrip(".")
            ts_info = {
                "available": True,
                "ip": ts_ip,
                "node_name": self_node.get("HostName"),
                "dns_name": dns_name,
                "online": self_node.get("Online", True),
                "url": f"http://{ts_ip}:{port}" if ts_ip else None,
                "magic_dns_url": f"http://{dns_name}:{port}" if dns_name else None
            }
        except Exception as e:
            ts_info = {"available": False, "error": str(e)}
    return {
        "exposed": is_exposed,
        "configured_exposed": configured_exposed,
        "bind_host": current_host,
        "port": port,
        "endpoints": {
            "localhost": localhost_url,
            "lan": lan_url,
            "tailscale": ts_info.get("url"),
            "tailscale_dns": ts_info.get("magic_dns_url")
        },
        "lan_ip": lan_ip,
        "tailscale": ts_info
    }


@app.post("/api/v1/network/toggle")
def toggle_network(body: dict):
    exposed = bool(body.get("exposed", False))
    net_file = config.STATE / "network.json"
    net_file.parent.mkdir(parents=True, exist_ok=True)
    net_file.write_text(json.dumps({
        "exposed": exposed,
        "host": "0.0.0.0" if exposed else "127.0.0.1",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }, indent=2))
    os.environ["ARA_HOST"] = "0.0.0.0" if exposed else "127.0.0.1"
    return {
        "exposed": exposed,
        "host": "0.0.0.0" if exposed else "127.0.0.1",
        "message": "Network exposure setting saved. Server will bind to " + ("0.0.0.0 (all interfaces including Tailscale and LAN)" if exposed else "127.0.0.1 (local loopback only)") + "."
    }


def enrich_profile(p: dict) -> dict:
    from . import swarms
    from .runtime_commands import selected
    selection_error = None
    if "_runtime_target" not in p:
        try:
            p = selected(p)
        except Problem as exc:
            selection_error = exc.detail
    conn = profiles.resolve_model_connection(p)
    spec = next((s for s in PRESETS if s["id"] == p["preset"]), None)
    values = {**{f["id"]: f["default"] for f in spec["fields"]}, **p.get("configuration", {})} if spec else {}
    context_ready = bool(spec and not any(f["required"] and values.get(f["id"]) in (None, "") for f in spec["fields"]))
    native_context = p.get("_runtime_target", {}).get("context_ready")
    if p.get("_runtime_target", {}).get("machine_id", "local") == "local":
        path = runtime.home(p) / ".ara-preferences.json"
        if path.is_file():
            native_context = json.loads(path.read_text()).get("context_ready")
    if native_context is not None:
        context_ready = native_context is True
    owner = p.get("_runtime_target", {})
    remote = owner.get("machine_id", "local") != "local"
    available = (owner.get("online") and owner.get("deployment_state") == "active" and owner.get("runtime_state") == "running") if remote else p.get("provision_state") == "ready"
    return {**p, "model_connection": conn, "runtime_error": selection_error,
            "model_ready": bool(conn), "chat_ready": bool(conn and p.get("enabled") and available and not selection_error),
            "preset_spec": spec, "context_ready": context_ready,
            "swarms": swarms.get_profile_swarm_config(p),
            "retired_preset": p["preset"] not in {s["id"] for s in PRESETS} | {"custom"}}


@app.get("/api/v1/dashboard")
def dashboard():
    with transaction() as session:
        ps, ds, rs = [enrich_profile(p) for p in listing(session, "profile")], domains.datasets(session), listing(session, "run")
        return {"version": __version__, "role": "coordinator" if config.coordinator_only() else "host", "profiles": ps, "datasets": [{**d, "summary": domains.summary(session, d["id"])} for d in ds],
                "runs": [runs.view(r) for r in rs[-20:][::-1]], "machines": listing(session, "machine"),
                "waiting": [runs.view(r) for r in rs if r["state"] in {"waiting", "unknown", "failed"}]}


@app.get("/api/v1/datasets")
def list_datasets():
    with transaction() as session:
        return domains.datasets(session)


@app.post("/api/v1/datasets", status_code=201)
def create_dataset(body: DatasetBody):
    with transaction() as session:
        return domains.make_dataset(session, body.name, body.module, body.schema_)


@app.get("/api/v1/datasets/{id}")
def dataset_detail(id: str):
    with transaction() as session:
        return {**get(session, id, "dataset"), "summary": domains.summary(session, id), "records": domains.records(session, id)}


@app.patch("/api/v1/datasets/{id}")
def dataset_patch(id: str, body: PatchBody):
    if set(body.values) - {"name", "archived"}:
        raise Problem("invalid_change", "Use module migrations for data schema changes.")
    if "archived" in body.values and not isinstance(body.values["archived"], bool):
        raise Problem("invalid_change", "Archived must be true or false.")
    with transaction() as session:
        get(session, id, "dataset")
        return change(session, id, body.values, body.revision)


@app.post("/api/v1/datasets/{id}/records", status_code=201)
def add_record(id: str, body: RecordBody):
    with transaction() as session:
        return domains.add_record(session, id, body.payload, body.operation_id)


@app.patch("/api/v1/records/{id}")
def edit_record(id: str, body: PatchBody):
    with transaction() as session:
        return domains.update_record(session, id, body.values, body.revision)


@app.get("/api/v1/datasets/{id}/export")
def export_dataset(id: str):
    data = dataset_detail(id)
    return JSONResponse({"format": "ara-dataset-v1", "dataset": data}, headers={"Content-Disposition": 'attachment; filename="ara-dataset.json"'})


@app.post("/api/v1/datasets/{id}/import")
def import_records(id: str, body: dict):
    rows = body.get("records", [])
    if not isinstance(rows, list) or len(rows) > 1000:
        raise Problem("invalid_import", "Import at most 1,000 records at a time.")
    if any(not isinstance(row, dict) for row in rows):
        raise Problem("invalid_import", "Each imported record must be an object.")
    with transaction() as session:
        result = [domains.add_record(session, id, row.get("payload", row), "import:" + hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()) for row in rows]
    return {"saved": len(result), "records": result}


@app.get("/api/v1/profiles")
def list_profiles():
    with transaction() as session:
        return [enrich_profile(p) for p in listing(session, "profile")]


@app.post("/api/v1/profiles", status_code=201)
async def new_profile(body: ProfileBody):
    profile = await profiles.create_profile(body.name, body.preset, body.soul, node_only=bool(body.machine_ids and "local" not in body.machine_ids))
    if body.machine_ids:
        from .deployments import update
        with transaction() as session:
            update(session, profile["id"], {"action": "deploy", "machine_ids": body.machine_ids})
            profile = get(session, profile["id"], "profile")
    return enrich_profile(profile)


@app.get("/api/v1/profiles/{id}/configuration")
async def profile_configuration(id: str):
    profile = runtime_profile(id)
    return await runtime.call({"operation": "instance-preferences", "profile": {
        k: profile.get(k) for k in ("preset", "name", "configuration")}}, profile)


@app.put("/api/v1/profiles/{id}/configuration")
async def update_profile_configuration(id: str, body: dict):
    profile = runtime_profile(id)
    return await runtime.call({"operation": "instance-preferences", "write": True, "body": body,
        "profile": {k: profile.get(k) for k in ("preset", "name", "configuration")}}, profile)


@app.get("/api/v1/swarms/presets")
def swarm_presets():
    from . import swarms
    return swarms.SWARM_PRESETS


@app.get("/api/v1/profiles/{id}/swarms")
async def profile_swarms(id: str):
    from . import swarms
    from .deployments import describe
    profile = runtime_profile(id)
    cfg = await runtime.call({"operation": "instance-swarm"}, profile)
    owner = profile["_runtime_target"]
    with transaction() as session:
        policy_id = "instance-policy:" + owner["instance_id"]
        row = session.get(Entity, policy_id)
        if row:
            row.data = {"config": cfg, "generation": owner["generation"]}
        else:
            session.add(Entity(id=policy_id, kind="instance_policy", data={"config": cfg, "generation": owner["generation"]}))
        return {"config": cfg, "presets": swarms.SWARM_PRESETS,
            "runs": [r for r in swarms.list_swarms_for_profile(session, id) if r.get("owner_machine", "local") == owner["machine_id"]],
            "deployments": describe(session, profile)}


@app.put("/api/v1/profiles/{id}/swarms")
async def update_profile_swarms(id: str, body: dict):
    from . import swarms
    profile = runtime_profile(id)
    cfg = await runtime.call({"operation": "instance-swarm", "write": True, "config": body}, profile)
    asset = await runtime.call({"operation": "instance-asset", "path": "SOUL.md"}, profile)
    await runtime.call({"operation": "instance-asset", "path": "SOUL.md", "write": True,
        "hash": asset["hash"], "content": swarms.identity_with_swarms(asset["content"], cfg)}, profile)
    return cfg


@app.post("/api/v1/profiles/{id}/swarms/spawn")
async def spawn_profile_swarm(id: str, body: dict):
    import uuid
    from . import swarms
    with transaction() as session:
        return swarms.spawn_swarm(
            session=session,
            profile_id=id,
            conversation_id=body.get("conversation_id"),
            preset=body.get("preset", "research"),
            task=body.get("task", ""),
            operation_id=body.get("operation_id"),
            custom_roles=body.get("custom_roles"), machine_id=body.get("machine_id") or runtime_machine.get()
        )


@app.get("/api/v1/swarms/{swarm_id}")
def get_swarm(swarm_id: str):
    with transaction() as session:
        return get(session, swarm_id, "swarm_run")


@app.post("/api/v1/swarms/{swarm_id}/cancel")
def cancel_swarm(swarm_id: str):
    from .task_journal import TERMINAL
    with transaction() as session:
        record = get(session, swarm_id, "swarm_run")
        if record["state"] in TERMINAL:
            return record
        return change(session, swarm_id, {"cancel_requested": True})


@app.put("/api/v1/profiles/{id}/placement")
def profile_placement(id: str, body: dict):
    from .node_execution import placement
    from .deployments import active
    with transaction() as session:
        before = bool(active(get(session, id, "profile"), "local"))
        result = placement(session, id, body)
        local_changed = before != bool(active(result, "local"))
    if local_changed:
        from .cua import policy
        policy.update({})
    return result


@app.get("/api/v1/profiles/{id}/definition")
def profile_definition(id: str):
    from .definitions import current
    with transaction() as session:
        value = current(session, get(session, id, "profile"))
    return {"revision": value["manifest"]["revision"] if value else None,
            "owner_machine": value["owner_machine"] if value else None,
            "excluded": value["manifest"].get("excluded", []) if value else []}


@app.post("/api/v1/profiles/{id}/definition/publish")
async def publish_profile_definition(id: str, body: dict):
    from .definitions import publish
    profile = runtime_profile(id)
    manifest = await runtime.call({"operation": "definition-capture"}, profile)
    with transaction() as session:
        value = publish(session, profile, manifest, expected=body.get("revision"), owner=profile["_runtime_target"]["machine_id"])
    return {"revision": value["manifest"]["revision"], "owner_machine": value["owner_machine"]}


@app.post("/api/v1/profiles/{id}/definition/preview")
async def preview_profile_definition(id: str):
    from .definitions import current
    profile = runtime_profile(id)
    with transaction() as session:
        value = current(session, profile)
    if not value:
        raise Problem("definition_missing", "Publish a definition first", 409)
    return await runtime.call({"operation": "definition-preview", "definition": value["manifest"]}, profile)


@app.post("/api/v1/profiles/{id}/definition/apply")
async def apply_profile_definition(id: str, body: dict):
    from .definitions import current
    profile = runtime_profile(id)
    with transaction() as session:
        value = current(session, profile)
    if not value or body.get("published_revision") != value["manifest"]["revision"]:
        raise Problem("definition_conflict", "The published definition changed; preview it again", 409)
    return await runtime.call({"operation": "definition-apply", "definition": value["manifest"],
        "local_revision": body.get("local_revision")}, profile)


@app.get("/api/v1/profiles/{id}/deployments")
def profile_deployments(id: str):
    from .deployments import describe
    with transaction() as session:
        return describe(session, get(session, id, "profile"))


@app.get("/api/v1/profiles/{id}/runtime")
async def profile_runtime_status(id: str):
    profile = runtime_profile(id)
    return await runtime.call({"operation": "instance-lifecycle", "action": "status"}, profile)


@app.post("/api/v1/profiles/{id}/runtime/start")
async def start_profile_runtime(id: str):
    profile = runtime_profile(id)
    return await runtime.call({"operation": "instance-lifecycle", "action": "start"}, profile)


@app.post("/api/v1/profiles/{id}/deployments")
async def update_profile_deployments(id: str, body: dict):
    from .deployments import update, active
    with transaction() as session:
        before = bool(active(get(session, id, "profile"), "local"))
        result = update(session, id, body)
        local_changed = before != bool(active(get(session, id, "profile"), "local"))
    if local_changed:
        from .cua import policy
        policy.update({})
        profile = find(id, "profile")
        local_enabled = bool(active(profile, "local"))
        if runtime.home(profile).is_dir():
            await runtime.call({"operation": "instance-lifecycle", "action": "start" if local_enabled else "stop"}, profile)
    return result


@app.get("/api/v1/deployments")
def all_deployments():
    from .deployments import describe
    with transaction() as session:
        machines = {m["id"]: m for m in listing(session, "machine")}
        result = [describe(session, p, machines) for p in listing(session, "profile")]
        for item in result:
            item["machines"] = [m for m in item["machines"] if m["state"] != "not_deployed"]
        return result


@app.get("/api/v1/profiles/{id}")
def profile_detail(id: str):
    profile = find(id, "profile")
    if runtime_machine.get():
        profile = runtime_profile(id)
    return enrich_profile(profile)


@app.patch("/api/v1/profiles/{id}")
async def profile_patch(id: str, body: PatchBody):
    if set(body.values) - {"name", "enabled", "description"}:
        raise Problem("invalid_profile_change", "Use dedicated profile controls for connections and bindings.")
    if "enabled" in body.values and not isinstance(body.values["enabled"], bool):
        raise Problem("invalid_profile_change", "Enabled must be true or false.")
    profile = find(id, "profile")
    if profile["revision"] != body.revision:
        raise Problem("revision_conflict", "This profile changed. Reload before applying lifecycle changes.", 409)
    if body.values.get("enabled") is False:
        from .cua import policy
        grants = policy.read()["grants"]
        if id in grants:
            policy.update({"grants": {key: value for key, value in grants.items() if key != id}})
    if "enabled" in body.values and runtime.home(profile).is_dir():
        await runtime.call({"operation": "instance-lifecycle", "action": "start" if body.values["enabled"] else "stop"}, profile)
    with transaction() as session:
        return change(session, id, body.values, body.revision)


@app.delete("/api/v1/profiles/{id}")
async def profile_delete(id: str):
    return await profiles.delete_profile(id)


@app.get("/api/v1/profiles/{id}/instances")
def instances(id: str):
    profile = find(id, "profile")
    logical = profile.get("logical_profile_id", profile["id"])
    with transaction() as session:
        return [p for p in listing(session, "profile") if p.get("logical_profile_id", p["id"]) == logical]


@app.post("/api/v1/profiles/{id}/instances", status_code=201)
async def new_instance(id: str, body: dict):
    from .definitions import current, publish
    from .deployments import update
    source = runtime_profile(id)
    preferences = await runtime.call({"operation": "instance-preferences", "profile": {
        k: source.get(k) for k in ("preset", "name", "configuration")}}, source)
    manifest = await runtime.call({"operation": "definition-capture"}, source)
    if preferences["identity_hash"] != hashlib.sha256(manifest["files"].get("SOUL.md", "").encode()).hexdigest():
        raise Problem("asset_conflict", "The source identity changed while copying. Reload before creating an instance.", 409)
    source = {**source, "configuration": preferences["values"]}
    clone = await profiles.create_profile(str(body.get("name", source["name"] + " instance"))[:100],
        source["preset"], manifest["files"].get("SOUL.md"), source, node_only=source["_runtime_target"]["machine_id"] != "local")
    with transaction() as session:
        baseline = current(session, clone)
        publish(session, clone, manifest, expected=baseline["manifest"]["revision"] if baseline else None, owner=source["_runtime_target"]["machine_id"])
        update(session, clone["id"], {"action": "deploy", "machine_ids": [source["_runtime_target"]["machine_id"]]})
        return get(session, clone["id"], "profile")


@app.get("/api/v1/profiles/{id}/export")
async def profile_export(id: str):
    import base64
    from starlette.background import BackgroundTask
    profile = runtime_profile(id)
    directory = config.STATE / "exports"; directory.mkdir(exist_ok=True, mode=0o700)
    path = directory / (uuid.uuid4().hex + ".tar.gz")
    digest, size, receipt = hashlib.sha256(), 0, None
    try:
        with path.open("xb") as output:
            path.chmod(0o600)
            async for frame in runtime.frames({"operation": "instance-export"}, profile):
                if frame["type"] in {"error", "unknown"}:
                    raise Problem("export_unconfirmed", "The owning node did not confirm a coherent export", 409)
                if frame["type"] == "event" and frame["data"].get("type") == "artifact.chunk":
                    chunk = base64.b64decode(frame["data"]["payload"]["data"], validate=True)
                    size += len(chunk)
                    if size > 32_000_000:
                        raise Problem("export_too_large", "Use native node tools for exports larger than 32 MB", 413)
                    digest.update(chunk); output.write(chunk)
                elif frame["type"] == "result":
                    receipt = frame["data"]
        if not receipt or receipt.get("bytes") != size or receipt.get("sha256") != digest.hexdigest():
            raise Problem("export_integrity", "Native export receipt did not match the downloaded artifact", 409)
        return FileResponse(path, filename=profile["native_name"] + ".tar.gz", background=BackgroundTask(path.unlink, missing_ok=True))
    except BaseException:
        path.unlink(missing_ok=True)
        raise


@app.post("/api/v1/profiles/{id}/retry-setup")
async def retry_setup(id: str):
    return await profiles.provision(find(id, "profile"))


@app.put("/api/v1/profiles/{id}/bindings")
async def set_bindings(id: str, body: dict):
    return await profiles.bind(find(id, "profile"), body.get("bindings", []))


@app.put("/api/v1/profiles/{id}/learning")
async def learning(id: str, body: dict):
    return await profiles.set_learning(runtime_profile(id), body.get("policy", "off"))


@app.api_route("/api/v1/profiles/{id}/pending/{subsystem}", methods=["GET", "POST"])
async def pending_review(id: str, subsystem: str, request: Request):
    if subsystem not in {"memory", "skills"}:
        raise Problem("unknown_review", "Choose memory or skills.", 404)
    body = await request.json() if request.method == "POST" else {}
    if request.method == "POST" and (set(body) - {"action", "id", "hash"} or body.get("action") not in {"approve", "reject"} or not body.get("id") or not body.get("hash")):
        raise Problem("invalid_review", "Review one pending change with its current hash.")
    result = await runtime.call({"operation": "pending-review", "subsystem": subsystem, **body}, runtime_profile(id))
    if isinstance(result, dict) and result.get("state") == "conflict":
        raise Problem("review_conflict", result.get("detail") or "The native write could not be applied. Review its target before retrying.", 409)
    return result


@app.get("/api/v1/profiles/{id}/assets")
async def assets(id: str):
    return await runtime.call({"operation": "instance-assets"}, runtime_profile(id))


@app.get("/api/v1/profiles/{id}/asset")
async def asset(id: str, path: str):
    return await runtime.call({"operation": "instance-asset", "path": path}, runtime_profile(id))


@app.put("/api/v1/profiles/{id}/asset")
async def save_asset(id: str, body: dict):
    profile = runtime_profile(id)
    result = await runtime.call({"operation": "instance-asset", "write": True,
        "path": body["path"], "content": body["content"], "hash": body["hash"]}, profile)
    with transaction() as session:
        event(session, id, "asset.saved", {"path": body["path"], "hash": result["hash"], "machine_id": profile["_runtime_target"]["machine_id"]})
    return {**result, "effective": "next_native_session", "saved": profile["_runtime_target"]["machine_id"]}


@app.post("/api/v1/profiles/{id}/model")
async def model(id: str, body: dict):
    profile = runtime_profile(id)
    required = ("name", "base_url", "model")
    if not all(body.get(k) for k in required):
        raise Problem("incomplete_connection", "Name, endpoint and model are required.")
    from urllib.parse import urlsplit
    parsed = urlsplit(body["base_url"])
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise Problem("invalid_endpoint", "Use an HTTP(S) model endpoint without embedded credentials.")
    payload = {"id": "ara-connection", "name": body["name"], "base_url": body["base_url"], "model": body["model"],
               "make_default": True, "discover_models": False, "api_mode": body.get("api_mode", "chat_completions")}
    if body.get("api_key"):
        payload["api_key"] = body["api_key"]
    result = await runtime.native_http("POST", "/api/providers/custom-endpoints", payload, profile)
    with transaction() as session:
        metadata = {k: payload[k] for k in ["name", "base_url", "model", "api_mode"]}
        if profile["_runtime_target"]["machine_id"] == "local":
            conn = profiles.resolve_model_connection({**profile, "model_connection": metadata})
            change(session, id, {"model_connection": conn})
    return runtime.redact(result)


# Only explicit native operations are available; no file-read or credential-reveal proxy.
NATIVE_PREFIXES = ("/api/providers/oauth", "/api/providers/custom-endpoints", "/api/messaging/platforms",
    "/api/skills", "/api/tools", "/api/cron/jobs", "/api/mcp/servers", "/api/memory/providers",
    "/api/model/info", "/api/model/options", "/api/model/set",
    "/api/audio/transcribe", "/api/audio/speak", "/api/audio/voice-live/status", "/api/sessions")


@app.get("/api/v1/profiles/{id}/voice-settings")
async def voice_settings(id: str):
    data = await runtime.native_http("GET", "/api/config", profile=runtime_profile(id))
    cfg = data.get("config", data)
    return runtime.redact({"stt": cfg.get("stt", {}), "tts": cfg.get("tts", {})})


@app.put("/api/v1/profiles/{id}/voice-settings")
async def set_voice_settings(id: str, body: dict):
    profile = runtime_profile(id)
    if set(body) - {"stt", "tts", "api_key"}:
        raise Problem("invalid_voice_setting", "Use the transcription and speech provider settings.")
    data = await runtime.native_http("GET", "/api/config", profile=profile)
    cfg = data.get("config", data)
    for key in ("stt", "tts"):
        if key in body:
            if not isinstance(body[key], dict):
                raise Problem("invalid_voice_setting", "Speech settings must be objects.")
            cfg[key] = {**cfg.get(key, {}), **body[key]}
    if body.get("api_key"):
        await runtime.native_http("PUT", "/api/env", {"key": "VOICE_TOOLS_OPENAI_KEY", "value": body["api_key"], "profile": profile["native_name"]}, profile)
    await runtime.native_http("PUT", "/api/config", {"config": cfg, "profile": profile["native_name"]}, profile)
    return {"saved": True, "credential_owner": "native_profile", "settings": runtime.redact({"stt": cfg.get("stt"), "tts": cfg.get("tts")})}


@app.put("/api/v1/profiles/{id}/delegation")
def set_delegation(id: str, body: dict):
    targets = body.get("targets", [])
    if not isinstance(targets, list) or len(targets) > 20:
        raise Problem("invalid_targets", "Choose at most 20 specialist targets.")
    with transaction() as session:
        get(session, id, "profile")
        for target in targets:
            if target == id:
                raise Problem("recursive_delegation", "An agent cannot delegate to itself.")
            get(session, target, "profile")
        all_profiles = {p["id"]: p for p in listing(session, "profile")}
        def reaches(start, goal, visited):
            if start == goal: return True
            if start in visited: return False
            return any(reaches(child, goal, visited | {start}) for child in all_profiles[start].get("delegation_targets", []))
        if any(reaches(target, id, set()) for target in targets):
            raise Problem("recursive_delegation", "This binding would create a delegation cycle.")
        return change(session, id, {"delegation_targets": targets})


@app.api_route("/api/v1/profiles/{id}/native/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def native_proxy(id: str, path: str, request: Request):
    native_path = "/api/" + path
    if not any(native_path == p or native_path.startswith(p + "/") for p in NATIVE_PREFIXES) or ".." in path:
        raise Problem("native_capability_unavailable", "This native operation is not exposed by the prototype.", 404)
    body = await request.json() if request.method in {"POST", "PUT"} else None
    if isinstance(body, dict):
        body = {**body, "profile": runtime_profile(id)["native_name"]}
    query = {k: v for k, v in request.query_params.items() if k in {"refresh", "limit", "offset", "source", "search"}}
    result = await runtime.native_http(request.method, native_path, body, runtime_profile(id), query=query)
    if runtime_profile(id)["_runtime_target"]["machine_id"] == "local" and native_path == "/api/model/set" and isinstance(body, dict) and body.get("scope") == "main" and body.get("model"):
        with transaction() as session:
            conn = profiles.resolve_model_connection(get(session, id, "profile"))
            change(session, id, {"model_connection": conn})
    return runtime.redact(result)


@app.post("/api/v1/profiles/{id}/channels/telegram")
async def telegram(id: str, body: dict):
    profile = runtime_profile(id)
    with transaction() as session:
        if any(get(session, b["dataset_id"], "dataset")["module"] in {"notebook", "emotional"} for b in profile.get("bindings", [])):
            raise Problem("private_channel_scope_unverified", "Keep this private notebook instance separate from a bot until per-channel data scoping is certified.", 409)
    token, users = body.get("token", "").strip(), body.get("allowed_users", "").strip()
    if not token or not users:
        raise Problem("incomplete_bot_setup", "Provide a bot token and the Telegram user IDs allowed to use it.")
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            check = await client.post("https://api.telegram.org/bot" + token + "/getMe")
        info = check.json()
    except (httpx.HTTPError, ValueError):
        raise Problem("telegram_unreachable", "Could not validate the bot with Telegram. Its connection has not been enabled.", 502)
    if not info.get("ok"):
        raise Problem("invalid_bot_token", "Telegram rejected this bot token. Check it before enabling the connection.")
    bot_id = str(info["result"]["id"])
    with transaction() as session:
        channel_id = "telegram-" + bot_id
        row = session.get(Entity, channel_id)
        if row and (row.data["profile_id"] != id or row.data.get("owner", "local") != profile["_runtime_target"]["machine_id"]):
            raise Problem("channel_owned", "This bot is already bound to another profile. Pause and transfer that connection first.", 409)
        if not row:
            create(session, "channel", {"profile_id": id, "platform": "telegram", "external_id": bot_id,
                "name": info["result"].get("username", "Telegram bot"), "owner": profile["_runtime_target"]["machine_id"], "instance_id": profile["_runtime_target"]["instance_id"], "state": "configuring"}, id=channel_id)
    result = await runtime.native_http("PUT", "/api/messaging/platforms/telegram", {"enabled": True,
        "profile": profile["native_name"], "env": {"TELEGRAM_BOT_TOKEN": token, "TELEGRAM_ALLOWED_USERS": users}}, profile)
    with transaction() as session:
        change(session, channel_id, {"state": "enabled"})
    return result


@app.post("/api/v1/profiles/{id}/channels/{platform}/pause")
async def pause_channel(id: str, platform: str):
    profile = runtime_profile(id)
    result = await runtime.native_http("PUT", "/api/messaging/platforms/" + platform,
        {"enabled": False, "profile": profile["native_name"]}, profile)
    with transaction() as session:
        for channel in listing(session, "channel"):
            if channel.get("profile_id") == id and channel.get("platform") == platform:
                change(session, channel["id"], {"state": "paused"})
    return result


@app.get("/api/v1/conversations")
def conversations(profile_id: str | None = None):
    with transaction() as session:
        return [c for c in listing(session, "conversation") if not profile_id or c["profile_id"] == profile_id]


@app.post("/api/v1/conversations", status_code=201)
def conversation(body: dict):
    with transaction() as session:
        from .runtime_commands import target
        owner = target(get(session, body["profile_id"], "profile"), body.get("machine_id") or runtime_machine.get())
        if owner["machine_id"] != "local" and not owner.get("owner_epoch"):
            raise Problem("instance_not_ready", "Wait for the node to confirm its native instance before opening a conversation", 409)
        return create(session, "conversation", {"profile_id": body["profile_id"], "title": str(body.get("title", "New conversation"))[:120], "audience": "application", "runtime_owner": owner})


@app.post("/api/v1/conversations/{id}/messages", status_code=202)
async def send(id: str, body: dict):
    content = body.get("text", "")
    if not isinstance(content, str) or not content.strip() or len(content) > 100000:
        raise Problem("invalid_message", "Write a message shorter than 100,000 characters.")
    return runs.submit(id, content, body.get("operation_id") or uuid.uuid4().hex)


@app.get("/api/v1/conversations/{id}")
async def conversation_detail(id: str):
    c = find(id, "conversation")
    with transaction() as session:
        turn_rows = [r for r in listing(session, "run") if r["conversation_id"] == id]
    recovery = await asyncio.to_thread(runs.conversation_recovery, c, turn_rows)
    return {**c, "runs": [runs.view(r) for r in turn_rows], "recovery": recovery}


@app.post("/api/v1/conversations/{id}/restart", status_code=201)
def restart_conversation(id: str):
    return runs.restart_conversation(id)


@app.get("/api/v1/runs")
def list_runs():
    with transaction() as session:
        return [runs.view(r) for r in listing(session, "run")[::-1]]


@app.get("/api/v1/runs/{id}")
def run_detail(id: str):
    with transaction() as session:
        run = get(session, id, "run")
        evs = session.scalars(select(Event).where(Event.entity_id == id).order_by(Event.sequence)).all()
        return {**runs.view(run), "events": [{"sequence": e.sequence, "type": e.type, "data": e.data} for e in evs]}


@app.post("/api/v1/runs/{id}/control")
async def run_control(id: str, body: dict):
    if body.get("action") not in {"cancel", "approve"}:
        raise Problem("invalid_control", "Choose cancel or approve.")
    return await runs.control(find(id, "run"), body["action"], body.get("choice"))


@app.post("/api/v1/runs/{id}/reconcile")
async def reconcile_run(id: str):
    return await runs.reconcile(find(id, "run"))


@app.get("/api/v1/events")
async def events(request: Request, after: int = 0, entity_id: str | None = None):
    try:
        cursor_start = max(0, after, int(request.headers.get("last-event-id", "0")))
    except ValueError:
        raise Problem("invalid_event_cursor", "Use a numeric event cursor.")
    async def stream():
        cursor = cursor_start
        while not await request.is_disconnected():
            with transaction() as session:
                query = select(Event).where(Event.sequence > cursor).order_by(Event.sequence).limit(100)
                if entity_id:
                    query = query.where(Event.entity_id == entity_id)
                rows = session.scalars(query).all()
            for row in rows:
                cursor = row.sequence
                yield f"id: {cursor}\ndata: {json.dumps({'sequence': cursor, 'entity_id': row.entity_id, 'type': row.type, 'data': row.data})}\n\n"
            if not rows:
                yield ": heartbeat\n\n"
                await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/v1/machines")
def machines():
    from . import releases, node_updates
    target = releases.current()
    with transaction() as session:
        return [{**m, "update_status": node_updates.describe(m, target)} for m in listing(session, "machine")]


@app.get("/api/v1/releases/current")
def current_release():
    from .releases import current
    return current()


@app.get("/api/v1/releases/current/notes")
def release_notes():
    from fastapi.responses import PlainTextResponse
    path = config.ROOT / "CHANGELOG.md"
    return PlainTextResponse(path.read_text() if path.is_file() else "No release notes available")


@app.get("/api/v1/releases/{build_id}/package")
def release_package(build_id: str):
    from .releases import package
    try:
        path, descriptor = package(build_id)
    except (ValueError, FileNotFoundError) as exc:
        raise Problem("release_unavailable", str(exc), 404)
    return FileResponse(path, filename=descriptor["filename"], media_type="application/gzip",
        headers={"ETag": '"' + descriptor["sha256"] + '"', "Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/v1/releases/{build_id}/installer")
def release_installer(build_id: str):
    import tarfile
    from .releases import package
    try:
        path, _ = package(build_id)
    except (ValueError, FileNotFoundError) as exc:
        raise Problem("release_unavailable", str(exc), 404)
    with tarfile.open(path) as archive:
        data = archive.extractfile("agent-os/src/ara_os/node_install.py").read()
    return Response(data, media_type="text/x-python", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/v1/machines/{id}/update")
def machine_update_status(id: str):
    from . import releases, node_updates
    return node_updates.describe(find(id, "machine"), releases.current())


@app.post("/api/v1/machines/{id}/update")
def request_machine_update(id: str, body: dict):
    from . import releases, node_updates
    target = releases.current()
    with transaction() as session:
        return node_updates.request_update(session, id, body, target)


@app.get("/api/v1/machines/{id}/update/bootstrap")
def machine_update_bootstrap(id: str, request: Request):
    find(id, "machine")
    net = network_status(request)
    host = (net["endpoints"].get("tailscale") or net["endpoints"].get("lan")) if is_network_exposed() else None
    host = host or str(request.base_url).rstrip("/")
    return {"command": f"curl -fsSL '{host}/api/v1/nodes/install-update.sh' | bash",
            "instruction": "Stop the old node worker first. Run this once on the paired node; later updates use the dashboard."}


@app.post("/api/v1/machines/{id}/update/cancel")
def cancel_machine_update(id: str, body: dict):
    from . import releases, node_updates
    with transaction() as session:
        node_updates.cancel_update(session, id, body.get("request_id"))
    return node_updates.describe(find(id, "machine"), releases.current())


@app.get("/api/v1/nodes/install-update.sh")
def node_update_installer(request: Request):
    import shlex
    import tarfile
    from .releases import current, package
    from fastapi.responses import PlainTextResponse
    release = current()
    archive, _ = package(release["build_id"])
    with tarfile.open(archive) as bundle:
        checksum = hashlib.sha256(bundle.extractfile("agent-os/src/ara_os/node_install.py").read()).hexdigest()
    url = str(request.base_url).rstrip("/") + f"/api/v1/releases/{release['build_id']}/installer"
    script = f'''#!/usr/bin/env bash
set -euo pipefail
cd "${{ARA_NODE_DIR:-$HOME/ara}}/agent-os"
ara_update_state="${{ARA_STATE_DIR:-$PWD/.state}}"
mkdir -p "$ara_update_state"
ara_update_file="$ara_update_state/installer-{release['build_id']}.py"
curl -fsSL {shlex.quote(url)} -o "$ara_update_file"
.venv/bin/python -c 'import hashlib,sys; assert hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest() == sys.argv[2], "Installer checksum mismatch"' "$ara_update_file" {shlex.quote(checksum)}
exec .venv/bin/python "$ara_update_file" --root "$PWD" --state "$ara_update_state" --build {shlex.quote(release['build_id'])}
'''
    return PlainTextResponse(script, media_type="text/x-shellscript")


@app.post("/api/v1/nodes/updates/poll")
async def node_update_poll(request: Request):
    from .node_updates import receive
    body = await request.json()
    if not isinstance(body, dict) or len(json.dumps(body)) > 32_000:
        raise Problem("invalid_update_poll", "Send bounded node software metadata")
    machine = authorized_node(request, body.get("machine_id", ""))
    with transaction() as session:
        return receive(session, machine["id"], body)


@app.post("/api/v1/machines", status_code=201)
def enroll_machine(body: dict):
    from urllib.parse import urlsplit
    host = str(body.get("endpoint") or config.API_URL).rstrip("/")
    parsed = urlsplit(host)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise Problem("invalid_host_address", "Use the host base address without credentials, paths or query parameters.")
    id = str(uuid.uuid4())
    token = config.private_file("node-key-" + id)
    with transaction() as session:
        machine = create(session, "machine", {"name": str(body.get("name", "New node"))[:100], "role": "node", "state": "awaiting_pairing", "endpoint": None}, id=id)
    bootstrap_cmd = f"curl -fsSL '{host}/api/v1/nodes/bootstrap.sh?machine_id={id}&token={token}' | bash"
    allow_insecure = host.startswith("http://")
    return {
        "machine": machine,
        "enrollment": {
            "format": "ara-node-v1",
            "host": host,
            "machine_id": id,
            "token": token,
            "allow_insecure_http": allow_insecure,
            "bootstrap_cmd": bootstrap_cmd,
        },
        "instructions": {
            "restart_pairing": "cd ~/ara/agent-os && .venv/bin/ara node pair --enrollment node-enrollment.json",
            "start_worker": "cd ~/ara/agent-os && .venv/bin/ara node work",
            "background_worker": "cd ~/ara/agent-os && nohup .venv/bin/ara node work > node-worker.log 2>&1 &",
            "status": "cd ~/ara/agent-os && .venv/bin/ara node status"
        }
    }



@app.get("/api/v1/machines/{id}/pairing")
def machine_pairing_info(request: Request, id: str):
    machine = find(id, "machine")
    token_path = config.STATE / ("node-key-" + id)
    if not token_path.is_file():
        raise Problem("token_not_found", "No enrollment token on this host for this node. Enroll a new machine.", 404)
    token = token_path.read_text().strip()
    host_url = str(request.base_url).rstrip("/")
    bootstrap_cmd = f"curl -fsSL '{host_url}/api/v1/nodes/bootstrap.sh?machine_id={id}&token={token}' | bash"
    allow_insecure = host_url.startswith("http://")
    return {
        "machine": machine,
        "enrollment": {
            "format": "ara-node-v1",
            "host": host_url,
            "machine_id": id,
            "token": token,
            "allow_insecure_http": allow_insecure,
            "bootstrap_cmd": bootstrap_cmd,
        },
        "instructions": {
            "restart_pairing": "cd ~/ara/agent-os && .venv/bin/ara node pair --enrollment node-enrollment.json",
            "start_worker": "cd ~/ara/agent-os && .venv/bin/ara node work",
            "background_worker": "cd ~/ara/agent-os && nohup .venv/bin/ara node work > node-worker.log 2>&1 &",
            "status": "cd ~/ara/agent-os && .venv/bin/ara node status"
        }
    }


@app.delete("/api/v1/machines/{id}")
def delete_machine(id: str):
    if id == "local":
        raise Problem("cannot_delete_local", "The host local machine cannot be removed.", 400)
    token_path = config.STATE / ("node-key-" + id)
    if token_path.is_file():
        try:
            token_path.unlink()
        except OSError:
            pass
    with transaction() as session:
        machine = remove(session, id, "machine")
        from .cua.remote import forget
        forget(session, id)
        return machine


def get_repository_url():
    import subprocess
    try:
        out = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=config.ROOT.parent, text=True).strip()
        if out.startswith("git@github.com:"):
            return "https://github.com/" + out[len("git@github.com:"):]
        elif out.startswith("git@"):
            parts = out.split("@", 1)[1].split(":", 1)
            if len(parts) == 2:
                return f"https://{parts[0]}/{parts[1]}"
        return out
    except Exception:
        return "https://github.com/coding-nyx/agent-os.git"


@app.get("/api/v1/nodes/bundle.tar.gz")
def node_bundle_archive():
    from .releases import current
    # Preserve the old bootstrap URL while serving the same audited release.
    return release_package(current()["build_id"])


@app.get("/api/v1/nodes/bootstrap.sh")
def node_bootstrap_script(request: Request, machine_id: str = "", token: str = "", profile: str = "coding-agent"):
    from fastapi.responses import PlainTextResponse
    import hmac
    import re
    if not machine_id:
        raise Problem("missing_machine_id", "machine_id query parameter is required.", 400)
    token_path = config.STATE / ("node-key-" + machine_id)
    if not token_path.is_file() or not token or not hmac.compare_digest(token, token_path.read_text().strip()):
        raise Problem("invalid_node_key", "The bootstrap token or machine enrollment is invalid.", 401)
    find(machine_id, "machine")
    import base64
    import shlex
    import tarfile
    from .releases import current, package
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", profile):
        raise Problem("invalid_profile_name", "Use a lowercase profile name with letters, numbers, underscores or hyphens.")
    host_url = str(request.base_url).rstrip("/")
    release = current()
    archive, _ = package(release["build_id"])
    with tarfile.open(archive) as bundle:
        checksum = hashlib.sha256(bundle.extractfile("agent-os/src/ara_os/node_install.py").read()).hexdigest()
    enrollment = {"format": "ara-node-v1", "host": host_url, "machine_id": machine_id,
        "token": token, "allow_insecure_http": host_url.startswith("http://")}
    payload = base64.b64encode(json.dumps({"release": release, "enrollment": enrollment}).encode()).decode()
    installer_url = host_url + f"/api/v1/releases/{release['build_id']}/installer"
    package_url = host_url + release["download_path"]
    # The verifier is pinned to this script; no archive is extracted until all
    # paths, sizes and hashes pass. A paired rerun uses the staged updater.
    script = f'''#!/usr/bin/env bash
set -euo pipefail
umask 077
for cmd in curl python3; do
  command -v "$cmd" >/dev/null || {{ echo "Install $cmd before setting up ARA." >&2; exit 1; }}
done
if ! command -v uv >/dev/null; then
  curl -fsSL https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi
ara_boot_dir="${{ARA_NODE_DIR:-$HOME/ara}}"
ara_boot_project="$ara_boot_dir/agent-os"
ara_boot_state="${{ARA_STATE_DIR:-$ara_boot_project/.state}}"
ara_boot_tmp="$(mktemp -d)"
trap 'rm -rf "$ara_boot_tmp"' EXIT
curl -fsSL {shlex.quote(installer_url)} -o "$ara_boot_tmp/installer.py"
python3 -c 'import hashlib,sys; assert hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest()==sys.argv[2], "Installer checksum mismatch"' "$ara_boot_tmp/installer.py" {shlex.quote(checksum)}
if [ -f "$ara_boot_state/node-connection.json" ]; then
  python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["machine_id"]==sys.argv[2], "This installation is paired to another node"' "$ara_boot_state/node-connection.json" {shlex.quote(machine_id)}
  echo "Paired installation detected. Stop its existing worker before continuing."
  uv python install 3.12
  ara_boot_python="$(uv python find 3.12)"
  "$ara_boot_python" "$ara_boot_tmp/installer.py" --root "$ara_boot_project" --state "$ara_boot_state" --build {shlex.quote(release['build_id'])}
  exit $?
fi
if [ -d "$ara_boot_project" ] && [ -n "$(ls -A "$ara_boot_project")" ]; then
  echo "Existing unpaired installation preserved at $ara_boot_project. Pair it with ara node pair, or choose an empty ARA_NODE_DIR." >&2
  exit 1
fi
curl -fsSL {shlex.quote(package_url)} -o "$ara_boot_tmp/package.tar.gz"
python3 - "$ara_boot_tmp" "$ara_boot_dir" "$ara_boot_state" {shlex.quote(payload)} <<'ARA_VERIFY'
import base64, importlib.util, json, pathlib, sys
stage, destination, state, payload = sys.argv[1:]
data = json.loads(base64.b64decode(payload))
spec = importlib.util.spec_from_file_location("ara_installer", pathlib.Path(stage)/"installer.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
installer.unpack(pathlib.Path(stage)/"package.tar.gz", pathlib.Path(destination).resolve(), data["release"])
installer.atomic(pathlib.Path(stage)/"enrollment.json", data["enrollment"])
ARA_VERIFY
cd "$ara_boot_project"
export ARA_STATE_DIR="$ara_boot_state"
bash scripts/setup-node.sh --profile {shlex.quote(profile)}
.venv/bin/ara node pair --enrollment "$ara_boot_tmp/enrollment.json"
echo "ARA paired. In a new terminal, use: ara node work; ara node status"
echo "For background service options, run: ara node service --help"
.venv/bin/ara node work
'''
    return PlainTextResponse(script, media_type="text/x-shellscript")


def authorized_node(request: Request, id: str):
    machine = find(id, "machine")
    if id == "local":
        raise Problem("invalid_node", "Local host is not a remote node identity.", 403)
    token_path = config.STATE / ("node-key-" + id)
    if not token_path.is_file() or not hmac.compare_digest(request.headers.get("X-ARA-Node-Key", ""), token_path.read_text().strip()):
        raise Problem("invalid_node_key", "The node enrollment is not valid.", 401)
    return machine


@app.post("/api/v1/nodes/check")
async def node_check(request: Request):
    body = await request.json(); machine = authorized_node(request, body["machine_id"])
    with transaction() as session:
        change(session, machine["id"], {"state": "paired", "last_seen": datetime.now(timezone.utc).isoformat()})
    return {"paired": True, "machine_id": machine["id"]}


@app.post("/api/v1/nodes/sync")
async def node_sync(request: Request):
    import base64
    import io
    import tarfile
    from .recovery import cipher
    body = await request.json(); machine = authorized_node(request, body["machine_id"])
    if len(body.get("archive", "")) > 45_000_000:
        raise Problem("snapshot_too_large", "Prototype node snapshots are limited to 32 MB.", 413)
    try:
        data = base64.b64decode(body["archive"], validate=True)
    except ValueError:
        raise Problem("invalid_snapshot", "The snapshot encoding is invalid.")
    if hashlib.sha256(data).hexdigest() != body["sha256"]:
        raise Problem("snapshot_integrity", "The snapshot checksum does not match.", 409)
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            entries = archive.getmembers()
            if len(entries) > 20000 or sum(e.size for e in entries) > 250 * 1024 * 1024 or any(Path(e.name).is_absolute() or ".." in Path(e.name).parts or e.issym() or e.islnk() or not (e.isfile() or e.isdir()) for e in entries):
                raise ValueError()
    except (tarfile.TarError, ValueError):
        raise Problem("invalid_snapshot", "The profile snapshot contains invalid entries.")
    id = hashlib.sha256((machine["id"] + body["sha256"]).encode()).hexdigest()
    directory = config.STATE / "replicas"; directory.mkdir(exist_ok=True)
    path = directory / (id + ".ara")
    if not path.exists():
        path.write_bytes(cipher().encrypt(data)); path.chmod(0o600)
    with transaction() as session:
        if session.get(Entity, id) is None:
            create(session, "replica", {"machine_id": machine["id"], "profile_name": str(body["profile_name"])[:100],
                "task_id": body.get("task_id"), "sha256": body["sha256"], "state": "received_snapshot", "filename": path.name}, id=id)
        if body.get("task_id"):
            task = get(session, body["task_id"], "swarm_run")
            if task.get("owner_machine") != machine["id"]:
                raise Problem("task_not_owned", "This node does not own that task", 403)
            change(session, task["id"], {"native_snapshot_id": id, "recovery_state": "received_native_snapshot"})
        change(session, machine["id"], {"state": "paired", "last_received": datetime.now(timezone.utc).isoformat()})
    return {"acknowledged": True, "snapshot_id": id, "native_state": "passive", "credentials": "excluded", "automatic_activation": False}


@app.post("/api/v1/nodes/runtime/poll")
async def node_runtime_poll(request: Request):
    from .runtime_commands import poll
    body = await request.json()
    if not isinstance(body, dict) or len(json.dumps(body)) > 100_000:
        raise Problem("invalid_runtime_poll", "Send a bounded instance inventory")
    machine = authorized_node(request, body.get("machine_id", ""))
    inventory = body.get("instances", [])
    if not isinstance(inventory, list) or len(inventory) > 128:
        raise Problem("invalid_inventory", "Report at most 128 instances")
    clean = [{k: row.get(k) for k in ("instance_id", "native_name", "logical_agent_id", "state", "enabled")} for row in inventory if isinstance(row, dict)]
    with transaction() as session:
        change(session, machine["id"], {"instances": clean, "runtime_contract": "ara-runtime/1",
            "last_seen": datetime.now(timezone.utc).isoformat()})
        from .node_execution import bindings
        controls = [{k: v for k, v in b.items() if k != "definition"} for b in bindings(session, machine["id"])]
        return {"commands": poll(session, machine["id"]), "bindings": controls}


@app.post("/api/v1/nodes/runtime/events")
async def node_runtime_events(request: Request):
    from .runtime_commands import receive
    body = await request.json()
    machine = authorized_node(request, body.get("machine_id", ""))
    with transaction() as session:
        return receive(session, machine["id"], body.get("command_id"), body.get("events"), body.get("terminal") is True)


@app.post("/api/v1/nodes/tasks/poll")
async def node_task_poll(request: Request):
    from .node_execution import bindings
    from .task_journal import TERMINAL
    body = await request.json()
    machine = authorized_node(request, body.get("machine_id", ""))
    with transaction() as session:
        assigned = bindings(session, machine["id"])
        enabled_owners = {(b["profile_id"], b["native_name"]): b["generation"] for b in assigned if b["enabled"]}
        owned = [r for r in listing(session, "swarm_run") if r.get("owner_machine") == machine["id"]]
        tasks = [{"id": r["id"], "request": r["request"], "profile_id": r["profile_id"],
                  "cancel_requested": bool(r.get("cancel_requested")) or (r["profile_id"], r["request"]["native_name"]) not in enabled_owners or
                    (r["request"].get("deployment_generation") is not None and r["request"]["deployment_generation"] !=
                     enabled_owners.get((r["profile_id"], r["request"]["native_name"])))}
                 for r in owned if r["state"] not in TERMINAL and r.get("request")]
        receipts = {r["id"]: r.get("event_cursor", 0) for r in owned}
        snapshot_receipts = [r["task_id"] for r in listing(session, "replica") if r.get("machine_id") == machine["id"] and r.get("task_id")]
        change(session, machine["id"], {"last_seen": datetime.now(timezone.utc).isoformat(), "execution_contract": "ara-execution/1"})
    return {"bindings": assigned, "tasks": tasks, "receipts": receipts, "snapshot_receipts": snapshot_receipts}


@app.post("/api/v1/nodes/deployments/status")
async def node_deployment_status(request: Request):
    from .deployments import receive
    body = await request.json()
    if not isinstance(body, dict) or len(json.dumps(body)) > 200_000:
        raise Problem("invalid_deployment_receipts", "Send a bounded deployment report")
    machine = authorized_node(request, body.get("machine_id", ""))
    with transaction() as session:
        return receive(session, machine["id"], body.get("receipts"))


@app.post("/api/v1/nodes/tasks/events")
async def node_task_events(request: Request):
    from .node_execution import receive
    body = await request.json()
    machine = authorized_node(request, body.get("machine_id", ""))
    with transaction() as session:
        return receive(session, machine["id"], body)


@app.post("/api/v1/nodes/computer/poll")
async def node_computer_poll(request: Request):
    from .cua import remote
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 120_000:
            raise Problem("computer_status_too_large", "Desktop status is limited to 100 KB", 413)
    try:
        body = json.loads(data)
    except ValueError:
        raise Problem("invalid_json", "Send a valid desktop status")
    if not isinstance(body, dict):
        raise Problem("invalid_json", "Send one desktop status object")
    machine = authorized_node(request, body.get("machine_id", ""))
    return remote.poll(machine["id"], body.get("status", {}))


@app.post("/api/v1/nodes/computer/results")
async def node_computer_results(request: Request):
    from .cua import remote
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > remote.MAX_RESULT + 1024:
            raise Problem("computer_result_too_large", "Desktop results are limited to 12 MB", 413)
    try:
        body = json.loads(data)
    except ValueError:
        raise Problem("invalid_json", "Send a valid desktop result")
    if not isinstance(body, dict):
        raise Problem("invalid_json", "Send one desktop result object")
    machine = authorized_node(request, body.get("machine_id", ""))
    return remote.receive(machine["id"], body.get("command_id", ""), body.get("result"))


@app.get("/api/v1/replicas")
def replicas():
    with transaction() as session:
        return listing(session, "replica")


@app.get("/api/v1/replicas/{id}/download")
def replica_download(id: str):
    from .recovery import cipher
    from fastapi.responses import Response
    row = find(id, "replica")
    content = cipher().decrypt((config.STATE / "replicas" / row["filename"]).read_bytes())
    if hashlib.sha256(content).hexdigest() != row["sha256"]:
        raise Problem("snapshot_integrity", "This stored snapshot failed verification.", 409)
    return Response(content, media_type="application/gzip", headers={"Content-Disposition": 'attachment; filename="ara-node-profile.tar.gz"'})


@app.get("/api/v1/backups")
def backups():
    with transaction() as session:
        return listing(session, "backup")[::-1]


@app.post("/api/v1/backups", status_code=201)
async def make_backup():
    from .recovery import backup
    return await backup()


@app.get("/api/v1/backups/{id}/download")
def backup_download(id: str):
    row = find(id, "backup")
    path = config.STATE / "backups" / row["filename"]
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
        raise Problem("backup_integrity", "This backup is missing or failed its integrity check.", 409)
    return FileResponse(path, filename="ara-agent-os-" + id + ".ara")


@app.post("/api/v1/mcp/{profile_id}")
async def mcp_route(profile_id: str, request: Request):
    token_path = config.STATE / ("data-token-" + profile_id)
    if not token_path.is_file():
        raise Problem("invalid_data_capability", "This data capability is not valid.", 401)
    expected = "Bearer " + token_path.read_text().strip()
    if not hmac.compare_digest(request.headers.get("authorization", ""), expected):
        raise Problem("invalid_data_capability", "This data capability is not valid.", 401)
    try:
        body = await request.json()
    except ValueError:
        raise Problem("invalid_json", "Send a valid MCP JSON request.", 422)
    if not isinstance(body, dict):
        raise Problem("invalid_json", "Send one MCP JSON request object.", 422)
    method, id = body.get("method"), body.get("id")
    if method and method.startswith("notifications/"):
        return JSONResponse({}, 202)
    if method == "initialize":
        result = {"protocolVersion": body.get("params", {}).get("protocolVersion", "2025-03-26"), "capabilities": {"tools": {}}, "serverInfo": {"name": "ARA data", "version": __version__}}
    elif method == "tools/list":
        from .cua import remote
        allowed = bool(remote.view_targets(find(profile_id, "profile")))
        result = {"tools": [t for t in mcp.TOOLS if allowed or not t["name"].startswith("ara_cua_")]}
    elif method == "tools/call":
        params = body.get("params", {})
        try:
            import jsonschema
            tool = next((t for t in mcp.TOOLS if t["name"] == params.get("name")), None)
            if tool is None:
                raise Problem("unknown_tool", "This data tool is not registered.")
            try:
                jsonschema.validate(params.get("arguments", {}), tool["inputSchema"])
            except jsonschema.ValidationError as exc:
                raise Problem("invalid_tool_arguments", exc.message)
            if params["name"].startswith("ara_cua_"):
                from .cua.tools import invoke_cua_tool, result_content
                profile = find(profile_id, "profile")
                if not profile["enabled"]:
                    raise Problem("profile_disabled", "This profile is disabled", 403)
                from .cua import remote
                arguments = params.get("arguments", {})
                if params["name"] == "ara_cua_list_devices":
                    found = await remote.profile_devices(profile)
                    value = {"devices": found, "count": len(found)}
                else:
                    value = (await remote.invoke(profile, params["name"], arguments)
                             if remote.profile_target(profile, arguments.get("device_id")) else
                             await invoke_cua_tool(params["name"], arguments, actor=profile_id))
                result = {"content": result_content(value), "isError": value.get("success") is False and
                          value.get("metadata", {}).get("state") != "pending"}
            else:
                value = mcp.invoke(profile_id, params["name"], params.get("arguments", {}))
                result = {"content": [{"type": "text", "text": json.dumps(value)}]}
        except Problem as exc:
            result = {"isError": True, "content": [{"type": "text", "text": exc.detail}]}
    elif method == "ping":
        result = {}
    else:
        return {"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "Method not supported"}}
    return {"jsonrpc": "2.0", "id": id, "result": result}


@app.get("/api/v1/storage/export")
def storage_export():
    with transaction() as session:
        items = [wire(row) for row in session.scalars(select(Entity).where(Entity.kind.in_(["dataset", "record", "profile", "conversation", "run"]))) ]
    return JSONResponse({"format": "ara-os-v1", "entities": items}, headers={"Content-Disposition": 'attachment; filename="ara-agent-os.json"'})


# ARA-managed native computer control. Desktop grants are not dataset grants.
from .cua import CUAAction, cua_engine
from .cua import remote as remote_computer


def host_computer_identity_guard(actor):
    try:
        uuid.UUID(actor)
    except ValueError:
        return None  # Native-name identities use standalone policy.
    from .deployments import active
    try:
        profile = find(actor, "profile")
    except Problem:
        return "This agent profile no longer exists"
    if not active(profile, "local"):
        return "This agent is not enabled on the host machine"
    return None


cua_engine.identity_guard = host_computer_identity_guard


@app.get("/api/v1/cua/session")
def cua_operator_session(request: Request):
    from urllib.parse import urlsplit
    origin = request.headers.get("origin", "")
    if (origin and urlsplit(origin).netloc != request.headers.get("host")) or request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
        raise Problem("origin_mismatch", "Open System Control from the connected dashboard", 403)
    return {"token": config.private_file("computer-operator-token")}


@app.get("/api/v1/cua/state")
def cua_state(machine_id: str = "local"):
    from .cua import policy
    return policy.read() if machine_id == "local" else remote_computer.state(machine_id)


@app.put("/api/v1/cua/state")
async def cua_update_state(body: dict, machine_id: str = "local"):
    from .cua import policy
    if machine_id != "local":
        if set(body) == {"kill_switch"}:
            return remote_computer.pause(machine_id, body["kill_switch"])
        if not body or set(body) - {"mode", "grants", "remote_access"}:
            raise Problem("invalid_computer_policy", "Use desktop mode, remote access or assigned-agent grants")
        result = await remote_computer.command(machine_id, "setup", {"action": "configure", "values": body})
        if not result.get("success"):
            raise Problem("computer_setup_failed", result.get("error") or "Node policy change was not confirmed", 409)
        cfg = result["policy"]
        return {**cfg, "remote": True, "online": True, "setup_supported": True,
                "local_kill_switch": cfg.get("kill_switch", False)}
    try:
        for actor, grants in body.get("grants", {}).items():
            if grants:
                try:
                    uuid.UUID(actor)
                except ValueError:
                    continue  # Standalone native-name grants have no app DB dependency.
                if not find(actor, "profile")["enabled"]:
                    raise Problem("profile_disabled", "Enable this profile before granting computer access", 403)
        return policy.update({k: body[k] for k in ("mode", "kill_switch", "grants") if k in body})
    except ValueError as exc:
        raise Problem("invalid_computer_policy", str(exc))


@app.get("/api/v1/cua/setup")
def computer_setup_status(machine_id: str = "local"):
    from .cua import setup
    return setup.local_status() if machine_id == "local" else remote_computer.setup_status(machine_id)


@app.post("/api/v1/cua/setup")
async def computer_setup_action(body: dict, machine_id: str = "local"):
    from .cua import setup
    if body.get("action") not in {"check", "request_permissions", "install"} or set(body) - {"action", "operation_id"}:
        raise Problem("invalid_computer_setup", "Choose check, request_permissions or install")
    if machine_id == "local":
        return await setup.perform(body["action"])
    return await remote_computer.command(machine_id, "setup", {"action": body["action"]}, operation_id=body.get("operation_id"))


@app.get("/api/v1/cua/approvals")
def cua_approvals(machine_id: str = "local"):
    if machine_id != "local":
        return remote_computer.approvals(machine_id)
    directory = config.STATE / "computer-approvals"
    return [json.loads(path.read_text()) for path in sorted(directory.glob("*.json"))]


@app.post("/api/v1/cua/approvals/{id}/approve")
async def cua_approve(id: str, machine_id: str = "local"):
    if machine_id != "local":
        return await remote_computer.command(machine_id, "approve", {"id": id}, operation_id="approve:" + id)
    try:
        if len(id) != 32 or any(c not in "0123456789abcdef" for c in id):
            raise ValueError("Invalid approval ID")
        pending = config.STATE / "computer-approvals" / (id + ".json")
        if pending.is_file():
            actor = json.loads(pending.read_text())["actor"]
            try:
                uuid.UUID(actor)
            except ValueError:
                pass
            else:
                if not find(actor, "profile")["enabled"]:
                    raise Problem("profile_disabled", "This profile was disabled before approval", 403)
        return (await cua_engine.approve(id)).to_dict()
    except ValueError as exc:
        raise Problem("approval_unavailable", str(exc), 409)


@app.post("/api/v1/cua/approvals/{id}/reject")
async def cua_reject(id: str, machine_id: str = "local"):
    if machine_id != "local":
        return await remote_computer.command(machine_id, "reject", {"id": id}, operation_id="reject:" + id)
    try:
        return cua_engine.reject(id).to_dict()
    except ValueError as exc:
        raise Problem("approval_unavailable", str(exc), 409)


@app.get("/api/v1/cua/devices")
async def list_cua_devices():
    return [*(await cua_engine.list_devices()), *remote_computer.devices()]


@app.post("/api/v1/cua/devices/{device_id}/action")
async def cua_device_action(device_id: str, body: dict):
    try:
        action = CUAAction.from_dict(body)
        if device_id.startswith(remote_computer.PREFIX):
            if action.action.value != "screenshot" and not body.get("operation_id"):
                raise ValueError("Remote operator input requires a stable operation_id")
            return await remote_computer.command(remote_computer.machine_id(device_id), "action",
                {k: v for k, v in body.items() if k != "operation_id"}, operation_id=body.get("operation_id"))
        return (await cua_engine.act(device_id, action, operator=True, operation_id=body.get("operation_id"))).to_dict()
    except ValueError as exc:
        raise Problem("computer_action_unavailable", str(exc), 409)


@app.post("/api/v1/cua/devices/{device_id}/semantic")
async def cua_device_semantic(device_id: str, body: dict):
    return (await cua_engine.execute_semantic(device_id, body.get("script", ""))).to_dict()


@app.get("/api/v1/cua/devices/{device_id}/frame")
async def cua_device_frame(device_id: str):
    try:
        data, meta = await computer_frame(device_id)
        return Response(content=data, media_type="image/jpeg" if meta.get("format") in {"jpeg", "jpg"} else "image/png")
    except ValueError as exc:
        raise Problem("computer_capture_unavailable", str(exc), 409)


@app.get("/api/v1/cua/devices/{device_id}/ui-tree")
async def cua_device_ui_tree(device_id: str):
    try:
        if device_id.startswith(remote_computer.PREFIX):
            value = await remote_computer.command(remote_computer.machine_id(device_id), "ui_tree")
            if not value.get("success"):
                raise ValueError(value.get("error", "Node accessibility inspection failed"))
            return value["ui_tree"]
        return await cua_engine.get_ui_tree(device_id, operator=True)
    except ValueError as exc:
        raise Problem("computer_tree_unavailable", str(exc), 409)


@app.post("/api/v1/cua/kill-switch")
async def cua_kill_switch(body: dict, machine_id: str = "local"):
    if type(body.get("active")) is not bool:
        raise Problem("invalid_kill_switch", "Provide a boolean active flag")
    active = (cua_engine.set_kill_switch(body["active"]) if machine_id == "local" else
              remote_computer.pause(machine_id, body["active"])["kill_switch"])
    return {"kill_switch": active,
            "detail": "Blocks new managed inputs and interrupts active transports; already delivered OS actions cannot be undone."}


@app.websocket("/api/v1/cua/devices/{device_id}/stream")
async def cua_device_stream(websocket: WebSocket, device_id: str):
    from urllib.parse import urlsplit
    origin = websocket.headers.get("origin", "")
    protocols = [p.strip() for p in websocket.headers.get("sec-websocket-protocol", "").split(",")]
    token = config.private_file("computer-operator-token")
    if not trusted_host(websocket.headers.get("host", "")) or (origin and urlsplit(origin).netloc != websocket.headers.get("host")) or not any(hmac.compare_digest(p, token) for p in protocols):
        await websocket.close(code=1008)
        return
    await websocket.accept(subprotocol="ara-control" if "ara-control" in protocols else None)
    try:
        if device_id.startswith(remote_computer.PREFIX):
            paused = remote_computer.state(remote_computer.machine_id(device_id))["kill_switch"]
        else:
            await cua_engine.get_provider_or_raise(device_id)
            paused = cua_engine.kill_switch_active
        await websocket.send_json({"type": "init", "kill_switch": paused})
        # Socket is observation-only; all inputs use the authenticated policy-gated API.
        while True:
            import base64
            data, meta = await computer_frame(device_id)
            await websocket.send_json({"type": "frame", "data": base64.b64encode(data).decode(),
                                       "format": meta.get("format", "png"), "observation_id": meta.get("observation_id")})
            await asyncio.sleep(1)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        await websocket.send_json({"type": "error", "message": "Native capture unavailable; inspect device readiness."})
        await websocket.close()


async def computer_frame(device_id):
    if not device_id.startswith(remote_computer.PREFIX):
        return await cua_engine.get_frame(device_id)
    import base64
    result = await remote_computer.command(remote_computer.machine_id(device_id), "action", {"action": "screenshot"})
    if not result.get("success") or not result.get("frame_base64"):
        raise ValueError(result.get("error", "Node capture unavailable"))
    return base64.b64decode(result["frame_base64"], validate=True), result.get("metadata", {})


def mount_web():
    dist = config.ROOT / "web/dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
        @app.get("/{path:path}", include_in_schema=False)
        def web(path: str):
            if path.startswith("api/"):
                raise Problem("not_found", "This API route does not exist.", 404)
            return FileResponse(dist / "index.html")


mount_web()
