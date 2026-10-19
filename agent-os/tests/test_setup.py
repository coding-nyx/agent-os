import hashlib
import base64
import json
import subprocess
import uuid
from types import SimpleNamespace

import psycopg
import yaml
import pytest

from .conftest import ROOT, free_port
from .test_lifecycle import start, until


def command(system, *args):
    env = {**system["env"]}
    for key in ("HERMES_HOME", "HERMES_PROFILE", "PYTHONPATH"):
        env.pop(key, None)
    return subprocess.run([str(ROOT / ".venv/bin/ara"), "setup", *args], cwd=ROOT,
        env=env, text=True, capture_output=True, timeout=120)


def worker(system, request):
    env = {**system["env"], "HERMES_HOME": str(system["state"] / "runtime"),
        "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools"), "HERMES_DISABLE_LAZY_INSTALLS": "1"}
    process = subprocess.run([str(ROOT / ".runtime/env/bin/python"), str(ROOT / "src/ara_os/native_worker.py")],
        cwd=ROOT / ".runtime/ara-agent", env=env, input=json.dumps(request) + "\n",
        text=True, capture_output=True, timeout=60)
    frames = [json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"ara_frame":')]
    return process, frames


def test_shared_setup_configures_all_presets_once_and_preserves_instances(system):
    c = system["client"]
    created = c.post("/profiles", json={"name": "Keep instance model", "preset": "scout"}).json()
    c.post(f"/profiles/{created['id']}/model", json={"name": "Own instance endpoint",
        "base_url": system["provider_url"], "model": "own-instance-model", "api_mode": "chat_completions",
        "api_key": "instance-only-secret"}).raise_for_status()
    root = system["state"] / "runtime"
    process, frames = worker(system, {"operation": "http", "method": "POST", "path": "/api/providers/custom-endpoints",
        "body": {"id": "setup-wire", "name": "Shared setup fixture", "base_url": system["provider_url"],
        "model": "ara-shared-setup-test", "api_key": "shared-setup-test-secret", "api_mode": "chat_completions",
        "make_default": True, "discover_models": False}})
    assert process.returncode == 0, frames
    assert frames[-1]["data"]["status"] < 300, frames
    before = c.get("/profiles").json()
    presets = [next(p for p in before if p["preset"] == name) for name in ("ara", "agnes", "titan", "ledger", "atlas", "scout")]
    souls = {p["id"]: (root / "profiles" / p["native_name"] / "SOUL.md").read_bytes() for p in presets}
    result = command(system, "--use-existing", "--replace-models", "--non-interactive")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Applied to 6 presets" in result.stdout
    assert "shared-setup-test-secret" not in result.stdout + result.stderr
    for p in presets:
        updated = c.get(f"/profiles/{p['id']}").json()
        assert updated["model_connection"]["model"] == "ara-shared-setup-test"
        assert updated["model_connection"]["api_mode"] == "chat_completions"
        assert updated["bindings"] == p["bindings"] and updated["enabled"] == p["enabled"]
        assert (root / "profiles" / p["native_name"] / "SOUL.md").read_bytes() == souls[p["id"]]
        if p["enabled"]:
            _, run = start(system, p, "Shared setup native connection verification")
            done = until(system, run, lambda r: r["state"] in {"succeeded", "failed", "unknown"})
            assert done["state"] == "succeeded", done
    instance = c.get(f"/profiles/{created['id']}").json()
    assert instance["model_connection"]["model"] == "own-instance-model"
    again = command(system, "--use-existing", "--non-interactive")
    assert again.returncode == 0 and "existing choices kept" in again.stdout
    # Re-entering a key in the wizard must replace the app-owned fallback,
    # not keep selecting a stale manual pool entry from the previous setup.
    for key in ("replacement-setup-test-secret", "shared-setup-test-secret"):
        process, frames = worker(system, {"operation": "http", "method": "POST", "path": "/api/providers/custom-endpoints",
            "body": {"id": "setup-wire", "name": "Shared setup fixture", "base_url": system["provider_url"],
            "model": "ara-shared-setup-test", "api_key": key, "api_mode": "chat_completions",
            "make_default": True, "discover_models": False}})
        assert process.returncode == 0 and frames[-1]["data"]["status"] < 300
        refreshed = command(system, "--use-existing", "--replace-models", "--non-interactive")
        assert refreshed.returncode == 0, refreshed.stdout + refreshed.stderr
        auth = json.loads((root / "auth.json").read_text())
        shared = [r for rows in auth["credential_pool"].values() for r in rows if r.get("id", "").startswith("ara-setup-")]
        assert len(shared) == 1 and shared[0]["access_token"] == key
        assert key not in refreshed.stdout + refreshed.stderr


def test_noninteractive_setup_does_not_prompt_or_overwrite_models(system):
    c = system["client"]
    before = {p["id"]: p["model_connection"] for p in c.get("/profiles").json()}
    result = command(system, "--non-interactive")
    assert result.returncode == 0, result.stderr
    assert "No interactive terminal: model setup skipped" in result.stdout
    assert {p["id"]: p["model_connection"] for p in c.get("/profiles").json()} == before
    skipped = command(system, "--skip-model")
    assert skipped.returncode == 0 and "Model setup skipped" in skipped.stdout


def test_setup_does_not_reconcile_running_api_work(system):
    c = system["client"]
    completed = next(r for r in c.get("/runs").json() if r["state"] == "succeeded")
    database = system["env"]["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")
    with psycopg.connect(database) as db:
        db.execute("UPDATE ara_entities SET data=jsonb_set(data,'{state}','\"running\"'::jsonb) WHERE id=%s", (completed["id"],))
    try:
        result = command(system, "--skip-model")
        assert result.returncode == 0, result.stdout + result.stderr
        assert c.get(f"/runs/{completed['id']}").json()["state"] == "running"
    finally:
        with psycopg.connect(database) as db:
            db.execute("UPDATE ara_entities SET data=jsonb_set(data,'{state}','\"succeeded\"'::jsonb) WHERE id=%s", (completed["id"],))


def test_changed_configuration_blocks_bulk_setup_before_any_writes(system):
    c = system["client"]
    selected = [p for p in c.get("/profiles").json() if p["preset"] in {"agnes", "atlas"}][:2]
    root = system["state"] / "runtime"
    paths = [root / "profiles" / p["native_name"] / "config.yaml" for p in selected]
    before = [p.read_bytes() for p in paths]
    request = {"operation": "setup-model", "source_hash": hashlib.sha256((root / "config.yaml").read_bytes()).hexdigest(),
        "targets": [{"native_name": p["native_name"], "config_hash": "stale"} for p in selected]}
    process, frames = worker(system, request)
    assert process.returncode != 0
    assert "changed during setup" in frames[-1]["data"]["detail"]
    assert [p.read_bytes() for p in paths] == before


def test_shared_oauth_keeps_one_root_refresh_grant(system):
    c = system["client"]
    root = system["state"] / "runtime"
    config_path, auth_path = root / "config.yaml", root / "auth.json"
    old_config = config_path.read_bytes()
    old_auth = auth_path.read_bytes() if auth_path.exists() else None
    encode = lambda data: base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    token = encode({"alg": "none"}) + "." + encode({"exp": 4102444800,
        "https://api.openai.com/auth": {"chatgpt_account_id": "fixture-account"}}) + ".fixture"
    refresh = "fixture-root-refresh-never-copy"
    children = [c.post("/profiles", json={"name": "OAuth shared child " + str(i), "preset": "custom"}).json() for i in range(2)]
    try:
        config_path.write_text(yaml.safe_dump({"model": {"provider": "openai-codex", "default": "fixture-codex-model", "api_mode": "codex_responses"}}))
        auth_path.write_text(json.dumps({"credential_pool": {"openai-codex": [{"id": "setup-oauth",
            "label": "OAuth fixture", "auth_type": "oauth", "priority": 0, "source": "device_code",
            "access_token": token, "refresh_token": refresh, "expires_at": "2100-01-01T00:00:00Z"}]}}))
        targets = []
        for p in children:
            path = root / "profiles" / p["native_name"] / "config.yaml"
            targets.append({"native_name": p["native_name"], "config_hash": hashlib.sha256(path.read_bytes()).hexdigest()})
        process, frames = worker(system, {"operation": "setup-model", "targets": targets,
            "source_hash": hashlib.sha256(config_path.read_bytes()).hexdigest()})
        assert process.returncode == 0, frames
        assert len(frames[-1]["data"]["applied"]) == 2, frames
        assert refresh not in process.stdout + process.stderr and token not in process.stdout
        for p in children:
            home = root / "profiles" / p["native_name"]
            for filename in ("config.yaml", "auth.json", ".env"):
                path = home / filename
                if path.exists():
                    assert refresh not in path.read_text() and token not in path.read_text()
            env = {**system["env"], "HERMES_HOME": str(home), "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools")}
            check = subprocess.run([str(ROOT / ".runtime/env/bin/python"), "-c",
                "from hermes_cli.auth import read_credential_pool; "
                "rows=read_credential_pool('openai-codex'); assert len(rows)==1; "
                "assert rows[0]['id']=='setup-oauth'; print('Root grant available')"],
                cwd=ROOT / ".runtime/ara-agent", env=env, text=True, capture_output=True, timeout=30)
            assert check.returncode == 0, check.stderr
    finally:
        config_path.write_bytes(old_config)
        if old_auth is not None:
            auth_path.write_bytes(old_auth)
        else:
            auth_path.unlink(missing_ok=True)


@pytest.mark.parametrize("confirmation,expected_applies", [("yes", 1), ("no", 0)])
def test_interactive_setup_opens_one_native_wizard_and_confirms_application(tmp_path, monkeypatch, confirmation, expected_applies):
    from ara_os import setup
    selected = [{"id": str(i), "name": name} for i, name in enumerate(("Ara", "Agnes", "Titan", "Ledger", "Atlas", "Scout"))]
    calls, applies = [], []

    async def ensure():
        return selected

    def wizard(command, **kwargs):
        calls.append(command)
        (tmp_path / "config.yaml").write_text(yaml.safe_dump({"model": {"provider": "test-provider", "default": "test-model"}}))
        return 0

    async def apply(items, **kwargs):
        applies.append(items)
        return {"applied": [p["name"] for p in items], "kept": [], "model": {"provider": "test-provider", "default": "test-model"}}

    monkeypatch.setattr(setup.config, "RUNTIME_HOME", tmp_path)
    monkeypatch.setattr(setup, "ensure_presets", ensure)
    monkeypatch.setattr(setup, "apply_model", apply)
    monkeypatch.setattr(setup.profiles, "resolve_model_connection", lambda p: None)
    monkeypatch.setattr(setup.subprocess, "call", wizard)
    monkeypatch.setattr(setup.sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr(setup.sys.stdout, "isatty", lambda: True)
    monkeypatch.setattr("builtins.input", lambda question: confirmation)
    setup.run_setup(SimpleNamespace(skip_model=False, use_existing=False, non_interactive=False, replace_models=False))
    assert len(calls) == 1 and calls[0][-3:] == ["--profile", "default", "model"]
    assert len(applies) == expected_applies


def test_setup_creates_presets_before_the_web_server_is_started(tmp_path):
    import os
    from psycopg import sql
    database = "ara_setup_test_" + uuid.uuid4().hex[:10]
    admin = "postgresql://ara_os:ara_os_local@127.0.0.1:55432/postgres"
    with psycopg.connect(admin, autocommit=True) as db:
        db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    state = tmp_path / "fresh-state"
    env = {**os.environ, "ARA_STATE_DIR": str(state),
        "ARA_DATABASE_URL": f"postgresql+psycopg://ara_os:ara_os_local@127.0.0.1:55432/{database}",
        "ARA_API_URL": f"http://127.0.0.1:{free_port()}"}
    try:
        result = command({"env": env}, "--skip-model")
        assert result.returncode == 0, result.stdout + result.stderr
        assert "Ara, Agnes, Titan, Ledger, Atlas, Scout" in result.stdout
        with psycopg.connect(env["ARA_DATABASE_URL"].replace("postgresql+psycopg:", "postgresql:")) as db:
            rows = db.execute("SELECT data FROM ara_entities WHERE kind='profile'").fetchall()
            assert len(rows) == 6
            assert db.execute("SELECT COUNT(*) FROM ara_entities WHERE kind='run'").fetchone()[0] == 0
        for (p,) in rows:
            cfg = yaml.safe_load((state / "runtime/profiles" / p["native_name"] / "config.yaml").read_text())
            assert not cfg["model"].get("default")
        assert (state / "default-profile").exists()
    finally:
        with psycopg.connect(admin, autocommit=True) as db:
            db.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database)))
