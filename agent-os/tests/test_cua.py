from __future__ import annotations

import base64
import json
import pytest

from ara_os.cua import CUAAction, CUAActionKind, DevicePlatform, cua_engine
from ara_os.cua.mcp_server import handle_jsonrpc
from ara_os.cua.providers.android import AndroidDeviceProvider
from ara_os.cua.providers.base import BaseDeviceProvider
from ara_os.cua.providers.linux import LinuxDeviceProvider
from ara_os.cua.providers.macos import MacOSDeviceProvider
from ara_os.cua.tools import invoke_cua_tool


@pytest.mark.asyncio
async def test_cua_device_providers_and_info():
    mac = MacOSDeviceProvider("mac_test", "Test Mac", is_mock=True)
    mac_info = await mac.get_device_info()
    assert mac_info.platform == DevicePlatform.MACOS
    assert "semantic_osascript" in mac_info.capabilities
    assert mac_info.resolution == (1920, 1080)

    android = AndroidDeviceProvider("android_test", "Test Android", is_mock=True)
    android_info = await android.get_device_info()
    assert android_info.platform == DevicePlatform.ANDROID
    assert "semantic_adb" in android_info.capabilities

    linux = LinuxDeviceProvider("linux_test", "Test Linux", is_mock=True)
    linux_info = await linux.get_device_info()
    assert linux_info.platform == DevicePlatform.LINUX
    assert "semantic_linux" in linux_info.capabilities


@pytest.mark.asyncio
async def test_cua_macos_osascript_semantic_execution():
    mac = MacOSDeviceProvider("mac_test", "Test Mac", is_mock=True)

    # Test AppleScript execution
    res_as = await mac.execute_semantic('tell application "Finder" to get name', "osascript_applescript")
    assert res_as.success is True
    assert "simulated osascript" in res_as.output
    assert res_as.metadata["engine"] == "osascript_applescript"

    # Test JXA (JavaScript for Automation) execution
    res_jxa = await mac.execute_semantic('Application("Finder").name()', "osascript_jxa")
    assert res_jxa.success is True
    assert res_jxa.metadata["engine"] == "osascript_jxa"


@pytest.mark.asyncio
async def test_cua_action_denormalization_and_input():
    mac = MacOSDeviceProvider("mac_test", "Test Mac", is_mock=True)

    # Test center click [0.5, 0.5] -> (960, 540)
    act_click = CUAAction.from_dict({
        "action": "left_click",
        "coordinate": [0.5, 0.5],
    })
    res_click = await mac.send_input(act_click)
    assert res_click.success is True
    assert res_click.metadata["pixel"] == (960, 540)

    # Test text typing
    act_type = CUAAction.from_dict({
        "action": "type",
        "text": "Hello from ARA CUA",
    })
    res_type = await mac.send_input(act_type)
    assert res_type.success is True

    # Test screenshot
    act_shot = CUAAction.from_dict({"action": "screenshot"})
    res_shot = await mac.send_input(act_shot)
    assert res_shot.success is True
    assert res_shot.frame_base64 is not None


@pytest.mark.asyncio
async def test_cua_kill_switch_safety_gate():
    cua_engine.set_kill_switch(False)
    assert cua_engine.kill_switch_active is False

    # Action succeeds when kill switch is off
    devices = await cua_engine.list_devices()
    dev_id = devices[0]["id"]
    res1 = await cua_engine.act(dev_id, CUAAction.from_dict({"action": "screenshot"}))
    assert res1.success is True

    # Activate kill switch
    cua_engine.set_kill_switch(True)
    assert cua_engine.kill_switch_active is True

    # Action must be rejected
    res_blocked = await cua_engine.act(dev_id, CUAAction.from_dict({"action": "left_click", "coordinate": [0.5, 0.5]}))
    assert res_blocked.success is False
    assert "Kill Switch is ACTIVE" in res_blocked.error

    # Semantic script must also be blocked
    res_sem_blocked = await cua_engine.execute_semantic(dev_id, "tell app 'Finder' to activate")
    assert res_sem_blocked.success is False
    assert "Kill Switch is ACTIVE" in res_sem_blocked.error

    # Release kill switch
    cua_engine.set_kill_switch(False)
    assert cua_engine.kill_switch_active is False


@pytest.mark.asyncio
async def test_standalone_mcp_server_protocol():
    # 1. Initialize
    init_req = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    init_res = await handle_jsonrpc(init_req)
    assert init_res["result"]["serverInfo"]["name"] == "ara-cua"

    # 2. tools/list
    list_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    list_res = await handle_jsonrpc(list_req)
    tool_names = [t["name"] for t in list_res["result"]["tools"]]
    assert "ara_cua_list_devices" in tool_names
    assert "ara_cua_computer" in tool_names
    assert "ara_cua_semantic" in tool_names
    assert "ara_cua_ui_tree" in tool_names

    # 3. tools/call: ara_cua_list_devices
    call_req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "ara_cua_list_devices",
            "arguments": {},
        },
    }
    call_res = await handle_jsonrpc(call_req)
    assert call_res["result"]["isError"] is False
    content = json.loads(call_res["result"]["content"][0]["text"])
    assert "devices" in content
    assert content["count"] >= 1


def test_agent_os_cua_rest_api(system):
    c = system["client"]

    # 1. GET /api/v1/cua/devices
    resp = c.get("/cua/devices")
    assert resp.status_code == 200
    devices = resp.json()
    assert len(devices) >= 1
    dev_id = devices[0]["id"]

    # 2. POST /api/v1/cua/devices/{id}/action
    action_resp = c.post(f"/cua/devices/{dev_id}/action", json={
        "action": "screenshot",
    })
    assert action_resp.status_code == 200
    act_data = action_resp.json()
    assert act_data["success"] is True
    assert "frame_base64" in act_data

    # 3. POST /api/v1/cua/devices/{id}/semantic
    sem_resp = c.post(f"/cua/devices/{dev_id}/semantic", json={
        "script": "echo 'Testing CUA'",
        "engine": "linux_shell",
    })
    assert sem_resp.status_code == 200
    assert sem_resp.json()["success"] is True

    # 4. GET /api/v1/cua/devices/{id}/frame
    frame_resp = c.get(f"/cua/devices/{dev_id}/frame")
    assert frame_resp.status_code == 200
    assert frame_resp.headers["content-type"] in ("image/png", "image/jpeg")
    assert len(frame_resp.content) > 0

    # 5. POST /api/v1/cua/kill-switch
    ks_resp = c.post("/cua/kill-switch", json={"active": True})
    assert ks_resp.status_code == 200
    assert ks_resp.json()["kill_switch"] is True

    # Verify action blocked via API
    blocked = c.post(f"/cua/devices/{dev_id}/action", json={"action": "left_click", "coordinate": [0.1, 0.1]})
    assert blocked.json()["success"] is False
    assert "Kill Switch is ACTIVE" in blocked.json()["error"]

    # Reset kill switch
    c.post("/cua/kill-switch", json={"active": False})


@pytest.mark.asyncio
async def test_cua_android_actions_and_semantic():
    android = AndroidDeviceProvider("android_mock", "Mock Android", is_mock=True)

    # Tap action
    res_tap = await android.send_input(CUAAction.from_dict({
        "action": "touch",
        "coordinate": [0.2, 0.8],
    }))
    assert res_tap.success is True
    assert res_tap.metadata["pixel"] == (216, 1920)

    # Swipe action
    res_swipe = await android.send_input(CUAAction.from_dict({
        "action": "swipe",
        "coordinate": [0.5, 0.8],
        "end_coordinate": [0.5, 0.2],
        "duration_ms": 250,
    }))
    assert res_swipe.success is True

    # Semantic adb shell execution
    res_sem = await android.execute_semantic("am start -a android.intent.action.VIEW -d 'https://ara.local'", "adb_shell")
    assert res_sem.success is True
    assert "simulated adb shell" in res_sem.output


def test_agent_os_mcp_wire_cua_tools(system):
    c = system["client"]
    profile = c.get("/profiles").json()[0]
    token = (system["state"] / f"data-token-{profile['id']}").read_text().strip()

    # Call ara_cua_list_devices over Agent OS MCP
    resp = c.post(
        f"/mcp/{profile['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "jsonrpc": "2.0",
            "id": 101,
            "method": "tools/call",
            "params": {
                "name": "ara_cua_list_devices",
                "arguments": {},
            },
        },
    )
    assert resp.status_code == 200
    res_body = resp.json()
    assert "result" in res_body
    content = json.loads(res_body["result"]["content"][0]["text"])
    assert "devices" in content
    assert content["count"] >= 1

