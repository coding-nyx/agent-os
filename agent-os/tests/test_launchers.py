import os
import subprocess

import pytest

from ara_os.launchers import install_cli, record_default_profile
from .conftest import ROOT


def run_cli(command, state, *arguments, home=None):
    env = {key: value for key, value in os.environ.items()
           if key not in {"HERMES_HOME", "HERMES_RUNTIME_DIR", "PYTHONPATH"}}
    env["ARA_STATE_DIR"] = str(state)
    if home is not None:
        env["HERMES_HOME"] = str(home)
    return subprocess.run([str(command), *arguments], cwd=state.parent, env=env,
                          text=True, capture_output=True, timeout=30)


def profile(state, name, model=""):
    home = state / "runtime/profiles" / name
    home.mkdir(parents=True)
    (home / "config.yaml").write_text(f'model:\n  provider: auto\n  default: "{model}"\n')
    (home / "SOUL.md").write_text("Test profile")
    return home


def test_installed_cli_lists_and_selects_agent_os_profiles(tmp_path):
    state = tmp_path / "state with spaces"
    ara = profile(state, "ara-primary", "example-model")
    scout = profile(state, "ara-scout")
    record_default_profile(state, {"preset": "ara", "provision_state": "ready", "native_name": ara.name})
    command, *others = install_cli(ROOT, tmp_path / "commands with spaces")
    result = run_cli(command, state, "profiles")
    assert result.returncode == 0, result.stderr
    assert "◆ara-primary" in result.stdout
    assert "ara-scout" in result.stdout
    assert "example-model" in result.stdout

    selected = run_cli(command, state, "-p", scout.name, "profile", "list")
    assert selected.returncode == 0, selected.stderr
    assert "◆ara-scout" in selected.stdout
    override = run_cli(command, state, "profile", "list", home=scout)
    assert override.returncode == 0, override.stderr
    assert "◆ara-scout" in override.stdout
    switched = run_cli(command, state, "profile", "use", scout.name)
    assert switched.returncode == 0, switched.stderr
    sticky = run_cli(command, state, "profile", "list")
    assert sticky.returncode == 0, sticky.stderr
    assert "◆ara-scout" in sticky.stdout
    reset = run_cli(command, state, "profile", "use", "default")
    assert reset.returncode == 0, reset.stderr
    default = run_cli(command, state, "profile", "list")
    assert default.returncode == 0, default.stderr
    assert "◆default" in default.stdout
    for entry in others:
        help_result = run_cli(entry, state, "--help")
        assert help_result.returncode == 0, help_result.stderr


def test_unconfigured_chat_is_refused_before_a_session_is_created(tmp_path):
    state = tmp_path / "state"
    home = profile(state, "ara-needs-model")
    record_default_profile(state, {"preset": "ara", "provision_state": "ready", "native_name": home.name})
    command = install_cli(ROOT, tmp_path / "bin")[0]
    for arguments in ((), ("chat",), ("-p", home.name, "chat")):
        result = run_cli(command, state, *arguments)
        assert result.returncode == 2, result.stdout + result.stderr
        assert "Model not configured for ara-needs-model" in result.stderr
        assert "hermes -p ara-needs-model model" in result.stderr
        assert "storage_unavailable" not in result.stderr
    assert not (home / "state.db").exists()
    assert run_cli(command, state, "--help").returncode == 0
    fresh = tmp_path / "fresh-install"
    missing = run_cli(command, fresh)
    assert missing.returncode == 2, missing.stdout + missing.stderr
    assert "start Agent OS first" in missing.stderr
    assert not (fresh / "runtime/state.db").exists()


def test_installation_preserves_foreign_commands_and_default_selection(tmp_path):
    state = tmp_path / "state"
    record_default_profile(state, {"preset": "scout", "provision_state": "ready", "native_name": "scout"})
    assert not (state / "default-profile").exists()
    for name in ("ara-first", "ara-another"):
        record_default_profile(state, {"preset": "ara", "provision_state": "ready", "native_name": name})
    assert (state / "default-profile").read_text().strip() == "ara-first"
    directory = tmp_path / "bin"
    installed = install_cli(ROOT, directory)
    assert install_cli(ROOT, directory) == installed
    foreign = directory / "hermes-acp"
    foreign.write_text("#!/bin/sh\n# Another installation\n")
    before = {path.name: path.read_bytes() for path in installed}
    with pytest.raises(FileExistsError, match="another installation"):
        install_cli(ROOT, directory)
    assert {path.name: path.read_bytes() for path in installed} == before


def test_seeded_profiles_have_a_cli_default_and_separate_model_readiness(system):
    state = system["state"]
    profiles = system["client"].get("/profiles").json()
    initial_ara = next(p for p in profiles if p["preset"] == "ara")
    assert (state / "default-profile").read_text().strip() == initial_ara["native_name"]
    assert initial_ara["provision_state"] == "ready"
    assert initial_ara["model_ready"] is False
    assert initial_ara["chat_ready"] is False
    response = system["client"].post(f"/profiles/{initial_ara['id']}/model", json={
        "name": "Launcher protocol fixture", "base_url": system["provider_url"],
        "model": "ara-protocol-test", "api_key": "test-only-placeholder", "api_mode": "chat_completions"})
    response.raise_for_status()
    configured = system["client"].get(f"/profiles/{initial_ara['id']}").json()
    assert configured["model_ready"] is True
    assert configured["chat_ready"] is True
    command = install_cli(ROOT, state / "cli-bin")[0]
    reply = run_cli(command, state, "-z", "Verify the installed terminal launcher.")
    assert reply.returncode == 0, reply.stdout + reply.stderr
    assert "ARA native runtime protocol verified." in reply.stdout
