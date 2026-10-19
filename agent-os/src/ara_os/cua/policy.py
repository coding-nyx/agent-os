"""Cross-process operator policy. Desktop authority is separate from data tokens."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .. import config

DEFAULT = {"mode": "view_only", "kill_switch": False, "grants": {}, "epoch": 0}


def read():
    path = config.STATE / "computer-policy.json"
    return {**DEFAULT, **json.loads(path.read_text())} if path.exists() else {**DEFAULT, "grants": {}}


def update(values):
    import fcntl
    config.STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (config.STATE / ".computer-policy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cfg = {**read(), **values}
        if cfg["mode"] not in {"view_only", "supervised", "autonomous"} or type(cfg["kill_switch"]) is not bool:
            raise ValueError("Use a valid computer-control mode and boolean kill_switch")
        if not isinstance(cfg["grants"], dict) or any(not isinstance(k, str) or not isinstance(v, list) or
                any(item not in {"view", "input"} for item in v) for k, v in cfg["grants"].items()):
            raise ValueError("Computer grants map profile identities to view/input permissions")
        cfg["epoch"] = read()["epoch"] + 1
        with tempfile.NamedTemporaryFile(mode="w", dir=config.STATE, delete=False) as tmp:
            os.chmod(tmp.name, 0o600)
            json.dump(cfg, tmp)
            path = Path(tmp.name)
        os.replace(path, config.STATE / "computer-policy.json")
    return cfg
