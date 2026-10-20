"""Host-side commands for an enrolled node's desktop. Images stay in memory."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..store import Entity, Problem, change, get, listing, transaction

PREFIX = "node:"
MAX_RESULT = 12_000_000
FRAMES = OrderedDict()


def update_command(row, values):
    # Desktop polling is transport traffic, not application activity history.
    row.data = {**row.data, **values}
    row.revision += 1


def private_status(session, id):
    row = session.get(Entity, "computer-status:" + id)
    return row.data if row and row.kind == "computer_status" else {}


def machine_id(device_id):
    if not device_id.startswith(PREFIX):
        raise Problem("invalid_device", "Select a paired node desktop", 404)
    value = device_id[len(PREFIX):]
    try:
        uuid.UUID(value)
    except ValueError:
        raise Problem("invalid_device", "Invalid node desktop identity", 404)
    return value


def online(machine):
    return machine.get("computer_seen", 0) > time.time() - 12


def devices():
    with transaction() as session:
        machines = listing(session, "machine")
        for machine in machines:
            machine["computer_status"] = private_status(session, machine["id"])
    result = []
    for machine in machines:
        if machine["id"] == "local":
            continue
        status = machine.get("computer_status", {})
        enabled = "view" in status.get("policy", {}).get("remote_access", [])
        device = status.get("device", {})
        detail = ("Node desktop worker offline; run ara node work on the node." if not online(machine) else
                  "Enable remote observation on the node with ara cua remote --allow-view." if not enabled else
                  device.get("metadata", {}).get("detail") or "Capture explicitly to verify the node's native driver and OS permissions.")
        result.append({**device, "id": PREFIX + machine["id"], "machine_id": machine["id"],
            "name": machine["name"] + " · node desktop", "platform": device.get("platform", "linux"),
            "state": "offline" if not online(machine) else device.get("state", "needs_verification") if enabled else "disabled",
            "metadata": {**device.get("metadata", {}), "detail": detail}})
    return result


def state(id):
    with transaction() as session:
        machine = get(session, id, "machine")
        cfg = private_status(session, id).get("policy", {})
    return {"mode": cfg.get("mode", "view_only"), "grants": cfg.get("grants", {}),
            "kill_switch": cfg.get("kill_switch", False) or machine.get("computer_pause", False),
            "local_kill_switch": cfg.get("kill_switch", False), "epoch": cfg.get("epoch", 0),
            "remote_access": cfg.get("remote_access", []), "remote": True, "online": online(machine)}


def approvals(id):
    with transaction() as session:
        machine = get(session, id, "machine")
        return private_status(session, id).get("approvals", []) if online(machine) else []


def pause(id, active):
    if type(active) is not bool:
        raise Problem("invalid_kill_switch", "Provide a boolean active flag")
    with transaction() as session:
        get(session, id, "machine")
        change(session, id, {"computer_pause": active})
    return state(id)


def _remember(id, result):
    now = time.time()
    for key, (created, _) in list(FRAMES.items()):
        if created < now - 30:
            FRAMES.pop(key)
    if result.get("frame_base64"):
        FRAMES[id] = (now, result["frame_base64"])
        def expire():
            if id in FRAMES and FRAMES[id][0] == now:
                FRAMES.pop(id)
        asyncio.get_running_loop().call_later(30, expire)
    while len(FRAMES) > 4:  # At most 48 MB, independent of command volume.
        FRAMES.popitem(last=False)


async def command(id, kind, body=None, *, actor=None, operation_id=None):
    body = body or {}
    if len(json.dumps(body)) > 64_000:
        raise Problem("computer_command_too_large", "Desktop commands are limited to 64 KB", 413)
    operation_id = operation_id or uuid.uuid4().hex
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 120:
        raise Problem("invalid_operation_id", "Provide a bounded stable operation ID")
    ident = hashlib.sha256(json.dumps([id, actor, operation_id]).encode()).hexdigest()
    request = {"kind": kind, "body": body, "actor": actor}
    with transaction() as session:
        machine_row = session.scalar(select(Entity).where(Entity.id == id, Entity.kind == "machine").with_for_update())
        if machine_row is None:
            raise Problem("node_not_found", "This paired node no longer exists", 404)
        machine = machine_row.data
        prior = session.get(Entity, ident)
        if prior:
            if prior.kind != "computer_command" or prior.data["request"] != request:
                raise Problem("operation_conflict", "This operation ID already identifies a different desktop command", 409)
        else:
            if not online(machine):
                raise Problem("node_offline", "The node desktop worker is offline; run ara node work on the node", 409)
            if "view" not in private_status(session, id).get("policy", {}).get("remote_access", []):
                raise Problem("node_desktop_disabled", "Enable remote desktop access on the node with ara cua remote --allow-view", 403)
            pending = session.scalars(select(Entity).where(Entity.kind == "computer_command",
                Entity.data["machine_id"].astext == id, Entity.data["state"].astext == "queued")).all()
            if len([r for r in pending if r.data["expires"] > time.time()]) >= 8:
                raise Problem("computer_busy", "This node has queued desktop commands; wait for completion", 409)
            session.add(Entity(id=ident, kind="computer_command", data={"machine_id": id, "request": request,
                "expires": time.time() + 15, "state": "queued"}))
    while True:
        with transaction() as session:
            row = get(session, ident, "computer_command")
        if row.get("result") is not None:
            value = dict(row["result"])
            if kind == "action" and actor and value.get("metadata", {}).get("state") == "pending":
                # A repeated agent operation can retrieve its post-approval receipt
                # without re-admitting the input or minting a second approval.
                value = await command(id, "receipt", {"command_id": ident}, actor=actor)
                if value.get("metadata", {}).get("state") != "pending":
                    receive(id, ident, value)
                return value
            cached = FRAMES.get(ident)
            if cached and cached[0] > time.time() - 30:
                value["frame_base64"] = cached[1]
            elif value.pop("frame_available", False):
                value.update(success=False, error="The transient frame expired; request a fresh screenshot")
            return {k: v for k, v in value.items() if k != "frame_available"}
        if row["expires"] < time.time():
            recoverable = (kind in {"approve", "reject"} or
                           (kind == "action" and body.get("action") != "screenshot"))
            with transaction() as session:
                machine = get(session, id, "machine")
            if recoverable and online(machine):
                # Lost result delivery is a read of the original node receipt.
                # Never extend the expired input's execution deadline.
                value = await command(id, "receipt", {"command_id": ident}, actor=actor)
                if value.get("metadata", {}).get("outcome") != "unknown":
                    receive(id, ident, value)
                return value
            return {"success": False, "error": "Node desktop response timed out. Inspect the device; reuse this operation ID to retrieve its receipt.",
                    "metadata": {"outcome": "unknown", "operation_id": operation_id}}
        await asyncio.sleep(.15)


def poll(id, status):
    from ..node_execution import bindings
    if not isinstance(status, dict) or len(json.dumps(status)) > 100_000:
        raise Problem("invalid_computer_status", "Desktop status is limited to 100 KB")
    cfg, device, pending = status.get("policy"), status.get("device"), status.get("approvals")
    if (not isinstance(cfg, dict) or not isinstance(device, dict) or not isinstance(pending, list) or
            not isinstance(device.get("metadata", {}), dict) or len(pending) > 32 or
            not isinstance(device.get("state", "needs_verification"), str) or
            not isinstance(device.get("platform", "linux"), str) or
            device.get("metadata", {}).get("detail") is not None and
            not isinstance(device["metadata"]["detail"], str)):
        raise Problem("invalid_computer_status", "Provide desktop, policy and bounded approval metadata")
    grants, access = cfg.get("grants"), cfg.get("remote_access")
    if (cfg.get("mode") not in ("view_only", "supervised", "autonomous") or
            type(cfg.get("kill_switch")) is not bool or not isinstance(access, list) or
            any(p not in ("view", "input") for p in access) or not isinstance(grants, dict) or
            any(not isinstance(v, list) or any(p not in ("view", "input") for p in v) for v in grants.values()) or
            any(not isinstance(a, dict) or not isinstance(a.get("id"), str) or
                not isinstance(a.get("actor"), str) or not isinstance(a.get("action"), dict) for a in pending)):
        raise Problem("invalid_computer_status", "Invalid desktop policy or approval metadata")
    with transaction() as session:
        machine_row = session.scalar(select(Entity).where(Entity.id == id, Entity.kind == "machine").with_for_update())
        if machine_row is None:
            raise Problem("node_not_found", "This paired node no longer exists", 404)
        machine = machine_row.data
        machine_row.data = {**machine_row.data, "computer_seen": time.time()}
        machine_row.revision += 1
        status_row = session.get(Entity, "computer-status:" + id)
        if status_row:
            update_command(status_row, status)
        else:
            session.add(Entity(id="computer-status:" + id, kind="computer_status", data=status))
        assigned = [{k: b[k] for k in ("profile_id", "native_name", "enabled", "generation")} for b in bindings(session, id)]
        commands = session.scalars(select(Entity).where(Entity.kind == "computer_command",
            Entity.data["machine_id"].astext == id, Entity.data["state"].astext == "queued")
            .order_by(Entity.created_at)).all()
        fresh = [r for r in commands if r.data["expires"] > time.time()]
        # Expired commands are never offered, even after a host restart.
        for row in commands:
            if row.data["expires"] <= time.time():
                update_command(row, {"state": "expired"})
        old = session.scalars(select(Entity).where(Entity.kind == "computer_command",
            Entity.data["machine_id"].astext == id,
            Entity.created_at < datetime.now(timezone.utc) - timedelta(seconds=75))).all()
        for row in old:
            request = row.data["request"]
            if request["kind"] in {"ui_tree", "receipt"} or (request["kind"] == "action" and request["body"].get("action") == "screenshot"):
                session.delete(row)
        return {"commands": [{"id": row.id, **row.data} for row in fresh[:1]],
                "pause": machine.get("computer_pause", False), "bindings": assigned, "server_time": time.time()}


def receive(id, ident, result):
    if not isinstance(result, dict) or len(json.dumps(result)) > MAX_RESULT:
        raise Problem("computer_result_too_large", "Desktop results are limited to 12 MB", 413)
    if not isinstance(result.get("metadata", {}), dict):
        raise Problem("invalid_computer_result", "Desktop result metadata must be an object")
    if result.get("frame_base64") is not None and not isinstance(result["frame_base64"], str):
        raise Problem("invalid_computer_frame", "Desktop frames must be base64 strings")
    with transaction() as session:
        row = session.scalar(select(Entity).where(Entity.id == ident).with_for_update())
        if row is None or row.kind != "computer_command" or row.data["machine_id"] != id:
            raise Problem("command_not_owned", "This node does not own that desktop command", 403)
        if row.data.get("result") is None or row.data["result"].get("metadata", {}).get("state") == "pending":
            clean = {k: v for k, v in result.items() if k != "frame_base64"}
            _remember(ident, result)
            if result.get("frame_base64"):
                clean["frame_available"] = True
            update_command(row, {"state": "finished", "result": clean})
    return {"acknowledged": ident}


def profile_target(profile, device_id=None):
    from ..deployments import resolve
    target = machine_id(device_id) if device_id and device_id.startswith(PREFIX) else "local" if device_id == "local_desktop" else None
    id = resolve(profile, target)["machine_id"]
    return id if id != "local" else None


def view_targets(profile):
    from ..deployments import entries, active
    from . import policy
    result = []
    for entry in entries(profile):
        id = entry["machine_id"]
        if not active(profile, id):
            continue
        try:
            cfg = policy.read() if id == "local" else state(id)
        except Problem:
            continue
        if "view" in cfg["grants"].get(profile["id"], []) and (id == "local" or "view" in cfg["remote_access"]):
            result.append(id)
    return result


async def profile_devices(profile):
    from .engine import cua_engine
    targets = view_targets(profile)
    found = await cua_engine.list_devices() if "local" in targets else []
    return [*found, *(d for d in devices() if d["machine_id"] in targets)]


def forget(session, id):
    status_row = session.get(Entity, "computer-status:" + id)
    if status_row:
        session.delete(status_row)
    for row in session.scalars(select(Entity).where(Entity.kind == "computer_command",
            Entity.data["machine_id"].astext == id)):
        FRAMES.pop(row.id, None)
        session.delete(row)


async def invoke(profile, name, args):
    id = profile_target(profile, args.get("device_id"))
    if not profile.get("enabled"):
        raise Problem("profile_disabled", "This profile is disabled", 403)
    if args.get("device_id") not in {None, "local_desktop", PREFIX + id}:
        raise Problem("device_not_owned", "Use the desktop assigned to this profile's node", 403)
    if name == "ara_cua_list_devices":
        found = [d for d in devices() if d["id"] == PREFIX + id]
        return {"devices": found, "count": len(found)}
    if name == "ara_cua_semantic":
        return {"success": False, "error": "OS scripting is not part of desktop authority"}
    kind = "action" if name == "ara_cua_computer" else "ui_tree"
    if kind == "action" and args.get("action") != "screenshot" and not args.get("operation_id"):
        raise Problem("operation_id_required", "Agent input requires a stable operation_id")
    body = {k: v for k, v in args.items() if k not in {"device_id", "operation_id"}}
    return await command(id, kind, body, actor=profile["id"], operation_id=args.get("operation_id"))
