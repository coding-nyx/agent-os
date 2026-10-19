from __future__ import annotations

import asyncio
import base64
import time

from ... import runtime_adapter
from ..models import CUAActionKind, CUAActionResult, DeviceInfo, DevicePlatform
from .base import BaseDeviceProvider


class NativeDeviceProvider(BaseDeviceProvider):
    """Native desktop backend only. Missing drivers/actions never become simulation."""
    def __init__(self):
        super().__init__("local_desktop", "Local desktop · native driver")
        self.metadata = {}
        self.observed_at = 0

    async def get_device_info(self):
        status = await runtime_adapter.computer({"action": "status"})
        platform = {"darwin": "macos"}.get(status.get("platform"), status.get("platform", "linux"))
        return DeviceInfo(id=self.device_id, name=self.name, platform=DevicePlatform(platform),
            state="needs_verification" if status.get("installed") else "unavailable",
            resolution=(self.metadata.get("width", 0), self.metadata.get("height", 0)),
            capabilities=["screenshot", "mouse_keyboard", "ui_tree"] if status.get("installed") else [],
            metadata=status)

    async def capture_frame(self):
        result = await runtime_adapter.computer({"arguments": {"action": "capture", "mode": "vision"}, "authorized": True})
        if not result.get("success") or not result.get("frame_base64"):
            raise ValueError(result.get("error") or "The native backend did not return a screenshot")
        self.metadata = result.get("metadata", {})
        self.observed_at = time.monotonic()
        return base64.b64decode(result["frame_base64"], validate=True), self.metadata

    async def stream_frames(self):
        while True:
            frame, _ = await self.capture_frame()
            yield frame
            await asyncio.sleep(1)  # Observation, not a claimed hardware video stream.

    async def send_input(self, action):
        if action.action == CUAActionKind.SCREENSHOT:
            data, meta = await self.capture_frame()
            return CUAActionResult(success=True, frame_base64=base64.b64encode(data).decode(), metadata=meta)
        kinds = {CUAActionKind.LEFT_CLICK: "click", CUAActionKind.TOUCH: "click", CUAActionKind.RIGHT_CLICK: "right_click",
            CUAActionKind.DOUBLE_CLICK: "double_click", CUAActionKind.DRAG: "drag", CUAActionKind.SCROLL: "scroll",
            CUAActionKind.TYPE: "type", CUAActionKind.KEY: "key", CUAActionKind.HOTKEY: "key"}
        kind = kinds.get(action.action)
        if not kind:
            return CUAActionResult(success=False, error="This action is not supported by the native desktop adapter")
        if not self.metadata or time.monotonic() - self.observed_at > 15:
            return CUAActionResult(success=False, error="Capture a fresh target window before sending input")
        args = {"action": kind, "capture_after": False}
        if self.metadata.get("app"):
            args["app"] = self.metadata["app"]
        if action.coordinate:
            args["coordinate"] = list(self.denormalize_coordinate(action.coordinate,
                (self.metadata["width"], self.metadata["height"])))
        if kind == "drag":
            if not action.coordinate or not action.end_coordinate:
                return CUAActionResult(success=False, error="Drag requires start and end coordinates")
            args["from_coordinate"] = args.pop("coordinate")
            args["to_coordinate"] = list(self.denormalize_coordinate(action.end_coordinate,
                (self.metadata["width"], self.metadata["height"])))
        if kind in {"click", "right_click", "double_click"} and "coordinate" not in args:
            return CUAActionResult(success=False, error="Click requires coordinates")
        if kind == "type":
            if not isinstance(action.text, str) or not action.text or len(action.text) > 20000:
                return CUAActionResult(success=False, error="Provide bounded text to type")
            args["text"] = action.text  # Passed as JSON, never interpolated into a shell.
        if kind == "key":
            if not action.keys or any(not isinstance(k, str) or len(k) > 40 for k in action.keys):
                return CUAActionResult(success=False, error="Provide a bounded key combination")
            args["keys"] = "+".join(action.keys)
        if kind == "scroll":
            dx, dy = action.scroll_delta or (0, 0)
            if dx == 0 and dy == 0:
                return CUAActionResult(success=True, output="No scrolling requested; no input was delivered")
            args.update(direction=("down" if dy < 0 else "up") if dy else ("left" if dx < 0 else "right"),
                        amount=min(20, max(1, abs(dy or dx))))
        result = await runtime_adapter.computer({"arguments": args, "authorized": True})
        return CUAActionResult(success=bool(result.get("success")), output=result.get("output"),
            error=result.get("error"), metadata=result.get("metadata", {}))

    async def execute_semantic(self, script, engine):
        return CUAActionResult(success=False, error="Arbitrary OS scripting is not enabled by a desktop grant. Use separately authorized terminal tools.")

    async def get_ui_tree(self):
        result = await runtime_adapter.computer({"arguments": {"action": "capture", "mode": "ax"}, "authorized": True})
        if not result.get("success"):
            raise ValueError(result.get("error") or "Native accessibility capture unavailable")
        return result["metadata"]
