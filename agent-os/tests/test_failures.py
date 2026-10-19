import os
import subprocess
import time

import httpx

from .conftest import ROOT, free_port


def test_missing_database_keeps_ui_and_diagnostics_available(tmp_path):
    port, absent_database_port = free_port(), free_port()
    env = {**os.environ, "ARA_STATE_DIR": str(tmp_path / "offline-state"), "ARA_DATABASE_URL": f"postgresql+psycopg://ara_os:unused@127.0.0.1:{absent_database_port}/missing"}
    with (tmp_path / "offline.log").open("w") as log:
        process = subprocess.Popen([str(ROOT / ".venv/bin/ara"), "serve", "--port", str(port)], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as c:
                for _ in range(50):
                    try:
                        response = c.get("/api/v1/health")
                        break
                    except httpx.HTTPError:
                        time.sleep(.1)
                else:
                    raise AssertionError("Diagnostics unavailable while storage is down")
                assert response.status_code == 503
                assert response.json()["database"] == "unavailable"
                assert c.get("/").status_code == 200
                failed = c.get("/api/v1/datasets")
                assert failed.status_code == 503
                assert failed.json()["error"]["code"] == "storage_unavailable"
        finally:
            process.terminate(); process.wait(timeout=15)


def test_domain_invalid_inputs_and_atomic_import(system):
    c = system["client"]
    d = c.post("/datasets", json={"name": "Failure checks", "module": "training"}).json()
    malformed = c.post(f"/datasets/{d['id']}/records", json={"operation_id": "malformed", "payload": {"title": "Invalid", "sets": None}})
    assert malformed.status_code == 400, malformed.text
    rejected = c.post(f"/datasets/{d['id']}/import", json={"records": [{"title": "Valid", "sets": []}, {"sets": []}]})
    assert rejected.status_code == 400
    assert not c.get(f"/datasets/{d['id']}").json()["records"]
    assert c.post(f"/datasets/{d['id']}/import", json={"records": [None]}).status_code == 400
    assert c.post("/datasets", headers={"Origin": "https://unrelated.example"}, json={"name": "Origin violation", "module": "finance"}).status_code == 403
    assert c.post("/machines", json={"name": "Invalid host", "endpoint": "https://ara.example/api/v1"}).status_code == 400


def test_event_reconnect_resumes_after_last_acknowledged_event(system):
    import json
    import psycopg
    c = system["client"]
    c.post("/datasets", json={"name": "Before reconnect", "module": "custom"}).raise_for_status()
    with psycopg.connect(system["env"]["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")) as connection:
        cursor = connection.execute("SELECT MAX(sequence) FROM ara_events").fetchone()[0]
    following = c.post("/datasets", json={"name": "After reconnect", "module": "custom"}).json()
    with c.stream("GET", "/events", headers={"Last-Event-ID": str(cursor)}) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line.startswith("data: "):
                item = json.loads(line[6:])
                assert item["sequence"] > cursor
                assert item["entity_id"] == following["id"]
                break
    assert c.get("/events", headers={"Last-Event-ID": "invalid"}).status_code == 400


def test_unconfigured_model_refuses_message_submission_cleanly(system):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Unconfigured model agent", "preset": "ara"}).json()
    assert p["provision_state"] == "ready"
    assert not p.get("model_connection")
    conversation = c.post("/conversations", json={"profile_id": p["id"], "title": "Unconfigured model test"}).json()
    response = c.post(f"/conversations/{conversation['id']}/messages", json={"text": "hello", "operation_id": "unconfigured-1"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "model_not_configured"

