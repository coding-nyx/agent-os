"""Node-local runtime identities. This module never connects to application storage."""
from __future__ import annotations

import fcntl
import json
import os
import re
import tempfile
import time
import uuid
from pathlib import Path

from . import config

NAMESPACE = uuid.UUID("40c97db3-a8f9-49cb-a3d3-b9f022d5d9ce")


def identity(profile_id, machine_id):
    return str(uuid.uuid5(NAMESPACE, f"{profile_id}:{machine_id}"))


def directory():
    path = config.STATE / "instances"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def path_for(id):
    return directory() / (str(uuid.UUID(id)) + ".json")


def read(id):
    path = path_for(id)
    return json.loads(path.read_text()) if path.is_file() else None


def listing():
    return [json.loads(path.read_text()) for path in sorted(directory().glob("*.json"))]


def by_name(name):
    return next((r for r in listing() if r["native_name"] == name), None)


def write(id, values):
    path = path_for(id)
    with (directory() / ".registry.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        value = {**(read(id) or {}), **values, "instance_id": id, "updated_at": time.time()}
        value.setdefault("owner_epoch", uuid.uuid4().hex)
        with tempfile.NamedTemporaryFile(mode="w", dir=directory(), delete=False) as stream:
            os.chmod(stream.name, 0o600)
            json.dump(value, stream)
            staged = stream.name
        os.replace(staged, path)
    return value


def register(name, *, id=None, logical_agent_id=None, machine_id=None, enabled=True, adopt=False):
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
        raise ValueError("Use a valid native profile name")
    previous = by_name(name)
    if previous:
        if logical_agent_id and previous.get("logical_agent_id") not in {None, logical_agent_id}:
            raise ValueError("This native instance belongs to another logical agent")
        if id and previous["instance_id"] != id:
            if not adopt:
                raise ValueError("An existing standalone instance needs explicit adoption with its instance ID")
            id = previous["instance_id"]
    id = id or (previous or {}).get("instance_id") or str(uuid.uuid4())
    return write(id, {"native_name": name, "logical_agent_id": logical_agent_id or
        (previous or {}).get("logical_agent_id"), "machine_id": machine_id or (previous or {}).get("machine_id"),
        "enabled": enabled, "state": (previous or {}).get("state", "installed")})


def local_profile(value):
    """Resolve native names/instance IDs locally before any optional host lookup."""
    row = by_name(value)
    if row is None:
        try:
            row = read(value)
        except ValueError:
            pass
    name = row["native_name"] if row else value
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
        return None
    home = config.RUNTIME_HOME / "profiles" / name
    if home.is_dir() and not home.is_symlink():
        return {"native_name": name, "instance_id": row["instance_id"] if row else None}
    return None


def assert_enabled(id, generation=None):
    row = read(id)
    if not row or not row.get("enabled"):
        raise ValueError("This runtime instance is disabled or no longer installed")
    if generation and row.get("generation") != generation:
        raise ValueError("This command belongs to a superseded deployment generation")
    return row
