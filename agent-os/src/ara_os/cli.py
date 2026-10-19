from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(prog="ara", description="ARA Agent OS — local agents, data and connected machines")
    parser.add_argument("--state", help="Agent OS state directory")
    subs = parser.add_subparsers(dest="command", required=True)
    serve = subs.add_parser("serve", help="Run the local Agent OS API and built web client")
    serve.add_argument("--port", type=int, default=8787)
    setup = subs.add_parser("setup", help="Create presets and configure one shared provider/model")
    setup.add_argument("--skip-model", action="store_true", help="Provision preset runtimes without model/account setup")
    setup.add_argument("--use-existing", action="store_true", help="Use the model/account already configured in this installation's native root")
    setup.add_argument("--replace-models", action="store_true", help="Explicitly replace existing preset model choices")
    setup.add_argument("--non-interactive", action="store_true", help="Never prompt; use --use-existing or skip model setup")
    chat = subs.add_parser("chat", help="Use the native agent CLI for an ARA profile")
    chat.add_argument("profile", help="Profile ID or native profile name")
    chat.add_argument("args", nargs=argparse.REMAINDER)
    native = subs.add_parser("runtime", help="Run auth, skills, memory or gateway commands on an installed profile")
    native.add_argument("profile", help="Profile ID or native profile name")
    native.add_argument("args", nargs=argparse.REMAINDER)
    importer = subs.add_parser("import", help="Preview or apply a native/OpenClaw profile import on this node")
    importer.add_argument("format", choices=["native", "openclaw"])
    importer.add_argument("source", type=Path)
    importer.add_argument("--name", required=True)
    importer.add_argument("--apply", action="store_true", help="Apply the preview; credentials, channels and schedules stay inactive")
    subs.add_parser("backup", help="Create an encrypted native/application recovery bundle")
    key = subs.add_parser("backup-key", help="Save the recovery key to a protected separate file")
    key.add_argument("--output", type=Path, required=True)
    restore = subs.add_parser("restore", help="Restore an encrypted recovery bundle into a new isolated state directory")
    restore.add_argument("source", type=Path)
    restore.add_argument("--key", type=Path, required=True)
    restore.add_argument("--target", type=Path, required=True)
    node = subs.add_parser("node", help="Node status and profile synchronization")
    node_sub = node.add_subparsers(dest="action", required=True)
    node_sub.add_parser("status")
    pair = node_sub.add_parser("pair"); pair.add_argument("--enrollment", type=Path, required=True)
    sync = node_sub.add_parser("sync"); sync.add_argument("--profile", required=True)
    sync.add_argument("--watch", action="store_true", help="Watch committed native assets and periodically snapshot active state")
    sync.add_argument("--interval", type=int, default=5, help="Asset reconciliation interval, minimum 2 seconds")
    cua = subs.add_parser("cua", help="Computer Use Agent (CUA) system control and MCP server")
    cua_sub = cua.add_subparsers(dest="action", required=True)
    cua_sub.add_parser("mcp", help="Run standalone CUA stdio MCP server for Hermes")
    cua_sub.add_parser("devices", help="List discovered devices available for computer control")
    args = parser.parse_args()
    if args.state:
        os.environ["ARA_STATE_DIR"] = str(Path(args.state).resolve())
    if args.command == "serve":
        os.environ.setdefault("ARA_API_URL", f"http://127.0.0.1:{args.port}")
    from . import config, runtime
    from .store import Problem
    try:
        if args.command == "setup":
            from .setup import run_setup
            try:
                run_setup(args)
            except (EOFError, KeyboardInterrupt):
                print("Setup interrupted. Review preset model settings before rerunning; no work was resubmitted.", file=sys.stderr)
                raise SystemExit(130)
        elif args.command == "serve":
            import uvicorn
            uvicorn.run("ara_os.app:app", host="127.0.0.1", port=args.port)
        elif args.command == "import":
            asyncio.run(import_profile(args))
        elif args.command in {"chat", "runtime"}:
            from .store import get, transaction
            try:
                with transaction() as session:
                    profile = get(session, args.profile, "profile")
            except Exception:
                if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.profile):
                    raise Problem("unknown_profile", "Use a profile ID or a valid native profile name.")
                profile = {"native_name": args.profile}
            if not runtime.home(profile).is_dir():
                raise Problem("profile_not_found", "This profile is not installed on this machine.")
            env = config.runtime_env(); env["HERMES_HOME"] = str(runtime.home(profile))
            arguments = args.args[1:] if args.args[:1] == ["--"] else args.args
            command = [str(config.RUNTIME_PYTHON), "-m", "hermes_cli.main", *(["chat"] if args.command == "chat" else []), *arguments]
            raise SystemExit(subprocess.call(command, cwd=config.RUNTIME_SOURCE, env=env))
        elif args.command == "backup":
            from .recovery import backup
            print(json.dumps(asyncio.run(backup()), indent=2))
        elif args.command == "backup-key":
            from .recovery import cipher
            cipher()
            with args.output.open("xb") as stream:
                args.output.chmod(0o600)
                stream.write((config.STATE / "recovery.key").read_bytes())
            print("Recovery key saved. Keep it separately from the protected machine.")
        elif args.command == "restore":
            asyncio.run(restore_bundle(args))
        elif args.command == "node":
            asyncio.run(node_command(args))
        elif args.command == "cua":
            if args.action == "mcp":
                from .cua.mcp_server import main as run_cua_mcp
                run_cua_mcp()
            elif args.action == "devices":
                from .cua import discover_all_devices
                async def print_devs():
                    devs = await discover_all_devices()
                    for d in devs:
                        info = await d.get_device_info()
                        print(json.dumps(info.to_dict(), indent=2))
                asyncio.run(print_devs())
    except Problem as exc:
        print(f"{exc.code}: {exc.detail}", file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError):
        print("operation_incomplete: Check the input files, connection settings and filesystem permissions. Existing data is retained.", file=sys.stderr)
        raise SystemExit(1)


async def import_profile(args):
    from . import config, runtime
    from .store import Problem
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.name) or args.name == "default":
        raise Problem("invalid_profile_name", "Use a lowercase name with letters, digits and hyphens; default is reserved.")
    source = args.source.expanduser().resolve()
    if not source.exists():
        raise Problem("source_not_found", "The source does not exist.")
    target = config.RUNTIME_HOME / "profiles" / args.name
    if target.exists():
        raise Problem("profile_exists", "Choose a new name; imports never overwrite a live profile.", 409)
    if args.format == "native":
        if not tarfile.is_tarfile(source):
            raise Problem("invalid_archive", "Use a native profile .tar.gz export.")
        with tarfile.open(source) as archive:
            entries = archive.getmembers()
            if len(entries) > 20000 or sum(e.size for e in entries) > 250 * 1024 * 1024:
                raise Problem("archive_too_large", "Profile imports are limited to 250 MB / 20,000 entries.")
            if any(Path(e.name).is_absolute() or ".." in Path(e.name).parts or e.issym() or e.islnk() or not (e.isfile() or e.isdir()) for e in entries):
                raise Problem("unsafe_archive", "The archive contains unsafe paths, links or special files.")
            print(json.dumps({"format": "native", "target": args.name, "files": len(entries), "credentials": "excluded", "bots": "inactive", "schedules": "inactive", "apply": args.apply}, indent=2))
        if not args.apply:
            return
        await runtime.call({"operation": "import-native", "source": str(source), "name": args.name})
    else:
        if not source.is_dir():
            raise Problem("invalid_source", "OpenClaw import expects the source configuration directory.")
        stage_parent = config.STATE / "import-staging"
        stage_parent.mkdir(parents=True, exist_ok=True)
        stage = stage_parent / (args.name + "-" + uuid.uuid4().hex[:8])
        report = await runtime.call({"operation": "import-openclaw", "source": str(source), "target": str(stage), "apply": args.apply})
        print(json.dumps(runtime.redact(report), indent=2, default=str))
        if not args.apply:
            return
        if not stage.exists():
            raise Problem("import_incomplete", "The upstream migration did not publish a target profile.")
        target.parent.mkdir(parents=True, exist_ok=True)
        stage.rename(target)
    # Register directly when local data service is available; keep an offline receipt otherwise.
    receipt = {"native_name": args.name, "name": args.name, "preset": "custom", "description": "Imported profile", "module": None,
        "enabled": False, "bindings": [], "learning": "off", "provision_state": "ready", "owner_machine": "local", "imported": args.format,
        "soul": (target / "SOUL.md").read_text() if (target / "SOUL.md").exists() else "Imported agent profile"}
    pending = config.STATE / "import-receipts"; pending.mkdir(exist_ok=True)
    id = str(uuid.uuid4()); (pending / (id + ".json")).write_text(json.dumps({"id": id, **receipt}))
    try:
        from .store import transaction, create
        with transaction() as session:
            installed = create(session, "profile", receipt, id=id)
        from .profiles import provision
        await provision(installed)
        (pending / (id + ".json")).unlink()
    except Exception:
        print("Native import complete. Registration queued locally until the data service is available.")
    print(json.dumps({"imported": args.name, "profile_id": id, "state": "disabled", "credentials": "reconnect explicitly"}))


async def restore_bundle(args):
    from . import config, runtime
    from .recovery import unpack
    destination = args.target.resolve()
    unpack(args.source, args.key, destination)
    env = config.runtime_env(); env["HERMES_HOME"] = str(destination / "runtime")
    command = [str(config.RUNTIME_PYTHON), str(runtime.WORKER)]
    result = subprocess.run(command, input=json.dumps({"operation": "restore", "source": str(destination / "native.zip")}) + "\n", text=True, capture_output=True, cwd=config.RUNTIME_SOURCE, env=env)
    if result.returncode:
        from .store import Problem
        raise Problem("restore_incomplete", "Native restore stopped. Staged files and the original bundle remain available.")
    result = subprocess.run(command, input=json.dumps({"operation": "sanitize-restored"}) + "\n", text=True, capture_output=True, cwd=config.RUNTIME_SOURCE, env=env)
    if result.returncode:
        from .store import Problem
        raise Problem("restore_sanitization_failed", "Restored connection state could not be deactivated. Do not activate this staging directory.")
    print(json.dumps({"restored_to": str(destination), "native_state": "restored inactive", "application_data": "staged in application-import.json", "next": "Start with a separate empty PostgreSQL database and this --state directory; reconnect credentials/channels deliberately."}, indent=2))


async def node_command(args):
    from . import config, runtime
    from .store import Problem
    import base64
    import hashlib
    import httpx
    pair_path = config.STATE / "node-connection.json"
    if args.action == "status":
        print(json.dumps({"product": "ARA Agent OS", "runtime_installed": config.RUNTIME_PYTHON.exists(), "state_directory": str(config.STATE), "paired": pair_path.exists()}, indent=2))
    elif args.action == "pair":
        enrollment = json.loads(args.enrollment.read_text())
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(enrollment["host"] + "/api/v1/nodes/check", headers={"X-ARA-Node-Key": enrollment["token"]}, json={"machine_id": enrollment["machine_id"]})
        if response.status_code != 200:
            raise Problem("pairing_failed", "The host did not accept this enrollment.")
        pair_path.parent.mkdir(parents=True, exist_ok=True)
        pair_path.write_text(json.dumps(enrollment)); pair_path.chmod(0o600)
        print("Node paired. Use ara node sync --profile <native-name> to protect a profile.")
    elif args.action == "sync":
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.profile):
            raise Problem("invalid_profile_name", "Use a native profile name from this node.")
        if not pair_path.exists():
            raise Problem("node_not_paired", "Pair this node using a host-generated enrollment file first.")
        profile = {"native_name": args.profile}
        if not runtime.home(profile).is_dir():
            raise Problem("profile_not_found", "This native profile is not installed on the node.")
        enrollment = json.loads(pair_path.read_text())
        import time
        status_path = config.STATE / ("sync-status-" + args.profile + ".json")
        previous, last_snapshot, backoff = "", 0.0, 2
        while True:
            root = runtime.home(profile)
            files = [root / "SOUL.md", root / "config.yaml", *(root / "memories").glob("*.md"), *(root / "skills").rglob("*")]
            fingerprint = hashlib.sha256()
            for file in sorted(files):
                if file.is_file() and not file.is_symlink() and file.stat().st_size < 2_000_000:
                    fingerprint.update(str(file.relative_to(root)).encode()); fingerprint.update(file.read_bytes())
            digest = fingerprint.hexdigest()
            database_stamp = max((p.stat().st_mtime for p in (root / "state.db", root / "state.db-wal") if p.exists()), default=0)
            if digest != previous or database_stamp > last_snapshot and time.time() - last_snapshot >= 60:
                status_path.write_text(json.dumps({"state": "pending", "profile": args.profile, "local_definition_hash": digest}))
                try:
                    with tempfile.TemporaryDirectory(dir=config.STATE) as tmp:
                        portable = Path(tmp) / "profile.tar.gz"
                        await runtime.call({"operation": "portable", "output": str(portable), "name": args.profile}, profile)
                        blob = portable.read_bytes()
                        async with httpx.AsyncClient(timeout=120) as client:
                            response = await client.post(enrollment["host"] + "/api/v1/nodes/sync", headers={"X-ARA-Node-Key": enrollment["token"]}, json={
                                "machine_id": enrollment["machine_id"], "profile_name": args.profile,
                                "sha256": hashlib.sha256(blob).hexdigest(), "archive": base64.b64encode(blob).decode()})
                        if response.status_code != 200:
                            raise Problem("sync_failed", "The host did not acknowledge this snapshot. Local data is unchanged.")
                        receipt = {**response.json(), "received_at": time.time(), "local_definition_hash": digest}
                        status_path.write_text(json.dumps(receipt)); print(json.dumps(receipt), flush=True)
                        previous, last_snapshot, backoff = digest, time.time(), 2
                except (httpx.HTTPError, Problem):
                    if not args.watch:
                        raise Problem("sync_pending", "The snapshot is not acknowledged. Local work and pending sync state are retained.")
                    print(json.dumps({"state": "retry_wait", "retry_seconds": backoff}), flush=True)
                    await asyncio.sleep(backoff); backoff = min(60, backoff * 2)
                    continue
            if not args.watch:
                break
            await asyncio.sleep(max(2, args.interval))


if __name__ == "__main__":
    main()
