import time

from ara_os import config
from ara_os.app import is_network_exposed


def test_data_survives_agent_disable_and_validates_exact_amounts(system):
    c = system["client"]
    d = c.post("/datasets", json={"name": "Test finances", "module": "finance"}).json()
    payload = {"description": "Salary", "amount": "1000.10", "currency": "INR", "date": "2026-10-16"}
    a = c.post(f"/datasets/{d['id']}/records", json={"payload": payload, "operation_id": "salary-once"})
    assert a.status_code == 201, a.text
    assert c.post(f"/datasets/{d['id']}/records", json={"payload": payload, "operation_id": "salary-once"}).json()["id"] == a.json()["id"]
    assert c.post(f"/datasets/{d['id']}/records", json={"payload": {**payload, "amount": "0.001"}, "operation_id": "bad"}).status_code == 400
    p = c.get("/profiles").json()[1]
    result = c.patch(f"/profiles/{p['id']}", json={"revision": p["revision"], "values": {"enabled": False}})
    assert result.status_code == 200, result.text
    stored = c.get(f"/datasets/{d['id']}").json()
    assert stored["summary"]["totals"]["INR"] == "1000.10"
    assert len(stored["records"]) == 1


def test_conflicts_and_read_only_data_scope(system):
    c = system["client"]
    d = c.post("/datasets", json={"name": "Private notes", "module": "notebook"}).json()
    r = c.post(f"/datasets/{d['id']}/records", json={"payload": {"content": "Private original"}, "operation_id": "note-1"}).json()
    assert c.patch(f"/records/{r['id']}", json={"revision": r["revision"], "values": {"content": "Revised"}}).status_code == 200
    assert c.patch(f"/records/{r['id']}", json={"revision": r["revision"], "values": {"content": "Stale overwrite"}}).status_code == 409
    p = c.get("/profiles").json()[0]
    c.put(f"/profiles/{p['id']}/bindings", json={"bindings": [{"dataset_id": d["id"], "access": "read"}]}).raise_for_status()
    token = (system["state"] / ("data-token-" + p["id"])).read_text().strip()
    headers = {"Authorization": "Bearer " + token}
    result = c.post(f"/mcp/{p['id']}", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ara_add_record", "arguments": {"dataset_id": d["id"], "payload": {"content": "Not allowed"}, "operation_id": "bad-write"}}})
    assert result.json()["result"]["isError"] is True
    assert len(c.get(f"/datasets/{d['id']}").json()["records"]) == 1
    assert c.post(f"/mcp/{p['id']}", json={"method": "initialize", "id": 1}).status_code == 401


def test_native_files_and_path_boundaries(system):
    c = system["client"]
    p = c.get("/profiles").json()[0]
    path = f"/profiles/{p['id']}/asset"
    asset = c.get(path, params={"path": "SOUL.md"}).json()
    saved = c.put(path, json={"path": "SOUL.md", "hash": asset["hash"], "content": asset["content"] + "\nTest edit."})
    assert saved.status_code == 200, saved.text
    assert c.put(path, json={"path": "SOUL.md", "hash": asset["hash"], "content": "Stale"}).status_code == 409
    assert c.get(path, params={"path": "../../runtime-token"}).status_code == 400
    assert c.get(path, params={"path": ".env"}).status_code == 403


def test_real_native_harness_model_and_bound_mcp_tool(system):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Runtime verification", "preset": "ara"}).json()
    assert p["provision_state"] == "ready", p
    d = c.post("/datasets", json={"name": "Native tool integration dataset", "module": "custom"}).json()
    c.put(f"/profiles/{p['id']}/bindings", json={"bindings": [{"dataset_id": d["id"], "access": "read"}]}).raise_for_status()
    connection = c.post(f"/profiles/{p['id']}/model", json={"name": "Explicit test protocol fixture", "base_url": system["provider_url"], "model": "ara-protocol-test", "api_key": "test-only-placeholder", "api_mode": "chat_completions"})
    assert connection.status_code == 200, connection.text
    conversation = c.post("/conversations", json={"profile_id": p["id"], "title": "Real native harness test"}).json()
    run = c.post(f"/conversations/{conversation['id']}/messages", json={"text": "ARA_TOOL_TEST: call the ARA list datasets tool and report the result.", "operation_id": "native-tool-once"}).json()
    assert "id" in run, run
    for _ in range(150):
        result = c.get(f"/runs/{run['id']}").json()
        if result["state"] not in {"accepted", "running", "waiting"}:
            break
        time.sleep(1)
    assert result["state"] == "succeeded", result
    assert "Native tool integration dataset" in result["output"], result
    assert any(e["type"] == "tool.complete" for e in result["events"]), result
    assert c.get(f"/conversations/{conversation['id']}").json()["native_session_id"].startswith("local-")
    repeated = c.post(f"/conversations/{conversation['id']}/messages", json={"text": run["input"], "operation_id": "native-tool-once"})
    assert repeated.json()["id"] == run["id"]


def test_network_health_uses_effective_bind_before_saved_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STATE", tmp_path)
    (tmp_path / "network.json").write_text('{"exposed":true}')
    for address in ("127.0.0.1", "::1", "localhost"):
        monkeypatch.setenv("ARA_HOST", address)
        assert is_network_exposed() is False
    for address in ("0.0.0.0", "::", "192.168.1.10", "ara.example.test"):
        monkeypatch.setenv("ARA_HOST", address)
        assert is_network_exposed() is True
    monkeypatch.delenv("ARA_HOST")
    assert is_network_exposed() is True
    (tmp_path / "network.json").write_text('{"exposed":false}')
    assert is_network_exposed() is False
