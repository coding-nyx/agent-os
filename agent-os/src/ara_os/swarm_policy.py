"""Portable profile policy shared by the dashboard and standalone execution nodes."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import yaml

DEFAULTS = {"enabled": False, "trigger_mode": "explicit", "allowed_presets": ["research", "coding", "analysis", "custom"],
    "custom_presets": [], "max_workers": 4, "max_concurrent": 3, "max_iterations": 12,
    "timeout_seconds": 600, "toolsets": ["web"], "workspace": None}


def validate(value):
    if not isinstance(value, dict):
        raise ValueError("Swarm policy must be an object")
    cfg = {**DEFAULTS, **value}
    if type(cfg["enabled"]) is not bool or cfg["trigger_mode"] not in {"explicit", "intelligent"}:
        raise ValueError("Use a boolean enabled flag and explicit/intelligent trigger mode")
    if not isinstance(cfg["allowed_presets"], list) or any(not isinstance(p, str) or p not in DEFAULTS["allowed_presets"] for p in cfg["allowed_presets"]):
        raise ValueError("Unknown allowed swarm preset")
    for key, ceiling in (("max_workers", 8), ("max_concurrent", 4), ("max_iterations", 40), ("timeout_seconds", 1800)):
        if type(cfg[key]) is not int or not 1 <= cfg[key] <= ceiling:
            raise ValueError(f"{key} must be between 1 and {ceiling}")
    if not isinstance(cfg["toolsets"], list) or any(t not in {"file", "terminal", "web"} for t in cfg["toolsets"]):
        raise ValueError("Workers may only be granted file, terminal and web toolsets")
    if cfg["workspace"] is not None and (not isinstance(cfg["workspace"], str) or not Path(cfg["workspace"]).is_absolute()):
        raise ValueError("Workspace must be an absolute path on the execution machine")
    if not isinstance(cfg["custom_presets"], list):
        raise ValueError("Custom presets must be a list")
    return cfg


def read(home: Path, fallback=None):
    native = yaml.safe_load((home / "config.yaml").read_text()) or {}
    return validate((native.get("ara") or {}).get("swarm", fallback or {}))


def write(home: Path, value):
    import fcntl
    cfg = validate(value)
    path = home / "config.yaml"
    if path.is_symlink():
        raise ValueError("Refusing to replace a linked native configuration")
    with (home / ".ara-policy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        before = path.read_bytes()
        native = yaml.safe_load(before) or {}
        native.setdefault("ara", {})["swarm"] = cfg
        with tempfile.NamedTemporaryFile(mode="w", dir=home, delete=False) as temp:
            os.chmod(temp.name, 0o600)
            yaml.safe_dump(native, temp, sort_keys=False)
            staged = Path(temp.name)
        try:
            if path.read_bytes() != before:
                raise ValueError("Configuration changed concurrently; reload before saving")
            os.replace(staged, path)
        finally:
            staged.unlink(missing_ok=True)
    return cfg
