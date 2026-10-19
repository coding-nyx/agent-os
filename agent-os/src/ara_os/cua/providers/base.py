from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from ..models import CUAAction, CUAActionResult, DeviceInfo


class BaseDeviceProvider(ABC):
    """Abstract base class for all CUA device providers (macOS, Android, Linux, Windows, iOS)."""

    def __init__(self, device_id: str, name: str):
        self.device_id = device_id
        self.name = name

    @abstractmethod
    async def get_device_info(self) -> DeviceInfo:
        """Returns the hardware specifications, resolution, and capabilities of the device."""
        pass

    @abstractmethod
    async def capture_frame(self) -> Tuple[bytes, Dict[str, Any]]:
        """Takes an instant visual snapshot (JPEG/PNG bytes + resolution metadata)."""
        pass

    @abstractmethod
    async def stream_frames(self) -> AsyncGenerator[bytes, None]:
        """Asynchronously yields a continuous stream of visual frames (H.264 NAL / JPEG stream)."""
        pass

    @abstractmethod
    async def send_input(self, action: CUAAction) -> CUAActionResult:
        """Executes a normalized pixel/touch/keyboard input action on the device."""
        pass

    @abstractmethod
    async def execute_semantic(self, script: str, engine: str) -> CUAActionResult:
        """Executes an OS-level script (osascript on macOS, adb shell on Android, dbus on Linux)."""
        pass

    @abstractmethod
    async def get_ui_tree(self) -> Dict[str, Any]:
        """Extracts the structured semantic accessibility/DOM/view hierarchy of the screen."""
        pass

    def denormalize_coordinate(self, norm_coord: Tuple[float, float], resolution: Tuple[int, int]) -> Tuple[int, int]:
        """Converts normalized [0.0 - 1.0] coordinates to physical screen pixel coordinates."""
        width, height = resolution
        x = max(0, min(width - 1, int(norm_coord[0] * width)))
        y = max(0, min(height - 1, int(norm_coord[1] * height)))
        return x, y
