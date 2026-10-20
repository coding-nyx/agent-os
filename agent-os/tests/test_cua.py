"""Computer policy/transport tests. All capture and input backends are explicit fakes."""
import asyncio
import base64
import fcntl
import json
import time
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ara_os import config
from ara_os.cua import policy
from ara_os.cua.engine import CUAEngine
from ara_os.cua.models import CUAAction, CUAActionResult, DeviceInfo, DevicePlatform
from ara_os.cua.providers.native import NativeDeviceProvider
from ara_os.cua.tools import result_content

FRAME = base64.b64encode(b"explicit-test-frame-not-a-desktop").decode()


class FakeProvider:
    def __init__(self):
        self.calls = []
        self.metadata = {"width": 1920, "height": 1080, "format": "png", "app": "Test app"}
        self.observed_at = time.monotonic()

    async def get_device_info(self):
        return DeviceInfo(id="local_desktop", name="Test only", platform=DevicePlatform.LINUX,
                          state="needs_verification", metadata={"test_only": True})

    async def send_input(self, action):
        self.calls.append(action)
        if action.action.value == "screenshot":
            return CUAActionResult(success=True, frame_base64=FRAME, metadata=self.metadata)
        return CUAActionResult(success=True, output="mock input only")

    async def get_ui_tree(self):
        return {"elements": [], "test_only": True}


@pytest.fixture
def computer(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE", tmp_path)
    engine = CUAEngine()
    engine.provider = FakeProvider()
    return engine


def action(kind="left_click"):
    return CUAAction.from_dict({"action": kind, "coordinate": [.5, .5]})


async def observe(engine, actor=None, operator=False):
    return await engine.act("local_desktop", action("screenshot"), actor=actor, operator=operator)


@pytest.mark.asyncio
async def test_default_denies_data_token_authority_and_inputs(computer):
    denied = await computer.act("local_desktop", action(), actor="data-profile", operation_id="once")
    assert not denied.success and "grant" in denied.error
    assert computer.provider.calls == []
    assert (await observe(computer, operator=True)).success
    denied = await computer.act("local_desktop", action(), operator=True)
    assert not denied.success and "view_only" in denied.error
    assert len(computer.provider.calls) == 1


@pytest.mark.asyncio
async def test_backend_modes_and_stable_input_receipts(computer):
    policy.update({"mode": "autonomous", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    first = await computer.act("local_desktop", action(), actor="coder", operation_id="once")
    repeated = await computer.act("local_desktop", action(), actor="coder", operation_id="once")
    assert first.success and repeated.success
    assert len(computer.provider.calls) == 2  # capture plus one actual input
    conflict = await computer.act("local_desktop", action("right_click"), actor="coder", operation_id="once")
    assert not conflict.success and "different" in conflict.error
    computer.set_mode("view_only")
    blocked = await computer.act("local_desktop", action(), actor="coder", operation_id="new")
    assert not blocked.success and "view_only" in blocked.error


@pytest.mark.asyncio
async def test_supervised_approval_is_single_use(computer):
    policy.update({"mode": "supervised", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    pending = await computer.act("local_desktop", action(), actor="coder", operation_id="approval-once")
    assert not pending.success and pending.metadata["state"] == "pending"
    assert len(computer.provider.calls) == 1
    ident = pending.metadata["approval_id"]
    assert (await computer.approve(ident)).success
    assert len(computer.provider.calls) == 2
    with pytest.raises(ValueError, match="consumed"):
        await computer.approve(ident)
    assert (await computer.act("local_desktop", action(), actor="coder", operation_id="approval-once")).success
    assert len(computer.provider.calls) == 2


@pytest.mark.asyncio
async def test_kill_switch_interrupts_inflight_transport(computer):
    policy.update({"mode": "autonomous"})
    await observe(computer, operator=True)
    started, stopped = asyncio.Event(), asyncio.Event()
    async def blocking(action):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()
    computer.provider.send_input = blocking
    work = asyncio.create_task(computer.act("local_desktop", action(), operator=True))
    await started.wait()
    computer.set_kill_switch(True)
    result = await asyncio.wait_for(work, 2)
    assert not result.success and result.metadata["outcome"] == "unknown"
    assert stopped.is_set()
    assert not (await computer.act("local_desktop", action(), operator=True)).success


@pytest.mark.asyncio
async def test_two_agents_cannot_drive_one_device(computer):
    policy.update({"mode": "autonomous", "grants": {"a": ["view", "input"], "b": ["view", "input"]}})
    await observe(computer, actor="a")
    await observe(computer, actor="b")
    assert (await computer.act("local_desktop", action(), actor="a", operation_id="a1")).success
    refused = await computer.act("local_desktop", action(), actor="b", operation_id="b1")
    assert not refused.success and "controller" in refused.error


@contextmanager
def held_device(monkeypatch):
    """Signal the actual failed lock acquisition; no timing guess in race tests."""
    waiting = asyncio.Event()
    original = fcntl.flock
    def flock(fd, flags):
        try:
            return original(fd, flags)
        except BlockingIOError:
            waiting.set()
            raise
    with (config.STATE / ".computer-device.lock").open("a") as lock:
        original(lock, fcntl.LOCK_EX)
        monkeypatch.setattr(fcntl, "flock", flock)
        yield waiting, lambda: original(lock, fcntl.LOCK_UN)


async def test_queued_autonomous_input_requires_current_supervised_approval(computer, monkeypatch):
    policy.update({"mode": "autonomous", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    with held_device(monkeypatch) as (waiting, release):
        work = asyncio.create_task(computer.act("local_desktop", action(), actor="coder", operation_id="queued"))
        await asyncio.wait_for(waiting.wait(), 2)
        policy.update({"mode": "supervised"})
        release()
        result = await work
    assert result.metadata["state"] == "pending"
    assert len(computer.provider.calls) == 1
    repeated = await computer.act("local_desktop", action(), actor="coder", operation_id="queued")
    assert repeated.metadata == result.metadata
    assert len(list((config.STATE / "computer-approvals").glob("*.json"))) == 1
    assert (await computer.approve(result.metadata["approval_id"])).success
    assert len(computer.provider.calls) == 2


@pytest.mark.parametrize("operation", ["input", "screenshot", "tree"])
async def test_queued_device_operation_rechecks_revoked_grant(computer, monkeypatch, operation):
    policy.update({"mode": "autonomous", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    reads = []
    async def tree():
        reads.append(True)
        return {"private": "must not be read"}
    computer.provider.get_ui_tree = tree
    with held_device(monkeypatch) as (waiting, release):
        call = (computer.get_ui_tree("local_desktop", actor="coder") if operation == "tree" else
            computer.act("local_desktop", action("screenshot" if operation == "screenshot" else "left_click"),
                actor="coder", operation_id="revoked"))
        work = asyncio.create_task(call)
        await asyncio.wait_for(waiting.wait(), 2)
        policy.update({"grants": {}})
        release()
        if operation == "tree":
            with pytest.raises(ValueError, match="grant"):
                await work
        else:
            result = await work
            assert not result.success and "grant" in result.error
    assert len(computer.provider.calls) == 1
    assert not reads


async def test_observation_expiry_is_checked_after_lock_wait(computer, monkeypatch):
    policy.update({"mode": "autonomous", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    with held_device(monkeypatch) as (waiting, release):
        work = asyncio.create_task(computer.act("local_desktop", action(), actor="coder", operation_id="expires"))
        await asyncio.wait_for(waiting.wait(), 2)
        computer.observations["coder"]["created"] -= 16
        release()
        result = await work
    assert not result.success and "fresh" in result.error
    assert len(computer.provider.calls) == 1


async def test_policy_change_invalidates_single_use_approval(computer):
    policy.update({"mode": "supervised", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    result = await computer.act("local_desktop", action(), actor="coder", operation_id="stale-approval")
    policy.update({"mode": "autonomous"})
    approved = await computer.approve(result.metadata["approval_id"])
    assert not approved.success and "policy" in approved.error
    assert len(computer.provider.calls) == 1
    with pytest.raises(ValueError, match="consumed"):
        await computer.approve(result.metadata["approval_id"])


async def test_approval_must_match_the_original_operation_payload(computer):
    policy.update({"mode": "supervised", "grants": {"coder": ["view", "input"]}})
    await observe(computer, actor="coder")
    result = await computer.act("local_desktop", action(), actor="coder", operation_id="bound-payload")
    path = config.STATE / "computer-approvals" / (result.metadata["approval_id"] + ".json")
    value = json.loads(path.read_text())
    value["action"]["action"] = "right_click"
    path.write_text(json.dumps(value))
    approved = await computer.approve(result.metadata["approval_id"])
    assert not approved.success and "admitted" in approved.error
    assert len(computer.provider.calls) == 1


async def test_revocation_during_accessibility_read_discards_result(computer):
    policy.update({"grants": {"coder": ["view"]}})
    started, finish = asyncio.Event(), asyncio.Event()
    async def tree():
        started.set()
        await finish.wait()
        return {"private": "discard"}
    computer.provider.get_ui_tree = tree
    work = asyncio.create_task(computer.get_ui_tree("local_desktop", actor="coder"))
    await started.wait()
    policy.update({"grants": {}})
    finish.set()
    with pytest.raises(ValueError, match="policy changed"):
        await work


@pytest.mark.parametrize("body", [
    {"action": "made_up"}, {"action": []}, {"action": "left_click", "coordinate": [-.1, .5]},
    {"action": "left_click", "coordinate": [float("nan"), .5]},
    {"action": "left_click", "coordinate": [1, 2, 3]}, {"action": "drag", "duration_ms": -1},
])
def test_action_validation_rejects_invalid_inputs(body):
    with pytest.raises(ValueError):
        CUAAction.from_dict(body)


@pytest.mark.asyncio
async def test_native_adapter_does_not_interpolate_shell_text(monkeypatch):
    from ara_os import runtime_adapter
    seen = []
    async def native(request):
        seen.append(request)
        if request["arguments"]["action"] == "capture":
            return {"success": True, "frame_base64": FRAME, "metadata": {"width": 1920, "height": 1080}}
        return {"success": True}
    monkeypatch.setattr(runtime_adapter, "computer", native)
    provider = NativeDeviceProvider()
    await provider.capture_frame()
    literal = "$(printf SHOULD_NOT_EXECUTE)"
    result = await provider.send_input(CUAAction.from_dict({"action": "type", "text": literal}))
    assert result.success
    assert seen[-1]["arguments"]["text"] == literal
    unsupported = await provider.send_input(CUAAction.from_dict({"action": "mouse_down"}))
    assert not unsupported.success


def test_http_and_websocket_authorization(computer, monkeypatch):
    import ara_os.app as module
    monkeypatch.setattr(module, "cua_engine", computer)
    client = TestClient(module.app, base_url=config.API_URL)
    assert client.get("/api/v1/cua/devices").status_code == 401
    assert client.get("/api/v1/cua/session", headers={"Origin": "https://untrusted.invalid"}).status_code == 403
    assert client.get("/api/v1/cua/session", headers={"Host": "rebinding.invalid"}).status_code == 403
    token = client.get("/api/v1/cua/session").json()["token"]
    headers = {"Authorization": "Bearer " + token}
    assert client.get("/api/v1/cua/devices", headers=headers).status_code == 200
    ws_url = config.API_URL.replace("http", "ws", 1) + "/api/v1/cua/devices/local_desktop/stream"
    for ws_headers in ({}, {"Origin": "https://untrusted.invalid", "Sec-WebSocket-Protocol": "ara-control, " + token}):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(ws_url, headers=ws_headers):
                pass
    with client.websocket_connect(ws_url, subprotocols=["ara-control", token]) as ws:
        assert ws.receive_json()["type"] == "init"
        assert ws.receive_json()["type"] == "frame"
    blocked = client.post("/api/v1/cua/devices/local_desktop/action", headers=headers,
                          json={"action": "left_click", "coordinate": [.5, .5]})
    assert blocked.status_code == 200 and blocked.json()["success"] is False


def test_mcp_returns_native_image_blocks_and_enforces_grants(computer, monkeypatch):
    import ara_os.app as module
    import ara_os.cua.tools as tools
    monkeypatch.setattr(module, "cua_engine", computer)
    monkeypatch.setattr(tools, "cua_engine", computer)
    monkeypatch.setattr(module, "find", lambda *args: {"enabled": True})
    (config.STATE / "data-token-coder").write_text("test-data-token")
    client = TestClient(module.app, base_url=config.API_URL)
    headers = {"Authorization": "Bearer test-data-token"}
    request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "ara_cua_computer", "arguments": {"device_id": "local_desktop", "action": "screenshot"}}}
    denied = client.post("/api/v1/mcp/coder", headers=headers, json=request).json()["result"]
    assert denied["isError"] is True
    policy.update({"grants": {"coder": ["view"]}})
    result = client.post("/api/v1/mcp/coder", headers=headers, json=request).json()["result"]
    assert [c["type"] for c in result["content"]] == ["text", "image"]
    assert FRAME not in result["content"][0]["text"]
    assert result["content"][1]["data"] == FRAME
    policy.update({"mode": "supervised", "grants": {"coder": ["view", "input"]}})
    request["params"]["arguments"] = {"device_id": "local_desktop", "action": "left_click", "coordinate": [.5, .5], "operation_id": "pending-once"}
    pending = client.post("/api/v1/mcp/coder", headers=headers, json=request).json()["result"]
    assert pending["isError"] is False
    metadata = json.loads(pending["content"][0]["text"])["metadata"]
    assert metadata["state"] == "pending"
    computer.reject(metadata["approval_id"])
    rejected = client.post("/api/v1/mcp/coder", headers=headers, json=request).json()["result"]
    assert rejected["isError"] is True

