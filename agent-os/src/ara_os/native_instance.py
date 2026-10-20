"""Native instance operations executed exclusively in the pinned Hermes environment."""
from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path


def assets(home):
    paths = ["SOUL.md", "memories/MEMORY.md", "memories/USER.md", "config.yaml"]
    paths += [str(p.relative_to(home)) for p in (home / "skills").rglob("SKILL.md")
              if not p.is_symlink()][:300]
    return [{"path": p, "exists": (home / p).is_file()} for p in paths]


def asset(home, request, *, locked=False):
    import yaml
    if not locked:
        import fcntl
        with (home / ".ara-assets.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            return asset(home, request, locked=True)
    relative = request["path"]
    path = Path(relative)
    if (path.is_absolute() or ".." in path.parts or not path.parts or
            any(p.startswith(".") for p in path.parts) or
            not (relative in {"SOUL.md", "config.yaml", "memories/MEMORY.md", "memories/USER.md"} or path.parts[0] == "skills")):
        raise ValueError("Use an editable profile-relative asset path")
    target = home / path
    if (any(home.joinpath(*path.parts[:i]).is_symlink() for i in range(1, len(path.parts) + 1)) or
            home.resolve() not in target.resolve().parents):
        raise ValueError("Linked assets are not editable")
    content = target.read_text() if target.exists() else ""
    if len(content.encode()) > 512_000:
        raise ValueError("Editable assets must be smaller than 512 KB")
    if relative == "config.yaml":
        # Raw native config can contain arbitrary credential names. Expose only
        # portable config; connection controls own secret reads and writes.
        from native_definition import portable_config
        content = yaml.safe_dump(portable_config(yaml.safe_load(content) or {}), sort_keys=False)
    digest = hashlib.sha256(content.encode()).hexdigest()
    if request.get("write"):
        if relative == "config.yaml":
            raise ValueError("Use native configuration controls")
        if request.get("hash") != digest:
            raise ValueError("Asset changed; reload and compare before saving")
        content = request["content"]
        if not isinstance(content, str) or len(content.encode()) > 512_000:
            raise ValueError("Editable assets must be smaller than 512 KB")
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", dir=target.parent, delete=False) as stream:
            os.chmod(stream.name, 0o600)
            stream.write(content)
            staged = Path(stream.name)
        current = target.read_bytes() if target.exists() else b""
        if hashlib.sha256(current).hexdigest() != digest:
            staged.unlink()
            raise ValueError("Asset changed during save")
        os.replace(staged, target)
        digest = hashlib.sha256(content.encode()).hexdigest()
    return {"path": relative, "content": content, "hash": digest}


def lifecycle(home, action):
    from hermes_cli.gateway_runtime import discover_gateway_endpoint, ensure_gateway_runtime, control_home_for
    from gateway.control_socket import request_serve_profile_hot, request_unserve_profile, query_gateway_control
    from hermes_cli.profiles import parked_marker_path
    home = home.resolve()
    if action == "start":
        parked_marker_path(home).unlink(missing_ok=True)
        root = home.parent.parent
        # A root multiplexer may have parked this individual profile.
        request_serve_profile_hot(root, home.name)
        discovery = ensure_gateway_runtime(home, idle_exit=False)
    else:
        discovery = discover_gateway_endpoint(home)
    if action == "stop":
        # Native multiplexer rescans and future boots honor this marker too.
        parked_marker_path(home).touch(mode=0o600)
        if discovery.endpoint:
            control = control_home_for(home, discovery.endpoint).resolve()
            if control == home:
                result = query_gateway_control(home, "pause-for-update")
            else:
                result = request_unserve_profile(control, home.name)
            if result is None or result.get("error") or result.get("pending"):
                return {"state": "stopping", "reason": "native_stop_unconfirmed"}
        discovery = discover_gateway_endpoint(home)
        return {"state": "stopped" if discovery.state == "absent" else "stopping",
                "reason": discovery.reason_code}
    return {"state": "running" if discovery.state == "ready" else "installed",
            "reason": discovery.reason_code, "native_instance_id": discovery.endpoint.instance_id if discovery.endpoint else None}
