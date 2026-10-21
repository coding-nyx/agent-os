"""Desktop worker for execution-only nodes; no application database is used."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time

import httpx

from .. import config
from ..node_execution import validate_connection
from . import policy
from .engine import CUAEngine
from .models import CUAAction
from .models import local_platform
from . import setup

log = logging.getLogger(__name__)


def failure(detail, outcome="not_started"):
    return {"success": False, "error": detail, "metadata": {"outcome": outcome}}


class NodeComputer:
    def __init__(self, enrollment):
        validate_connection(enrollment)
        self.enrollment = enrollment
        self.engine = CUAEngine(remote=True)
        self.bindings = []
        self.observations = {}
        self.job = None
        self.job_id = None
        self.completed = {}
        self.device = {"platform": local_platform(), "state": "needs_verification", "capabilities": []}
        self.checked = 0
        self.last_error = 0

    def status(self):
        from ..node_deployments import authorized
        cfg = policy.read()
        allowed = "view" in cfg["remote_access"]
        # Never advertise grants for native profiles not assigned to this host.
        confirmed = [b for b in self.bindings if b["enabled"] and
                     authorized(b["native_name"], b["profile_id"], b.get("generation"))]
        grants = {b["profile_id"]: cfg["grants"].get(b["native_name"], []) for b in confirmed}
        approvals = []
        if allowed:
            for path in sorted((config.STATE / "computer-approvals").glob("*.json")):
                try:
                    value = json.loads(path.read_text())
                except FileNotFoundError:
                    continue  # A local operator may consume it during discovery.
                if any(b["native_name"] == value["actor"] for b in confirmed):
                    approvals.append({k: value[k] for k in ("id", "actor", "action", "created")})
                if len(approvals) >= 32:
                    break
        status = {"device": self.device, "setup_contract": setup.CONTRACT, "setup": setup.cached(), "policy": {**{k: cfg[k] for k in
            ("mode", "kill_switch", "epoch", "remote_access", "remote_pause")}, "grants": grants if allowed else {}},
                "approvals": approvals}
        # Include complete actions within the status budget. Further approvals
        # appear when the preceding ones are consumed; never truncate typed text.
        while status["approvals"] and len(json.dumps(status)) > 96_000:
            status["approvals"].pop()
        return status

    def receipt_path(self, ident):
        if not isinstance(ident, str) or not re.fullmatch(r"[a-f0-9]{64}", ident):
            raise ValueError("Invalid desktop command identity")
        directory = config.STATE / "computer-node-commands"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        return directory / (ident + ".json")

    def actor(self, profile_id):
        if profile_id is None:
            return None
        binding = next((b for b in self.bindings if b["profile_id"] == profile_id and b["enabled"]), None)
        if not binding:
            raise ValueError("This profile is no longer enabled and assigned to this node")
        from ..node_deployments import authorized
        if not authorized(binding["native_name"], profile_id, binding.get("generation")):
            raise ValueError("This agent deployment has not been confirmed on this node")
        return binding["native_name"]

    async def execute(self, command):
        """Admit before dispatch. A crashed admission is uncertain and never replayed."""
        ident = command["id"]
        path = self.receipt_path(ident)
        request = command["request"]
        readonly = request["kind"] in {"ui_tree", "receipt"} or (request["kind"] == "action" and
                    request["body"].get("action") == "screenshot") or (request["kind"] == "setup" and request["body"].get("action") == "check")
        if readonly:
            return await self.perform(command)
        async with self.engine.operation_lock(path):
            if path.exists():
                prior = json.loads(path.read_text())
                if prior["request"] != request:
                    return failure("Desktop command identity conflict")
                result = prior["result"]
                # Agent approvals update the engine's durable operation receipt.
                if result.get("metadata", {}).get("state") == "pending":
                    actor = self.actor(request["actor"])
                    engine_receipt = self.engine.operation_path(actor, ident)
                    if engine_receipt.exists():
                        result = json.loads(engine_receipt.read_text()).get("result", result)
                return result
            if command["expires"] <= time.time():
                return failure("Desktop command expired before dispatch")
            unknown = failure("Desktop command admitted without a confirmed completion; inspect before retrying", "unknown")
            self.engine.save_receipt(path, {"request": request, "result": unknown})
            result = await self.perform(command)
            # Frames are transported once and never retained in durable command receipts.
            clean = {k: v for k, v in result.items() if k != "frame_base64"}
            if result.get("frame_base64"):
                clean = failure("Capture receipt has no retained image; request a fresh snapshot")
            self.engine.save_receipt(path, {"request": request, "result": clean})
            return result

    async def perform(self, command):
        if command["expires"] <= time.time():
            return failure("Desktop command expired before dispatch")
        self.engine.remote_epoch = policy.read()["epoch"]
        self.engine.remote_deadline = command["expires"]
        try:
            async with asyncio.timeout(min(240 if command["request"]["kind"] == "setup" else 12, command["expires"] - time.time())):
                return await self.dispatch(command["id"], command["request"])
        except TimeoutError:
            return failure("Desktop command timed out; inspect before retrying", "unknown")
        except ValueError as exc:
            return failure(str(exc))
        except Exception:
            log.exception("Node desktop command failed")
            return failure("Node desktop execution failed; inspect its local logs", "unknown")

    async def dispatch(self, ident, request):
        kind, body = request["kind"], request["body"]
        if kind == "setup":
            if request.get("actor") is not None:
                return failure("Desktop setup is an operator action, not an agent capability")
            if body.get("action") == "configure":
                values = body.get("values", {})
                if not isinstance(values, dict) or set(values) - {"mode", "remote_access", "grants"}:
                    raise ValueError("Use mode, remote access and assigned-agent grants")
                values = dict(values)
                if "grants" in values:
                    if not isinstance(values["grants"], dict):
                        raise ValueError("Agent grants must be an object")
                    values["grants"] = {**policy.read()["grants"], **{self.actor(id): grants for id, grants in values["grants"].items()}}
                policy.update(values)
                return {"success": True, "policy": self.status()["policy"]}
            result = await setup.perform(body.get("action"))
            self.checked = 0  # Refresh the advertised driver after setup/checks.
            return result
        actor = self.actor(request["actor"])
        operator = actor is None
        denied = self.engine.authorize(actor, operator, input=kind == "approve")
        if denied:
            return failure(denied)
        if kind == "receipt":
            original = self.receipt_path(body["command_id"])
            if not original.exists():
                return failure("No local receipt for this desktop operation", "unknown")
            prior = json.loads(original.read_text())
            if prior["request"]["actor"] != request["actor"]:
                return failure("Receipt belongs to another desktop actor")
            engine_receipt = self.engine.operation_path(actor, body["command_id"])
            return json.loads(engine_receipt.read_text()).get("result", prior["result"]) if engine_receipt.exists() else prior["result"]
        if kind == "action":
            action = CUAAction.from_dict(body)
            if action.action.value != "screenshot":
                observation = self.observations.get(body.get("observation_id"))
                if not observation or observation[0] != actor:
                    return failure("Input requires the observation_id from this actor's fresh node screenshot")
                self.engine.observations["operator" if operator else actor] = observation[1]
            result = (await self.engine.act("local_desktop", action, actor=actor,
                        operator=operator, operation_id=ident)).to_dict()
            if result.get("frame_base64"):
                observation = self.engine.observations["operator" if operator else actor]
                self.observations[observation["id"]] = (actor, observation)
                self.observations = {key: value for key, value in self.observations.items()
                                     if value[1]["created"] > time.time() - 15}
                while len(self.observations) > 64:
                    self.observations.pop(next(iter(self.observations)))
                result["metadata"] = {**result.get("metadata", {}), "observation_id": observation["id"]}
            return result
        if kind == "ui_tree":
            return {"success": True, "ui_tree": await self.engine.get_ui_tree("local_desktop", actor=actor, operator=operator)}
        if kind in {"approve", "reject"} and operator:
            approval_id = body.get("id", "")
            if not re.fullmatch(r"[a-f0-9]{32}", approval_id):
                raise ValueError("Invalid approval identity")
            path = config.STATE / "computer-approvals" / (approval_id + ".json")
            value = json.loads(path.read_text()) if path.exists() else {}
            from ..node_deployments import authorized
            if not any(b["enabled"] and b["native_name"] == value.get("actor") and
                       authorized(b["native_name"], b["profile_id"], b.get("generation")) for b in self.bindings):
                raise ValueError("Approval profile is not enabled and assigned to this node")
            result = (await self.engine.approve(approval_id) if kind == "approve" else
                      await asyncio.to_thread(self.engine.reject, approval_id))
            return result.to_dict()
        raise ValueError("Unsupported node desktop command")

    def apply_control(self, pause, bindings):
        cfg = policy.read()
        if cfg["remote_pause"] != pause or self.bindings != bindings:
            # Epoch changes also interrupt work whose profile was disabled/moved.
            policy.update({"remote_pause": pause})
        self.bindings = bindings

    async def exchange_once(self):
        base = self.enrollment["host"].rstrip("/") + "/api/v1/nodes/computer"
        headers = {"X-ARA-Node-Key": self.enrollment["token"]}
        machine = self.enrollment["machine_id"]
        if not self.checked or time.monotonic() - self.checked > 30:
            try:
                self.device = (await asyncio.wait_for(self.engine.list_devices(), 5))[0]
            except TimeoutError:
                self.device["state"] = "unavailable"
            self.checked = time.monotonic()
        async with httpx.AsyncClient(timeout=4, trust_env=False) as client:
            started = time.monotonic()
            response = await client.post(base + "/poll", headers=headers,
                                         json={"machine_id": machine, "status": self.status()})
            response.raise_for_status()
            data = response.json()
            self.apply_control(data["pause"], data["bindings"])
            if self.job and self.job.done():
                try:
                    self.completed[self.job_id] = self.job.result()
                except Exception:
                    log.exception("Node desktop job did not complete")
                    self.completed[self.job_id] = failure("Desktop job ended without a confirmed receipt", "unknown")
                self.job = self.job_id = None
            acknowledged = set()
            for ident, result in list(self.completed.items()):
                if len(json.dumps(result)) > 12_000_000:
                    result = failure("Desktop result exceeded the 12 MB transport limit", "unknown")
                response = await client.post(base + "/results", headers=headers,
                    json={"machine_id": machine, "command_id": ident, "result": result})
                response.raise_for_status()
                self.completed.pop(ident)
                acknowledged.add(ident)
            from ..node_updates import draining
            if not self.job and data["commands"] and not draining():
                command = data["commands"][0]
                # Translate the host deadline conservatively into this machine's
                # clock; a skewed wall clock must not extend an input's lifetime.
                remaining = command["expires"] - data["server_time"] - (time.monotonic() - started)
                command["expires"] = time.time() + max(0, min(240 if command["request"]["kind"] == "setup" else 15, remaining))
                # Do not re-admit a command just acknowledged in this same poll.
                if command["id"] not in acknowledged:
                    self.job_id = command["id"]
                    self.job = asyncio.create_task(self.execute(command))

    async def run(self):
        self.apply_control(True, [])
        try:
            while True:
                try:
                    await self.exchange_once()
                except Exception:
                    self.apply_control(True, self.bindings)
                    if time.monotonic() - self.last_error > 10:
                        log.warning("Node desktop link unavailable; remote input paused", exc_info=True)
                        self.last_error = time.monotonic()
                    if self.job and not self.job.done():
                        self.job.cancel()
                        await asyncio.gather(self.job, return_exceptions=True)
                        self.completed[self.job_id] = failure("Node link lost during desktop work; inspect before retrying", "unknown")
                        self.job = self.job_id = None
                    await asyncio.sleep(1.5)
                await asyncio.sleep(.5)
        finally:
            self.apply_control(True, self.bindings)
            if self.job:
                self.job.cancel()
                await asyncio.gather(self.job, return_exceptions=True)
