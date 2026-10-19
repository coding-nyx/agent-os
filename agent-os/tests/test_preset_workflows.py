"""Exercise every recommended role through real native sessions and scoped MCP.

All accounts, preferences and datasets here belong to the disposable test install.
This verifies wiring, not live provider availability or model reasoning quality.
"""
import pytest

from .test_lifecycle import start, until


@pytest.mark.parametrize("preset,values,module,payload", [
    ("ara", {"preferred_name": "Test operator"}, "custom", {"purpose": "Orchestrator verification"}),
    ("agnes", {"goals": "Fixture-only reflection", "somatic_consent": "off"}, "emotional", {"content": "A private fixture reflection"}),
    ("titan", {"goal": "strength", "experience": "beginner", "days_per_week": 3}, "training", {"title": "Fixture workout", "sets": []}),
    ("ledger", {"currency": "INR", "planning_horizon": "monthly"}, "finance", {"description": "Fixture expense", "amount": "-25.10", "currency": "INR", "date": "2026-10-19"}),
    ("atlas", {"peak_hours": "varies", "focus_style": "flexible"}, "planning", {"title": "Fixture focus task", "status": "planned"}),
    ("scout", {"evidence_quality": "primary sources"}, "research", {"title": "Fixture finding", "url": "https://example.com"}),
])
def test_recommended_preset_native_workflow(system, preset, values, module, payload):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Workflow " + preset, "preset": preset}).json()
    preferences = c.get(f"/profiles/{p['id']}/configuration").json()
    saved = c.put(f"/profiles/{p['id']}/configuration", json={
        "revision": preferences["revision"], "identity_hash": preferences["identity_hash"], "values": values})
    saved.raise_for_status()
    connection = c.post(f"/profiles/{p['id']}/model", json={"name": "Preset workflow wire fixture",
        "base_url": system["provider_url"], "model": "ara-protocol-test",
        "api_key": "test-only-placeholder", "api_mode": "chat_completions"})
    connection.raise_for_status()
    dataset = c.post("/datasets", json={"name": preset + " workflow records", "module": module}).json()
    c.post(f"/datasets/{dataset['id']}/records", json={"payload": payload, "operation_id": "fixture-once"}).raise_for_status()
    c.put(f"/profiles/{p['id']}/bindings", json={"bindings": [{"dataset_id": dataset["id"], "access": "read"}]}).raise_for_status()
    ready = next(x for x in c.get("/profiles").json() if x["id"] == p["id"])
    assert ready["model_ready"] and ready["context_ready"] and ready["chat_ready"]
    _, run = start(system, p, "ARA_TOOL_TEST: inspect only this agent's explicitly granted datasets")
    completed = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert completed["state"] == "succeeded", completed
    assert dataset["name"] in completed["output"]
    assert any(e["type"] == "tool.complete" for e in completed["events"])
    assert len(c.get(f"/datasets/{dataset['id']}").json()["records"]) == 1
