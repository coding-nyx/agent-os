import json
import os
from pathlib import Path
import sqlite3
import subprocess

import pytest

from ara_os.native_diagnostics import POLICY_PREFIX, session_recovery
from ara_os.runs import terminal_patch, view
from .conftest import ROOT
from .test_lifecycle import until


def test_missing_storage_diagnostics_do_not_create_or_repair_files(tmp_path):
    missing = tmp_path / "missing-profile"
    assert session_recovery(missing, request_id="missing") is None
    assert not missing.exists()
    (tmp_path / "state.db").write_bytes(b"not a sqlite database")
    assert session_recovery(tmp_path, request_id="missing") is None
    assert (tmp_path / "state.db").read_bytes() == b"not a sqlite database"


@pytest.mark.parametrize("model,owner,expected", [("", True, True), ("  ", True, True),
    ("configured-model", True, False), ("", False, False), (None, True, False)])
def test_diagnostics_only_identify_confirmed_empty_model(tmp_path, model, owner, expected):
    receipt = {"session_id": "local-test", "profile_id": str(tmp_path if owner else tmp_path / "other"),
               "request_id": "conversation-test", "policy": {"model": model, "secret": "never-display"}}
    with sqlite3.connect(tmp_path / "state.db") as db:
        db.execute("CREATE TABLE state_meta(key TEXT PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO state_meta VALUES(?,?)", (POLICY_PREFIX + "local-test", json.dumps(receipt)))
    result = session_recovery(tmp_path, request_id="conversation-test")
    assert bool(result) == expected
    assert "never-display" not in json.dumps(result)
    assert session_recovery(tmp_path, session_id="local-test", request_id="other-request") is None


def test_failed_receipts_always_explain_failure():
    assert terminal_patch({"outcome": "failed", "result": {}})["error"]
    assert terminal_patch({"outcome": "completed", "result": {}})["error"] is None
    assert terminal_patch({"outcome": "interrupted", "result": {}})["error"] is None
    historical = {"state": "failed", "error": None}
    assert view(historical)["error"]
    assert historical["error"] is None


async def test_native_errors_preserve_executable_setup_commands(monkeypatch):
    from ara_os import runtime
    from ara_os.store import Problem

    async def refused(request, profile):
        return {"status": 400, "body": {"detail": "Run `hermes -p target auth add openai-codex` to authenticate."}}

    monkeypatch.setattr(runtime, "call", refused)
    with pytest.raises(Problem) as error:
        await runtime.native_http("POST", "/api/model/set")
    assert "hermes -p target auth add openai-codex" in error.value.detail


def legacy_empty_model_conversation(system, name="Legacy model recovery"):
    c = system["client"]
    profile = c.post("/profiles", json={"name": name, "preset": "titan"}).json()
    conversation = c.post("/conversations", json={"profile_id": profile["id"], "title": name}).json()
    home = system["state"] / "runtime/profiles" / profile["native_name"]
    env = {**system["env"], "HERMES_HOME": str(home),
           "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools"), "HERMES_DISABLE_LAZY_INSTALLS": "1"}
    # Reproduce an old client bypassing today's no-model submission guard.
    request = {"operation": "rpc", "method": "session.create", "params": {
        "request_id": conversation["id"], "source": "gui", "title": name, "run_budget": 300}}
    process = subprocess.run([str(ROOT / ".runtime/env/bin/python"),
        str(ROOT / "src/ara_os/native_worker.py")], cwd=ROOT / ".runtime/ara-agent",
        env=env, input=json.dumps(request) + "\n", text=True, capture_output=True, timeout=60)
    frames = [json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"ara_frame":')]
    assert process.returncode == 1, frames
    assert frames[-1]["data"]["code"] == "native_storage_unavailable", frames
    configured = c.post(f"/profiles/{profile['id']}/model", json={"name": "Recovery wire fixture",
        "base_url": system["provider_url"], "model": "ara-protocol-test",
        "api_key": "test-only-placeholder", "api_mode": "chat_completions"})
    configured.raise_for_status()
    with sqlite3.connect(home / "state.db") as db:
        receipt = db.execute("SELECT value FROM state_meta WHERE key GLOB ?", (POLICY_PREFIX + "*",)).fetchone()[0]
    response = c.post(f"/conversations/{conversation['id']}/messages", json={"text": "Recover safely", "operation_id": "legacy-once"})
    response.raise_for_status()
    failed = until(system, response.json(), lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert failed["state"] == "failed", failed
    assert failed["error_code"] == "native_session_model_missing", failed
    assert failed["error_stage"] == "session.create"
    return profile, conversation, failed, home, receipt


def test_legacy_session_recovers_without_rewriting_history_or_resending(system):
    c = system["client"]
    profile, old, failed, home, receipt = legacy_empty_model_conversation(system)
    detail = c.get(f"/conversations/{old['id']}").json()
    assert detail["recovery"]["action"] == "start_new_conversation"
    blocked = c.post(f"/conversations/{old['id']}/messages", json={"text": "Do not write another failed run", "operation_id": "new-attempt"})
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["error"]["code"] == "native_session_model_missing"
    duplicate = c.post(f"/conversations/{old['id']}/messages", json={"text": "Recover safely", "operation_id": "legacy-once"})
    assert duplicate.json()["id"] == failed["id"]
    result = c.post(f"/conversations/{old['id']}/restart", json={})
    assert result.status_code == 201, result.text
    fresh = result.json()
    assert fresh["recovery_of"] == old["id"]
    assert c.post(f"/conversations/{old['id']}/restart", json={}).json()["id"] == fresh["id"]
    assert not c.get(f"/conversations/{fresh['id']}").json()["runs"]
    with sqlite3.connect(home / "state.db") as db:
        assert db.execute("SELECT value FROM state_meta WHERE key GLOB ?", (POLICY_PREFIX + "*",)).fetchone()[0] == receipt
        assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0
    run = c.post(f"/conversations/{fresh['id']}/messages", json={"text": "A deliberate fresh turn", "operation_id": "fresh-once"}).json()
    completed = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert completed["state"] == "succeeded", completed
    assert "ARA native runtime protocol verified" in completed["output"]
    assert len(c.get(f"/conversations/{old['id']}").json()["runs"]) == 1


def test_runtime_disconnect_is_unknown_not_a_confirmed_refusal():
    script = """
import json, sys
sys.path.insert(0, sys.argv[1])
from native_worker import failure_frame
from hermes_cli.gateway_client import GatewayClientError, GatewayRPCError
for error in [GatewayClientError('disconnected'), TimeoutError(), GatewayRPCError('permission_denied')]:
    kind, payload = failure_frame(error, {'_stage': 'prompt.submit'})
    print(json.dumps({'kind': kind, 'code': payload['code']}))
kind, payload = failure_frame(GatewayRPCError('storage_unavailable'), {'_stage': 'prompt.events'})
print(json.dumps({'kind': kind, 'code': payload['code']}))
"""
    process = subprocess.run([str(ROOT / ".runtime/env/bin/python"), "-c", script,
        str(ROOT / "src/ara_os")], cwd=ROOT / ".runtime/ara-agent", text=True,
        capture_output=True, timeout=30)
    assert process.returncode == 0, process.stderr
    frames = [json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"kind":')]
    assert [f["kind"] for f in frames] == ["unknown", "unknown", "error", "unknown"]
    assert frames[2]["code"] == "native_permission_denied"


def test_recovery_control_preserves_history_and_opens_an_empty_draft(system):
    from playwright.sync_api import expect, sync_playwright
    profile, old, _, _, _ = legacy_empty_model_conversation(system, "Recovery browser")
    output = ROOT / "test-results"
    output.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        executable = "/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else "/usr/bin/google-chrome"
        browser = playwright.chromium.launch(executable_path=os.environ.get("ARA_BROWSER_EXECUTABLE", executable), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{system['port']}")
        page.locator("nav").get_by_role("button", name="Agents", exact=False).click()
        page.get_by_role("button", name="Open agent Recovery browser", exact=True).click()
        page.get_by_role("tab", name="Conversation", exact=True).click()
        action = page.get_by_role("button", name="Start fresh conversation", exact=True)
        expect(action).to_be_visible()
        expect(page.get_by_role("textbox", name="Message agent")).to_be_disabled()
        page.screenshot(path=str(output / "session-recovery-desktop.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        expect(action).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(output / "session-recovery-mobile.png"), full_page=True)
        action.click()
        expect(action).not_to_be_visible()
        expect(page.get_by_role("textbox", name="Message agent")).to_be_enabled()
        expect(page.get_by_role("textbox", name="Message agent")).to_have_value("")
        c = system["client"]
        conversations = c.get("/conversations", params={"profile_id": profile["id"]}).json()
        assert len(conversations) == 2
        fresh = next(x for x in conversations if x.get("recovery_of") == old["id"])
        assert not c.get(f"/conversations/{fresh['id']}").json()["runs"]
        assert len(c.get(f"/conversations/{old['id']}").json()["runs"]) == 1
        assert not errors, errors
        browser.close()
