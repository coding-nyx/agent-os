from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

from .models import CUAAction, CUAActionResult, DeviceInfo
from .providers import discover_all_devices, get_device_provider, register_device
from .providers.base import BaseDeviceProvider


logger = logging.getLogger(__name__)


class CUAEngine:
    """Core CUA Orchestrator managing device providers, safety gates, kill-switches, and live frame caching."""

    def __init__(self):
        self._kill_switch: bool = False
        self._mode: str = "autonomous"  # "autonomous" | "supervised" | "view_only"
        self._frame_cache: Dict[str, Tuple[bytes, Dict[str, Any]]] = {}

    @property
    def kill_switch_active(self) -> bool:
        return self._kill_switch

    def set_kill_switch(self, active: bool) -> bool:
        self._kill_switch = active
        logger.warning(f"CUA Kill Switch set to {active}")
        return self._kill_switch

    def set_mode(self, mode: str) -> str:
        if mode in ("autonomous", "supervised", "view_only"):
            self._mode = mode
        return self._mode

    async def list_devices(self) -> List[Dict[str, Any]]:
        providers = await discover_all_devices()
        result = []
        for p in providers:
            info = await p.get_device_info()
            d = info.to_dict()
            d["kill_switch"] = self._kill_switch
            d["mode"] = self._mode
            result.append(d)
        return result

    async def get_provider_or_raise(self, device_id: str) -> BaseDeviceProvider:
        prov = get_device_provider(device_id)
        if not prov:
            await discover_all_devices()
            prov = get_device_provider(device_id)
        if not prov:
            raise ValueError(f"Device '{device_id}' is not connected or registered.")
        return prov

    async def act(self, device_id: str, action: CUAAction) -> CUAActionResult:
        """Executes a visual or input action on the target device."""
        if self._kill_switch:
            return CUAActionResult(
                success=False,
                error="Emergency Kill Switch is ACTIVE. Human operator has paused computer control.",
                metadata={"kill_switch": True},
            )

        if self._mode == "view_only" and action.action.value != "screenshot":
            return CUAActionResult(
                success=False,
                error="CUA is currently in view_only mode. Inputs are suppressed.",
                metadata={"mode": "view_only"},
            )

        prov = await self.get_provider_or_raise(device_id)
        res = await prov.send_input(action)

        # Update cache if this produced a frame
        if res.frame_base64:
            import base64
            frame_bytes = base64.b64decode(res.frame_base64)
            self._frame_cache[device_id] = (frame_bytes, res.metadata)

        return res

    async def execute_semantic(self, device_id: str, script: str, engine: str = "osascript_applescript") -> CUAActionResult:
        """Executes native OS scripting (AppleScript/JXA via osascript, adb shell, etc.)."""
        if self._kill_switch:
            return CUAActionResult(
                success=False,
                error="Emergency Kill Switch is ACTIVE. Semantic execution paused by human operator.",
                metadata={"kill_switch": True},
            )

        if self._mode == "view_only":
            return CUAActionResult(
                success=False,
                error="CUA is currently in view_only mode. Script execution is suppressed.",
                metadata={"mode": "view_only"},
            )

        prov = await self.get_provider_or_raise(device_id)
        return await prov.execute_semantic(script, engine)

    async def get_frame(self, device_id: str) -> Tuple[bytes, Dict[str, Any]]:
        """Returns the latest frame (from in-memory cache if fresh or live capture)."""
        prov = await self.get_provider_or_raise(device_id)
        frame_bytes, meta = await prov.capture_frame()
        self._frame_cache[device_id] = (frame_bytes, meta)
        return frame_bytes, meta

    async def get_ui_tree(self, device_id: str) -> Dict[str, Any]:
        """Extracts accessibility and window hierarchy."""
        prov = await self.get_provider_or_raise(device_id)
        return await prov.get_ui_tree()


# Global Singleton Instance
cua_engine = CUAEngine()
