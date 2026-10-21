"""Runtime-boundary regressions; no inference, services or physical input."""
import json
import sys
import subprocess
from types import SimpleNamespace

import pytest
import yaml

from ara_os import config, instances, native_instance, node_deployments, runtime
from ara_os.store import Problem


def test_native_worker_does_not_shadow_the_mcp_sdk():
    script = "import runpy, sys; runpy.run_path(sys.argv[1], run_name='ara_bridge_import_check'); import mcp; assert hasattr(mcp, 'ClientSession'), mcp.__file__"
    checked = subprocess.run([str(config.RUNTIME_PYTHON), "-c", script, str(runtime.WORKER)],
        cwd=config.RUNTIME_SOURCE, capture_output=True, text=True, timeout=15)
    assert checked.returncode == 0, checked.stderr


@pytest.mark.parametrize("native_request", [
    {"operation": "definition-capture"},
    {"operation": "instance-asset", "path": "config.yaml"},
    {"operation": "instance-swarm"},
    {"operation": "instance-preferences", "profile": {"preset": "custom", "name": "Test", "configuration": {}}},
    {"operation": "instance-preferences", "profile": {"preset": "ara", "name": "Ara", "configuration": None}},
])
async def test_native_profile_helpers_run_in_actual_hermes_environment(tmp_path, monkeypatch, native_request):
    monkeypatch.setattr(config, "STATE", tmp_path)
    monkeypatch.setattr(config, "RUNTIME_HOME", tmp_path / "runtime")
    home = runtime.home({"native_name": "test-agent"})
    home.mkdir(parents=True)
    (home / "SOUL.md").write_text("Native bridge smoke check")
    (home / "config.yaml").write_text("model:\n  default: test-model\ndisplay:\n  skin: ara\n")
    result = await runtime.call(native_request, {"native_name": "test-agent"})
    assert isinstance(result, dict)
    if native_request["operation"] == "definition-capture":
        assert result["files"]["SOUL.md"] == "Native bridge smoke check"
        assert result["config"] == {"display": {"skin": "ara"}}
    if native_request["operation"] == "instance-asset":
        assert yaml.safe_load(result["content"]) == {"display": {"skin": "ara"}}


@pytest.mark.parametrize("online,state,ready", [(False, "running", False), (True, "stopped", False),
    (True, "starting", False), (True, "error", False), (True, "running", True)])
def test_remote_readiness_requires_a_running_reachable_owner(online, state, ready):
    from ara_os.app import enrich_profile
    profile = {"id": "agent", "name": "Agent", "preset": "custom", "enabled": True,
        "native_name": "agent", "provision_state": "definition_ready", "_runtime_target": {
            "machine_id": "node", "online": online, "deployment_state": "active", "runtime_state": state,
            "model_connection": {"provider": "custom", "model": "test-model"}}}
    assert enrich_profile(profile)["chat_ready"] is ready


@pytest.mark.parametrize("machine", ["local", "node"])
def test_runtime_controls_use_the_selected_machine(monkeypatch, machine):
    from fastapi.testclient import TestClient
    import ara_os.app as module
    calls = []
    monkeypatch.setattr(module, "runtime_profile", lambda id: {"id": id, "_runtime_target": {"machine_id": module.runtime_machine.get()}})
    async def call(request, profile):
        calls.append((request, profile))
        return {"state": "running", "reason": None}
    monkeypatch.setattr(runtime, "call", call)
    client = TestClient(module.app, base_url=config.API_URL)
    assert client.get(f"/api/v1/profiles/agent/runtime?machine_id={machine}").json()["state"] == "running"
    assert client.post(f"/api/v1/profiles/agent/runtime/start?machine_id={machine}", json={}).status_code == 200
    assert [r[0]["action"] for r in calls] == ["status", "start"]
    assert all(r[1]["_runtime_target"]["machine_id"] == machine for r in calls)


@pytest.mark.parametrize("frames", [[], [{"type": "event", "data": {"type": "diagnostic"}}]])
async def test_runtime_closing_without_result_is_not_success(monkeypatch, frames):
    async def transport(request, profile):
        for frame in frames:
            yield frame
    monkeypatch.setattr(runtime, "frames", transport)
    with pytest.raises(Problem) as error:
        await runtime.call({"operation": "http", "method": "PUT"})
    assert error.value.code == "runtime_result_missing"
    assert "unconfirmed" in error.value.detail


async def test_native_failure_keeps_reason_and_recovery_action(monkeypatch):
    async def transport(request, profile):
        yield {"type": "error", "data": {"code": "native_storage_unavailable",
            "detail": "Profile store unavailable", "action": "Inspect this profile's native storage"}}
    monkeypatch.setattr(runtime, "frames", transport)
    with pytest.raises(Problem) as error:
        await runtime.call({"operation": "instance-lifecycle", "action": "start"})
    assert error.value.code == "native_storage_unavailable"
    assert error.value.action == "Inspect this profile's native storage"


@pytest.mark.parametrize("body", ["model not configured", ["model not configured"]])
async def test_native_http_error_bodies_do_not_raise_attribute_error(monkeypatch, body):
    async def call(request, profile):
        return {"status": 409, "body": body}
    monkeypatch.setattr(runtime, "call", call)
    with pytest.raises(Problem) as error:
        await runtime.native_http("GET", "/api/model/info")
    assert error.value.status == 409
    assert "model not configured" in error.value.detail


@pytest.fixture
def native_api(tmp_path, monkeypatch):
    home = tmp_path / "runtime/profiles/test-agent"
    home.mkdir(parents=True)
    absent = SimpleNamespace(state="absent", endpoint=None, reason_code=None, detail=None)
    api = SimpleNamespace(discovery=absent, started=absent)
    monkeypatch.setitem(sys.modules, "hermes_cli.gateway_runtime", SimpleNamespace(
        discover_gateway_endpoint=lambda home: api.discovery,
        ensure_gateway_runtime=lambda home, **kwargs: api.started,
        control_home_for=lambda home, endpoint: home.parent.parent))
    monkeypatch.setitem(sys.modules, "hermes_cli.profiles", SimpleNamespace(
        parked_marker_path=lambda home: home / "gateway.parked"))
    def unserve(root, name):
        api.discovery = SimpleNamespace(state="inaccessible", endpoint=None, reason_code="profile_parked", detail="operator stop")
        return {"ok": True}
    monkeypatch.setitem(sys.modules, "gateway.control_socket", SimpleNamespace(
        request_serve_profile_hot=lambda *args: None, request_unserve_profile=unserve,
        query_gateway_control=lambda *args: {"ok": True}))
    return home, api


def test_failed_native_start_is_not_reported_as_installed(native_api):
    home, api = native_api
    api.started = SimpleNamespace(state="inaccessible", endpoint=None, reason_code="runtime_exited", detail="Profile storage failed to open")
    result = native_instance.lifecycle(home, "start")
    assert result["state"] == "error"
    assert result["reason"] == "runtime_exited"
    assert result["detail"] == "Profile storage failed to open"


def test_unserved_multiplexed_profile_confirms_stop(native_api):
    home, api = native_api
    api.discovery = SimpleNamespace(state="ready", endpoint=SimpleNamespace(instance_id="native-owner"), reason_code=None, detail=None)
    assert native_instance.lifecycle(home, "stop")["state"] == "stopped"
    assert native_instance.lifecycle(home, "status")["state"] == "stopped"


def test_unexpected_native_parking_is_an_error(native_api):
    home, api = native_api
    api.discovery = SimpleNamespace(state="inaccessible", endpoint=None, reason_code="profile_parked", detail="profile store unusable")
    result = native_instance.lifecycle(home, "status")
    assert result["state"] == "error"
    assert result["detail"] == "profile store unusable"


async def test_reconciliation_reports_native_failure_even_without_a_model(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE", tmp_path)
    monkeypatch.setattr(config, "RUNTIME_HOME", tmp_path / "runtime")
    home = runtime.home({"native_name": "test-agent"})
    home.mkdir(parents=True)
    (home / "config.yaml").write_text(yaml.safe_dump({"model": {"default": "  "}}))
    row = instances.register("test-agent", logical_agent_id="logical-agent", machine_id="node")
    binding = {"native_name": "test-agent", "profile_id": "logical-agent", "machine_id": "node",
        "instance_id": row["instance_id"], "generation": "current", "enabled": True, "definition": {"revision": "published"}}
    marker = node_deployments.marker("test-agent")
    marker.parent.mkdir()
    marker.write_text(json.dumps({k: v for k, v in binding.items() if k != "definition"} | {"definition_revision": "published"}))
    async def failed_status(request, profile):
        assert request == {"operation": "instance-lifecycle", "action": "status"}
        return {"state": "error", "reason": "runtime_exited", "detail": "Native startup failed"}
    monkeypatch.setattr(runtime, "call", failed_status)
    receipts = await node_deployments.reconcile([binding])
    assert receipts[0]["state"] == "error"
    assert receipts[0]["runtime_state"] == "error"
    assert receipts[0]["error"] == "Native startup failed"
    assert receipts[0]["model_configured"] is False
    assert receipts[0]["owner_epoch"] == row["owner_epoch"]


def test_bad_local_configuration_does_not_break_deployment_directory(tmp_path, monkeypatch):
    from ara_os.deployments import describe
    monkeypatch.setattr(config, "RUNTIME_HOME", tmp_path)
    home = runtime.home({"native_name": "test-agent"})
    home.mkdir(parents=True)
    (home / "config.yaml").write_text("model: [unfinished")
    profile = {"id": "agent", "revision": 1, "name": "Agent", "native_name": "test-agent", "enabled": True}
    result = describe(None, profile, machines={"local": {"id": "local", "name": "This machine"}})
    assert result["machines"][0]["state"] == "error"
    assert result["machines"][0]["model_configured"] is False
    assert "configuration could not be read" in result["machines"][0]["error"]
