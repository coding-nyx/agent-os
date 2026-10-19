import base64
import hashlib
import io
import json
import subprocess
import tarfile
import time

import httpx
import psycopg
from psycopg import sql
from .conftest import free_port
import uuid

from .conftest import ROOT


def cli(system, *args, env=None):
    return subprocess.run([str(ROOT / ".venv/bin/ara"), *args], env=env or system["env"], cwd=ROOT, capture_output=True, text=True, timeout=150)


def native_archive(path):
    with tarfile.open(path, "w:gz") as archive:
        for name, text in {"source/config.yaml": "model:\n  provider: openrouter\n  default: test-model\nplatforms:\n  telegram:\n    enabled: true\n", "source/SOUL.md": "Imported native identity", "source/memories/MEMORY.md": "A curated memory", "source/.env": "TELEGRAM_BOT_TOKEN=not-a-real-token\nOPENAI_API_KEY=not-a-real-key\n", "source/cron/jobs.json": "[]", "source/skills/example/SKILL.md": "---\nname: example\ndescription: An imported skill\n---\n# Example\n"}.items():
            entry = tarfile.TarInfo(name); blob = text.encode(); entry.size = len(blob)
            archive.addfile(entry, io.BytesIO(blob))


def test_native_import_preview_apply_and_credentials_exclusion(system, tmp_path):
    source = tmp_path / "native.tar.gz"; native_archive(source)
    preview = cli(system, "import", "native", str(source), "--name", "imported-native")
    assert preview.returncode == 0, preview.stderr + preview.stdout
    target = system["state"] / "runtime/profiles/imported-native"
    assert not target.exists()
    result = cli(system, "import", "native", str(source), "--name", "imported-native", "--apply")
    assert result.returncode == 0, result.stderr + result.stdout
    assert (target / "SOUL.md").read_text() == "Imported native identity"
    assert not (target / ".env").exists()
    assert not (target / "cron/jobs.json").exists()
    assert (target / "imported-cron-disabled/jobs.json").exists()
    rows = system["client"].get("/profiles").json()
    assert next(p for p in rows if p["native_name"] == "imported-native")["enabled"] is False


def test_unsafe_import_preserves_source_and_does_not_publish(system, tmp_path):
    source = tmp_path / "unsafe.tar.gz"
    with tarfile.open(source, "w:gz") as archive:
        entry = tarfile.TarInfo("../escape"); entry.size = 3
        archive.addfile(entry, io.BytesIO(b"bad"))
    result = cli(system, "import", "native", str(source), "--name", "unsafe-import", "--apply")
    assert result.returncode == 1
    assert "unsafe_archive" in result.stderr
    assert source.exists()
    assert not (system["state"] / "runtime/profiles/unsafe-import").exists()


def test_openclaw_import_uses_native_mappings_and_does_not_activate_channels(system, tmp_path):
    source = tmp_path / "openclaw"; workspace = source / "workspace"; workspace.mkdir(parents=True)
    (workspace / "SOUL.md").write_text("OpenClaw imported identity")
    (workspace / "MEMORY.md").write_text("Remember the user's reading preference")
    (source / "openclaw.json").write_text(json.dumps({"agents": {"defaults": {"workspace": str(workspace)}}, "channels": {"telegram": {"botToken": "not-a-real-token"}}}))
    preview = cli(system, "import", "openclaw", str(source), "--name", "imported-openclaw")
    assert preview.returncode == 0, preview.stderr + preview.stdout
    target = system["state"] / "runtime/profiles/imported-openclaw"
    assert not target.exists()
    applied = cli(system, "import", "openclaw", str(source), "--name", "imported-openclaw", "--apply")
    assert applied.returncode == 0, applied.stderr + applied.stdout
    assert "Ara imported identity" in (target / "SOUL.md").read_text()
    assert not (target / ".env").exists() or "not-a-real-token" not in (target / ".env").read_text()
    assert (workspace / "SOUL.md").exists()


def test_passive_node_sync_checks_auth_and_checksum(system, tmp_path):
    c = system["client"]
    enrollment = c.post("/machines", json={"name": "Test node"}).json()["enrollment"]
    enrollment_path = tmp_path / "enrollment.json"; enrollment_path.write_text(json.dumps(enrollment))
    paired = cli(system, "node", "pair", "--enrollment", str(enrollment_path))
    assert paired.returncode == 0, paired.stdout + paired.stderr
    profile = c.get("/profiles").json()[0]
    sync = cli(system, "node", "sync", "--profile", profile["native_name"])
    assert sync.returncode == 0, sync.stdout + sync.stderr
    receipt = json.loads(sync.stdout.strip().splitlines()[-1])
    assert receipt["acknowledged"] is True
    assert receipt["automatic_activation"] is False
    rows = c.get("/replicas").json()
    row = next(r for r in rows if r["id"] == receipt["snapshot_id"])
    archive = c.get(f"/replicas/{row['id']}/download")
    assert hashlib.sha256(archive.content).hexdigest() == row["sha256"]
    assert c.post("/nodes/check", json={"machine_id": enrollment["machine_id"]}).status_code == 401
    bad = c.post("/nodes/sync", headers={"X-ARA-Node-Key": enrollment["token"]}, json={"machine_id": enrollment["machine_id"], "profile_name": "test", "sha256": "wrong", "archive": base64.b64encode(b"bad").decode()})
    assert bad.status_code == 409


def test_multi_machine_profile_deployment_and_sync(system, tmp_path):
    c = system["client"]
    # 1. Enroll Node 1 ("Mac Studio") and Node 2 ("Linux Worker")
    m1_resp = c.post("/machines", json={"name": "Node 1 - Mac Studio"}).json()
    m2_resp = c.post("/machines", json={"name": "Node 2 - Linux Worker"}).json()
    m1_enroll = m1_resp["enrollment"]
    m2_enroll = m2_resp["enrollment"]

    # 2. Setup isolated state directories for each machine
    node1_state = tmp_path / "node1"; node1_state.mkdir()
    node2_state = tmp_path / "node2"; node2_state.mkdir()

    env1 = {**system["env"], "ARA_STATE_DIR": str(node1_state)}
    env2 = {**system["env"], "ARA_STATE_DIR": str(node2_state)}

    m1_file = node1_state / "enrollment.json"; m1_file.write_text(json.dumps(m1_enroll))
    m2_file = node2_state / "enrollment.json"; m2_file.write_text(json.dumps(m2_enroll))

    # 3. Pair both nodes
    pair1 = cli(system, "node", "pair", "--enrollment", str(m1_file), env=env1)
    assert pair1.returncode == 0, pair1.stdout + pair1.stderr
    pair2 = cli(system, "node", "pair", "--enrollment", str(m2_file), env=env2)
    assert pair2.returncode == 0, pair2.stdout + pair2.stderr

    machines = c.get("/machines").json()
    assert next(m for m in machines if m["id"] == m1_enroll["machine_id"])["state"] == "paired"
    assert next(m for m in machines if m["id"] == m2_enroll["machine_id"])["state"] == "paired"

    # 4. Create and import custom profile on Node 1
    initial_archive = tmp_path / "node1_profile.tar.gz"
    native_archive(initial_archive)
    import1 = cli(system, "import", "native", str(initial_archive), "--name", "edge-alpha", "--apply", env=env1)
    assert import1.returncode == 0, import1.stdout + import1.stderr
    assert (node1_state / "runtime/profiles/edge-alpha/SOUL.md").read_text() == "Imported native identity"

    # 5. Node 1 syncs profile to Host
    sync1 = cli(system, "node", "sync", "--profile", "edge-alpha", env=env1)
    assert sync1.returncode == 0, sync1.stdout + sync1.stderr
    receipt1 = json.loads(sync1.stdout.strip().splitlines()[-1])
    assert receipt1["acknowledged"] is True
    snap1_id = receipt1["snapshot_id"]

    # Host replica verification
    replicas = c.get("/replicas").json()
    rep1 = next(r for r in replicas if r["id"] == snap1_id)
    assert rep1["machine_id"] == m1_enroll["machine_id"]
    assert rep1["profile_name"] == "edge-alpha"

    # 6. Deploy snapshot from Node 1 onto Node 2
    archive_bytes = c.get(f"/replicas/{snap1_id}/download").content
    node2_pkg = node2_state / "deployed_edge.tar.gz"
    node2_pkg.write_bytes(archive_bytes)

    deploy2 = cli(system, "import", "native", str(node2_pkg), "--name", "edge-beta", "--apply", env=env2)
    assert deploy2.returncode == 0, deploy2.stdout + deploy2.stderr

    node2_profile = node2_state / "runtime/profiles/edge-beta"
    assert (node2_profile / "SOUL.md").read_text() == "Imported native identity"
    assert (node2_profile / "memories/MEMORY.md").read_text() == "A curated memory"
    assert not (node2_profile / ".env").exists()  # Credential safety preserved across machines

    # 7. Incremental sync on Node 1: update definition and re-sync
    (node1_state / "runtime/profiles/edge-alpha/SOUL.md").write_text("Updated identity on Node 1 with multi-machine consensus")
    sync2 = cli(system, "node", "sync", "--profile", "edge-alpha", env=env1)
    assert sync2.returncode == 0, sync2.stdout + sync2.stderr
    receipt2 = json.loads(sync2.stdout.strip().splitlines()[-1])
    assert receipt2["acknowledged"] is True
    snap2_id = receipt2["snapshot_id"]
    assert snap2_id != snap1_id

    # 8. Node 2 syncs its deployed profile back to host
    sync_node2 = cli(system, "node", "sync", "--profile", "edge-beta", env=env2)
    assert sync_node2.returncode == 0, sync_node2.stdout + sync_node2.stderr
    receipt_node2 = json.loads(sync_node2.stdout.strip().splitlines()[-1])
    assert receipt_node2["acknowledged"] is True
    snap_node2_id = receipt_node2["snapshot_id"]
    assert snap_node2_id not in {snap1_id, snap2_id}

    # Verify host records all replicas partitioned by machine_id
    all_reps = c.get("/replicas").json()
    node1_reps = [r for r in all_reps if r["machine_id"] == m1_enroll["machine_id"]]
    node2_reps = [r for r in all_reps if r["machine_id"] == m2_enroll["machine_id"]]
    assert len(node1_reps) >= 2
    assert len(node2_reps) >= 1


def test_encrypted_backup_and_isolated_restore(system, tmp_path):
    c = system["client"]
    response = c.post("/backups", json={})
    assert response.status_code == 201, response.text
    backup = response.json()
    path = tmp_path / "snapshot.ara"; path.write_bytes(c.get(f"/backups/{backup['id']}/download").content)
    assert path.read_bytes()[:2] != b"PK"
    destination = tmp_path / "restored-state"
    key = system["state"] / "recovery.key"
    restored = cli(system, "restore", str(path), "--key", str(key), "--target", str(destination))
    assert restored.returncode == 0, restored.stdout + restored.stderr
    assert (destination / "application-import.json").is_file()
    assert (destination / "runtime/profiles").is_dir()
    assert not list((destination / "runtime/profiles").glob("*/.env"))
    assert cli(system, "restore", str(path), "--key", str(key), "--target", str(destination)).returncode == 1


def test_restore_starts_with_data_history_and_received_node_backups(system, tmp_path):
    c = system["client"]
    backup = c.post("/backups", json={}); backup.raise_for_status()
    path = tmp_path / "restore-start.ara"
    path.write_bytes(c.get(f"/backups/{backup.json()['id']}/download").content)
    target = tmp_path / "restored"
    result = cli(system, "restore", str(path), "--key", str(system["state"] / "recovery.key"), "--target", str(target))
    assert result.returncode == 0, result.stderr
    db, port = "ara_restore_" + uuid.uuid4().hex[:10], free_port()
    admin = "postgresql://ara_os:ara_os_local@127.0.0.1:55432/postgres"
    with psycopg.connect(admin, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db)))
    env = {**system["env"], "ARA_STATE_DIR": str(target), "ARA_API_URL": f"http://127.0.0.1:{port}", "ARA_DATABASE_URL": f"postgresql+psycopg://ara_os:ara_os_local@127.0.0.1:55432/{db}"}
    with (target / "restore-api.log").open("w") as log:
        process = subprocess.Popen([str(ROOT / ".venv/bin/ara"), "serve", "--port", str(port)], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}/api/v1", timeout=30) as restored:
                for _ in range(180):
                    try:
                        if restored.get("/health").status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(.2)
                else:
                    raise AssertionError((target / "restore-api.log").read_text()[-3000:])
                profiles = restored.get("/profiles").json()
                assert profiles and all(not p["enabled"] for p in profiles)
                assert len(restored.get("/datasets").json()) == len(c.get("/datasets").json())
                assert all((target / ("data-token-" + p["id"])).exists() for p in profiles)
                replicas = restored.get("/replicas").json()
                assert replicas
                for replica in replicas:
                    blob = restored.get(f"/replicas/{replica['id']}/download")
                    assert blob.status_code == 200
                    assert hashlib.sha256(blob.content).hexdigest() == replica["sha256"]
        finally:
            process.terminate(); process.wait(timeout=15)
            with psycopg.connect(admin, autocommit=True) as connection:
                connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(db)))
