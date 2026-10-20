"""Cross-process exact-target checks using the real pinned native adapter."""
import json
import asyncio
import os
import subprocess

import pytest

from .conftest import ROOT


@pytest.fixture
def native_computer(tmp_path):
    windows = [
        {"pid": os.getpid(), "window_id": 100, "app_name": "Test app", "title": "Observed", "z_index": 10},
        {"pid": os.getpid(), "window_id": 200, "app_name": "Test app", "title": "Other", "z_index": 1}]
    def call(arguments, *, observation=None, actor="coder", epoch=0, **fixture):
        body = {"arguments": arguments, "actor": actor, "owner_pid": os.getpid(), "policy_epoch": epoch,
            "authorized": True, "observation_ref": observation,
            "fixture": {"windows": windows, **fixture}}
        result = subprocess.run([str(ROOT / ".runtime/env/bin/python"), str(ROOT / "tests/native_computer_fixture.py")],
            input=json.dumps(body) + "\n", text=True, capture_output=True, timeout=30, cwd=ROOT / ".runtime/ara-agent",
            env={**os.environ, "ARA_STATE_DIR": str(tmp_path), "HERMES_HOME": str(tmp_path / "runtime"),
                "HERMES_DISABLE_LAZY_INSTALLS": "1"})
        assert result.returncode == 0, result.stderr
        frames = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{"fixture_result"')]
        assert frames, result.stdout + result.stderr
        return frames[-1]
    return call, windows, tmp_path


@pytest.mark.parametrize("arguments,tool", [
    ({"action": "click", "coordinate": [500, 250]}, "click"),
    ({"action": "type", "text": "Literal test text"}, "type_text"),
    ({"action": "key", "keys": "enter"}, "press_key")])
def test_capture_then_input_binds_exact_window_across_native_processes(native_computer, arguments, tool):
    call, windows, _ = native_computer
    observed = call({"action": "capture", "mode": "vision"})["result"]
    assert observed["success"], observed
    windows[1]["z_index"] = 100  # Another window of the same app becomes foreground.
    result = call(arguments, observation=observed["metadata"]["observation_ref"])
    assert result["result"]["success"], result
    inputs = [c for c in result["calls"] if c["tool"] == tool]
    assert len(inputs) == 1
    assert inputs[0]["arguments"]["window_id"] == 100
    assert inputs[0]["arguments"]["pid"] == os.getpid()
    assert result["result"]["metadata"]["effect"] == "confirmed"


@pytest.mark.parametrize("change", ["missing", "renamed", "actor", "desktop", "dimensions", "expired", "process", "owner", "policy"])
def test_changed_native_observation_refuses_input(native_computer, change):
    call, windows, state = native_computer
    observed = call({"action": "capture", "mode": "vision"})["result"]
    reference = observed["metadata"]["observation_ref"]
    path = state / "computer-observations" / (reference + ".json")
    value = json.loads(path.read_text())
    args = {}
    if change == "missing":
        windows.pop(0)
    elif change == "renamed":
        windows[0]["title"] = "Replaced"
    elif change == "actor":
        args["actor"] = "other"
    elif change == "desktop":
        args["desktop"] = "different-display"
    elif change == "dimensions":
        args["dimensions"] = [2000, 1000]
    elif change == "expired":
        value["created"] -= 16
    elif change in {"process", "owner"}:
        value["target_process" if change == "process" else "owner_process"]["started"] -= 1
    elif change == "policy":
        (state / "computer-policy.json").write_text(json.dumps({"epoch": 1}))
    path.write_text(json.dumps(value))
    result = call({"action": "click", "coordinate": [500, 250]}, observation=reference, **args)
    assert not result["result"]["success"], result
    assert "fresh" in result["result"]["error"]
    assert not any(c["tool"] == "click" for c in result["calls"])


def test_native_hard_blocks_remain_in_force(native_computer):
    call, _, _ = native_computer
    observed = call({"action": "capture", "mode": "vision"})["result"]
    result = call({"action": "key", "keys": "ctrl+alt+delete"}, observation=observed["metadata"]["observation_ref"])
    assert not result["result"]["success"]
    assert "blocked" in result["result"]["error"]
    assert not any(c["tool"] in {"press_key", "hotkey"} for c in result["calls"])


def test_native_unconfirmed_effect_is_retained_without_repeating_input(native_computer):
    call, _, _ = native_computer
    observed = call({"action": "capture", "mode": "vision"})["result"]
    result = call({"action": "click", "coordinate": [500, 250]},
        observation=observed["metadata"]["observation_ref"], effect="unverifiable")
    assert result["result"]["metadata"]["effect"] == "unverifiable"
    assert result["result"]["metadata"]["verified"] is False
    assert len([c for c in result["calls"] if c["tool"] == "click"]) == 1


def test_capture_owner_exit_during_target_revalidation_blocks_delivery(native_computer):
    call, windows, _ = native_computer
    for window in windows:
        window["pid"] = os.getppid()  # Distinguish the still-live target from the exiting capture owner.
    observed = call({"action": "capture", "mode": "vision"})["result"]
    result = call({"action": "click", "coordinate": [500, 250]},
        observation=observed["metadata"]["observation_ref"], owner_exits_during_capture=True)
    assert not result["result"]["success"] and "fresh" in result["result"]["error"]
    assert not any(c["tool"] == "click" for c in result["calls"])


async def test_supervised_approval_in_another_process_keeps_target_and_receipt(native_computer, monkeypatch):
    from ara_os import config, runtime_adapter
    from ara_os.cua import policy
    from ara_os.cua.engine import CUAEngine
    from ara_os.cua.models import CUAAction
    call, windows, state = native_computer
    monkeypatch.setattr(config, "STATE", state)
    policy.update({"mode": "supervised", "grants": {"coder": ["view", "input"]}})
    input_log = state / "fake-driver-inputs.jsonl"
    async def adapter(body):
        result = await asyncio.to_thread(call, body["arguments"], observation=body.get("observation_ref"),
            actor=body["actor"], epoch=body["policy_epoch"], input_log=str(input_log))
        return result["result"]
    monkeypatch.setattr(runtime_adapter, "computer", adapter)
    engine = CUAEngine()
    captured = await engine.act("local_desktop", CUAAction.from_dict({"action": "screenshot"}), actor="coder")
    assert captured.success
    click = CUAAction.from_dict({"action": "left_click", "coordinate": [.5, .5]})
    pending = await engine.act("local_desktop", click, actor="coder", operation_id="cross-process")
    assert pending.metadata["state"] == "pending"
    windows[1]["z_index"] = 100
    script = '''
import asyncio, json, sys
from pathlib import Path
from ara_os import runtime, runtime_adapter
from ara_os.cua.engine import CUAEngine
data = json.loads(sys.stdin.readline())
runtime.WORKER = Path(data["worker"])
async def computer(body):
    return await runtime.call({**body, "fixture_protocol": "ara", "fixture": data["fixture"]})
runtime_adapter.computer = computer
print(json.dumps(asyncio.run(CUAEngine().approve(data["approval"])).to_dict()))
'''
    result = await asyncio.to_thread(subprocess.run, [str(ROOT / ".venv/bin/python"), "-c", script],
        input=json.dumps({"approval": pending.metadata["approval_id"], "worker": str(ROOT / "tests/native_computer_fixture.py"),
            "fixture": {"windows": windows, "input_log": str(input_log)}}) + "\n",
        text=True, capture_output=True, cwd=ROOT, timeout=30,
        env={**os.environ, "ARA_STATE_DIR": str(state), "HERMES_DISABLE_LAZY_INSTALLS": "1"})
    assert result.returncode == 0, result.stdout + result.stderr
    approved = json.loads(result.stdout)
    assert approved["success"], approved
    assert (await engine.act("local_desktop", click, actor="coder", operation_id="cross-process")).success
    inputs = [json.loads(line) for line in input_log.read_text().splitlines()]
    assert len(inputs) == 1 and inputs[0]["arguments"]["window_id"] == 100
    with pytest.raises(ValueError, match="consumed"):
        await engine.approve(pending.metadata["approval_id"])


@pytest.mark.parametrize("coordinate,expected", [([.25, .75], [500, 750]), ([1, 1], [1999, 999])])
async def test_provider_uses_observed_image_dimensions_and_clamps_edges(native_computer, monkeypatch, coordinate, expected):
    from ara_os import runtime_adapter
    from ara_os.cua.models import CUAAction
    from ara_os.cua.providers.native import NativeDeviceProvider
    call, _, _ = native_computer
    seen = []
    async def adapter(body):
        result = await asyncio.to_thread(call, body["arguments"], observation=body.get("observation_ref"),
            actor=body["actor"], epoch=0, dimensions=[2000, 1000])
        seen.extend(result["calls"])
        return result["result"]
    monkeypatch.setattr(runtime_adapter, "computer", adapter)
    provider = NativeDeviceProvider()
    await provider.capture_frame()
    result = await provider.send_input(CUAAction.from_dict({"action": "left_click", "coordinate": coordinate}))
    assert result.success, result
    click = next(c["arguments"] for c in seen if c["tool"] == "click")
    assert [click["x"], click["y"]] == expected
