"""Authenticated pull execution and acknowledged, replayable task events."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re

import httpx

from . import config, swarm_runner, runtime
from .task_journal import fingerprint, TERMINAL


def is_safe_plain_http(host_url: str) -> bool:
    from urllib.parse import urlsplit
    import ipaddress
    value = urlsplit(host_url)
    hostname = (value.hostname or "").lower()
    if hostname in {"localhost", "::1"}:
        return True
    if hostname.endswith(".local") or hostname.endswith(".ts.net"):
        return True
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_loopback:
            return True
        private_subnets = [
            ipaddress.ip_network("10.0.0.0/8"),
            ipaddress.ip_network("172.16.0.0/12"),
            ipaddress.ip_network("192.168.0.0/16"),
            ipaddress.ip_network("100.64.0.0/10"),
        ]
        return any(ip in net for net in private_subnets)
    except ValueError:
        return False


def validate_connection(enrollment: dict) -> None:
    import os
    from urllib.parse import urlsplit
    value = urlsplit(enrollment["host"])
    if value.scheme not in {"http", "https"} or not value.hostname or value.username or value.password or value.path or value.query or value.fragment:
        raise ValueError("Use a node host base address without credentials or paths")
    if value.scheme != "https":
        allowed = (
            enrollment.get("allow_insecure_http") is True or
            os.environ.get("ARA_ALLOW_INSECURE_HTTP") in {"1", "true", "yes"} or
            is_safe_plain_http(enrollment["host"])
        )
        if not allowed:
            raise ValueError("Remote execution links require HTTPS; use Tailscale (*.ts.net / 100.64.0.0/10), private LAN, or a loopback SSH tunnel for local HTTP")


async def exchange(enrollment):
    validate_connection(enrollment)
    headers = {"X-ARA-Node-Key": enrollment["token"]}
    base = enrollment["host"].rstrip("/") + "/api/v1"
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        response = await client.post(base + "/nodes/tasks/poll", headers=headers,
                                     json={"machine_id": enrollment["machine_id"]})
        response.raise_for_status()
        data = response.json()
        bindings = {b["native_name"]: b["profile_id"] for b in data["bindings"]}
        # Automatically provision any deployed profiles that do not yet exist locally on this node
        for b in data.get("bindings", []):
            name = b.get("native_name")
            if not name:
                continue
            profile_dir = config.RUNTIME_HOME / "profiles" / name
            if not profile_dir.is_dir():
                try:
                    from .swarm_policy import DEFAULTS
                    workspace = config.STATE / "workspaces" / name
                    workspace.mkdir(parents=True, exist_ok=True)
                    await runtime.call({"operation": "create", "profiles": [{
                        "name": name,
                        "soul": b.get("soul") or "You are an ARA node agent. Work within explicit task and tool grants.",
                        "description": b.get("description") or f"Deployed node profile for {b.get('name', name)}",
                        "ara_config": {
                            "terminal": {"backend": "local", "cwd": str(workspace)},
                            "ara": {"swarm": dict(DEFAULTS)}
                        }
                    }]})
                    print(f"✓ Automatically provisioned profile '{name}' deployed from Host", flush=True)
                except Exception as err:
                    print(f"[!] Could not auto-provision profile '{name}': {err}", flush=True)
        j = swarm_runner.journal()
        for task in data["tasks"]:
            local = swarm_runner.admit(task["request"], task["id"])
            if task.get("cancel_requested"):
                j.cancel(task["id"])
            if local["state"] == "queued":
                swarm_runner.launch(task["id"])
        synced = 0
        for local in j.pending():
            name = local["request"]["native_name"]
            prior_remote = next((t for t in data["tasks"] if t["id"] == local["id"]), None)
            profile_id = bindings.get(name) or (prior_remote or {}).get("profile_id")
            if not profile_id:
                continue  # Local-only task: no implicit upload without placement binding.
            local = j.reconcile(local["id"])
            already_received = data.get("receipts", {}).get(local["id"]) == len(local["events"]) and local["ack"] == len(local["events"])
            # Replay the bounded event ledger, including acknowledged entries. A restored
            # server can recover its cursor; duplicate payloads must match immutable hashes.
            if not already_received:
                response = await client.post(base + "/nodes/tasks/events", headers=headers, json={
                    "machine_id": enrollment["machine_id"], "profile_id": profile_id,
                    "task_id": local["id"], "request": local["request"], "events": local["events"]})
                response.raise_for_status()
                j.acknowledge(local["id"], response.json()["acknowledged_sequence"])
                synced += 1
            if local["state"] in TERMINAL and local["id"] not in data.get("snapshot_receipts", []):
                try:
                    home = runtime.home(swarm_runner.profile(name))
                except ValueError:
                    continue  # The failure receipt already reports an absent local profile.
                if not (home / "state.db").is_file():
                    continue  # No persisted native session exists to snapshot.
                snapshot = j.snapshot(local["id"])
                if snapshot is None:
                    path = j.root / local["id"] / "native-snapshot.tar.gz"
                    await runtime.call({"operation": "portable", "output": str(path), "name": name}, {"native_name": name})
                    path.chmod(0o600)
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    j.record_snapshot(local["id"], path, digest)
                    snapshot = j.snapshot(local["id"])
                from pathlib import Path
                raw = Path(snapshot["path"]).read_bytes()
                if hashlib.sha256(raw).hexdigest() != snapshot["sha256"]:
                    raise ValueError("Local native snapshot changed; inspect it before claiming protection")
                response = await client.post(base + "/nodes/sync", headers=headers, json={
                    "machine_id": enrollment["machine_id"], "profile_name": name, "task_id": local["id"],
                    "sha256": snapshot["sha256"], "archive": base64.b64encode(raw).decode()})
                response.raise_for_status()
        return {"tasks_offered": len(data["tasks"]), "tasks_synchronized": synced}


def placement(session, profile_id, body):
    from .store import Problem, get, change
    machine_id = body.get("machine_id", "local")
    profile = get(session, profile_id, "profile")
    name = body.get("native_name", profile["native_name"])
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
        raise Problem("invalid_profile_name", "Use the native profile name installed on the execution node")
    if machine_id != "local":
        get(session, machine_id, "machine")
    else:
        name = profile["native_name"]
    from .store import listing
    for other in listing(session, "profile"):
        if other["id"] != profile_id and other.get("execution_placement") == {"machine_id": machine_id, "native_name": name}:
            raise Problem("placement_in_use", "This native execution profile already belongs to another logical profile", 409)
    return change(session, profile_id, {"execution_placement": {"machine_id": machine_id, "native_name": name}})


def bindings(session, machine_id):
    from .store import listing
    return [
        {
            "profile_id": p["id"],
            "native_name": p["execution_placement"]["native_name"],
            "name": p.get("name", p["execution_placement"]["native_name"]),
            "soul": p.get("soul", ""),
            "preset": p.get("preset", "custom"),
            "description": p.get("description", ""),
            "enabled": p.get("enabled", False)
        }
        for p in listing(session, "profile") if
        (p.get("execution_placement") or {}).get("machine_id") == machine_id
    ]


def receive(session, machine_id, body):
    from sqlalchemy import select
    from .store import Entity, Problem, get, create, change
    from .swarms import project_events
    allowed = {b["profile_id"]: b["native_name"] for b in bindings(session, machine_id)}
    req, ident = body.get("request"), body.get("task_id", "")
    existing = session.get(Entity, ident) if isinstance(ident, str) else None
    if not isinstance(req, dict) or (not existing and (body.get("profile_id") not in allowed or req.get("native_name") != allowed[body["profile_id"]])):
        raise Problem("execution_not_bound", "This node is not the assigned profile execution owner", 403)
    if not re.fullmatch(r"[a-f0-9]{64}", ident) or req.get("contract") != "ara-execution/1":
        raise Problem("invalid_task_receipt", "Invalid task identity or execution contract")
    events = body.get("events")
    if not isinstance(events, list) or len(events) > 64 or len(json.dumps(body)) > 12_000_000:
        raise Problem("task_receipt_too_large", "Task receipts are limited to 64 events and 12 MB", 413)
    if any(not isinstance(e, dict) or type(e.get("sequence")) is not int or not isinstance(e.get("data"), dict) for e in events):
        raise Problem("invalid_task_receipt", "Events require integer sequences and object data")
    row = session.scalar(select(Entity).where(Entity.id == ident).with_for_update())
    if row is None:
        workers = req.get("workers")
        if not isinstance(workers, list) or not 1 <= len(workers) <= 8 or any(not isinstance(w, dict) or not all(isinstance(w.get(k), str) for k in ("id", "role", "objective")) for w in workers):
            raise Problem("invalid_task_receipt", "Invalid worker definition")
        create(session, "swarm_run", {"profile_id": body["profile_id"], "owner_machine": machine_id,
            "preset": req.get("preset"), "task": req.get("task"), "operation_id": req.get("operation_id"),
            "request": req, "request_fingerprint": fingerprint(req), "state": "queued", "event_cursor": 0,
            "workers": [{**w, "state": "pending", "output": None, "error": None} for w in workers],
            "synthesized_output": None, "error": None}, id=ident)
    record = get(session, ident, "swarm_run")
    if record.get("owner_machine") != machine_id or record["profile_id"] != body["profile_id"] or record.get("request_fingerprint") != fingerprint(req):
        raise Problem("task_receipt_conflict", "This task already identifies different work or another owner", 409)
    digests = record.get("event_digests", {})
    for entry in events:
        key = str(entry["sequence"])
        digest = fingerprint({k: entry[k] for k in ("sequence", "type", "data")})
        if key in digests and digests[key] != digest:
            raise Problem("task_event_conflict", "An acknowledged task event cannot be replaced", 409)
        digests[key] = digest
    cursor = project_events(session, record, events)
    change(session, ident, {"event_digests": digests})
    return {"acknowledged_sequence": cursor, "task_id": ident}
