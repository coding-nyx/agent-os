from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from . import __version__, config, domains, mcp, profiles, runs, runtime
from .catalog import MODULES, PRESETS
from .store import Entity, Event, Problem, change, create, engine, event, get, initialize, listing, transaction, wire

log = logging.getLogger("ara")


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
    # Keep static UI and diagnostics reachable while storage recovers.
    yield
    preparation.cancel()
    tasks = list(runs.TASKS.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(preparation, *tasks, return_exceptions=True)


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
    origin = request.headers.get("origin", "")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        from urllib.parse import urlsplit
        if urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"error": {"code": "origin_mismatch", "detail": "Use the connected Agent OS application to change state."}}, 403)
    try:
        response = await call_next(request)
    except Exception:
        id = uuid.uuid4().hex[:12]
        log.exception("Unhandled operation %s", id)
        return JSONResponse({"error": {"code": "unexpected_failure", "detail": "This operation stopped unexpectedly. Existing data is retained.", "reference": id}}, 500)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


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


class PatchBody(BaseModel):
    values: dict
    revision: int = Field(ge=1, le=2147483647)


def find(id, kind=None):
    with transaction() as session:
        return get(session, id, kind)


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
            "runtime": "installed" if config.RUNTIME_PYTHON.exists() else "missing", "local_only": True,
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


@app.get("/api/v1/dashboard")
def dashboard():
    with transaction() as session:
        ps, ds, rs = listing(session, "profile"), domains.datasets(session), listing(session, "run")
        return {"profiles": ps, "datasets": [{**d, "summary": domains.summary(session, d["id"])} for d in ds],
                "runs": rs[-20:][::-1], "machines": listing(session, "machine"),
                "waiting": [r for r in rs if r["state"] in {"waiting", "unknown", "failed"}]}


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
        return listing(session, "profile")


@app.post("/api/v1/profiles", status_code=201)
async def new_profile(body: ProfileBody):
    return await profiles.create_profile(body.name, body.preset, body.soul)


@app.get("/api/v1/profiles/{id}")
def profile_detail(id: str):
    return find(id, "profile")


@app.patch("/api/v1/profiles/{id}")
async def profile_patch(id: str, body: PatchBody):
    if set(body.values) - {"name", "enabled", "description"}:
        raise Problem("invalid_profile_change", "Use dedicated profile controls for connections and bindings.")
    if "enabled" in body.values and not isinstance(body.values["enabled"], bool):
        raise Problem("invalid_profile_change", "Enabled must be true or false.")
    profile = find(id, "profile")
    if profile["revision"] != body.revision:
        raise Problem("revision_conflict", "This profile changed. Reload before applying lifecycle changes.", 409)
    if "enabled" in body.values:
        await runtime.call({"operation": "profile-state", "name": profile["native_name"], "enabled": bool(body.values["enabled"])})
    with transaction() as session:
        return change(session, id, body.values, body.revision)


@app.get("/api/v1/profiles/{id}/instances")
def instances(id: str):
    profile = find(id, "profile")
    logical = profile.get("logical_profile_id", profile["id"])
    with transaction() as session:
        return [p for p in listing(session, "profile") if p.get("logical_profile_id", p["id"]) == logical]


@app.post("/api/v1/profiles/{id}/instances", status_code=201)
async def new_instance(id: str, body: dict):
    source = find(id, "profile")
    return await profiles.create_profile(str(body.get("name", source["name"] + " instance"))[:100], source["preset"], runtime.read_asset(source, "SOUL.md")["content"], source)


@app.get("/api/v1/profiles/{id}/export")
async def profile_export(id: str):
    from starlette.background import BackgroundTask
    profile = find(id, "profile")
    directory = config.STATE / "exports"; directory.mkdir(exist_ok=True)
    path = directory / (uuid.uuid4().hex + ".tar.gz")
    await runtime.call({"operation": "portable", "output": str(path), "name": profile["native_name"]}, profile)
    return FileResponse(path, filename=profile["native_name"] + ".tar.gz", background=BackgroundTask(path.unlink, missing_ok=True))


@app.post("/api/v1/profiles/{id}/retry-setup")
async def retry_setup(id: str):
    return await profiles.provision(find(id, "profile"))


@app.put("/api/v1/profiles/{id}/bindings")
async def set_bindings(id: str, body: dict):
    return await profiles.bind(find(id, "profile"), body.get("bindings", []))


@app.put("/api/v1/profiles/{id}/learning")
async def learning(id: str, body: dict):
    return await profiles.set_learning(find(id, "profile"), body.get("policy", "off"))


@app.api_route("/api/v1/profiles/{id}/pending/{subsystem}", methods=["GET", "POST"])
async def pending_review(id: str, subsystem: str, request: Request):
    if subsystem not in {"memory", "skills"}:
        raise Problem("unknown_review", "Choose memory or skills.", 404)
    body = await request.json() if request.method == "POST" else {}
    if request.method == "POST" and (set(body) - {"action", "id", "hash"} or body.get("action") not in {"approve", "reject"} or not body.get("id") or not body.get("hash")):
        raise Problem("invalid_review", "Review one pending change with its current hash.")
    result = await runtime.call({"operation": "pending-review", "subsystem": subsystem, **body}, find(id, "profile"))
    if isinstance(result, dict) and result.get("state") == "conflict":
        raise Problem("review_conflict", result.get("detail") or "The native write could not be applied. Review its target before retrying.", 409)
    return result


@app.get("/api/v1/profiles/{id}/assets")
def assets(id: str):
    profile = find(id, "profile")
    paths = ["SOUL.md", "memories/MEMORY.md", "memories/USER.md", "config.yaml"]
    base = runtime.home(profile)
    paths += [str(p.relative_to(base)) for p in (base / "skills").rglob("SKILL.md") if not p.is_symlink()][:300]
    return [{"path": path, "exists": (base / path).exists()} for path in paths]


@app.get("/api/v1/profiles/{id}/asset")
def asset(id: str, path: str):
    return runtime.read_asset(find(id, "profile"), path)


@app.put("/api/v1/profiles/{id}/asset")
def save_asset(id: str, body: dict):
    result = runtime.write_asset(find(id, "profile"), body["path"], body["content"], body["hash"])
    with transaction() as session:
        event(session, id, "asset.saved", {"path": body["path"], "hash": result["hash"]})
    return {**result, "effective": "next_native_session", "saved": "local"}


@app.post("/api/v1/profiles/{id}/model")
async def model(id: str, body: dict):
    profile = find(id, "profile")
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
        change(session, id, {"model_connection": {k: payload[k] for k in ["name", "base_url", "model", "api_mode"]}})
    return runtime.redact(result)


# Only explicit native operations are available; no file-read or credential-reveal proxy.
NATIVE_PREFIXES = ("/api/providers/oauth", "/api/providers/custom-endpoints", "/api/messaging/platforms",
    "/api/skills", "/api/tools", "/api/cron/jobs", "/api/mcp/servers", "/api/memory/providers",
    "/api/model/info", "/api/model/options", "/api/model/set",
    "/api/audio/transcribe", "/api/audio/speak", "/api/audio/voice-live/status", "/api/sessions")


@app.get("/api/v1/profiles/{id}/voice-settings")
async def voice_settings(id: str):
    data = await runtime.native_http("GET", "/api/config", profile=find(id, "profile"))
    cfg = data.get("config", data)
    return runtime.redact({"stt": cfg.get("stt", {}), "tts": cfg.get("tts", {})})


@app.put("/api/v1/profiles/{id}/voice-settings")
async def set_voice_settings(id: str, body: dict):
    profile = find(id, "profile")
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
        body = {**body, "profile": find(id, "profile")["native_name"]}
    result = await runtime.native_http(request.method, native_path, body, find(id, "profile"))
    return runtime.redact(result)


@app.post("/api/v1/profiles/{id}/channels/telegram")
async def telegram(id: str, body: dict):
    profile = find(id, "profile")
    with transaction() as session:
        if any(get(session, b["dataset_id"], "dataset")["module"] == "notebook" for b in profile.get("bindings", [])):
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
        if row and row.data["profile_id"] != id:
            raise Problem("channel_owned", "This bot is already bound to another profile. Pause and transfer that connection first.", 409)
        if not row:
            create(session, "channel", {"profile_id": id, "platform": "telegram", "external_id": bot_id,
                "name": info["result"].get("username", "Telegram bot"), "owner": "local", "state": "configuring"}, id=channel_id)
    result = await runtime.native_http("PUT", "/api/messaging/platforms/telegram", {"enabled": True,
        "profile": profile["native_name"], "env": {"TELEGRAM_BOT_TOKEN": token, "TELEGRAM_ALLOWED_USERS": users}}, profile)
    with transaction() as session:
        change(session, channel_id, {"state": "enabled"})
    return result


@app.post("/api/v1/profiles/{id}/channels/{platform}/pause")
async def pause_channel(id: str, platform: str):
    profile = find(id, "profile")
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
        get(session, body["profile_id"], "profile")
        return create(session, "conversation", {"profile_id": body["profile_id"], "title": str(body.get("title", "New conversation"))[:120], "audience": "application"})


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
    return {**c, "runs": turn_rows}


@app.get("/api/v1/runs")
def list_runs():
    with transaction() as session:
        return listing(session, "run")[::-1]


@app.get("/api/v1/runs/{id}")
def run_detail(id: str):
    with transaction() as session:
        run = get(session, id, "run")
        evs = session.scalars(select(Event).where(Event.entity_id == id).order_by(Event.sequence)).all()
        return {**run, "events": [{"sequence": e.sequence, "type": e.type, "data": e.data} for e in evs]}


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
    with transaction() as session:
        return listing(session, "machine")


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
    return {"machine": machine, "enrollment": {"format": "ara-node-v1", "host": host, "machine_id": id, "token": token}}


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
            create(session, "replica", {"machine_id": machine["id"], "profile_name": str(body["profile_name"])[:100], "sha256": body["sha256"], "state": "received_snapshot", "filename": path.name}, id=id)
        change(session, machine["id"], {"state": "paired", "last_received": datetime.now(timezone.utc).isoformat()})
    return {"acknowledged": True, "snapshot_id": id, "native_state": "passive", "credentials": "excluded", "automatic_activation": False}


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
        result = {"tools": mcp.TOOLS}
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
