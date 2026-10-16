"""Runtime controls and scope boundaries through actual native services."""
import json
import time

import yaml


def connected_profile(system, name):
    c = system["client"]
    p = c.post("/profiles", json={"name": name, "preset": "ara"}).json()
    assert p["provision_state"] == "ready", p.get("provision_error")
    result = c.post(f"/profiles/{p['id']}/model", json={"name": "Test wire fixture", "base_url": system["provider_url"], "model": "ara-protocol-test", "api_key": "test-only-placeholder", "api_mode": "chat_completions"})
    result.raise_for_status()
    return p


def start(system, profile, text):
    c = system["client"]
    conversation = c.post("/conversations", json={"profile_id": profile["id"], "title": text}).json()
    run = c.post(f"/conversations/{conversation['id']}/messages", json={"text": text, "operation_id": "once"})
    run.raise_for_status()
    return conversation, run.json()


def until(system, run, predicate, seconds=75):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        latest = system["client"].get(f"/runs/{run['id']}").json()
        if predicate(latest):
            return latest
        time.sleep(.3)
    raise AssertionError(latest)


def test_clarification_resumes_actual_native_waiter(system):
    c = system["client"]
    p = connected_profile(system, "Clarification verification")
    conversation, run = start(system, p, "ARA_CLARIFY_TEST")
    waiting = until(system, run, lambda r: r["state"] == "waiting" or r["state"] in {"succeeded", "failed", "unknown"})
    assert waiting["state"] == "waiting", waiting
    assert waiting["prompt"]["kind"] == "clarify"
    assert c.post(f"/conversations/{conversation['id']}/messages", json={"text": "Another simultaneous turn", "operation_id": "second"}).status_code == 409
    answer = c.post(f"/runs/{run['id']}/control", json={"action": "approve", "choice": "Option A"})
    assert answer.status_code == 200, answer.text
    done = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "cancelled", "unknown"})
    assert done["state"] == "succeeded", done
    assert "Option A" in done["output"]


def test_interrupt_and_duplicate_submission_do_not_restart_work(system):
    c = system["client"]
    p = connected_profile(system, "Cancellation verification")
    conversation, run = start(system, p, "ARA_SLOW_TEST")
    until(system, run, lambda r: bool(r.get("admission_id")))
    time.sleep(1)
    cancel = c.post(f"/runs/{run['id']}/control", json={"action": "cancel"})
    assert cancel.status_code == 200, cancel.text
    done = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "cancelled", "unknown"})
    assert done["state"] == "cancelled", done
    retry = c.post(f"/conversations/{conversation['id']}/messages", json={"text": run["input"], "operation_id": "once"})
    assert retry.json()["id"] == run["id"]
    assert retry.json()["state"] == "cancelled"


def test_learning_native_schedules_mcp_and_isolated_clone(system):
    c = system["client"]
    p = connected_profile(system, "Configuration verification")
    native = f"/profiles/{p['id']}/native"
    for policy in ["automatic", "review", "off"]:
        c.put(f"/profiles/{p['id']}/learning", json={"policy": policy}).raise_for_status()
        cfg = yaml.safe_load((system["state"] / "runtime/profiles" / p["native_name"] / "config.yaml").read_text())
        assert cfg["auxiliary"]["background_review"]["enabled"] == (policy != "off")
        assert cfg["memory"]["write_approval"] == (policy != "automatic")
        assert cfg["skills"]["write_approval"] == (policy != "automatic")
    providers = c.get(native + "/providers/oauth")
    providers.raise_for_status()
    assert any(o["id"] == "openai-codex" for o in providers.json()["providers"])
    job = c.post(native + "/cron/jobs", json={"name": "Paused diagnostic", "prompt": "Never run during this test", "schedule": "0 9 * * *", "paused": True, "deliver": "local"})
    assert job.status_code < 300, job.text
    jobs = c.get(native + "/cron/jobs").json()
    rows = jobs if isinstance(jobs, list) else jobs["jobs"]
    created = next(j for j in rows if j["name"] == "Paused diagnostic")
    assert created["enabled"] is False and created["state"] == "paused"
    other = c.get("/profiles").json()[0]
    other_jobs = c.get(f"/profiles/{other['id']}/native/cron/jobs").json()
    other_rows = other_jobs if isinstance(other_jobs, list) else other_jobs["jobs"]
    assert not any(j["id"] == created["id"] for j in other_rows)
    server = c.post(native + "/mcp/servers", json={"name": "extra-test-service", "url": "http://127.0.0.1:1/mcp"})
    assert server.status_code < 300, server.text
    assert any(s["name"] == "extra-test-service" for s in c.get(native + "/mcp/servers").json()["servers"])
    c.delete(native + "/mcp/servers/extra-test-service").raise_for_status()
    instance = c.post(f"/profiles/{p['id']}/instances", json={"name": "Isolated instance"})
    assert instance.status_code == 201, instance.text
    clone = instance.json()
    assert clone["native_name"] != p["native_name"]
    assert clone["logical_profile_id"] == p["logical_profile_id"]
    assert not clone["bindings"]
    clone_home = system["state"] / "runtime/profiles" / clone["native_name"]
    assert not (clone_home / ".env").exists() or "test-only-placeholder" not in (clone_home / ".env").read_text()


def test_scoped_delegation_and_cycle_rejection(system):
    c = system["client"]
    parent = connected_profile(system, "Scoped orchestrator")
    child = connected_profile(system, "Scoped specialist")
    unrelated = connected_profile(system, "Other orchestrator")
    c.put(f"/profiles/{parent['id']}/delegation", json={"targets": [child["id"]]}).raise_for_status()
    assert c.put(f"/profiles/{child['id']}/delegation", json={"targets": [parent["id"]]}).status_code == 400
    def tool(profile, name, args):
        token = (system["state"] / ("data-token-" + profile["id"])).read_text().strip()
        return c.post(f"/mcp/{profile['id']}", headers={"Authorization": "Bearer " + token}, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}).json()["result"]
    delegated = tool(parent, "ara_delegate_task", {"profile_id": child["id"], "text": "Execute a diagnostic response", "operation_id": "delegated-once"})
    assert not delegated.get("isError"), delegated
    task = json.loads(delegated["content"][0]["text"])
    done = until(system, {"id": task["run_id"]}, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert done["state"] == "succeeded", done
    assert tool(unrelated, "ara_get_task", {"run_id": task["run_id"]})["isError"] is True
    repeated = tool(parent, "ara_delegate_task", {"profile_id": child["id"], "text": "Execute a diagnostic response", "operation_id": "delegated-once"})
    assert json.loads(repeated["content"][0]["text"])["run_id"] == task["run_id"]


def test_unknown_projection_is_reconciled_without_resubmitting(system):
    import psycopg
    c = system["client"]
    p = connected_profile(system, "Outcome reconciliation")
    conversation, run = start(system, p, "Verify the durable native outcome")
    completed = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert completed["state"] == "succeeded"
    with psycopg.connect(system["env"]["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")) as connection:
        connection.execute("UPDATE ara_entities SET data=jsonb_set(data, '{state}', %s::jsonb) WHERE id=%s", (json.dumps("unknown"), run["id"]))
    assert c.post(f"/conversations/{conversation['id']}/messages", json={"text": "Do not repeat uncertain work", "operation_id": "new"}).status_code == 409
    checked = c.post(f"/runs/{run['id']}/reconcile", json={})
    assert checked.status_code == 200, checked.text
    assert checked.json()["state"] == "succeeded"
    assert checked.json()["output"] == completed["output"]
    assert checked.json()["receipt"]["admission_id"] == completed["admission_id"]


def test_memory_write_requires_and_honors_native_approval(system):
    c = system["client"]
    p = connected_profile(system, "Memory approval verification")
    c.put(f"/profiles/{p['id']}/learning", json={"policy": "review"}).raise_for_status()
    conversation, run = start(system, p, "ARA_APPROVAL_TEST")
    completed = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert completed["state"] == "succeeded", completed
    memory = system["state"] / "runtime/profiles" / p["native_name"] / "memories/MEMORY.md"
    assert not memory.exists() or "ARA approved memory verification marker" not in memory.read_text()
    pending = c.get(f"/profiles/{p['id']}/pending/memory").json()
    assert len(pending) == 1
    proposal = pending[0]
    stale = c.post(f"/profiles/{p['id']}/pending/memory", json={"action": "approve", "id": proposal["id"], "hash": "stale"})
    assert stale.status_code == 409
    approved = c.post(f"/profiles/{p['id']}/pending/memory", json={"action": "approve", "id": proposal["id"], "hash": proposal["hash"]})
    assert approved.status_code == 200, approved.text
    assert approved.json()["state"] == "applied"
    assert "ARA approved memory verification marker" in memory.read_text()
    assert c.get(f"/profiles/{p['id']}/pending/memory").json() == []
