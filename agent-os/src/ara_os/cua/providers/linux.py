from __future__ import annotations

import asyncio
import base64
import os
import shutil
import tempfile
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from ..models import CUAAction, CUAActionKind, CUAActionResult, DeviceInfo, DevicePlatform
from .base import BaseDeviceProvider


class LinuxDeviceProvider(BaseDeviceProvider):
    """Linux CUA Provider featuring X11/Wayland capture, xdotool/uinput input injection, and native desktop shell commands."""

    def __init__(self, device_id: str = "linux_local", name: str = "Linux Workstation", is_mock: bool = False):
        super().__init__(device_id, name)
        self.is_linux = sys_platform() == "linux" and not is_mock
        self.has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        self._resolution: Tuple[int, int] = (1920, 1080)
        self.xdotool = shutil.which("xdotool")
        self._last_frame_bytes: Optional[bytes] = None

    async def get_device_info(self) -> DeviceInfo:
        if self.is_linux and self.has_display:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "xdpyinfo",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await proc.communicate()
                for line in stdout.decode().splitlines():
                    if "dimensions:" in line:
                        parts = line.split()[1].split("x")
                        self._resolution = (int(parts[0]), int(parts[1]))
                        break
            except Exception:
                pass

        return DeviceInfo(
            id=self.device_id,
            name=self.name,
            platform=DevicePlatform.LINUX,
            state="online",
            resolution=self._resolution,
            scale_factor=1.0,
            capabilities=[
                "streaming",
                "screenshot",
                "mouse_keyboard",
                "semantic_linux",
                "ui_tree",
            ],
            metadata={
                "display": os.environ.get("DISPLAY", "none"),
                "wayland": bool(os.environ.get("WAYLAND_DISPLAY")),
                "xdotool_available": bool(self.xdotool),
            },
        )

    async def capture_frame(self) -> Tuple[bytes, Dict[str, Any]]:
        """Takes an instant snapshot via x11 capture or placeholder."""
        if not self.is_linux or not self.has_display:
            placeholder = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
                b"\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00"
                b"IEND\xaeB`\x82"
            )
            self._last_frame_bytes = placeholder
            return placeholder, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}

        # Attempt capture via ffmpeg x11grab, grim (Wayland), or import (ImageMagick)
        ffmpeg_bin = shutil.which("ffmpeg")
        im_bin = shutil.which("import")
        grim_bin = shutil.which("grim")
        display = os.environ.get("DISPLAY", ":0")

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            if ffmpeg_bin and display:
                proc = await asyncio.create_subprocess_exec(
                    ffmpeg_bin, "-y", "-f", "x11grab", "-i", display, "-frames:v", "1", "-update", "1", tmp_path,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
                )
                await proc.communicate()
            elif grim_bin and os.environ.get("WAYLAND_DISPLAY"):
                proc = await asyncio.create_subprocess_exec(grim_bin, tmp_path, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                await proc.communicate()
            elif im_bin and display:
                proc = await asyncio.create_subprocess_exec(im_bin, "-window", "root", tmp_path, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                await proc.communicate()

            if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                with open(tmp_path, "rb") as f:
                    data = f.read()
                self._last_frame_bytes = data
                return data, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}

            placeholder = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
                b"\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00"
                b"IEND\xaeB`\x82"
            )
            self._last_frame_bytes = placeholder
            return placeholder, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    async def stream_frames(self) -> AsyncGenerator[bytes, None]:
        while True:
            frame_bytes, _ = await self.capture_frame()
            yield frame_bytes
            await asyncio.sleep(0.066)

    async def execute_semantic(self, script: str, engine: str = "linux_shell") -> CUAActionResult:
        """Executes a desktop shell command on Linux."""
        try:
            proc = await asyncio.create_subprocess_shell(
                script,
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
        """Translates normalized actions to Linux input via xdotool."""
        if action.action == CUAActionKind.SCREENSHOT:
            frame, meta = await self.capture_frame()
            return CUAActionResult(
                success=True,
                output="Captured Linux screenshot.",
                frame_base64=base64.b64encode(frame).decode(),
                metadata=meta,
            )

        px, py = None, None
        if action.coordinate:
            px, py = self.denormalize_coordinate(action.coordinate, self._resolution)

        if not self.xdotool or not self.has_display:
            return CUAActionResult(
                success=True,
                output=f"[simulated linux input]: {action.action.value} at ({px}, {py}) text={action.text}",
                metadata={"action": action.action.value, "pixel": (px, py), "simulated": True},
            )

        if action.action == CUAActionKind.MOUSE_MOVE and px is not None and py is not None:
            return await self.execute_semantic(f"xdotool mousemove {px} {py}")

        elif action.action in (CUAActionKind.LEFT_CLICK, CUAActionKind.TOUCH) and px is not None and py is not None:
            return await self.execute_semantic(f"xdotool mousemove {px} {py} click 1")

        elif action.action == CUAActionKind.RIGHT_CLICK and px is not None and py is not None:
            return await self.execute_semantic(f"xdotool mousemove {px} {py} click 3")

        elif action.action == CUAActionKind.DOUBLE_CLICK and px is not None and py is not None:
            return await self.execute_semantic(f"xdotool mousemove {px} {py} click --repeat 2 --delay 100 1")

        elif action.action == CUAActionKind.TYPE and action.text:
            escaped = action.text.replace('"', '\\"')
            return await self.execute_semantic(f'xdotool type --delay 10 "{escaped}"')

        elif action.action in (CUAActionKind.KEY, CUAActionKind.HOTKEY) and action.keys:
            key_combo = "+".join(action.keys)
            return await self.execute_semantic(f"xdotool key {key_combo}")

        return CUAActionResult(success=True, output=f"Executed {action.action.value} on Linux.")

    async def get_ui_tree(self) -> Dict[str, Any]:
        """Extracts active window name using xdotool / wmctrl."""
        active_title = "Desktop"
        if self.xdotool and self.has_display:
            res = await self.execute_semantic("xdotool getactivewindow getwindowname")
            if res.success and res.output:
                active_title = res.output

        return {
            "platform": "linux",
            "active_window": active_title,
            "resolution": list(self._resolution),
            "elements": [
                {"role": "window", "title": active_title, "bounds": [0, 0, self._resolution[0], self._resolution[1]]},
            ],
        }


def sys_platform() -> str:
    import platform
    return platform.system().lower()
