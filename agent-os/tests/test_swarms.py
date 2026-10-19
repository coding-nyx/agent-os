"""Verification of profile-level swarm coordination, worker execution in tandem, and MCP tools."""
from __future__ import annotations

import json
import time
import pytest

from ara_os.swarms import SWARM_PRESET_MAP, SWARM_PRESETS


def test_swarm_presets_catalog(system):
    c = system["client"]
    res = c.get("/swarms/presets")
    assert res.status_code == 200
    presets = res.json()
    assert {p["id"] for p in presets} >= {"research", "coding", "analysis", "custom"}
    for p in presets:
        assert len(p["workers"]) >= 2
        for w in p["workers"]:
            assert "role" in w and "objective" in w


def test_profile_swarm_toggle_and_identity_updates(system):
    c = system["client"]
    p = next(x for x in c.get("/profiles").json() if x["preset"] == "ara")

    # Initial state should have swarms disabled by default
    res = c.get(f"/profiles/{p['id']}/swarms")
    assert res.status_code == 200
    data = res.json()
    assert data["config"]["enabled"] is False

    # Check that SOUL.md initially does not have swarm instructions
    home = system["state"] / "runtime/profiles" / p["native_name"]
    soul_initial = (home / "SOUL.md").read_text()
    assert "<!-- ara:agent-swarms:start -->" not in soul_initial

    try:
        # Enable swarms with intelligent triggering
        update = c.put(f"/profiles/{p['id']}/swarms", json={
            "enabled": True,
            "trigger_mode": "intelligent",
            "allowed_presets": ["research", "coding"]
        })
        assert update.status_code == 200
        assert update.json()["enabled"] is True
        assert update.json()["trigger_mode"] == "intelligent"
        assert update.json()["allowed_presets"] == ["research", "coding"]

        # SOUL.md should now contain swarm instructions
        soul_enabled = (home / "SOUL.md").read_text()
        assert "<!-- ara:agent-swarms:start -->" in soul_enabled
        assert "Coordinated Swarm Capabilities" in soul_enabled
        assert "research" in soul_enabled
        assert "coding" in soul_enabled
        assert "INTELLIGENT SWARM TRIGGERING" in soul_enabled

        # Switch to explicit-only triggering
        c.put(f"/profiles/{p['id']}/swarms", json={
            "enabled": True,
            "trigger_mode": "explicit",
            "allowed_presets": ["research", "coding", "analysis"]
        })
        soul_explicit = (home / "SOUL.md").read_text()
        assert "EXPLICIT SWARM TRIGGERING" in soul_explicit
    finally:
        # Disable swarms and restore state
        c.put(f"/profiles/{p['id']}/swarms", json={"enabled": False})
        soul_disabled = (home / "SOUL.md").read_text()
        assert "<!-- ara:agent-swarms:start -->" not in soul_disabled


def call_mcp(c, system, profile_id, name, args):
    token = (system["state"] / ("data-token-" + profile_id)).read_text().strip()
    headers = {"Authorization": "Bearer " + token}
    res = c.post(f"/mcp/{profile_id}", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}})
    assert res.status_code == 200, res.text
    result = res.json()["result"]
    if result.get("isError"):
        return {"error": result["content"][0]["text"]}
    return json.loads(result["content"][0]["text"])


def connect_fixture(c, system, profile):
    response = c.post(f"/profiles/{profile['id']}/model", json={"name": "Swarm wire fixture", "base_url": system["provider_url"],
        "model": "ara-shared-setup-test", "api_key": "shared-setup-test-secret", "api_mode": "chat_completions"})
    response.raise_for_status()


def test_swarm_mcp_tools_and_execution_in_tandem(system):
    c = system["client"]
    p = next(x for x in c.get("/profiles").json() if x["preset"] == "scout")
    connect_fixture(c, system, p)

    # Calling ara_spawn_swarm while disabled should return error
    refused = call_mcp(c, system, p["id"], "ara_spawn_swarm", {"preset": "research", "task": "Investigate distributed consensus", "operation_id": "sw-1"})
    assert "error" in refused
    assert "Swarms are disabled" in refused["error"]

    try:
        # Enable swarms
        c.put(f"/profiles/{p['id']}/swarms", json={
            "enabled": True,
            "trigger_mode": "intelligent",
            "allowed_presets": ["research", "coding", "analysis", "custom"]
        })

        # ara_list_swarms tool
        swarms_info = call_mcp(c, system, p["id"], "ara_list_swarms", {})
        assert swarms_info["enabled"] is True
        assert len(swarms_info["allowed_presets"]) == 4

        # Spawn a research swarm via MCP tool
        spawn_result = call_mcp(c, system, p["id"], "ara_spawn_swarm", {
            "preset": "research",
            "task": "Investigate Byzantine fault tolerance in edge mesh networks",
            "operation_id": "sw-exec-1"
        })
        assert "swarm_id" in spawn_result
        assert spawn_result["state"] in {"queued", "running"}
        assert len(spawn_result["workers"]) == 3

        swarm_id = spawn_result["swarm_id"]

        # Poll ara_get_swarm until completion
        completed = None
        for _ in range(180):
            info = call_mcp(c, system, p["id"], "ara_get_swarm", {"swarm_id": swarm_id})
            if info["state"] in {"succeeded", "failed"}:
                completed = info
                break
            time.sleep(0.3)

        assert completed is not None
        assert completed["state"] == "succeeded"
        assert completed["preset"] == "research"
        assert len(completed["workers"]) == 3

        # All workers should have completed in tandem
        for w in completed["workers"]:
            assert w["state"] == "completed"
            assert w["output"] is not None
            assert w["role"] in {"Lead Researcher", "Source & Evidence Analyst", "Fact Checker & Synthesizer"}

        # Synthesized output should integrate all workers
        assert "ARA native runtime protocol verified" in completed["synthesized_output"]
        assert all("ARA native runtime protocol verified" in w["output"] for w in completed["workers"])
    finally:
        c.put(f"/profiles/{p['id']}/swarms", json={"enabled": False})


def test_swarm_api_spawning_and_custom_preset(system):
    c = system["client"]
    p = next(x for x in c.get("/profiles").json() if x["preset"] == "ara")
    connect_fixture(c, system, p)
    try:
        c.put(f"/profiles/{p['id']}/swarms", json={
            "enabled": True,
            "trigger_mode": "intelligent",
            "allowed_presets": ["custom", "coding"]
        })

        # Spawn custom swarm via REST API
        res = c.post(f"/profiles/{p['id']}/swarms/spawn", json={
            "preset": "custom",
            "task": "Build and audit a cryptographic token vault",
            "operation_id": "custom-sw-1",
            "custom_roles": [
                {"role": "Vault Architect", "objective": "Design secure storage interfaces and key rotation."},
                {"role": "Security Auditor", "objective": "Perform threat modeling and attack vector analysis."}
            ]
        })
        assert res.status_code == 200, res.text
        swarm = res.json()
        assert swarm["preset"] == "custom"
        assert len(swarm["workers"]) == 2

        # Poll via GET /api/v1/swarms/{id}
        completed = None
        for _ in range(180):
            check = c.get(f"/swarms/{swarm['id']}").json()
            if check["state"] in {"succeeded", "failed"}:
                completed = check
                break
            time.sleep(0.3)

        assert completed is not None
        assert completed["state"] == "succeeded"
        worker_roles = {w["role"] for w in completed["workers"]}
        assert worker_roles == {"Vault Architect", "Security Auditor"}
        assert all(w["state"] == "completed" for w in completed["workers"])
        assert "ARA native runtime protocol verified" in completed["synthesized_output"]

        # Profile swarms list should reflect this run
        profile_swarms = c.get(f"/profiles/{p['id']}/swarms").json()
        assert len(profile_swarms["runs"]) >= 1
        assert profile_swarms["runs"][0]["id"] == swarm["id"]
    finally:
        c.put(f"/profiles/{p['id']}/swarms", json={"enabled": False})
