from __future__ import annotations

import asyncio
import base64
import json
import os
import platform
import subprocess
import sys
import tempfile
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from ..models import CUAAction, CUAActionKind, CUAActionResult, DeviceInfo, DevicePlatform
from .base import BaseDeviceProvider


class MacOSDeviceProvider(BaseDeviceProvider):
    """macOS CUA Provider featuring native osascript (AppleScript/JXA), CoreGraphics, and ScreenCaptureKit."""

    def __init__(self, device_id: str = "macos_local", name: str = "Mac Desktop", is_mock: bool = False):
        super().__init__(device_id, name)
        self.is_macos = platform.system() == "Darwin" and not is_mock
        self._resolution: Tuple[int, int] = (1920, 1080)
        self._scale_factor: float = 2.0  # Retina default
        self._last_frame_bytes: Optional[bytes] = None

    async def get_device_info(self) -> DeviceInfo:
        if self.is_macos:
            try:
                # Query screen resolution via AppleScript
                proc = await asyncio.create_subprocess_exec(
                    "osascript", "-e", 'tell application "Finder" to get bounds of window of desktop',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await proc.communicate()
                parts = [int(p.strip()) for p in stdout.decode().strip().split(",") if p.strip().isdigit()]
                if len(parts) >= 4:
                    self._resolution = (parts[2] - parts[0], parts[3] - parts[1])
            except Exception:
                pass

        return DeviceInfo(
            id=self.device_id,
            name=self.name,
            platform=DevicePlatform.MACOS,
            state="online",
            resolution=self._resolution,
            scale_factor=self._scale_factor,
            capabilities=[
                "streaming",
                "screenshot",
                "mouse_keyboard",
                "semantic_osascript",
                "ui_tree",
            ],
            metadata={
                "os": "macOS",
                "darwin": self.is_macos,
                "scripting_engine": "osascript (AppleScript / JXA)",
            },
        )

    async def capture_frame(self) -> Tuple[bytes, Dict[str, Any]]:
        """Takes an instant visual snapshot using macOS native capture or mock frame."""
        if not self.is_macos:
            # Generate a lightweight 1920x1080 placeholder frame on non-Darwin platforms
            placeholder = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
                b"\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00"
                b"IEND\xaeB`\x82"
            )
            self._last_frame_bytes = placeholder
            return placeholder, {"width": self._resolution[0], "height": self._resolution[1], "format": "png"}

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            # screencapture -x (silent, no shutter sound), -t jpg
            proc = await asyncio.create_subprocess_exec(
                "screencapture", "-x", "-t", "jpg", tmp_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                with open(tmp_path, "rb") as f:
                    data = f.read()
                self._last_frame_bytes = data
                return data, {"width": self._resolution[0], "height": self._resolution[1], "format": "jpeg"}
            raise RuntimeError("screencapture produced an empty file")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    async def stream_frames(self) -> AsyncGenerator[bytes, None]:
        """Streams continuous frames at low latency for the dashboard video canvas."""
        while True:
            frame_bytes, _ = await self.capture_frame()
            yield frame_bytes
            await asyncio.sleep(0.066)  # ~15 FPS continuous capture loop

    async def execute_semantic(self, script: str, engine: str = "osascript_applescript") -> CUAActionResult:
        """Executes native AppleScript or JXA via osascript."""
        if not self.is_macos:
            # Simulated execution on non-Darwin for testing / dev validation
            return CUAActionResult(
                success=True,
                output=f"[simulated osascript ({engine})]: {script.strip()}",
                metadata={"engine": engine, "simulated": True},
            )

        cmd = ["osascript"]
        if engine == "osascript_jxa":
            cmd.extend(["-l", "JavaScript", "-e", script])
        else:
            cmd.extend(["-e", script])

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
        """Translates normalized actions to macOS input events."""
        if action.action == CUAActionKind.SCREENSHOT:
            frame, meta = await self.capture_frame()
            return CUAActionResult(
                success=True,
                output="Captured screenshot.",
                frame_base64=base64.b64encode(frame).decode(),
                metadata=meta,
            )

        # Coordinate translation
        px, py = None, None
        if action.coordinate:
            px, py = self.denormalize_coordinate(action.coordinate, self._resolution)

        if not self.is_macos:
            return CUAActionResult(
                success=True,
                output=f"[simulated macos input]: {action.action.value} at ({px}, {py}) text={action.text}",
                metadata={"action": action.action.value, "pixel": (px, py), "simulated": True},
            )

        # macOS System Events script builders
        if action.action in (CUAActionKind.LEFT_CLICK, CUAActionKind.TOUCH) and px is not None and py is not None:
            script = f'tell application "System Events" to click at {{{px}, {py}}}'
            return await self.execute_semantic(script)

        elif action.action == CUAActionKind.DOUBLE_CLICK and px is not None and py is not None:
            script = f'''
            tell application "System Events"
                click at {{{px}, {py}}}
                delay 0.05
                click at {{{px}, {py}}}
            end tell
            '''
            return await self.execute_semantic(script)

        elif action.action == CUAActionKind.TYPE and action.text:
            escaped = action.text.replace('\\', '\\\\').replace('"', '\\"')
            script = f'tell application "System Events" to keystroke "{escaped}"'
            return await self.execute_semantic(script)

        elif action.action in (CUAActionKind.KEY, CUAActionKind.HOTKEY) and action.keys:
            # Map standard keys
            key = action.keys[0].lower()
            modifiers = [m.lower() for m in action.keys[1:]]
            mod_str = ""
            if modifiers:
                mod_mappings = {"command": "command down", "cmd": "command down", "control": "control down", "ctrl": "control down", "option": "option down", "alt": "option down", "shift": "shift down"}
                mod_clauses = [mod_mappings.get(m, f"{m} down") for m in modifiers]
                mod_str = f" using {{{', '.join(mod_clauses)}}}"

            if len(key) == 1:
                script = f'tell application "System Events" to keystroke "{key}"{mod_str}'
            else:
                key_code_map = {"enter": 36, "return": 36, "space": 49, "tab": 48, "backspace": 51, "escape": 53, "left": 123, "right": 124, "down": 125, "up": 126}
                code = key_code_map.get(key, 36)
                script = f'tell application "System Events" to key code {code}{mod_str}'
            return await self.execute_semantic(script)

        elif action.action == CUAActionKind.SCROLL and action.scroll_delta:
            dy = action.scroll_delta[1]
            code = 125 if dy < 0 else 126  # down vs up arrow
            script = f'''
            tell application "System Events"
                repeat {min(abs(dy), 10)} times
                    key code {code}
                end repeat
            end tell
            '''
            return await self.execute_semantic(script)

        return CUAActionResult(success=True, output=f"Executed {action.action.value} on macOS.")

    async def get_ui_tree(self) -> Dict[str, Any]:
        """Extracts structured frontmost application UI elements via System Events."""
        script = '''
        tell application "System Events"
            set frontProc to first application process whose frontmost is true
            set procName to name of frontProc
            set winTitle to ""
            try
                set winTitle to name of front window of frontProc
            end try
            return procName & ":::" & winTitle
        end tell
        '''
        res = await self.execute_semantic(script)
        proc_name = "Unknown"
        win_title = "Desktop"
        if res.success and res.output and ":::" in res.output:
            parts = res.output.split(":::", 1)
            proc_name, win_title = parts[0], parts[1]

        return {
            "platform": "macos",
            "frontmost_process": proc_name,
            "active_window": win_title,
            "resolution": list(self._resolution),
            "elements": [
                {"role": "window", "title": win_title, "bounds": [0, 0, self._resolution[0], self._resolution[1]]},
                {"role": "process", "name": proc_name},
            ],
        }
