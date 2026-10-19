"""Durability and actual native execution; no paid accounts or physical input."""
import asyncio
import json
import os
import subprocess
import time
from pathlib import Path

import pytest
import yaml

from ara_os.task_journal import Journal, fingerprint
from .conftest import ROOT


def test_journal_atomic_claim_conflicts_and_acknowledgements(tmp_path):
    j = Journal(tmp_path)
    req = {"operation_id": "once", "task": "one"}
    ident = fingerprint(req)
    assert j.admit(ident, req)["state"] == "queued"
    assert j.claim(ident)
    assert not j.claim(ident)
    with pytest.raises(ValueError, match="idempotency_conflict"):
        j.admit(ident, {**req, "task": "other"})
    assert j.append(ident, "swarm.started", {}) == 1
    assert j.append(ident, "swarm.finished", {"state": "failed"}, "failed") == 2
    j.acknowledge(ident, 2)
    assert j.read(ident)["ack"] == 2
    with pytest.raises(ValueError):
        j.acknowledge(ident, 3)
    assert not j.claim(ident)


def native_profile(state, provider_url, name="coding-agent"):
    home = state / "runtime/profiles" / name
    home.mkdir(parents=True)
    cfg = {"model": {"provider": "custom", "default": "ara-protocol-test", "base_url": provider_url,
                     "api_mode": "chat_completions"}, "terminal": {"backend": "local"},
           "ara": {"swarm": {"enabled": True, "toolsets": []}}}
    (home / "config.yaml").write_text(yaml.safe_dump(cfg))
    return home


def command(env, *args):
    return subprocess.run([str(ROOT / ".venv/bin/ara"), *args], cwd=ROOT, env=env,
                          text=True, capture_output=True, timeout=100)


def wait_local(state, ident):
    j = Journal(state / "execution")
    for _ in range(200):
        row = j.reconcile(ident)
        if row["state"] not in {"queued", "running"}:
            return row
        time.sleep(.2)
    raise AssertionError(j.read(ident))


def test_standalone_native_swarm_without_application_database(system, tmp_path):
    state = tmp_path / "standalone"
    home = native_profile(state, system["provider_url"])
    env = {**system["env"], "ARA_STATE_DIR": str(state), "ARA_DATABASE_URL": "postgresql+psycopg://invalid@127.0.0.1:9/missing"}
    roles = tmp_path / "roles.json"
    roles.write_text(json.dumps([{"role": "Coder A", "objective": "Analyze one contract"},
                                 {"role": "Coder B", "objective": "Analyze another contract"}]))
    result = command(env, "swarm", "run", "--profile", home.name, "--preset", "custom", "--task", "Local-only native work",
                     "--operation-id", "offline-once", "--roles", str(roles), "--wait")
    assert result.returncode == 0, result.stdout + result.stderr
    ident = json.loads(result.stdout.splitlines()[0])["task_id"]
    row = Journal(state / "execution").read(ident)
    assert row["state"] == "succeeded", row
    finished = [e for e in row["events"] if e["type"] == "swarm.worker_finished"]
    assert len(finished) == 3  # two native children and actual model synthesis
    assert len([e for e in row["events"] if e["type"] == "swarm.worker_bound"]) == 3
    assert all("ARA native runtime protocol verified" in e["data"]["summary"] for e in finished)
    assert (home / "state.db").exists()
    repeat = command(env, "swarm", "run", "--profile", home.name, "--preset", "custom", "--task", "Local-only native work",
                     "--operation-id", "offline-once", "--roles", str(roles), "--wait")
    assert repeat.returncode == 0, repeat.stderr
    assert len(Journal(state / "execution").read(ident)["events"]) == len(row["events"])


def test_missing_model_fails_without_fabricated_findings(system):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Unconnected custom coder", "preset": "custom"}).json()
    c.put(f"/profiles/{p['id']}/swarms", json={"enabled": True, "toolsets": []}).raise_for_status()
    run = c.post(f"/profiles/{p['id']}/swarms/spawn", json={"preset": "custom", "task": "Check a claim", "operation_id": "no-model"}).json()
    for _ in range(120):
        final = c.get(f"/swarms/{run['id']}").json()
        if final["state"] not in {"queued", "running"}:
            break
        time.sleep(.2)
    assert final["state"] == "failed", final
    assert final["synthesized_output"] is None
    assert not any(w.get("output") for w in final["workers"])
    conflict = c.post(f"/profiles/{p['id']}/swarms/spawn", json={"preset": "custom", "task": "Different claim", "operation_id": "no-model"})
    assert conflict.status_code == 409


def test_real_node_execution_event_sync_and_idempotent_replay(system, tmp_path):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Node coding agent", "preset": "custom"}).json()
    c.put(f"/profiles/{p['id']}/swarms", json={"enabled": True, "toolsets": []}).raise_for_status()
    enrollment = c.post("/machines", json={"name": "Execution test node"}).json()["enrollment"]
    node_state = tmp_path / "node"
    home = native_profile(node_state, system["provider_url"])
    env = {**system["env"], "ARA_STATE_DIR": str(node_state), "ARA_DATABASE_URL": "postgresql+psycopg://invalid@127.0.0.1:9/missing"}
    (node_state / "node-connection.json").write_text(json.dumps(enrollment))
    c.put(f"/profiles/{p['id']}/placement", json={"machine_id": enrollment["machine_id"], "native_name": home.name}).raise_for_status()
    submitted = c.post(f"/profiles/{p['id']}/swarms/spawn", json={"preset": "custom", "task": "Execute on assigned node", "operation_id": "remote-once"})
    submitted.raise_for_status()
    task = submitted.json()
    assert task["owner_machine"] == enrollment["machine_id"]
    assert c.post("/nodes/tasks/poll", json={"machine_id": enrollment["machine_id"]}).status_code == 401
    pulled = command(env, "node", "work", "--once")
    assert pulled.returncode == 0, pulled.stderr + pulled.stdout
    # No more host polling while execution finishes. The native provider fixture
    # remains available; this is host independence, not offline cloud inference.
    local = wait_local(node_state, task["id"])
    assert local["state"] == "succeeded", local
    uploaded = command(env, "node", "work", "--once")
    assert uploaded.returncode == 0, uploaded.stderr
    final = c.get(f"/swarms/{task['id']}").json()
    assert final["state"] == "succeeded", final
    assert final.get("native_snapshot_id"), final
    replica = next(r for r in c.get("/replicas").json() if r.get("task_id") == task["id"])
    assert replica["id"] == final["native_snapshot_id"]
    cursor = final["event_cursor"]
    replay = command(env, "node", "work", "--once")
    assert replay.returncode == 0, replay.stderr
    assert c.get(f"/swarms/{task['id']}").json()["event_cursor"] == cursor
    assert Journal(node_state / "execution").read(task["id"])["ack"] == cursor
    changed = json.loads(json.dumps(local["events"]))
    changed[-1]["data"]["state"] = "failed"
    response = c.post("/nodes/tasks/events", headers={"X-ARA-Node-Key": enrollment["token"]}, json={
        "machine_id": enrollment["machine_id"], "profile_id": p["id"], "task_id": task["id"],
        "request": local["request"], "events": changed})
    assert response.status_code == 409


def test_native_worktree_stage_handoff_preserves_original(system, tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    def git(*args):
        value = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, check=True)
        return value.stdout
    git("init")
    (repo / "base.txt").write_text("original\n")
    git("add", "base.txt")
    git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "baseline")
    state = tmp_path / "node"
    home = native_profile(state, system["provider_url"])
    env = {**system["env"], "HERMES_HOME": str(home), "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools"),
           "PYTHONPATH": str(ROOT / ".runtime/ara-agent"), "HERMES_DISABLE_LAZY_INSTALLS": "1"}
    def native(action, target, **extra):
        target.parent.mkdir(parents=True, exist_ok=True)
        done = subprocess.run([str(ROOT / ".runtime/env/bin/python"), str(ROOT / "src/ara_os/native_worker.py")],
            input=json.dumps({"operation": "swarm-workspace", "action": action, "source": str(repo), "target": str(target), **extra}) + "\n",
            cwd=ROOT / ".runtime/ara-agent", env=env, text=True, capture_output=True, timeout=30)
        frames = [json.loads(line) for line in done.stdout.splitlines() if line.startswith('{"ara_frame"')]
        assert done.returncode == 0, frames
        return frames[-1]["data"]
    first = tmp_path / "stage1/workspace"
    native("prepare", first)
    (first / "base.txt").write_text("implemented\n")
    (first / "new.txt").write_text("new evidence\n")
    artifacts = native("collect", first)
    second = tmp_path / "stage2/workspace"
    native("prepare", second, prior_artifacts=[artifacts])
    assert (second / "base.txt").read_text() == "implemented\n"
    assert (second / "new.txt").read_text() == "new evidence\n"
    assert (repo / "base.txt").read_text() == "original\n"
    assert not (repo / "new.txt").exists()
    assert git("status", "--porcelain") == ""


def test_custom_coding_agent_uses_real_tools_and_inherited_worktrees(system, tmp_path):
    from .test_swarms import connect_fixture
    c = system["client"]
    repo = tmp_path / "coding-repo"
    repo.mkdir()
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    (repo / "baseline.txt").write_text("User baseline\n")
    subprocess.run(["git", "add", "baseline.txt"], cwd=repo, check=True)
    subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "Baseline"], cwd=repo, check=True, capture_output=True)
    p = c.post("/profiles", json={"name": "Custom native coding agent", "preset": "custom"}).json()
    connect_fixture(c, system, p)
    c.put(f"/profiles/{p['id']}/swarms", json={"enabled": True, "toolsets": ["file", "terminal"], "workspace": str(repo)}).raise_for_status()
    response = c.post(f"/profiles/{p['id']}/swarms/spawn", json={"preset": "coding", "task": "ARA_SWARM_WRITE_TEST: implement and check a file", "operation_id": "coding-once"})
    response.raise_for_status()
    ident = response.json()["id"]
    for _ in range(300):
        final = c.get(f"/swarms/{ident}").json()
        if final["state"] not in {"queued", "running"}:
            break
        time.sleep(.2)
    assert final["state"] == "succeeded", final
    engineer = next(w for w in final["workers"] if w["id"] == "code_engineer")
    reviewer = next(w for w in final["workers"] if w["id"] == "test_reviewer")
    assert any(f["path"] == "swarm-proof.txt" for f in engineer["artifacts"]["untracked_files"]), engineer
    assert "ARA_SWARM_FILE_CHECK_PASSED" in reviewer["output"], reviewer
    assert engineer["artifacts"]["path"] != reviewer["artifacts"]["path"]
    assert not (repo / "swarm-proof.txt").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_roles,expected", [({"one", "two"}, "failed"), ({"two"}, "partial"), (set(), "succeeded")])
async def test_worker_failures_are_not_upgraded_and_grants_intersect(tmp_path, monkeypatch, failed_roles, expected):
    from ara_os import config, swarm_runner, runtime_adapter
    state = tmp_path / "unit"
    home = native_profile(state, "http://127.0.0.1:9/v1")
    monkeypatch.setattr(config, "STATE", state)
    monkeypatch.setattr(config, "RUNTIME_HOME", state / "runtime")
    request = swarm_runner.request_for(home.name, "custom", "Unit failure test", "unit-once", [
        {"role": "one", "objective": "First scoped task"}, {"role": "two", "objective": "Second scoped task"}])
    request["policy"]["max_iterations"] = 1
    # Local policy broadens after admission. It must not broaden the admitted task.
    cfg = yaml.safe_load((home / "config.yaml").read_text())
    cfg["ara"]["swarm"]["toolsets"] = ["file", "terminal", "web"]
    (home / "config.yaml").write_text(yaml.safe_dump(cfg))
    calls = []
    async def fake_worker(profile, body):
        calls.append(body)
        assert body["toolsets"] == []
        assert body["max_iterations"] == 1
        failed = any(body["goal"].startswith("Role: " + role + "\n") for role in failed_roles)
        return {"status": "failed" if failed else "completed", "summary": None if failed else "Explicit unit fixture output", "error": "fixture rejection" if failed else None}
    monkeypatch.setattr(runtime_adapter, "worker", fake_worker)
    task = swarm_runner.admit(request)
    await swarm_runner.execute(task["id"])
    final = swarm_runner.journal().read(task["id"])
    assert final["state"] == expected
    assert len(calls) == (2 if expected == "failed" else 3)
    if expected == "failed":
        assert final["events"][-1]["data"]["synthesized_output"] is None


def test_dead_owner_becomes_unknown_not_a_retry(tmp_path):
    j = Journal(tmp_path)
    ident = fingerprint({"test": "dead"})
    j.admit(ident, {"test": "dead"})
    j.claim(ident)
    with j.db() as db:
        db.execute("UPDATE tasks SET pid=? WHERE id=?", (2147483646, ident))
    assert j.reconcile(ident)["state"] == "unknown"
    assert not j.claim(ident)


def test_remote_machine_links_require_transport_security():
    from ara_os.node_execution import validate_connection
    validate_connection({"host": "http://127.0.0.1:8787"})
    validate_connection({"host": "https://ara.example.test"})
    with pytest.raises(ValueError, match="HTTPS"):
        validate_connection({"host": "http://192.0.2.4:8787"})


def test_node_bootstrap_needs_no_application_database(system, tmp_path):
    state = tmp_path / "bootstrap"
    env = {**system["env"], "ARA_STATE_DIR": str(state), "ARA_DATABASE_URL": "postgresql+psycopg://invalid@127.0.0.1:9/missing"}
    initialized = command(env, "node", "init", "--profile", "standalone-coder")
    assert initialized.returncode == 0, initialized.stdout + initialized.stderr
    assert json.loads(initialized.stdout)["database_required"] is False
    home = state / "runtime/profiles/standalone-coder"
    cfg = yaml.safe_load((home / "config.yaml").read_text())
    assert cfg["ara"]["swarm"]["enabled"] is False
    assert not cfg.get("mcp_servers", {}).get("ara-data")
    assert not (state / "computer-policy.json").exists()
    before = (home / "config.yaml").read_bytes()
    repeated = command(env, "node", "init", "--profile", "standalone-coder")
    assert repeated.returncode == 0, repeated.stderr
    assert (home / "config.yaml").read_bytes() == before
