import plistlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from ara_os import config
from ara_os.node_service import service
from ara_os.store import Problem


def test_macos_launch_agent_installs_with_isolated_state_and_removes_cleanly(tmp_path, monkeypatch):
    home = tmp_path / "user home"
    state = tmp_path / "agent state"
    root = tmp_path / "project root"
    home.mkdir()
    monkeypatch.setattr("ara_os.node_service.sys.platform", "darwin")
    monkeypatch.setattr("ara_os.node_service.Path.home", lambda: home)
    monkeypatch.setattr("ara_os.node_service.os.getuid", lambda: 501)
    monkeypatch.setattr(config, "STATE", state)
    monkeypatch.setattr(config, "ROOT", root)
    monkeypatch.setattr("ara_os.node_service.shutil.which", lambda command: "/usr/bin/launchctl" if command == "launchctl" else "/user/bin/ara")
    loaded = False
    calls = []

    def run(args, **kwargs):
        nonlocal loaded
        calls.append(args)
        if args[1] == "print":
            return SimpleNamespace(returncode=0 if loaded else 113, stdout="", stderr="")
        if args[1] == "bootstrap":
            loaded = True
        elif args[1] == "bootout":
            loaded = False
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("ara_os.node_service.subprocess.run", run)
    result = service("install")
    path = Path(result["unit"])
    data = plistlib.loads(path.read_bytes())
    assert result["state"] == "running"
    assert result["scope"] == "user"
    assert result["boot"].startswith("Starts at graphical login")
    assert path.stat().st_mode & 0o777 == 0o600
    assert data["Label"] == result["service"]
    assert data["ProgramArguments"] == ["/user/bin/ara", "--state", str(state), "node", "daemon"]
    assert data["WorkingDirectory"] == str(root)
    assert data["KeepAlive"] is True and data["RunAtLoad"] is True
    assert data["EnvironmentVariables"]["ARA_STATE_DIR"] == str(state)
    assert data["StandardOutPath"].startswith(str(state))
    assert all("token" not in str(call).lower() for call in calls)

    assert service("status")["state"] == "running"
    removed = service("remove")
    assert removed["state"] == "stopped"
    assert not path.exists()
    assert loaded is False


def test_macos_service_preserves_launch_agent_if_launchd_refuses_shutdown(tmp_path, monkeypatch):
    home = tmp_path / "home"
    state = tmp_path / "state"
    home.mkdir()
    monkeypatch.setattr("ara_os.node_service.sys.platform", "darwin")
    monkeypatch.setattr("ara_os.node_service.Path.home", lambda: home)
    monkeypatch.setattr("ara_os.node_service.os.getuid", lambda: 501)
    monkeypatch.setattr(config, "STATE", state)
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.setattr("ara_os.node_service.shutil.which", lambda command: "/usr/bin/launchctl")
    loaded = True

    def run(args, **kwargs):
        if args[1] == "print":
            return SimpleNamespace(returncode=0 if loaded else 113, stdout="", stderr="")
        if args[1] == "bootout":
            return SimpleNamespace(returncode=5, stdout="", stderr="busy")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("ara_os.node_service.subprocess.run", run)
    path = home / "Library/LaunchAgents" / ("com.ara.node." + __import__("hashlib").sha256(str(state).encode()).hexdigest()[:12] + ".plist")
    path.parent.mkdir(parents=True)
    path.write_bytes(plistlib.dumps({"Label": "existing"}))
    with pytest.raises(Problem, match="file was preserved"):
        service("remove")
    assert path.exists()
