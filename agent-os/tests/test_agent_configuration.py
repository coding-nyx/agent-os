import hashlib
import json
import subprocess

import psycopg

from .conftest import ROOT


def test_main_branch_roster_and_existing_install_migration(system):
    c = system["client"]
    catalog = c.get("/catalog").json()
    assert {p["id"] for p in catalog["presets"]} == {"ara", "agnes", "titan", "ledger", "atlas", "scout"}
    assert "orchestrator" in next(p for p in catalog["presets"] if p["id"] == "ara")["role"]
    before = c.get("/profiles").json()
    kept = {p["id"] for p in before if p["preset"] not in {"agnes", "atlas"}}
    # Recreate an old install in this fixture's disposable database, with two missing presets.
    database = system["env"]["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")
    with psycopg.connect(database) as conn:
        for p in before:
            if p["preset"] in {"agnes", "atlas"}:
                conn.execute("DELETE FROM ara_entities WHERE id=%s", (p["id"],))
        for preset in ("orchestrator", "soma"):
            data = {"preset": preset, "name": "Legacy " + preset, "native_name": "legacy-" + preset,
                    "provision_state": "pending", "soul": "Preserved legacy identity", "description": "Retained profile",
                    "module": None, "enabled": True, "bindings": [], "learning": "off", "owner_machine": "local"}
            conn.execute("INSERT INTO ara_entities(id,kind,workspace_id,data,revision,created_at,updated_at) VALUES(%s,'profile','personal',%s,1,now(),now())",
                         ("legacy-" + preset, json.dumps(data)))
    for _ in range(2):
        seed = subprocess.run([str(ROOT / ".venv/bin/python"), "-c", "import asyncio; from ara_os.profiles import seed; asyncio.run(seed())"],
                              cwd=ROOT, env=system["env"], text=True, capture_output=True, timeout=60)
        assert seed.returncode == 0, seed.stderr
    after = c.get("/profiles").json()
    assert kept <= {p["id"] for p in after}
    assert len([p for p in after if not p["retired_preset"]]) == 6
    assert {p["preset"] for p in after if p["retired_preset"]} == {"orchestrator", "soma"}
    for preset in ("agnes", "atlas"):
        assert len([p for p in after if p["preset"] == preset]) == 1
    assert c.post("/profiles", json={"name": "Not in this release", "preset": "forge"}).status_code == 400


def test_personalization_updates_native_identity_and_preserves_user_edits(system):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Personalized Agnes", "preset": "agnes"}).json()
    home = system["state"] / "runtime/profiles" / p["native_name"]
    identity = home / "SOUL.md"
    identity.write_text(identity.read_text() + "\nUser-authored identity extension.\n")
    credentials = (home / ".env").read_bytes()
    config = c.get(f"/profiles/{p['id']}/configuration").json()
    saved = c.put(f"/profiles/{p['id']}/configuration", json={
        "values": {"goals": "Make space for reflection", "engagement_mode": "casual", "somatic_consent": "off"},
        "revision": config["revision"], "identity_hash": config["identity_hash"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["context_ready"] is True
    content = identity.read_text()
    assert "Make space for reflection" in content
    assert "User-authored identity extension." in content
    assert content.count("<!-- ara:agent-configuration:start -->") == 1
    assert (home / ".env").read_bytes() == credentials
    assert c.get(f"/profiles/{p['id']}").json()["context_ready"] is True
    stale = c.put(f"/profiles/{p['id']}/configuration", json={
        "values": {"goals": "Stale write"}, "revision": config["revision"], "identity_hash": hashlib.sha256(content.encode()).hexdigest()})
    assert stale.status_code == 409
    assert identity.read_text() == content
    clone = c.post(f"/profiles/{p['id']}/instances", json={"name": "Agnes preferences clone"})
    assert clone.status_code == 201, clone.text
    copied = c.get(f"/profiles/{clone.json()['id']}/configuration").json()
    assert copied["values"]["goals"] == "Make space for reflection"
    assert copied["values"]["engagement_mode"] == "casual"
    assert identity.read_text() == content


def test_configuration_validation_and_external_identity_conflicts(system):
    c = system["client"]
    p = c.post("/profiles", json={"name": "Validation Titan", "preset": "titan"}).json()
    path = f"/profiles/{p['id']}/configuration"
    data = c.get(path).json()
    body = {"revision": data["revision"], "identity_hash": data["identity_hash"]}
    for values in ({"goal": "invented"}, {"unknown": "value"}, {"goal": "strength", "experience": "beginner", "days_per_week": 9}):
        response = c.put(path, json={**body, "values": values})
        assert response.status_code == 400, response.text
    identity = system["state"] / "runtime/profiles" / p["native_name"] / "SOUL.md"
    identity.write_text(identity.read_text() + "\nNew external edit.")
    conflict = c.put(path, json={**body, "values": {"goal": "strength", "experience": "beginner", "days_per_week": 3}})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "asset_conflict"
    assert identity.read_text().endswith("New external edit.")


def test_reflections_and_planning_have_validated_independent_data(system):
    c = system["client"]
    reflection = c.post("/datasets", json={"name": "Reflection test", "module": "emotional"}).json()
    assert c.post(f"/datasets/{reflection['id']}/records", json={"payload": {"content": ""}, "operation_id": "blank"}).status_code == 400
    assert c.post(f"/datasets/{reflection['id']}/records", json={"payload": {"content": "A private reflection", "mood": "calm"}, "operation_id": "reflection"}).status_code == 201
    plans = c.post("/datasets", json={"name": "Plans test", "module": "planning"}).json()
    payload = {"title": "One manageable task", "status": "planned", "priority": "normal"}
    assert c.post(f"/datasets/{plans['id']}/records", json={"payload": {**payload, "status": "fictional"}, "operation_id": "bad"}).status_code == 400
    assert c.post(f"/datasets/{plans['id']}/records", json={"payload": payload, "operation_id": "task"}).status_code == 201
