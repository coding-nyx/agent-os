from __future__ import annotations

import base64
import json
from typing import Any, Dict, List

from .engine import cua_engine
from .models import CUAAction


CUA_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "ara_cua_list_devices",
        "description": "List validated native desktop adapters. Driver presence alone is not proof of capture or input readiness.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
    {
        "name": "ara_cua_computer",
        "description": (
            "Interact with a device screen via normalized mouse, keyboard, touch gestures, and instant screenshot observation. "
            "Coordinates are strictly normalized from [0.0, 0.0] (top-left) to [1.0, 1.0] (bottom-right)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {
                    "type": "string",
                    "description": "Target device ID from ara_cua_list_devices. Defaults to the profile's assigned desktop.",
                },
                "operation_id": {"type": "string", "minLength": 1, "maxLength": 120,
                    "description": "Stable operation ID required for agent inputs. Reuse on retries; never resubmit unknown work under a new ID."},
                "observation_id": {"type": "string", "maxLength": 64,
                    "description": "For remote node input, copy observation_id from this actor's fresh screenshot metadata."},
                "action": {
                    "type": "string",
                    "enum": [
                        "screenshot",
                        "left_click",
                        "right_click",
                        "double_click",
                        "drag",
                        "scroll",
                        "touch",
                        "type",
                        "key",
                        "hotkey",
                    ],
                    "description": "Visual or input action to perform.",
                },
                "coordinate": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 2,
                    "items": {"type": "number"},
                    "description": "Normalized coordinates [x, y] in range [0.0, 1.0]. Example: [0.5, 0.5] for screen center.",
                },
                "end_coordinate": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 2,
                    "items": {"type": "number"},
                    "description": "Target normalized coordinates [x, y] for drag or swipe gestures.",
                },
                "text": {
                    "type": "string",
                    "description": "Text to type into the focused element or field.",
                },
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key or key combination to press (e.g. ['enter'], ['command', 'space'], ['control', 'c']).",
                },
                "button": {
                    "type": "string",
                    "enum": ["left", "right", "middle"],
                    "default": "left",
                },
                "scroll_delta": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Scroll delta [dx, dy] where negative dy scrolls down.",
                },
                "duration_ms": {
                    "type": "integer",
                    "default": 200,
                    "description": "Duration in milliseconds for drag or swipe gestures.",
                },
            },
            "required": ["action"],
            "additionalProperties": False,
        },
    },
    {
        "name": "ara_cua_semantic",
        "description": (
            "Compatibility endpoint that refuses OS scripting. Desktop grants do not authorize arbitrary scripts. "
            "Use separately authorized terminal tools for OS scripting."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {
                    "type": "string",
                    "description": "Target device ID.",
                },
                "script": {
                    "type": "string",
                    "description": "The exact script or command to execute.",
                },
                "engine": {
                    "type": "string",
                    "enum": [
                        "osascript_applescript",
                        "osascript_jxa",
                        "adb_shell",
                        "linux_shell",
                        "powershell",
                    ],
                    "default": "osascript_applescript",
                    "description": "Scripting engine to use.",
                },
            },
            "required": ["script"],
            "additionalProperties": False,
        },
    },
    {
        "name": "ara_cua_ui_tree",
        "description": "Retrieve the structured accessibility / window tree of the target device to find UI elements and titles without image token cost.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {
                    "type": "string",
                    "description": "Target device ID.",
                },
            },
            "additionalProperties": False,
        },
    },
]


async def invoke_cua_tool(name: str, args: Dict[str, Any], *, actor=None) -> Dict[str, Any]:
    """Universal dispatcher for CUA MCP tools."""
    if name == "ara_cua_list_devices":
        devices = await cua_engine.list_devices()
        return {"devices": devices, "count": len(devices)}

    device_id = args.get("device_id")
    if not device_id:
        devices = await cua_engine.list_devices()
        if not devices:
            return {"error": "No devices available for computer control."}
        device_id = devices[0]["id"]

    if name == "ara_cua_computer":
        action = CUAAction.from_dict(args)
        result = await cua_engine.act(device_id, action, actor=actor, operation_id=args.get("operation_id"))
        return result.to_dict()

    elif name == "ara_cua_semantic":
        script = args.get("script", "")
        engine = args.get("engine", "osascript_applescript")
        result = await cua_engine.execute_semantic(device_id, script, engine)
        return result.to_dict()

    elif name == "ara_cua_ui_tree":
        tree = await cua_engine.get_ui_tree(device_id, actor=actor)
        return {"device_id": device_id, "ui_tree": tree}

    return {"error": f"Unknown CUA tool: {name}"}


def result_content(value):
    clean = {k: v for k, v in value.items() if k != "frame_base64"}
    content = [{"type": "text", "text": json.dumps(clean)}]
    if value.get("frame_base64"):
        fmt = value.get("metadata", {}).get("format", "png")
        content.append({"type": "image", "data": value["frame_base64"],
                        "mimeType": "image/jpeg" if fmt in {"jpeg", "jpg"} else "image/png"})
    return content
