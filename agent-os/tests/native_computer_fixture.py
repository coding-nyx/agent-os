"""Fake driver transport around real pinned capture, targeting and safety dispatch.

Executed as a subprocess in the native environment. Never starts a physical driver.
"""
import base64
import json
import os
from pathlib import Path
import struct
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ara_os.native_execution import computer_control
from ara_os import native_computer
from tools.bot_desktop import runtime as desktop_runtime
from tools.computer_use import cua_backend, cua_backend_driver, tool
from tools.computer_use.cua_backend_session import _CuaDriverSession

body = json.loads(sys.stdin.readline())
fixture = body.pop("fixture")
calls = []
owner_changed = False
identity = native_computer.process_identity


def process_identity(pid):
    if owner_changed and pid == body["owner_pid"]:
        raise ValueError("Observation owner exited; capture a fresh window")
    return identity(pid)


def call_tool(self, name, args):
    global owner_changed
    calls.append({"tool": name, "arguments": args})
    if name == "list_windows":
        return {"structuredContent": {"windows": fixture["windows"]}, "data": {}, "images": [], "isError": False}
    if name in {"screenshot", "get_window_state"}:
        owner_changed = bool(fixture.get("owner_exits_during_capture"))
        width, height = fixture.get("dimensions", [1000, 500])
        frame = base64.b64encode(b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height)).decode()
        return {"structuredContent": {"elements": [{"element_index": 1, "role": "button", "label": "Test only",
            "frame": {"x": 10, "y": 20, "w": 30, "h": 40}}]},
            "data": {}, "images": [frame], "image_mime_types": ["image/png"], "isError": False}
    if fixture.get("input_log"):
        with Path(fixture["input_log"]).open("a") as stream:
            stream.write(json.dumps({"tool": name, "arguments": args}) + "\n")
    return {"structuredContent": {"ok": True, "effect": fixture.get("effect", "confirmed"),
        "verified": fixture.get("effect", "confirmed") == "confirmed"},
        "data": {}, "images": [], "isError": False}


try:
    with patch.object(cua_backend_driver, "resolve_cua_driver_cmd", return_value="explicit-fake-driver"), \
         patch.object(cua_backend.CuaDriverBackend, "start"), \
         patch.object(cua_backend.CuaDriverBackend, "stop"), \
         patch.object(_CuaDriverSession, "call_tool", call_tool), \
         patch.object(_CuaDriverSession, "_has_tool", return_value=True), \
         patch.object(_CuaDriverSession, "supports_input_property", return_value=True), \
         patch.object(cua_backend, "desktop_identity", return_value=fixture.get("desktop", "fake-display")), \
         patch.object(native_computer, "process_identity", process_identity), \
         patch.object(desktop_runtime, "ensure_started_for_tool"), \
         patch.object(tool, "_new_backend", side_effect=lambda mode: cua_backend.CuaDriverBackend(mode)):
        value = computer_control(body)
except Exception as exc:
    value = {"success": False, "error": str(exc)}
print(json.dumps({"fixture_result": True, "result": value, "calls": calls}))
if body.get("fixture_protocol") == "ara":
    print(json.dumps({"ara_frame": True, "type": "result", "data": value}))
