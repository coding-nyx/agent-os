"""Publish installation-bound native commands and the initial Ara selection."""
from __future__ import annotations

import re
import shlex
import os
from pathlib import Path


def install_ara_cli(root: Path, directory: Path | None = None, *, source_root: Path | None = None, state: Path | None = None) -> Path:
    """Keep the public command bound to its original data after release updates."""
    root = root.resolve()
    directory = (directory or Path.home() / ".local/bin").expanduser().resolve()
    target = directory / "ara"
    source = (source_root or root).resolve()
    marker = "# ARA CLI installation: " + str(root)
    if target.exists() or target.is_symlink():
        if target.is_symlink() or marker not in target.read_text(errors="replace").splitlines():
            raise FileExistsError(f"{target} belongs to another installation; choose ARA_CLI_BIN_DIR explicitly")
    directory.mkdir(parents=True, exist_ok=True)
    command = shlex.join(["env", f"ARA_INSTALL_ROOT={root}", str(source / ".venv/bin/python"), "-I", str(source / "src/ara_os/ara_launcher.py")])
    state_line = ("if [ -z \"${ARA_STATE_DIR+x}\" ]; then export ARA_STATE_DIR=" + shlex.quote(str(state.resolve())) + "; fi\n") if state else ""
    target.write_text(f'#!/bin/sh\n{marker}\n{state_line}exec {command} "$@"\n')
    target.chmod(0o755)
    return target


def ensure_shell_path(directory: Path) -> list[Path]:
    """Add a visible, idempotent PATH entry for new login and interactive shells."""
    directory = directory.expanduser().resolve()
    line = "export PATH=" + shlex.quote(str(directory)) + ':"$PATH"'
    home = Path.home()
    shell = Path(os.environ.get("SHELL", "/bin/sh")).name
    files = [home / ".profile"]
    if shell == "zsh":
        files.extend([home / ".zprofile", home / ".zshrc"])
    elif shell == "bash":
        login = next((home / name for name in (".bash_profile", ".bash_login") if (home / name).exists()), None)
        if login:
            files.append(login)
        files.append(home / ".bashrc")
    changed = []
    for path in files:
        content = path.read_text() if path.exists() else ""
        if line not in content.splitlines():
            with path.open("a") as stream:
                stream.write("\n# ARA Agent OS CLI\n" + line + "\n")
            changed.append(path)
    return changed


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
