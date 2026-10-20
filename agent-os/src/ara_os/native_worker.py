"""Runs inside the pinned native environment. Transport only; no second agent loop.

Stdout contains framed JSON lines; native status output is ignored by the parent.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
from pathlib import Path


def emit(type, data):
    print(json.dumps({"ara_frame": True, "type": type, "data": data}, default=str), flush=True)


async def native_http(request):
    import httpx
    from hermes_cli.gateway_runtime import ensure_gateway_runtime
    from hermes_cli.gateway_client import _session_ticket
    from hermes_constants import get_hermes_home
    home = get_hermes_home().resolve()
    # A command is bound to one native home; callers cannot select another one.
    if home.parent.name == "profiles":
        request["params"] = {**request.get("params", {}), "profile": home.name}
        if isinstance(request.get("body"), dict):
            request["body"] = {**request["body"], "profile": home.name}
    ready = await asyncio.to_thread(ensure_gateway_runtime, home, idle_exit=True)
    if ready.state != "ready" or ready.endpoint is None:
        raise RuntimeError(f"Runtime {ready.state}: {ready.reason_code}")
    ticket = await asyncio.to_thread(_session_ticket, home, ready.endpoint, purpose="native-http")
    async with httpx.AsyncClient(timeout=90, trust_env=False) as client:
        response = await client.request(request.get("method", "GET"), ready.endpoint.api_origin + request["path"],
            headers={"x-hermes-gateway-ticket": ticket}, params=request.get("params"), json=request.get("body"))
    try:
        payload = response.json()
    except ValueError:
        payload = {"detail": "Agent runtime returned a non-JSON response."}
    return {"status": response.status_code, "body": payload}


async def main(request):
    operation = request["operation"]
    if operation in {"definition-preview", "definition-apply"}:
        from native_definition import capture, apply, digest
        home = Path(os.environ["HERMES_HOME"])
        local = capture(home)
        incoming = request["definition"]
        if operation == "definition-preview":
            record = home / ".ara-definition.json"
            baseline = json.loads(record.read_text()) if record.exists() else {}
            paths = sorted(set(baseline.get("files", {})) | set(incoming["files"]))
            emit("result", {"local_revision": local["revision"], "published_revision": incoming["revision"],
                "changes": [{"path": p, "action": "remove" if p not in incoming["files"] else "add" if p not in local["files"] else "replace"}
                    for p in paths if local["files"].get(p) != incoming["files"].get(p) or
                    bool(local.get("modes", {}).get(p) == 0o700) != bool(incoming.get("modes", {}).get(p) == 0o700)],
                "config_changed": local["config"] != incoming["config"]})
        else:
            if request.get("local_revision") != local["revision"]:
                raise ValueError("Node files changed after the preview; reload before applying")
            emit("result", apply(home, incoming, force=True, expected_local=request.get("local_revision")))
    elif operation == "instance-preferences":
        from native_preferences import preferences
        emit("result", preferences(Path(os.environ["HERMES_HOME"]), request))
    elif operation == "instance-lifecycle":
        from native_instance import lifecycle
        emit("result", await asyncio.to_thread(lifecycle, Path(os.environ["HERMES_HOME"]), request["action"]))
    elif operation in {"instance-assets", "instance-asset", "definition-capture", "instance-swarm"}:
        home = Path(os.environ["HERMES_HOME"])
        if operation == "instance-swarm":
            from swarm_policy import read, write
            cfg = read(home)
            if request.get("write"):
                cfg = write(home, {**cfg, **request["config"]})
            emit("result", cfg)
        elif operation == "definition-capture":
            from native_definition import capture
            emit("result", capture(home))
        else:
            from native_instance import assets, asset
            emit("result", assets(home) if operation == "instance-assets" else asset(home, request))
    elif operation == "swarm-workspace":
        from native_execution import workspace_operation
        emit("result", await asyncio.to_thread(workspace_operation, request))
    elif operation in {"swarm-worker", "computer-control"}:
        if request.get("contract") != "ara-execution/1":
            raise ValueError("Unsupported ARA execution contract")
        from native_execution import run_worker, computer_control
        emit("result", await asyncio.to_thread(run_worker if operation == "swarm-worker" else computer_control, request))
    elif operation == "setup-model":
        from native_model_setup import apply_shared_model
        emit("result", apply_shared_model(request))
    elif operation == "create":
        from hermes_cli.profiles import create_profile, seed_profile_skills, _scrub_export_secrets
        from hermes_cli import profiles_initialization
        original_finish = profiles_initialization.finish_profile_layout
        cloning = False

        def finish_without_borrowed_credentials(staging, **kwargs):
            original_finish(staging, **kwargs)
            if cloning:
                # Native config clones deliberately retain API keys. ARA instances require
                # explicit account setup, so sanitize within native staging before publish.
                _scrub_export_secrets(staging)
                for name in (".env", "auth.json", ".anthropic_oauth.json", "vault.key", "vault.json.enc"):
                    (staging / name).unlink(missing_ok=True)
            # The running native multiplexer adopts a profile immediately on publication.
            # Install its data capability within staging, before its first tool discovery.
            from hermes_cli.config import read_user_config_raw, atomic_config_replace
            path = staging / "config.yaml"
            cfg = (read_user_config_raw(path) or {}) if path.exists() else {}
            for key, value in profile.get("ara_config", {}).items():
                cfg[key] = {**cfg.get(key, {}), **value}
            atomic_config_replace(path, cfg)
            path.chmod(0o600)
            if profile.get("start_paused"):
                (staging / "gateway.parked").touch(mode=0o600)

        profiles_initialization.finish_profile_layout = finish_without_borrowed_credentials
        results = []
        for profile in request["profiles"]:
            cloning = bool(profile.get("clone_from"))
            path = Path(os.environ["HERMES_HOME"]) / "profiles" / profile["name"]
            if not path.exists():
                path = create_profile(profile["name"], no_alias=True, soul=profile["soul"], description=profile.get("description"),
                    clone_from=profile.get("clone_from"), clone_config=bool(profile.get("clone_from")))
                seed_profile_skills(path, quiet=True)
            results.append({"name": profile["name"], "path": str(path)})
        emit("result", results)
    elif operation == "http":
        emit("result", await native_http(request))
    elif operation == "rpc":
        from hermes_cli.gateway_client import connect_gateway
        async with connect_gateway() as client:
            params = request.get("params", {})
            if params.get("session_id") and request["method"] not in {"session.resume", "session.create"}:
                await client.rpc("session.resume", session_id=params["session_id"])
            emit("result", await client.rpc(request["method"], **params))
    elif operation == "observe":
        request["_stage"] = "prompt.events"
        from hermes_cli.gateway_client import connect_gateway
        async with connect_gateway() as client:
            sid, admission = request["session_id"], request["admission_id"]
            snapshot = await client.rpc("session.resume", session_id=sid)
            for prompt in snapshot.get("prompts", []):
                emit("event", {"type": "clarify.request" if prompt.get("kind") == "clarify" else "approval.request",
                    "payload": prompt, "execution_generation": snapshot.get("execution_generation")})
            while True:
                receipt = await client.rpc("prompt.receipt", session_id=sid, admission_id=admission, include_result=True)
                if receipt.get("status") in {"terminal", "unknown"}:
                    emit("receipt" if receipt["status"] == "terminal" else "unknown", receipt)
                    break
                try:
                    frame = await asyncio.wait_for(client.events.get(), 2)
                except TimeoutError:
                    continue
                if isinstance(frame, Exception):
                    raise frame
                params = frame.get("params", {})
                event_admission = params.get("admission_id") or params.get("payload", {}).get("admission_id")
                if params.get("session_id") == sid and (not event_admission or event_admission == admission):
                    emit("event", params)
    elif operation == "run":
        from hermes_cli.gateway_client import connect_gateway
        async with connect_gateway() as client:
            request["_stage"] = "session.resume" if request.get("session_id") else "session.create"
            if request.get("session_id"):
                snapshot = await client.rpc("session.resume", session_id=request["session_id"])
            else:
                create_params = {
                    "request_id": request["conversation_id"],
                    "source": "gui",
                    "title": request.get("title", "ARA conversation"),
                    "run_budget": 300,
                }
                if request.get("model"):
                    create_params["model"] = request["model"]
                snapshot = await client.rpc("session.create", **create_params)
            sid = snapshot["session_id"]
            request["session_id"] = sid
            emit("session", snapshot)
            request["_stage"] = "prompt.submit"
            receipt = await client.rpc("prompt.submit", session_id=sid,
                submission_id=request["submission_id"], text=request["text"])
            emit("admission", receipt)
            request["_stage"] = "prompt.events"
            admission_id = receipt["admission_id"]
            while True:
                try:
                    frame = await asyncio.wait_for(client.events.get(), 25)
                except TimeoutError:
                    receipt = await client.rpc("prompt.receipt", session_id=sid, admission_id=admission_id, include_result=True)
                    if receipt.get("status") == "terminal":
                        emit("receipt", receipt)
                        break
                    if receipt.get("status") == "unknown":
                        emit("unknown", receipt)
                        break
                    continue
                if isinstance(frame, Exception):
                    raise frame
                params = frame.get("params", {})
                if params.get("session_id") != sid:
                    continue
                event_admission = params.get("admission_id") or params.get("payload", {}).get("admission_id")
                if event_admission and event_admission != admission_id:
                    continue
                emit("event", params)
                if params.get("type") == "message.complete":
                    break
    elif operation == "pending-review":
        import hashlib
        import fcntl
        from tools import write_approval as wa
        from tools.memory_tool import load_on_disk_store
        from hermes_cli.write_approval_commands import _apply_one, _matched_entries
        subsystem = request["subsystem"]
        if subsystem not in {"memory", "skills"}:
            raise ValueError("Unknown review subsystem")
        root = Path(os.environ["HERMES_HOME"]) / "pending"
        root.mkdir(parents=True, exist_ok=True)
        with (root / ".ara-review.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            records = wa.list_pending(subsystem)
            def digest(record):
                return hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
            if request.get("action", "list") == "list":
                emit("result", [{**r, "hash": digest(r), "review": wa.skill_pending_diff(r) if subsystem == "skills" else "\n".join(_matched_entries(r["payload"]))} for r in records])
            else:
                record = next((r for r in records if r["id"] == request.get("id")), None)
                if record is None or digest(record) != request.get("hash"):
                    emit("result", {"state": "conflict", "detail": "This pending write changed or was already reviewed. Reload it."})
                elif request["action"] == "reject":
                    wa.discard_pending(subsystem, record["id"])
                    emit("result", {"state": "rejected"})
                elif request["action"] == "approve":
                    ok, detail, result = _apply_one(subsystem, record, load_on_disk_store() if subsystem == "memory" else None)
                    if ok:
                        wa.discard_pending(subsystem, record["id"])
                    emit("result", {"state": "applied" if ok else "conflict", "detail": detail, "result": result})
                else:
                    raise ValueError("Unknown review action")
    elif operation == "backup":
        from hermes_cli.backup import _write_full_zip_backup
        home = Path(os.environ["HERMES_HOME"])
        result = _write_full_zip_backup(Path(request["output"]), home)
        if result is None:
            raise RuntimeError("Native backup could not obtain a consistent snapshot.")
        emit("result", {"path": str(result)})
    elif operation == "import-native":
        import tempfile
        from hermes_cli.profiles import import_profile, _scrub_export_secrets
        from hermes_cli.profile_channels import strip_channel_settings
        root = Path(os.environ["HERMES_HOME"])
        target = root / "profiles" / request["name"]
        if target.exists():
            raise FileExistsError("A native profile with that name already exists.")
        # Publish only after channel/credential sanitization, away from gateway discovery.
        with tempfile.TemporaryDirectory(dir=root.parent, prefix="ara-import-") as tmp:
            os.environ["HERMES_HOME"] = tmp
            path = import_profile(request["source"], name=request["name"])
            strip_channel_settings(path, include_state=True)
            _scrub_export_secrets(path)
            for name in (".env", "auth.json", "vault.key", "vault.json.enc"):
                (path / name).unlink(missing_ok=True)
            if (path / "cron").exists():
                disabled = path / "imported-cron-disabled"
                if disabled.exists():
                    shutil.rmtree(disabled)
                (path / "cron").rename(disabled)
            target.parent.mkdir(parents=True, exist_ok=True)
            path.rename(target)
        emit("result", {"path": str(target), "name": request["name"], "channels": "disabled", "credentials": "excluded"})
    elif operation == "import-openclaw":
        from hermes_cli.claw import _find_migration_script, _load_migration_module
        script = _find_migration_script()
        if script is None:
            raise RuntimeError("The upstream migration package is not installed. Run scripts/setup.sh again.")
        module = _load_migration_module(script)
        selected = module.resolve_selected_options(None, None, preset="full")
        target = Path(request["target"])
        migrator = module.Migrator(source_root=Path(request["source"]).resolve(), target_root=target,
            execute=request.get("apply", False), workspace_target=None, overwrite=False,
            migrate_secrets=False, output_dir=None, selected_options=selected, preset_name="full", skill_conflict_mode="skip")
        report = migrator.migrate()
        if request.get("apply"):
            from hermes_cli.profiles_initialization import finish_profile_layout
            finish_profile_layout(target, no_skills=False, clone_all=False, description="Imported ARA agent")
            from hermes_cli.profile_channels import strip_channel_settings
            from hermes_cli.profiles import _scrub_export_secrets
            strip_channel_settings(target, include_state=True)
            _scrub_export_secrets(target)
            soul = target / "SOUL.md"
            if soul.exists():
                # The native migrator rewrites source-product identity to its own;
                # adapt that generated branding to the downstream product.
                soul.write_text(soul.read_text().replace("Hermes", "Ara"))
            if (target / "cron").exists():
                disabled = target / "imported-cron-disabled"
                if disabled.exists():
                    shutil.rmtree(disabled)
                (target / "cron").rename(disabled)
        emit("result", report)
    elif operation == "restore":
        from types import SimpleNamespace
        from hermes_cli.backup import run_import
        result = run_import(SimpleNamespace(zipfile=request["source"], force=True))
        if result:
            raise RuntimeError("Native restore was incomplete; the original archive is retained.")
        emit("result", {"restored": True, "target": os.environ["HERMES_HOME"]})
    elif operation == "portable":
        from native_export import portable
        portable(Path(os.environ["HERMES_HOME"]), request["output"], request.get("name", "ara-profile"))
        emit("result", {"path": request["output"], "native_databases": "consistent", "credentials": "excluded", "channels": "disabled"})
    elif operation == "instance-export":
        import base64
        import hashlib
        import tempfile
        from native_export import portable
        home = Path(os.environ["HERMES_HOME"])
        with tempfile.TemporaryDirectory(dir=home.parent, prefix="ara-export-") as tmp:
            output = Path(tmp) / "profile.tar.gz"
            portable(home, output, home.name)
            if output.stat().st_size > 32_000_000:
                raise ValueError("Use native node tools for exports larger than 32 MB")
            digest = hashlib.sha256()
            with output.open("rb") as stream:
                while chunk := stream.read(512_000):
                    digest.update(chunk)
                    emit("event", {"type": "artifact.chunk", "payload": {"data": base64.b64encode(chunk).decode()}})
            emit("result", {"sha256": digest.hexdigest(), "bytes": output.stat().st_size,
                "native_databases": "consistent", "credentials": "excluded", "channels": "disabled"})
    elif operation == "profile-state":
        from gateway.control_socket import request_serve_profile_hot, request_unserve_profile
        root = Path(os.environ["HERMES_HOME"])
        fn = request_serve_profile_hot if request["enabled"] else request_unserve_profile
        emit("result", fn(root, request["name"]) or {"state": "not_running"})
    elif operation == "sanitize-restored":
        from hermes_cli.profile_channels import strip_channel_settings
        from hermes_cli.profiles import _scrub_export_secrets
        root = Path(os.environ["HERMES_HOME"])
        for target in [root, *(root / "profiles").glob("*")]:
            if not target.is_dir():
                continue
            strip_channel_settings(target, include_state=True)
            _scrub_export_secrets(target)
            for name in ("auth.json", ".env", "vault.key", "vault.json.enc"):
                (target / name).unlink(missing_ok=True)
            if (target / "cron").exists() and not (target / "restored-cron-disabled").exists():
                (target / "cron").rename(target / "restored-cron-disabled")
        emit("result", {"channels": "disabled", "credentials": "excluded", "schedules": "inactive"})
    else:
        raise ValueError("Unsupported node operation")


def failure_frame(exc, request):
    from hermes_cli.gateway_client import GatewayRPCError
    stage = request.get("_stage")
    detail = str(exc)[:1200]
    payload = {"code": type(exc).__name__, "detail": detail, "stage": stage}
    if isinstance(exc, GatewayRPCError):
        payload["code"] = "native_" + str(exc)
        payload["native_reason"] = str(exc)
        if str(exc) == "storage_unavailable":
            from native_diagnostics import session_recovery
            home = os.environ.get("HERMES_HOME")
            recovery = session_recovery(Path(home), session_id=request.get("session_id"),
                request_id=request.get("conversation_id")) if home else None
            if recovery:
                payload.update(recovery)
            else:
                payload["detail"] = ("The native runtime could not read or save this session "
                    "(storage_unavailable). Check the profile's native storage and service logs. "
                    "A missing model has not been established; do not delete its database.")
    # A lost reply during submission or execution is not a confirmed refusal.
    ambiguous = (stage in {"prompt.events", "worker.execute", "computer.execute"} or
                 (stage == "prompt.submit" and not isinstance(exc, GatewayRPCError)) or
                 (request.get("operation") == "rpc" and request.get("method") != "prompt.receipt" and not isinstance(exc, GatewayRPCError)) or
                 (request.get("operation") == "http" and request.get("method", "GET") != "GET" and not isinstance(exc, GatewayRPCError)))
    if ambiguous:
        payload.update(code="native_outcome_unknown", detail="The runtime connection stopped. "
            "Inspect the native session outcome before retrying; work may already have run.")
    return ("unknown" if ambiguous else "error"), payload


if __name__ == "__main__":
    request = {}
    try:
        request = json.loads(sys.stdin.readline())
        asyncio.run(main(request))
    except Exception as exc:
        kind, payload = failure_frame(exc, request)
        emit(kind, payload)
        sys.exit(1)
