"""Desired agent deployments and node-confirmed state, independent of job ownership."""
from __future__ import annotations

import hashlib
import re
import time
import uuid

from sqlalchemy import select, text

from .store import Entity, Problem, change, get, listing
from .task_journal import TERMINAL, fingerprint


def entries(profile):
    if "deployments" in profile:
        return profile["deployments"]
    return [{**(profile.get("execution_placement") or
        {"machine_id": "local", "native_name": profile["native_name"]}), "enabled": True, "generation": "legacy"}]


def binding(profile, entry):
    enabled = bool(profile.get("enabled") and entry["enabled"])
    return {"profile_id": profile["id"], "native_name": entry["native_name"], "enabled": enabled,
            "generation": fingerprint([profile["id"], entry, enabled]), "name": profile["name"],
            "soul": profile.get("soul", ""), "description": profile.get("description", ""),
            "preset": profile.get("preset", "custom")}


def active(profile, machine_id, native_name=None):
    return next((binding(profile, e) for e in entries(profile) if e["machine_id"] == machine_id and
        e["enabled"] and profile.get("enabled") and (native_name is None or e["native_name"] == native_name)), None)


def resolve(profile, machine_id=None):
    if machine_id is None:
        machine_id = (profile.get("execution_placement") or {}).get("machine_id")
        if not machine_id:
            machine_id = next((e["machine_id"] for e in entries(profile) if e["enabled"]), None)
    found = active(profile, machine_id)
    if not found:
        raise Problem("agent_not_deployed", "Deploy and enable this agent on an execution machine first", 409)
    return {"machine_id": machine_id, "native_name": found["native_name"]}


def receipt_id(profile_id, machine_id):
    return "deployment:" + hashlib.sha256(f"{profile_id}:{machine_id}".encode()).hexdigest()


def describe(session, profile):
    machines = {m["id"]: m for m in listing(session, "machine")}
    desired = {e["machine_id"]: e for e in entries(profile)}
    rows = []
    for id in dict.fromkeys([*machines, *desired]):
        machine = machines.get(id, {})
        entry = desired.get(id)
        effective = bool(entry and entry["enabled"] and profile.get("enabled"))
        online = id == "local"
        if id != "local" and machine.get("last_seen"):
            from datetime import datetime
            online = datetime.fromisoformat(machine["last_seen"]).timestamp() > time.time() - 20
        receipt = session.get(Entity, receipt_id(profile["id"], id))
        confirmed = receipt.data if receipt and entry and receipt.data.get("generation") == binding(profile, entry)["generation"] else {}
        if id == "local" and entry:
            from . import runtime
            installed = runtime.home(profile).is_dir()
            confirmed = {"state": "active" if effective and installed else "error" if effective else "disabled",
                         "error": "Local native profile needs setup" if effective and not installed else None}
        state = ("not_deployed" if not entry else confirmed.get("state") or
                 ("deploy_pending" if effective else "disable_pending"))
        rows.append({"machine_id": id, "machine_name": machine.get("name", "Removed machine"),
            "available": bool(machine), "online": online, "native_name": entry["native_name"] if entry else profile["native_name"],
            "desired_enabled": bool(entry and entry["enabled"]), "enabled": effective,
            "state": state, "confirmed_at": confirmed.get("confirmed_at"), "error": confirmed.get("error"),
            "model_configured": confirmed.get("model_configured"), "swarm_enabled": confirmed.get("swarm_enabled")})
    return {"profile_id": profile["id"], "profile_name": profile["name"], "revision": profile["revision"],
            "profile_enabled": profile.get("enabled", False), "primary_machine_id": (profile.get("execution_placement") or {}).get("machine_id", "local")
                if any(e["enabled"] for e in entries(profile)) else None, "machines": rows}


def update(session, profile_id, body):
    # Serialize alias claims across profiles, as well as updates to one profile.
    session.execute(text("SELECT pg_advisory_xact_lock(34821972)"))
    session.scalar(select(Entity).where(Entity.id == profile_id).with_for_update())
    profile = get(session, profile_id, "profile")
    if body.get("revision") is not None and body["revision"] != profile["revision"]:
        raise Problem("revision_conflict", "Agent deployment settings changed. Reload before saving", 409)
    action, ids = body.get("action"), body.get("machine_ids")
    if action not in {"deploy", "undeploy", "primary", "replace"} or not isinstance(ids, list) or not 1 <= len(ids) <= 128 or any(not isinstance(i, str) for i in ids):
        raise Problem("invalid_deployment", "Select one or more machines and a deploy/undeploy action")
    ids = list(dict.fromkeys(ids))
    if action == "primary" and len(ids) != 1:
        raise Problem("invalid_deployment", "Select one default execution machine")
    existing = {e["machine_id"]: dict(e) for e in entries(profile)}
    if action in {"deploy", "replace"}:
        for id in ids:
            get(session, id, "machine")
            name = (existing[id]["native_name"] if id in existing else body.get("native_name") or profile["native_name"])
            if id == "local":
                name = profile["native_name"]
            if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
                raise Problem("invalid_profile_name", "Use a native profile name of up to 64 lowercase letters, digits, underscores or hyphens")
            for other in listing(session, "profile"):
                if other["id"] != profile_id and any(e["machine_id"] == id and e["native_name"] == name for e in entries(other)):
                    raise Problem("placement_in_use", "Another agent owns this native profile name on the selected machine", 409)
            previous = existing.get(id)
            if not previous or not previous["enabled"]:
                existing[id] = {"machine_id": id, "native_name": name, "enabled": True, "generation": uuid.uuid4().hex}
    disabled = ids if action == "undeploy" else [i for i in existing if i not in ids] if action == "replace" else []
    for id in disabled:
        if id in existing and existing[id]["enabled"]:
            existing[id] = {**existing[id], "enabled": False, "generation": uuid.uuid4().hex}
    if disabled:
        for run in listing(session, "swarm_run"):
            if run.get("profile_id") == profile_id and run.get("owner_machine", "local") in disabled and run["state"] not in TERMINAL:
                change(session, run["id"], {"cancel_requested": True})
    if action == "primary":
        if ids[0] not in existing or not existing[ids[0]]["enabled"]:
            raise Problem("agent_not_deployed", "The default machine must have an enabled deployment", 409)
        primary = ids[0]
    else:
        primary = (profile.get("execution_placement") or {}).get("machine_id", "local")
        if primary not in existing or not existing[primary]["enabled"]:
            primary = next((i for i, e in existing.items() if e["enabled"]), None)
    placement = {"machine_id": primary, "native_name": existing[primary]["native_name"]} if primary else None
    updated = change(session, profile_id, {"deployments": list(existing.values()), "execution_placement": placement})
    return describe(session, updated)


def receive(session, machine_id, receipts):
    if not isinstance(receipts, list) or len(receipts) > 128:
        raise Problem("invalid_deployment_receipts", "Send up to 128 deployment receipts")
    accepted = []
    for receipt in receipts:
        if not isinstance(receipt, dict) or receipt.get("state") not in {"active", "disabled", "error"}:
            raise Problem("invalid_deployment_receipt", "Invalid deployment receipt")
        profile = get(session, receipt.get("profile_id", ""), "profile")
        entry = next((e for e in entries(profile) if e["machine_id"] == machine_id), None)
        if not entry or receipt.get("generation") != binding(profile, entry)["generation"]:
            continue  # A newer deploy/undeploy request superseded this report.
        if receipt["state"] == "active" and not binding(profile, entry)["enabled"]:
            continue
        data = {"profile_id": profile["id"], "machine_id": machine_id, "generation": receipt["generation"],
            "state": receipt["state"], "error": str(receipt.get("error") or "")[:1000] or None,
            "model_configured": receipt.get("model_configured") is True, "swarm_enabled": receipt.get("swarm_enabled") is True,
            "confirmed_at": time.time()}
        row = session.get(Entity, receipt_id(profile["id"], machine_id))
        if row:
            row.data = data
            row.revision += 1
        else:
            session.add(Entity(id=receipt_id(profile["id"], machine_id), kind="deployment_receipt", data=data))
        accepted.append(profile["id"])
    return {"acknowledged": accepted}
