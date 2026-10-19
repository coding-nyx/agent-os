from pathlib import Path
import json
import subprocess

import pytest

from ara_os.runtime_setup import refresh_environment
from .conftest import ROOT


def build(candidate: Path):
    assert not candidate.exists(), "PM only builds into a fresh destination"
    candidate.mkdir()
    (candidate / "marker").write_text("new environment")


def test_refresh_preserves_the_previous_environment(tmp_path):
    env = tmp_path / "env"
    env.mkdir()
    (env / "marker").write_text("working environment")
    checked = []
    previous = refresh_environment(env, build, lambda candidate: checked.append(candidate))
    assert (env / "marker").read_text() == "new environment"
    assert (previous / "marker").read_text() == "working environment"
    assert len(checked) == 2 and checked[-1] == env


def test_failed_staged_validation_leaves_the_working_environment_untouched(tmp_path):
    env = tmp_path / "env"
    env.mkdir()
    (env / "marker").write_text("working environment")

    def refuse(candidate):
        raise RuntimeError("missing provider dependency")

    with pytest.raises(RuntimeError, match="missing provider"):
        refresh_environment(env, build, refuse)
    assert (env / "marker").read_text() == "working environment"
    assert list(tmp_path.iterdir()) == [env]


def test_failed_promoted_validation_restores_the_previous_environment(tmp_path):
    env = tmp_path / "env"
    env.mkdir()
    (env / "marker").write_text("working environment")

    def verify(candidate):
        if candidate == env:
            raise RuntimeError("promotion failed")

    with pytest.raises(RuntimeError, match="promotion failed"):
        refresh_environment(env, build, verify)
    assert (env / "marker").read_text() == "working environment"
    failed = list(tmp_path.glob("env-failed-*"))
    assert len(failed) == 1 and (failed[0] / "marker").read_text() == "new environment"


def test_selected_provider_adapters_are_installed_by_pinned_setup():
    lock = json.loads((ROOT / "compatibility.lock.json").read_text())
    assert "anthropic" in lock["runtime"]["extras"]
    result = subprocess.run([str(ROOT / ".runtime/env/bin/python"), "-c",
        "import anthropic; from agent.anthropic_adapter import _require_sdk; "
        "assert _require_sdk('Anthropic Messages') is anthropic"],
        cwd=ROOT / ".runtime/ara-agent", capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
