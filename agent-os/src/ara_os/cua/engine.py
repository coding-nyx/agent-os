"""ARA-managed native desktop execution with explicit policy and intervention."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import tempfile
import time
import uuid
from dataclasses import asdict
from contextlib import asynccontextmanager

from .. import config
from . import policy
from .models import CUAAction, CUAActionResult, CUAActionKind
from .providers.native import NativeDeviceProvider


class CUAEngine:
    def __init__(self, *, remote=False):
        self.provider = NativeDeviceProvider()
        self.observations = {}
        self.remote = remote
        self.remote_epoch = None
        self.remote_deadline = None

    @property
    def kill_switch_active(self):
        return policy.read()["kill_switch"]

    def set_kill_switch(self, active):
        return policy.update({"kill_switch": active})["kill_switch"]

    def set_mode(self, mode):
        return policy.update({"mode": mode})["mode"]

    async def list_devices(self):
        try:
            info = await self.provider.get_device_info()
            value = info.to_dict()
        except Exception:
            value = {"id": "local_desktop", "name": "Local desktop", "platform": "linux",
                     "state": "unavailable", "resolution": [0, 0], "capabilities": [],
                     "metadata": {"detail": "Native backend unavailable; run the node's computer-use readiness checks."}}
        cfg = policy.read()
        return [{**value, "mode": cfg["mode"], "kill_switch": cfg["kill_switch"]}]

    async def get_provider_or_raise(self, device_id):
        if device_id != "local_desktop":
            raise ValueError("This device has no validated native desktop adapter")
        return self.provider

    def authorize(self, actor, operator, *, input=False, cfg=None):
        cfg = policy.read() if cfg is None else cfg
        if actor and not operator:
            from ..node_deployments import is_disabled
            if is_disabled(actor):
                return "This agent deployment is disabled on this node"
        if self.remote:
            if "view" not in cfg["remote_access"]:
                return "Remote desktop observation has not been enabled on this node"
            if input and ("input" not in cfg["remote_access"] or cfg["remote_pause"]):
                return "Remote desktop input is disabled or paused on this node"
            if input and (self.remote_epoch != cfg["epoch"] or
                          self.remote_deadline is None or self.remote_deadline <= time.time()):
                return "Remote desktop command expired or its admission policy changed"
        if not operator and (not actor or "view" not in cfg["grants"].get(actor, [])):
            return "This profile has no computer observation grant"
        if input:
            if cfg["kill_switch"]:
                return "Emergency Kill Switch is ACTIVE. New managed inputs are blocked."
            if cfg["mode"] == "view_only":
                return "Computer control is in view_only mode"
            if not operator and "input" not in cfg["grants"].get(actor, []):
                return "This profile has no computer input grant"
        return None

    async def _execute(self, operation):
        import fcntl
        config.STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (config.STATE / ".computer-device.lock").open("a") as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    await asyncio.sleep(.05)
            cfg = policy.read()
            # A policy/stop change in any ARA process interrupts the transport.
            # An already delivered OS action cannot be rolled back.
            task = asyncio.create_task(operation(cfg))
            async def changed():
                while policy.read()["epoch"] == cfg["epoch"]:
                    await asyncio.sleep(.1)
            watcher = asyncio.create_task(changed())
            try:
                done, _ = await asyncio.wait([task, watcher], return_when=asyncio.FIRST_COMPLETED)
                if watcher in done or policy.read()["epoch"] != cfg["epoch"]:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                    return CUAActionResult(success=False, error="Operator policy changed; execution stopped. Inspect the device before retrying.",
                                           metadata={"outcome": "unknown"})
                return await task
            finally:
                task.cancel()
                watcher.cancel()
                await asyncio.gather(task, watcher, return_exceptions=True)

    @staticmethod
    def save_receipt(path, value):
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
            staged = stream.name
            os.chmod(staged, 0o600)
            json.dump(value, stream)
        os.replace(staged, path)

    def claim_controller(self, actor):
        # Called only under the device lock, after authorization and approval.
        path = config.STATE / "computer-controller.json"
        lease = json.loads(path.read_text()) if path.exists() else {}
        if actor != "operator" and lease.get("owner") not in {None, actor} and lease.get("expires", 0) > time.time():
            return "Another controller owns this desktop; wait for hand-back"
        self.save_receipt(path, {"owner": actor, "expires": time.time() + 15})
        return None

    def operation_path(self, actor, operation_id):
        directory = config.STATE / "computer-operations"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        return directory / (hashlib.sha256(f"{actor}:{operation_id}".encode()).hexdigest() + ".json")

    @asynccontextmanager
    async def operation_lock(self, path):
        import fcntl
        with path.with_suffix(".lock").open("a") as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    await asyncio.sleep(.05)
            yield

    async def act(self, device_id, action, *, actor=None, operator=False, operation_id=None):
        if operator or action.action == CUAActionKind.SCREENSHOT:
            return await self._act(device_id, action, actor=actor, operator=operator, operation_id=operation_id)
        denied = self.authorize(actor, operator, input=True)
        if denied:
            return CUAActionResult(success=False, error=denied)
        if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 120:
            return CUAActionResult(success=False, error="Agent input requires a stable operation_id; do not retry unknown work")
        async with self.operation_lock(self.operation_path(actor, operation_id)):
            return await self._recorded_act(device_id, action, actor, operation_id)

    async def _recorded_act(self, device_id, action, actor, operation_id):
        path = self.operation_path(actor, operation_id)
        request = json.loads(json.dumps({"device_id": device_id, "action": asdict(action)}))
        try:
            with path.open("x") as stream:
                os.chmod(path, 0o600)
                json.dump({"request": request, "state": "admitted"}, stream)
        except FileExistsError:
            try:
                prior = json.loads(path.read_text())
            except (ValueError, OSError):
                return CUAActionResult(success=False, error="Action receipt is incomplete; inspect the device instead of retrying")
            if prior["request"] != request:
                return CUAActionResult(success=False, error="operation_id already identifies a different computer action")
            if "result" not in prior:
                return CUAActionResult(success=False, error="Action outcome is pending or unknown; inspect before retrying")
            return CUAActionResult(**prior["result"])
        try:
            result = await self._act(device_id, action, actor=actor, operation_id=operation_id)
        except Exception:
            result = CUAActionResult(success=False, error="Execution outcome was not confirmed. Inspect the device before retrying.",
                                     metadata={"outcome": "unknown"})
        self.save_receipt(path, {"request": request, "result": result.to_dict()})
        return result

    async def _act(self, device_id, action, *, actor=None, operator=False, approval=None, operation_id=None):
        prov = await self.get_provider_or_raise(device_id)
        is_input = action.action != CUAActionKind.SCREENSHOT
        denied = self.authorize(actor, operator, input=is_input)
        if denied:
            return CUAActionResult(success=False, error=denied)
        observation = self.observations.get("operator" if operator else actor)
        async def invoke(cfg):
            # Every dispatch decision uses the current policy after the lock wait.
            denied = self.authorize(actor, operator, input=is_input, cfg=cfg)
            if denied:
                return CUAActionResult(success=False, error=denied)
            if is_input:
                if not observation or time.time() - observation["created"] > 15:
                    return CUAActionResult(success=False, error="Capture a fresh target window before requesting input")
                if approval is not None and (approval.get("policy_epoch") != cfg["epoch"] or
                        approval.get("actor") != actor or approval.get("device_id") != device_id or
                        approval.get("operation_id") != operation_id or
                        approval.get("action") != json.loads(json.dumps(asdict(action))) or
                        approval.get("observation", {}).get("id") != observation.get("id")):
                    return CUAActionResult(success=False, error="Approval no longer matches this action or policy; capture and request again")
                if cfg["mode"] == "supervised" and not operator and approval is None:
                    directory = config.STATE / "computer-approvals"
                    directory.mkdir(exist_ok=True, mode=0o700)
                    ident = uuid.uuid4().hex
                    self.save_receipt(directory / (ident + ".json"), {"id": ident, "device_id": device_id, "actor": actor,
                        "action": asdict(action), "operation_id": operation_id, "observation": observation,
                        "policy_epoch": cfg["epoch"], "created": time.time()})
                    result = CUAActionResult(success=False, error="Operator approval required",
                        metadata={"approval_id": ident, "state": "pending"})
                    # The operation lock serializes this pending receipt with decisions.
                    return result
                denied = self.claim_controller("operator" if operator else actor)
                if denied:
                    return CUAActionResult(success=False, error=denied)
                prov.metadata = dict(observation["metadata"])
                prov.observed_at = time.monotonic() - (time.time() - observation["created"])
            if hasattr(prov, "actor"):
                prov.actor = "operator" if operator else actor
                prov.policy_epoch = cfg["epoch"]
            result = await prov.send_input(action)
            if result.success and result.frame_base64 and policy.read()["epoch"] == cfg["epoch"]:
                self.observations["operator" if operator else actor] = {
                    "id": uuid.uuid4().hex, "metadata": result.metadata, "created": time.time()}
            return result
        return await self._execute(invoke)

    async def approve(self, ident):
        if not re.fullmatch(r"[a-f0-9]{32}", ident):
            raise ValueError("Invalid approval ID")
        path = config.STATE / "computer-approvals" / (ident + ".json")
        receipt = path.with_suffix(".consumed")
        try:
            os.rename(path, receipt)
        except FileNotFoundError:
            raise ValueError("This approval was already consumed or does not exist")
        value = json.loads(receipt.read_text())
        path = self.operation_path(value["actor"], value["operation_id"])
        async with self.operation_lock(path):
            return await self._approve(value, path)

    async def _approve(self, value, path):
        prior = json.loads(path.read_text())
        if (prior.get("request") != {"device_id": value["device_id"], "action": value["action"]} or
                prior.get("result", {}).get("metadata", {}).get("approval_id") != value["id"] or
                prior.get("result", {}).get("metadata", {}).get("state") != "pending"):
            return CUAActionResult(success=False, error="Approval no longer matches the admitted computer action")
        unknown = CUAActionResult(success=False, error="Approval consumed; inspect the device if no completion receipt arrives",
                                  metadata={"outcome": "unknown"})
        self.save_receipt(path, {**prior, "result": unknown.to_dict()})
        if time.time() - value["created"] > 120:
            result = CUAActionResult(success=False, error="Approval expired; capture the current device before requesting another action")
        else:
            self.observations[value["actor"]] = value["observation"]
            result = await self._act(value["device_id"], CUAAction.from_dict(value["action"]),
                actor=value["actor"], approval=value, operation_id=value["operation_id"])
        self.save_receipt(path, {**prior, "result": result.to_dict()})
        return result

    def reject(self, ident):
        if not re.fullmatch(r"[a-f0-9]{32}", ident):
            raise ValueError("Invalid approval ID")
        path = config.STATE / "computer-approvals" / (ident + ".json")
        try:
            os.rename(path, path.with_suffix(".consumed"))
        except FileNotFoundError:
            raise ValueError("This approval was already consumed or does not exist")
        value = json.loads(path.with_suffix(".consumed").read_text())
        result = CUAActionResult(success=False, error="Operator rejected this computer action", metadata={"state": "denied"})
        receipt = self.operation_path(value["actor"], value["operation_id"])
        import fcntl
        with receipt.with_suffix(".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            prior = json.loads(receipt.read_text())
            self.save_receipt(receipt, {**prior, "result": result.to_dict()})
        return result

    async def execute_semantic(self, device_id, script, engine=""):
        return CUAActionResult(success=False, error="OS scripting is not part of a computer-control grant. Use separately authorized terminal tools.")

    async def get_frame(self, device_id):
        result = await self.act(device_id, CUAAction.from_dict({"action": "screenshot"}), operator=True)
        if not result.success or not result.frame_base64:
            raise ValueError(result.error or "Native capture failed")
        return base64.b64decode(result.frame_base64), result.metadata

    async def get_ui_tree(self, device_id, *, actor=None, operator=False):
        denied = self.authorize(actor, operator)
        if denied:
            raise ValueError(denied)
        prov = await self.get_provider_or_raise(device_id)
        async def invoke(cfg):
            denied = self.authorize(actor, operator, cfg=cfg)
            if denied:
                return CUAActionResult(success=False, error=denied)
            if hasattr(prov, "actor"):
                prov.actor = "operator" if operator else actor
                prov.policy_epoch = cfg["epoch"]
            return await prov.get_ui_tree()
        value = await self._execute(invoke)
        if isinstance(value, CUAActionResult):
            raise ValueError(value.error)
        return value


cua_engine = CUAEngine()
