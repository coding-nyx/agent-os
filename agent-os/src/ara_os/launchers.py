"""Publish installation-bound native commands and the initial Ara selection."""
from __future__ import annotations

import re
import shlex
from pathlib import Path


def record_default_profile(state: Path, profile: dict) -> None:
    if profile.get("preset") != "ara" or profile.get("provision_state") != "ready":
        return
    name = profile["native_name"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
        raise ValueError("Invalid native profile name")
    target = state / "default-profile"
    state.mkdir(parents=True, exist_ok=True)
    try:
        with target.open("x", encoding="utf-8") as stream:
            stream.write(name + "\n")
    except FileExistsError:
        return  # Keep the first Ara selection when another seed or profile creation races us.


def install_cli(root: Path, directory: Path | None = None, fallback_directory: Path | None = None) -> list[Path]:
    root = root.resolve()
    directory = (directory or Path.home() / ".local/bin").expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    python = root / ".runtime/env/bin/python"
    bridge = root / "src/ara_os/native_cli.py"
    targets = [directory / name for name in ("hermes", "hermes-agent", "hermes-acp")]
    for target in targets:
        # A setup rerun may refresh this installation's commands, but cannot adopt another one.
        if target.exists() or target.is_symlink():
            owned_by_this = False
            if not target.is_symlink():
                try:
                    content = target.read_text(encoding="utf-8", errors="replace")
                    owned_by_this = str(root) in content
                except Exception:
                    owned_by_this = False
            if not owned_by_this:
                if fallback_directory is not None:
                    fallback_directory = fallback_directory.expanduser().resolve()
                    if fallback_directory != directory:
                        return install_cli(root, fallback_directory)
                raise FileExistsError(f"{target} belongs to another installation; choose a different CLI directory")
    for target in targets:
        command = shlex.join(["env", f"ARA_PROJECT_ROOT={root}", str(python), "-I", str(bridge), target.name])
        target.write_text(f'#!/bin/sh\n# ARA Agent OS launcher\nexec {command} "$@"\n', encoding="utf-8")
        target.chmod(0o755)
    return targets
