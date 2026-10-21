"""Operator setup without granting permissions, capturing screens or downloading drivers."""
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from ara_os import config, native_computer_setup as native, node_mcp
from ara_os.cua import policy, setup
from ara_os.cua.engine import CUAEngine
from ara_os.cua.node import NodeComputer


@pytest.fixture
def native_driver(tmp_path, monkeypatch):
    binary = tmp_path / "CuaDriver.app/Contents/MacOS/cua-driver"
    binary.parent.mkdir(parents=True)
    binary.write_text("fixture executable; never executed")
    binary.chmod(0o700)
    monkeypatch.setenv("ARA_STATE_DIR", str(tmp_path))
    monkeypatch.delenv("HERMES_CUA_DRIVER_CMD", raising=False)
    monkeypatch.setitem(sys.modules, "tools.computer_use.cua_backend_driver", SimpleNamespace(resolve_cua_driver_cmd=lambda: None))
    monkeypatch.setitem(sys.modules, "tools.computer_use.permissions", SimpleNamespace(_child_env=lambda: {"TEST_ONLY": "1"}))
    monkeypatch.setattr(native.shutil, "which", lambda name: str(binary))
    return binary


def test_existing_driver_is_selected_without_installing_and_override_is_preserved(native_driver, monkeypatch):
    binary, source = native.driver()
    assert binary == str(native_driver) and source == "PATH"
    assert os.environ["HERMES_CUA_DRIVER_CMD"] == binary
    monkeypatch.setenv("HERMES_CUA_DRIVER_CMD", "/explicit/missing-driver")
    assert native.driver() == (None, "invalid_override")


def test_macos_checks_report_permissions_without_requesting_them(native_driver, monkeypatch):
    monkeypatch.setattr(native.sys, "platform", "darwin")
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(stdout="cua-driver 0.21.0" if args[-1] == "--version" else
            json.dumps({"accessibility": True, "screen_recording": False, "screen_recording_capturable": False}))
    monkeypatch.setattr(native.subprocess, "run", run)
    result = native.run({"action": "check"})
    assert result["success"] and result["diagnostics"]["installed"]
    assert result["diagnostics"]["accessibility"] is True
    assert result["diagnostics"]["screen_recording"] is False
    assert result["diagnostics"]["ready"] is False
    assert result["diagnostics"]["capture_verified"] is False
    assert all("grant" not in call for call in calls)


def test_request_launch_is_not_reported_as_a_permission_grant(native_driver, monkeypatch):
    monkeypatch.setattr(native.sys, "platform", "darwin")
    calls = []
    def launch(args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(pid=123)
    monkeypatch.setattr(native.subprocess, "Popen", launch)
    result = native.run({"action": "request_permissions"})
    assert result["request_started"] and result["diagnostics"]["accessibility"] is None
    assert result["diagnostics"]["screen_recording"] is None
    assert calls[0][0] == [str(native_driver), "permissions", "grant"]
    assert calls[0][1]["env"] == {"TEST_ONLY": "1"}


async def test_failed_adapter_retains_macos_and_unknown_installation(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE", tmp_path)
    monkeypatch.setattr(sys, "platform", "darwin")
    async def fail(): raise ValueError("backend failure")
    engine = CUAEngine()
    monkeypatch.setattr(engine.provider, "get_device_info", fail)
    device = (await engine.list_devices())[0]
    assert device["platform"] == "macos" and device["metadata"]["installed"] is None
    assert device["capabilities"] == [] and device["state"] == "unavailable"


async def test_operator_setup_works_before_remote_access_but_agents_cannot_request_it(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE", tmp_path)
    computer = NodeComputer({"host": "http://127.0.0.1:8787", "token": "test", "machine_id": "test"})
    calls = []
    async def perform(action):
        calls.append(action)
        return {"success": True, "request_started": True}
    monkeypatch.setattr(setup, "perform", perform)
    request = {"kind": "setup", "body": {"action": "request_permissions"}, "actor": None}
    assert (await computer.dispatch("a" * 64, request))["success"]
    assert calls == ["request_permissions"] and policy.read()["remote_access"] == []
    request["actor"] = "agent"
    assert not (await computer.dispatch("b" * 64, request))["success"]
    assert calls == ["request_permissions"]


async def test_remote_grants_map_to_confirmed_native_owner_and_keep_local_kill(tmp_path, monkeypatch):
    from ara_os import node_deployments
    monkeypatch.setattr(config, "STATE", tmp_path)
    monkeypatch.setattr(node_deployments, "authorized", lambda *args: True)
    computer = NodeComputer({"host": "http://127.0.0.1:8787", "token": "test", "machine_id": "test"})
    computer.bindings = [{"profile_id": "agent-id", "native_name": "native-agent", "enabled": True}]
    policy.update({"kill_switch": True, "grants": {"standalone-agent": ["view"]}})
    request = {"kind": "setup", "actor": None, "body": {"action": "configure", "values": {
        "remote_access": ["view"], "mode": "supervised", "grants": {"agent-id": ["view"]}}}}
    assert (await computer.dispatch("a" * 64, request))["success"]
    cfg = policy.read()
    assert cfg["kill_switch"] and cfg["grants"] == {"native-agent": ["view"], "standalone-agent": ["view"]}
    request["body"]["values"] = {"grants": {"unassigned": ["view", "input"]}}
    with pytest.raises(ValueError, match="assigned"):
        await computer.dispatch("b" * 64, request)
    assert policy.read()["grants"] == cfg["grants"]


def test_mcp_configuration_binds_the_shared_runtime_after_a_release_switch(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RUNTIME_SOURCE", tmp_path / "original/source")
    monkeypatch.setattr(config, "RUNTIME_PYTHON", tmp_path / "original/python")
    monkeypatch.setattr(config, "RUNTIME_TOOLS", tmp_path / "original/tools")
    value = node_mcp.configuration("native-agent")
    assert value["env"] == {"ARA_RUNTIME_SOURCE": str(config.RUNTIME_SOURCE),
        "ARA_RUNTIME_PYTHON": str(config.RUNTIME_PYTHON), "ARA_RUNTIME_TOOLS": str(config.RUNTIME_TOOLS)}


def test_operator_endpoint_is_authenticated_and_targets_the_selected_machine(tmp_path, monkeypatch):
    import ara_os.app as module
    monkeypatch.setattr(config, "STATE", tmp_path)
    calls = []
    async def command(machine, kind, body, **kwargs):
        calls.append((machine, kind, body, kwargs))
        return {"success": True, "request_started": True}
    monkeypatch.setattr(module.remote_computer, "command", command)
    client = TestClient(module.app, base_url=config.API_URL)
    url = "/api/v1/cua/setup?machine_id=mac-node"
    assert client.post(url, json={"action": "request_permissions"}).status_code == 401
    token = client.get("/api/v1/cua/session").json()["token"]
    headers = {"Authorization": "Bearer " + token}
    assert client.post(url, headers=headers, json={"action": "request_permissions", "operation_id": "once"}).status_code == 200
    assert calls == [("mac-node", "setup", {"action": "request_permissions"}, {"operation_id": "once"})]
    assert client.post(url, headers=headers, json={"action": "shell", "command": "anything"}).status_code == 400


def test_permission_request_round_trip_before_remote_view_is_enabled(system):
    from concurrent.futures import ThreadPoolExecutor
    import time
    client = system["client"]
    enrollment = client.post("/machines", json={"name": "Setup protocol fixture"}).json()["enrollment"]
    machine = enrollment["machine_id"]
    node_headers = {"X-ARA-Node-Key": enrollment["token"]}
    operator = {"Authorization": "Bearer " + client.get("/cua/session").json()["token"]}
    status = {"device": {"platform": "macos", "state": "needs_verification", "metadata": {"installed": True}},
        "setup_contract": setup.CONTRACT, "setup": None, "policy": {**policy.DEFAULT, "grants": {}}, "approvals": []}
    def poll():
        response = client.post("/nodes/computer/poll", headers=node_headers, json={"machine_id": machine, "status": status})
        response.raise_for_status()
        return response.json()
    poll()
    assert client.get("/cua/setup", headers=operator, params={"machine_id": machine}).json()["supported"]
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(client.post, "/cua/setup", params={"machine_id": machine}, headers=operator,
            json={"action": "request_permissions", "operation_id": "request-once"}, timeout=10)
        command = None
        for _ in range(50):
            commands = poll()["commands"]
            if commands:
                command = commands[0]
                break
            time.sleep(.03)
        assert command and command["request"] == {"kind": "setup", "body": {"action": "request_permissions"}, "actor": None}
        result = {"success": True, "request_started": True,
            "diagnostics": {"installed": True, "accessibility": False, "screen_recording": False}}
        client.post("/nodes/computer/results", headers=node_headers,
            json={"machine_id": machine, "command_id": command["id"], "result": result}).raise_for_status()
        response = pending.result(timeout=5)
        response.raise_for_status()
        assert response.json() == result
    assert client.get("/cua/state", headers=operator, params={"machine_id": machine}).json()["remote_access"] == []
    replay = client.post("/cua/setup", headers=operator, params={"machine_id": machine},
        json={"action": "request_permissions", "operation_id": "request-once"})
    assert replay.json() == result
    assert poll()["commands"] == []
