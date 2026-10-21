import os
import subprocess

import pytest

from ara_os.launchers import install_cli, record_default_profile
from .conftest import ROOT


def test_public_ara_command_selects_active_release_and_preserves_original_state(tmp_path):
    import json
    import sys
    from pathlib import Path
    from ara_os.launchers import install_ara_cli
    root = tmp_path / "original installation"
    for project, version in [(root, "first"), (tmp_path / "new release", "second")]:
        (project / "src/ara_os").mkdir(parents=True)
        (project / "src/ara_os/__init__.py").write_text("")
        (project / "src/ara_os/cli.py").write_text('import os,json\ndef main(): print(json.dumps(dict(version=' + repr(version) + ',state=os.environ["ARA_STATE_DIR"],native=os.environ.get("ARA_RUNTIME_SOURCE"))))\n')
        (project / ".venv/bin").mkdir(parents=True)
        (project / ".venv/bin/python").symlink_to(sys.executable)
    source = ROOT
    # The bootstrapping interpreter lives with the original installation.
    (root / "src/ara_os/ara_launcher.py").write_bytes((source / "src/ara_os/ara_launcher.py").read_bytes())
    command = install_ara_cli(root, tmp_path / "public bin")
    def call(*args):
        env = {k:v for k,v in os.environ.items() if k not in {"ARA_STATE_DIR", "ARA_INSTALL_ROOT", "PYTHONPATH"}}
        reply = subprocess.run([str(command), *args], cwd=tmp_path, env=env, text=True, capture_output=True)
        assert reply.returncode == 0, reply.stderr
        return json.loads(reply.stdout)
    assert call()["version"] == "first"
    state = root / ".state"
    state.mkdir()
    (state / "node-active-release.json").write_text(json.dumps({"project": str(tmp_path / "new release"),
        "python": str(tmp_path / "new release/.venv/bin/python"), "native": {"source": "shared-native"}}))
    result = call()
    assert result == {"version": "second", "state": str(state), "native": "shared-native"}
    assert call("--state", str(tmp_path / "separate state"))["version"] == "first"
    custom_state = tmp_path / "custom state"
    install_ara_cli(root, command.parent, state=custom_state)
    assert call()["state"] == str(custom_state)
    foreign = command.read_bytes()
    with pytest.raises(FileExistsError):
        install_ara_cli(tmp_path / "different installation", command.parent)
    assert command.read_bytes() == foreign


def test_shell_path_setup_is_quoted_and_idempotent(tmp_path, monkeypatch):
    from ara_os.launchers import ensure_shell_path
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("SHELL", "/bin/zsh")
    (tmp_path / ".zshrc").write_text("# Existing shell settings\n")
    directory = tmp_path / "commands with spaces"
    files = ensure_shell_path(directory)
    assert {p.name for p in files} == {".profile", ".zprofile", ".zshrc"}
    assert ensure_shell_path(directory) == []
    shell = subprocess.run(["/bin/sh", "-c", '. "$1"; command -v sh; printf "%s" "$PATH"', "sh", str(tmp_path / ".profile")], text=True, capture_output=True)
    assert shell.returncode == 0
    assert str(directory) in shell.stdout
    assert (tmp_path / ".zshrc").read_text().startswith("# Existing shell settings\n")


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

    # Foreign command with fallback directory should preserve the foreign command and install in fallback
    fallback_dir = tmp_path / "fallback-bin"
    fallback_commands = install_cli(ROOT, directory, fallback_directory=fallback_dir)
    assert fallback_commands[0].parent == fallback_dir
    assert (directory / "hermes-acp").read_text() == "#!/bin/sh\n# Another installation\n"

    # Non-UTF8 binary foreign file does not trigger UnicodeDecodeError
    binary_dir = tmp_path / "bin-binary"
    binary_dir.mkdir()
    (binary_dir / "hermes").write_bytes(b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00")
    with pytest.raises(FileExistsError, match="another installation"):
        install_cli(ROOT, binary_dir)


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
