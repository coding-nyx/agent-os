"""ARA-managed native desktop execution with explicit policy and intervention."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import asdict

from .. import config
from . import policy
from .models import CUAAction, CUAActionResult, CUAActionKind
from .providers.native import NativeDeviceProvider


class CUAEngine:
    def __init__(self):
        self.provider = NativeDeviceProvider()
        self.observations = {}

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

    def authorize(self, actor, operator, *, input=False):
        cfg = policy.read()
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

    async def _execute(self, operation, actor, *, input=False):
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
            if input:
                lease_path = config.STATE / "computer-controller.json"
                lease = json.loads(lease_path.read_text()) if lease_path.exists() else {}
                if actor != "operator" and lease.get("owner") not in {None, actor} and lease.get("expires", 0) > time.time():
                    return CUAActionResult(success=False, error="Another controller owns this desktop; wait for hand-back")
                lease_path.write_text(json.dumps({"owner": actor, "expires": time.time() + 15}))
                lease_path.chmod(0o600)
            # A policy/stop change in any ARA process interrupts the transport.
            # An already delivered OS action cannot be rolled back.
            task = asyncio.create_task(operation())
            async def changed():
                while policy.read()["epoch"] == cfg["epoch"]:
                    await asyncio.sleep(.1)
            watcher = asyncio.create_task(changed())
            try:
                done, _ = await asyncio.wait([task, watcher], return_when=asyncio.FIRST_COMPLETED)
                if watcher in done:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                    return CUAActionResult(success=False, error="Operator policy changed; execution stopped. Inspect the device before retrying.",
                                           metadata={"outcome": "unknown"})
                return await task
            finally:
                task.cancel()
                watcher.cancel()
                await asyncio.gather(task, watcher, return_exceptions=True)

    def operation_path(self, actor, operation_id):
        directory = config.STATE / "computer-operations"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        return directory / (hashlib.sha256(f"{actor}:{operation_id}".encode()).hexdigest() + ".json")

    async def act(self, device_id, action, *, actor=None, operator=False, approved=False, operation_id=None):
        if operator or action.action == CUAActionKind.SCREENSHOT or approved:
            return await self._act(device_id, action, actor=actor, operator=operator, approved=approved, operation_id=operation_id)
        denied = self.authorize(actor, operator, input=True)
        if denied:
            return CUAActionResult(success=False, error=denied)
        if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 120:
            return CUAActionResult(success=False, error="Agent input requires a stable operation_id; do not retry unknown work")
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
        path.write_text(json.dumps({"request": request, "result": result.to_dict()}))
        return result

    async def _act(self, device_id, action, *, actor=None, operator=False, approved=False, operation_id=None):
        prov = await self.get_provider_or_raise(device_id)
        is_input = action.action != CUAActionKind.SCREENSHOT
        denied = self.authorize(actor, operator, input=is_input)
        if denied:
            return CUAActionResult(success=False, error=denied)
        observation = self.observations.get("operator" if operator else actor)
        if is_input and (not observation or time.time() - observation["created"] > 15):
            return CUAActionResult(success=False, error="Capture a fresh target window before requesting input")
        if is_input and policy.read()["mode"] == "supervised" and not operator and not approved:
            directory = config.STATE / "computer-approvals"
            directory.mkdir(exist_ok=True, mode=0o700)
            ident = uuid.uuid4().hex
            path = directory / (ident + ".json")
            with path.open("x") as stream:
                os.chmod(path, 0o600)
                json.dump({"id": ident, "device_id": device_id, "actor": actor,
                    "action": asdict(action), "operation_id": operation_id, "observation": observation,
                    "created": time.time()}, stream)
            return CUAActionResult(success=False, error="Operator approval required",
                                   metadata={"approval_id": ident, "state": "pending"})
        async def invoke():
            # Policy is checked again after waiting for the device lock.
            denied = self.authorize(actor, operator, input=is_input)
            if denied:
                return CUAActionResult(success=False, error=denied)
            if is_input:
                prov.metadata = dict(observation["metadata"])
                prov.observed_at = time.monotonic() - (time.time() - observation["created"])
            result = await prov.send_input(action)
            if result.success and result.frame_base64:
                self.observations["operator" if operator else actor] = {"metadata": result.metadata, "created": time.time()}
            return result
        return await self._execute(invoke, "operator" if operator else actor, input=is_input)

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
        prior = json.loads(path.read_text())
        unknown = CUAActionResult(success=False, error="Approval consumed; inspect the device if no completion receipt arrives",
                                  metadata={"outcome": "unknown"})
        path.write_text(json.dumps({**prior, "result": unknown.to_dict()}))
        if time.time() - value["created"] > 120:
            result = CUAActionResult(success=False, error="Approval expired; capture the current device before requesting another action")
        else:
            self.observations[value["actor"]] = value["observation"]
            result = await self.act(value["device_id"], CUAAction.from_dict(value["action"]),
                                    actor=value["actor"], approved=True)
        path.write_text(json.dumps({**prior, "result": result.to_dict()}))
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
        prior = json.loads(receipt.read_text())
        receipt.write_text(json.dumps({**prior, "result": result.to_dict()}))
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
        async def invoke():
            return await prov.get_ui_tree()
        value = await self._execute(invoke, "operator" if operator else actor)
        if isinstance(value, CUAActionResult):
            raise ValueError(value.error)
        return value


cua_engine = CUAEngine()
