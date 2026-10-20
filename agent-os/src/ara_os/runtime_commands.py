"""Authenticated host-to-instance commands with durable, ordered native events."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid

from sqlalchemy import select

from . import config, instances
from .recovery import cipher
from .store import Entity, Problem, get, transaction
from .task_journal import fingerprint

HTTP_PREFIXES = ("/api/providers/oauth", "/api/providers/custom-endpoints", "/api/messaging/platforms",
    "/api/skills", "/api/tools", "/api/cron/jobs", "/api/mcp/servers", "/api/memory/providers",
    "/api/model/info", "/api/model/options", "/api/model/set", "/api/config", "/api/env",
    "/api/audio/transcribe", "/api/audio/speak", "/api/audio/voice-live/status", "/api/sessions")
RPC_METHODS = {"prompt.receipt", "prompt.cancel", "session.interrupt", "approval.respond", "clarify.respond"}


def permitted(request):
    operation = request.get("operation")
    if operation == "rpc":
        return request.get("method") in RPC_METHODS
    if operation == "http":
        path = request.get("path", "")
        return (isinstance(path, str) and ".." not in path and "?" not in path and
                any(path == p or path.startswith(p + "/") for p in HTTP_PREFIXES) and
                not (path == "/api/env" and request.get("method") != "PUT"))
    return operation in {"run", "instance-assets", "instance-asset", "pending-review", "definition-capture", "instance-swarm", "instance-preferences", "definition-preview", "definition-apply", "instance-export"}


def target(profile, machine_id=None, *, pinned=None):
    from .deployments import resolve, active, entries, receipt_id
    if pinned:
        # Historical ownership never follows the current default machine.
        value = dict(pinned)
        if value["machine_id"] == "local" and config.coordinator_only():
            raise Problem("coordinator_only", "This historical conversation belongs to the local runtime, which is disabled in coordinator mode", 409)
        current = active(profile, value["machine_id"], value["native_name"])
        if not current or current["instance_id"] != value["instance_id"]:
            raise Problem("instance_disabled", "This conversation's runtime instance is disabled or its ownership changed", 409)
        if value["machine_id"] != "local":
            with transaction() as session:
                receipt = session.get(Entity, receipt_id(profile["id"], value["machine_id"]))
                if not receipt or receipt.data.get("generation") != current["generation"]:
                    raise Problem("instance_not_ready", "Wait for this node to confirm its current deployment before resuming", 409)
                if receipt.data.get("owner_epoch") != value.get("owner_epoch"):
                    raise Problem("instance_owner_changed", "This historical conversation belongs to a previous native owner. Inspect its history before opening a new conversation", 409)
        # Pause/resume may rotate deployment admission while the native instance
        # and its session ownership remain the same. New commands use the fresh
        # fence; previously queued commands keep their original fence.
        return {**value, "generation": current["generation"]}
    placement = resolve(profile, machine_id)
    if placement["machine_id"] == "local" and config.coordinator_only():
        raise Problem("coordinator_only", "Deploy this agent to a node or select one of its node instances", 409)
    current = active(profile, placement["machine_id"])
    entry = next(e for e in entries(profile) if e["machine_id"] == placement["machine_id"])
    value = {**placement, "profile_id": profile["id"],
        "instance_id": entry.get("instance_id") or instances.identity(profile["id"], placement["machine_id"]),
        "generation": current["generation"], "machine_name": "This machine", "model_connection": None}
    with transaction() as session:
        machine = get(session, placement["machine_id"], "machine")
        value["machine_name"] = machine["name"]
        value["runtime_contract"] = machine.get("runtime_contract")
        receipt = session.get(Entity, receipt_id(profile["id"], placement["machine_id"]))
        if receipt and receipt.data.get("generation") == current["generation"]:
            value.update({k: receipt.data.get(k) for k in ("model_connection", "runtime_state", "definition_revision", "owner_epoch", "swarm_config", "context_ready")})
        policy = session.get(Entity, "instance-policy:" + value["instance_id"])
        if policy and policy.data.get("generation") == current["generation"]:
            value["swarm_config"] = policy.data["config"]
    return value


def selected(profile, machine_id=None, *, pinned=None):
    value = target(profile, machine_id, pinned=pinned)
    return {**profile, "native_name": value["native_name"], "_runtime_target": value}


def enqueue(session, owner, request, *, operation_id=None, run_id=None, conversation_id=None):
    machine = get(session, owner["machine_id"], "machine")
    if machine.get("runtime_contract") != "ara-runtime/1":
        raise Problem("node_upgrade_required", "Update ARA on this node and restart ara node work to enable native agent chat and settings", 409)
    if not owner.get("owner_epoch"):
        raise Problem("instance_not_ready", "Wait for the node to confirm this native instance's ownership before sending commands", 409)
    if not permitted(request):
        raise Problem("runtime_operation_unavailable", "This native operation is not available on a remote instance", 403)
    operation_id = operation_id or uuid.uuid4().hex
    id = hashlib.sha256(f"native:{owner['instance_id']}:{operation_id}".encode()).hexdigest()
    envelope = {"contract": "ara-runtime/1", "instance_id": owner["instance_id"], "profile_id": owner["profile_id"],
        "native_name": owner["native_name"], "generation": owner["generation"], "owner_epoch": owner["owner_epoch"], "request": request}
    digest = fingerprint(envelope)
    previous = session.get(Entity, id)
    if previous:
        if previous.kind != "runtime_command" or previous.data["fingerprint"] != digest:
            raise Problem("operation_conflict", "This native operation ID already identifies different work", 409)
        return id
    # Credentials may be intentionally supplied to the selected native owner.
    # Encrypt command payloads rather than placing keys in ordinary entity JSON.
    session.add(Entity(id=id, kind="runtime_command", data={"machine_id": owner["machine_id"],
        "instance_id": owner["instance_id"], "profile_id": owner["profile_id"], "generation": owner["generation"],
        "fingerprint": digest, "payload": cipher().encrypt(json.dumps(envelope).encode()).decode(),
        "state": "queued", "cursor": 0, "run_id": run_id, "conversation_id": conversation_id,
        "expires": None if request["operation"] == "run" else time.time() + 120}))
    return id


async def frames(profile, request):
    owner = profile["_runtime_target"]
    with transaction() as session:
        id = enqueue(session, owner, request, operation_id=request.get("submission_id"))
    cursor = 0
    while True:
        with transaction() as session:
            row = get(session, id, "runtime_command")
            batches = session.scalars(select(Entity).where(Entity.kind == "runtime_frame",
                Entity.data["command_id"].astext == id).order_by(Entity.created_at)).all()
            values = sorted((b.data for b in batches if b.data["sequence"] > cursor), key=lambda b: b["sequence"])
        for item in values:
            cursor = item["sequence"]
            yield json.loads(cipher().decrypt(item["payload"].encode()))
        if row["state"] in {"finished", "unknown", "expired"} and cursor >= row["cursor"]:
            if row["state"] != "finished":
                raise Problem("runtime_outcome_unknown", "The node did not confirm completion. Inspect its native receipt before retrying", 409)
            return
        if row.get("expires") and row["expires"] < time.time():
            raise Problem("node_response_pending", "The node has not confirmed this native operation. Do not repeat uncertain changes", 409)
        await asyncio.sleep(.2)


def poll(session, machine_id):
    from .deployments import active
    result = []
    for row in session.scalars(select(Entity).where(Entity.kind == "runtime_command",
            Entity.data["machine_id"].astext == machine_id,
            Entity.data["state"].astext.in_(["queued", "running"])) .order_by(Entity.data["state"].astext, Entity.created_at)):
        data = row.data
        profile_row = session.get(Entity, data["profile_id"])
        profile = get(session, data["profile_id"], "profile") if profile_row and profile_row.kind == "profile" else None
        binding = active(profile, machine_id) if profile else None
        if data["state"] == "queued" and (not binding or binding["generation"] != data["generation"] or
                data.get("expires") and data["expires"] < time.time()):
            # Delivery may have succeeded before the host lost its response.
            # Ask the node to inspect its inbox; never certify unobserved cancellation.
            revoked = True
        else:
            revoked = not binding or binding["generation"] != data["generation"]
        result.append({"id": row.id, "envelope": json.loads(cipher().decrypt(data["payload"].encode())),
                       "ack": data["cursor"], "state": data["state"], "revoked": revoked})
        if len(result) >= 32:
            break
    return result


def receive(session, machine_id, id, batch, terminal=False):
    if not isinstance(batch, list) or len(batch) > 64 or len(json.dumps(batch)) > 12_000_000:
        raise Problem("invalid_runtime_events", "Send at most 64 native events and 12 MB")
    row = session.scalar(select(Entity).where(Entity.id == id).with_for_update())
    if row is None or row.kind != "runtime_command" or row.data["machine_id"] != machine_id:
        raise Problem("command_not_owned", "This node does not own the native command", 403)
    data = row.data
    cursor = data["cursor"]
    for item in batch:
        sequence, frame = item.get("sequence"), item.get("frame")
        if type(sequence) is not int or not isinstance(frame, dict) or frame.get("type") not in {"session", "admission", "event", "error", "unknown", "result", "receipt"}:
            raise Problem("invalid_runtime_events", "Invalid native event envelope")
        frame_id = f"native-frame:{id}:{sequence}"
        previous = session.get(Entity, frame_id)
        if sequence <= cursor:
            if not previous or json.loads(cipher().decrypt(previous.data["payload"].encode())) != frame:
                raise Problem("runtime_event_conflict", "A native event cannot be replaced", 409)
            continue
        if sequence != cursor + 1:
            raise Problem("runtime_event_gap", "Replay missing native events before later events", 409)
        session.add(Entity(id=frame_id, kind="runtime_frame", data={"command_id": id, "sequence": sequence,
            "payload": cipher().encrypt(json.dumps(frame).encode()).decode()}))
        if data.get("run_id") and session.get(Entity, data["run_id"]) and session.get(Entity, data["conversation_id"]):
            from .runs import apply_frame
            apply_frame(session, data["run_id"], data["conversation_id"], frame)
        cursor = sequence
    row.data = {**data, "cursor": cursor, "state": "finished" if terminal or data["state"] == "finished" else "running"}
    row.revision += 1
    return {"acknowledged_sequence": cursor}
