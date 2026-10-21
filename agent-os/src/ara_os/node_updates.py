"""Versioned coordinator requests and node-local staging/activation receipts."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import os
import platform
import re
import subprocess
import time
import uuid

import httpx
from sqlalchemy import select

from . import config, releases
from .node_install import atomic, prepare, read
from .store import Entity, Problem, get

PHASES = {"queued", "downloading", "verifying", "installing_dependencies", "installing_runtime",
          "checking", "waiting_for_idle", "restarting", "complete", "failed"}
TERMINAL = {"complete", "failed", "cancelled"}


def can_cancel(machine):
    request = machine.get("software_update") or {}
    if request.get("phase") != "queued" or request.get("delivered_at") or request.get("reported_at"):
        return False
    # Older hosts did not mark delivery. A heartbeat after the request means
    # the worker might already have received it; never cancel that blindly.
    try:
        seen = datetime.fromisoformat(machine["last_seen"]).timestamp() if machine.get("last_seen") else 0
        return seen < request["requested_at"]
    except (ValueError, TypeError, KeyError):
        return False


def cancel_update(session, machine_id, request_id):
    row = session.scalar(select(Entity).where(Entity.id == machine_id, Entity.kind == "machine").with_for_update())
    if row is None or machine_id == "local":
        raise Problem("node_required", "Select a paired execution node", 404)
    request = row.data.get("software_update") or {}
    if not request_id or request.get("id") != request_id:
        raise Problem("update_changed", "Refresh the node update before cancelling", 409)
    if not can_cancel(row.data):
        raise Problem("update_already_delivered", "This update may already be running. Wait for its result before selecting another release.", 409)
    row.data = {**row.data, "software_update": {**request, "phase": "cancelled", "detail": "Cancelled before delivery to the node"}}
    row.revision += 1


def version_key(value):
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", value or "")
    if not match:
        raise ValueError("Use a semantic release version")
    parts = (match[4] or "").split(".") if match[4] else []
    if any(not p or p.isdigit() and len(p) > 1 and p[0] == "0" for p in parts):
        raise ValueError("Invalid semantic prerelease version")
    prerelease = tuple((0, int(p)) if p.isdigit() else (1, p) for p in parts)
    return (*map(int, match.groups()[:3]), match[4] is None, prerelease)


def describe(machine, target):
    software = machine.get("software") or {}
    supported = software.get("contract") == releases.CONTRACT
    current = software.get("build_id") == target["build_id"]
    try:
        ahead = bool(software.get("version") and version_key(software["version"]) > version_key(target["version"]))
    except ValueError:
        ahead = False
    request = machine.get("software_update")
    return {"installed": software or None, "available": target, "bootstrap_required": not supported,
            "last_seen": machine.get("last_seen"),
            "update_available": supported and not current and not ahead, "ahead": ahead,
            "status": "up_to_date" if current else "bootstrap_required" if not supported else "ahead" if ahead else "update_available",
            "request": request, "can_cancel": can_cancel(machine)}


def request_update(session, machine_id, body, target):
    row = session.scalar(select(Entity).where(Entity.id == machine_id, Entity.kind == "machine").with_for_update())
    if row is None or machine_id == "local":
        raise Problem("node_required", "Select a paired execution node", 404)
    machine = get(session, machine_id, "machine")
    status = describe(machine, target)
    if status["bootstrap_required"]:
        raise Problem("node_updater_required", "Install update support once on this node using the dashboard's upgrade command", 409)
    if body.get("build_id") != target["build_id"]:
        raise Problem("release_changed", "The available release changed; refresh before updating", 409)
    if status["ahead"]:
        raise Problem("node_newer_than_host", "This node runs a newer release; update the coordinator first", 409)
    if status["status"] == "up_to_date":
        return status
    prior = machine.get("software_update")
    if prior and prior.get("phase") not in TERMINAL:
        if prior.get("build_id") != target["build_id"]:
            raise Problem("update_in_progress", "Wait for the current node update before selecting another build", 409)
        return status
    request = {"id": str(uuid.uuid4()), "build_id": target["build_id"], "version": target["version"],
        "phase": "queued", "requested_at": time.time(), "descriptor": target, "detail": None}
    row.data = {**row.data, "software_update": request}
    row.revision += 1
    return describe({**machine, "software_update": request}, target)


def receive(session, machine_id, body):
    software, receipt = body.get("software"), body.get("receipt")
    if (not isinstance(software, dict) or software.get("contract") != releases.CONTRACT or
            not isinstance(software.get("build_id"), str) or not re.fullmatch(r"[a-f0-9]{64}", software["build_id"])):
        raise Problem("invalid_node_version", "Report a versioned node release")
    try:
        version_key(software.get("version"))
    except (TypeError, ValueError):
        raise Problem("invalid_node_version", "Report a semantic application version")
    clean = {k: str(software.get(k) or "")[:100] for k in ("version", "build_id", "runtime_revision", "contract", "platform", "architecture")}
    row = session.scalar(select(Entity).where(Entity.id == machine_id, Entity.kind == "machine").with_for_update())
    if row is None:
        raise Problem("node_required", "This node is no longer paired", 404)
    request = row.data.get("software_update")
    if receipt is not None:
        if not isinstance(receipt, dict) or receipt.get("phase") not in PHASES:
            raise Problem("invalid_update_receipt", "Invalid node update phase")
        if request and receipt.get("id") == request["id"] and receipt.get("build_id") == request["build_id"]:
            phase = receipt["phase"]
            # A queued or stale reply cannot undo a terminal receipt. Completion
            # requires the new process itself to advertise the requested build.
            if request["phase"] not in TERMINAL and (phase != "complete" or clean["build_id"] == request["build_id"]):
                request = {**request, "phase": phase, "detail": str(receipt.get("detail") or "")[:600] or None,
                    "reported_at": time.time()}
    if request and request["phase"] not in TERMINAL and not request.get("delivered_at"):
        request = {**request, "delivered_at": time.time()}
    row.data = {**row.data, "software": clean, "software_update": request,
        "last_seen": datetime.now(timezone.utc).isoformat()}
    row.revision += 1
    return {"update": request if request and request["phase"] not in TERMINAL else None}


def draining():
    return read(config.STATE / "node-update.json", {}).get("phase") in {"waiting_for_idle", "restarting"}


class NodeUpdater:
    def __init__(self, enrollment):
        self.enrollment = enrollment
        self.software = {**releases.installed(), "platform": platform.system().lower(), "architecture": platform.machine()}
        self.path = config.STATE / "node-update.json"
        self.preparation = None
        atomic(config.STATE / "node-worker-health.json", {"pid": os.getpid(), "build_id": self.software["build_id"]})
        receipt = read(self.path, {})
        if receipt.get("phase") == "restarting" and receipt.get("build_id") == self.software["build_id"]:
            from .node_install import install_command
            plan = read(config.STATE / "node-active-release.json")
            if plan and plan.get("build_id") == self.software["build_id"]:
                try:
                    install_command(plan.get("installation_root") or config.STATE.parent, config.STATE, plan)
                except (OSError, subprocess.SubprocessError):
                    # CLI publication must not stop the worker from reconnecting.
                    # Leave a visible diagnostic instead of undoing a healthy update.
                    atomic(config.STATE / "node-cli-status.json", {"state": "repair_required", "detail": "Run scripts/install_cli.py from the active release to repair the public ara command"})
            self.record({**receipt, "phase": "complete", "detail": "Updated worker started successfully"})

    def record(self, receipt):
        atomic(self.path, receipt)

    async def exchange(self):
        from .node_execution import validate_connection
        validate_connection(self.enrollment)
        receipt = read(self.path)
        clean = {k: receipt.get(k) for k in ("id", "build_id", "phase", "detail")} if receipt else None
        async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
            response = await client.post(self.enrollment["host"].rstrip("/") + "/api/v1/nodes/updates/poll",
                headers={"X-ARA-Node-Key": self.enrollment["token"]}, json={"machine_id": self.enrollment["machine_id"],
                    "software": self.software, "receipt": clean})
            response.raise_for_status()
        request = response.json().get("update")
        if not request or receipt and receipt.get("id") == request["id"] and receipt.get("phase") in TERMINAL | {"waiting_for_idle", "restarting"}:
            return
        if self.preparation and not self.preparation.done():
            return
        receipt = {"id": request["id"], "build_id": request["build_id"], "phase": "queued", "detail": None}
        self.record(receipt)
        self.preparation = asyncio.create_task(self.prepare_request(request, receipt))

    async def prepare_request(self, request, receipt):
        def progress(phase):
            self.record({**receipt, "phase": phase})
        try:
            if request["descriptor"]["build_id"] != request["build_id"] or request["descriptor"]["version"] != request["version"]:
                raise ValueError("Update request and release identity disagree")
            if version_key(request["version"]) < version_key(self.software["version"]):
                raise ValueError("A node update cannot downgrade the installed semantic release")
            native = {"source": str(config.RUNTIME_SOURCE), "python": str(config.RUNTIME_PYTHON), "tools": str(config.RUNTIME_TOOLS)}
            plan = await asyncio.to_thread(prepare, config.ROOT, config.STATE, self.enrollment, request["descriptor"], native=native, progress=progress)
            self.record({**receipt, "phase": "waiting_for_idle", "plan": plan,
                "detail": "Waiting for managed work and desktop commands to finish"})
        except Exception:
            self.record({**receipt, "phase": "failed", "detail": "Update preparation failed; inspect the node's private install.log. The running release was retained."})

    async def run(self):
        while True:
            try:
                await self.exchange()
            except (httpx.HTTPError, ValueError, OSError):
                pass  # Keep receipts for reconnect and leave the running code intact.
            await asyncio.sleep(3)

    def ready(self, computer):
        receipt = read(self.path, {})
        if receipt.get("phase") != "waiting_for_idle":
            return False
        from .runtime_journal import RuntimeJournal
        from . import swarm_runner
        if any(row["state"] in {"running", "observing", "observe_pending"} for row in RuntimeJournal().rows()):
            return False
        if any(row["state"] == "running" for row in swarm_runner.journal().pending()):
            return False
        return computer.job is None or computer.job.done()
