from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional, Tuple


class DevicePlatform(str, Enum):
    MACOS = "macos"
    ANDROID = "android"
    LINUX = "linux"
    WINDOWS = "windows"
    IOS = "ios"


class CUAActionKind(str, Enum):
    SCREENSHOT = "screenshot"
    MOUSE_MOVE = "mouse_move"
    LEFT_CLICK = "left_click"
    RIGHT_CLICK = "right_click"
    DOUBLE_CLICK = "double_click"
    TRIPLE_CLICK = "triple_click"
    MOUSE_DOWN = "mouse_down"
    MOUSE_UP = "mouse_up"
    DRAG = "drag"
    SCROLL = "scroll"
    TOUCH = "touch"
    SWIPE = "swipe"
    TYPE = "type"
    KEY = "key"
    HOTKEY = "hotkey"


class SemanticEngine(str, Enum):
    OSASCRIPT_APPLESCRIPT = "osascript_applescript"
    OSASCRIPT_JXA = "osascript_jxa"
    ADB_SHELL = "adb_shell"
    LINUX_SHELL = "linux_shell"
    POWERSHELL = "powershell"


@dataclass
class DeviceInfo:
    id: str
    name: str
    platform: DevicePlatform
    state: str = "online"  # online, offline, busy, error
    resolution: Tuple[int, int] = (1920, 1080)
    scale_factor: float = 1.0
    capabilities: List[str] = field(default_factory=lambda: ["streaming", "screenshot"])
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "platform": self.platform.value if isinstance(self.platform, DevicePlatform) else str(self.platform),
            "state": self.state,
            "resolution": list(self.resolution),
            "scale_factor": self.scale_factor,
            "capabilities": self.capabilities,
            "metadata": self.metadata,
        }


@dataclass
class CUAAction:
    action: CUAActionKind
    coordinate: Optional[Tuple[float, float]] = None  # Normalized [0.0 - 1.0]
    end_coordinate: Optional[Tuple[float, float]] = None  # Normalized for drag/swipe
    text: Optional[str] = None
    keys: Optional[List[str]] = None
    button: str = "left"
    scroll_delta: Optional[Tuple[int, int]] = None
    duration_ms: int = 200

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CUAAction:
        act_str = data.get("action", "screenshot")
        try:
            kind = CUAActionKind(act_str)
        except ValueError:
            # Fallback mappings for various CUA tool naming conventions
            alias_map = {
                "click": CUAActionKind.LEFT_CLICK,
                "move": CUAActionKind.MOUSE_MOVE,
                "tap": CUAActionKind.TOUCH,
                "press": CUAActionKind.KEY,
                "press_hotkey": CUAActionKind.HOTKEY,
                "key_combination": CUAActionKind.HOTKEY,
            }
            kind = alias_map.get(act_str, CUAActionKind.SCREENSHOT)

        coord = data.get("coordinate")
        if coord and isinstance(coord, (list, tuple)) and len(coord) >= 2:
            coord = (float(coord[0]), float(coord[1]))
        else:
            coord = None

        end_coord = data.get("end_coordinate")
        if end_coord and isinstance(end_coord, (list, tuple)) and len(end_coord) >= 2:
            end_coord = (float(end_coord[0]), float(end_coord[1]))
        else:
            end_coord = None

        scroll = data.get("scroll_delta")
        if scroll and isinstance(scroll, (list, tuple)) and len(scroll) >= 2:
            scroll = (int(scroll[0]), int(scroll[1]))
        else:
            scroll = None

        keys = data.get("keys")
        if not keys and data.get("key"):
            keys = [data["key"]]

        return cls(
            action=kind,
            coordinate=coord,
            end_coordinate=end_coord,
            text=data.get("text"),
            keys=keys,
            button=data.get("button", "left"),
            scroll_delta=scroll,
            duration_ms=int(data.get("duration_ms", 200)),
        )


@dataclass
class CUAActionResult:
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None
    frame_base64: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        res: dict[str, Any] = {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "metadata": self.metadata,
        }
        if self.frame_base64:
            res["frame_base64"] = self.frame_base64
        return res
