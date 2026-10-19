import json
import sqlite3

import psycopg
import pytest
import yaml

from ara_os import profiles, runtime
from .test_lifecycle import connected_profile, start, until


@pytest.mark.parametrize("provider,model,mode", [
    ("openai-codex", "selected-chatgpt-model", "codex_responses"),
    ("minimax-oauth", "selected-minimax-model", "anthropic_messages"),
    ("ara-connection", "selected-local-model", "chat_completions"),
])
def test_native_configuration_overrides_cached_connection(tmp_path, monkeypatch, provider, model, mode):
    monkeypatch.setattr(runtime, "home", lambda profile: tmp_path)
    (tmp_path / "config.yaml").write_text(yaml.safe_dump({"model": {
        "default": model, "provider": provider, "api_mode": mode,
        "base_url": "https://native.example/v1", "api_key": "never-export-this"}}))
    cached = {"model_connection": {"name": "Old provider", "model": "obsolete-model",
        "api_mode": "chat_completions", "base_url": "https://old.example/v1"}}
    result = profiles.resolve_model_connection(cached)
    assert result == {"name": provider, "provider": provider, "model": model,
        "api_mode": mode, "base_url": "https://native.example/v1"}
    assert "never-export-this" not in json.dumps(result)


@pytest.mark.parametrize("raw", [None, "model: {default: ''}", "model: {default: '   '}",
    "model: {default: 123}", "model: [invalid]", "model: [", "[]"])
def test_stale_metadata_cannot_enable_missing_or_invalid_native_model(tmp_path, monkeypatch, raw):
    monkeypatch.setattr(runtime, "home", lambda profile: tmp_path)
    if raw is not None:
        (tmp_path / "config.yaml").write_text(raw)
    assert profiles.resolve_model_connection({"model_connection": {"model": "old-model"}}) is None


def test_matching_custom_connection_preserves_display_name_not_cached_protocol(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime, "home", lambda profile: tmp_path)
    (tmp_path / "config.yaml").write_text(yaml.safe_dump({"model": {
        "default": "test-model", "provider": "ara-connection", "api_mode": "anthropic_messages",
        "base_url": "https://same.example/v1"}}))
    result = profiles.resolve_model_connection({"model_connection": {"name": "My endpoint",
        "model": "test-model", "base_url": "https://same.example/v1", "api_mode": "chat_completions"}})
    assert result["name"] == "My endpoint"
    assert result["api_mode"] == "anthropic_messages"


def test_live_native_config_is_used_for_api_execution_and_missing_model_guard(system):
    c = system["client"]
    p = connected_profile(system, "Native model authority")
    database = system["env"]["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")
    stale = {"name": "Stale cache", "model": "obsolete-model", "api_mode": "anthropic_messages", "base_url": ""}
    with psycopg.connect(database) as db:
        db.execute("UPDATE ara_entities SET data=jsonb_set(data, '{model_connection}', %s::jsonb) WHERE id=%s",
                   (json.dumps(stale), p["id"]))
    current = c.get(f"/profiles/{p['id']}").json()
    assert current["model_connection"]["model"] == "ara-protocol-test"
    assert current["model_connection"]["api_mode"] == "chat_completions"
    conversation, run = start(system, p, "Check native model authority")
    completed = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
    assert completed["state"] == "succeeded", completed
    home = system["state"] / "runtime/profiles" / p["native_name"]
    with sqlite3.connect(home / "state.db") as db:
        model = db.execute("SELECT model FROM sessions WHERE id=?", (completed["native_session_id"],)).fetchone()[0]
    assert model == "ara-protocol-test"
    path = home / "config.yaml"
    cfg = yaml.safe_load(path.read_text())
    cfg["model"]["default"] = ""
    path.write_text(yaml.safe_dump(cfg))
    unconfigured = c.get(f"/profiles/{p['id']}").json()
    assert not unconfigured["model_ready"] and not unconfigured["chat_ready"]
    assert unconfigured["model_connection"] is None
    new = c.post("/conversations", json={"profile_id": p["id"], "title": "No cached fallback"}).json()
    rejected = c.post(f"/conversations/{new['id']}/messages", json={"text": "Do not run", "operation_id": "blocked"})
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "model_not_configured"
    assert not c.get(f"/conversations/{new['id']}").json()["runs"]
