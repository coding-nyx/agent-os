from __future__ import annotations

import asyncio
import base64
import os
import shutil
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from ..models import CUAAction, CUAActionKind, CUAActionResult, DeviceInfo, DevicePlatform
from .base import BaseDeviceProvider


class AndroidDeviceProvider(BaseDeviceProvider):
    """Android CUA Provider featuring ADB shell semantic commands, screencap streaming, and touch injection."""

    def __init__(self, device_id: str = "android_device", name: str = "Android Device", serial: Optional[str] = None, is_mock: bool = False):
        super().__init__(device_id, name)
        self.serial = serial
        self.is_mock = is_mock
        self.adb_path = shutil.which("adb")
        self._resolution: Tuple[int, int] = (1080, 2400)
        self._density: int = 420
        self._last_frame_bytes: Optional[bytes] = None

    @classmethod
    async def discover_devices(cls) -> List[AndroidDeviceProvider]:
        """Discovers connected Android devices via ADB."""
        adb = shutil.which("adb")
        if not adb:
            return []

        try:
            proc = await asyncio.create_subprocess_exec(
                adb, "devices", "-l",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            lines = stdout.decode().strip().splitlines()[1:]
            devices = []
            for line in lines:
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    serial = parts[0]
                    # Try to extract model name
                    model = serial
                    for p in parts[2:]:
                        if p.startswith("model:"):
                            model = p.split(":", 1)[1].replace("_", " ")
                    devices.append(cls(device_id=f"android_{serial}", name=f"Android ({model})", serial=serial))
            return devices
        except Exception:
            return []

    async def get_device_info(self) -> DeviceInfo:
        if self.adb_path and self.serial and not self.is_mock:
            try:
                proc = await asyncio.create_subprocess_exec(
                    self.adb_path, "-s", self.serial, "shell", "wm", "size",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await proc.communicate()
                out = stdout.decode()
                # Parse: Physical size: 1080x2400
                if "x" in out:
                    size_part = out.strip().split()[-1]
                    w, h = size_part.split("x")
                    self._resolution = (int(w), int(h))
            except Exception:
                pass

        return DeviceInfo(
            id=self.device_id,
            name=self.name,
            platform=DevicePlatform.ANDROID,
            state="online",
            resolution=self._resolution,
            scale_factor=2.5,
            capabilities=[
                "streaming",
                "screenshot",
                "touch",
                "semantic_adb",
                "ui_tree",
            ],
            metadata={
                "serial": self.serial or "simulated",
                "density": self._density,
                "scripting_engine": "adb shell & scrcpy",
            },
        )

    async def capture_frame(self) -> Tuple[bytes, Dict[str, Any]]:
        """Takes an instant snapshot via ADB exec-out screencap or mock placeholder."""
        if not self.adb_path or not self.serial or self.is_mock:
            placeholder = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
                b"\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00"
                b"IEND\xaeB`\x82"
            )
            self._last_frame_bytes = placeholder
            return placeholder, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}

        cmd = [self.adb_path]
        if self.serial:
            cmd.extend(["-s", self.serial])
        cmd.extend(["exec-out", "screencap", "-p"])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0 and len(stdout) > 0:
            self._last_frame_bytes = stdout
            return stdout, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}

        raise RuntimeError("Failed to capture frame from Android device.")

    async def stream_frames(self) -> AsyncGenerator[bytes, None]:
        """Continuous low-latency frame stream."""
        while True:
            frame_bytes, _ = await self.capture_frame()
            yield frame_bytes
            await asyncio.sleep(0.066)

    async def execute_semantic(self, script: str, engine: str = "adb_shell") -> CUAActionResult:
        """Executes native ADB shell commands (e.g. am start, input, dumpsys)."""
        if not self.adb_path or not self.serial or self.is_mock:
            return CUAActionResult(
                success=True,
                output=f"[simulated adb shell]: {script.strip()}",
                metadata={"engine": engine, "simulated": True},
            )

        cmd = [self.adb_path]
        if self.serial:
            cmd.extend(["-s", self.serial])
        cmd.extend(["shell", script])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            success = proc.returncode == 0
            return CUAActionResult(
                success=success,
                output=stdout.decode().strip(),
                error=stderr.decode().strip() if not success else None,
                metadata={"returncode": proc.returncode, "engine": engine},
            )
        except Exception as e:
            return CUAActionResult(success=False, error=str(e), metadata={"engine": engine})

    async def send_input(self, action: CUAAction) -> CUAActionResult:
        """Translates normalized touch, swipe, and key actions into Android ADB input events."""
        if action.action == CUAActionKind.SCREENSHOT:
            frame, meta = await self.capture_frame()
            return CUAActionResult(
                success=True,
                output="Captured Android screenshot.",
                frame_base64=base64.b64encode(frame).decode(),
                metadata=meta,
            )

        # Coordinate translation
        px, py = None, None
        if action.coordinate:
            px, py = self.denormalize_coordinate(action.coordinate, self._resolution)

        if not self.adb_path or not self.serial or self.is_mock:
            return CUAActionResult(
                success=True,
                output=f"[simulated android input]: {action.action.value} at ({px}, {py}) text={action.text}",
                metadata={"action": action.action.value, "pixel": (px, py), "simulated": True},
            )

        if action.action in (CUAActionKind.LEFT_CLICK, CUAActionKind.TOUCH) and px is not None and py is not None:
            return await self.execute_semantic(f"input tap {px} {py}")

        elif action.action in (CUAActionKind.DRAG, CUAActionKind.SWIPE) and px is not None and py is not None and action.end_coordinate:
            end_x, end_y = self.denormalize_coordinate(action.end_coordinate, self._resolution)
            duration = action.duration_ms or 300
            return await self.execute_semantic(f"input swipe {px} {py} {end_x} {end_y} {duration}")

        elif action.action == CUAActionKind.TYPE and action.text:
            escaped = action.text.replace(' ', '%s').replace('&', '\\&').replace('"', '\\"')
            return await self.execute_semantic(f'input text "{escaped}"')

        elif action.action in (CUAActionKind.KEY, CUAActionKind.HOTKEY) and action.keys:
            key_name = action.keys[0].lower()
            key_map = {
                "home": "KEYCODE_HOME",
                "back": "KEYCODE_BACK",
                "app_switch": "KEYCODE_APP_SWITCH",
                "recent": "KEYCODE_APP_SWITCH",
                "enter": "KEYCODE_ENTER",
                "volume_up": "KEYCODE_VOLUME_UP",
                "volume_down": "KEYCODE_VOLUME_DOWN",
                "power": "KEYCODE_POWER",
            }
            code = key_map.get(key_name, "KEYCODE_ENTER")
            return await self.execute_semantic(f"input keyevent {code}")

        return CUAActionResult(success=True, output=f"Executed {action.action.value} on Android.")

    async def get_ui_tree(self) -> Dict[str, Any]:
        """Extracts structured UI hierarchy from Android."""
        res = await self.execute_semantic("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'")
        focus = res.output if res.success else "Unknown"

        return {
            "platform": "android",
            "active_window": focus,
            "resolution": list(self._resolution),
            "elements": [
                {"role": "screen", "bounds": [0, 0, self._resolution[0], self._resolution[1]]},
                {"role": "focus", "info": focus},
            ],
        }
