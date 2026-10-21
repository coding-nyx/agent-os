"""Versioned profile definitions; sessions, credentials and memories stay with their owner."""
from __future__ import annotations

import hashlib
import base64
import json
import os
import tempfile
from pathlib import Path

try:
    import hermes_yaml as yaml
except ModuleNotFoundError:
    import yaml

CONFIG_KEYS = {"agent", "display", "compression", "context_files", "personalities", "reasoning_effort"}


def portable_config(value):
    def clean(v):
        if isinstance(v, dict):
            return {k: clean(x) for k, x in v.items() if not any(s in k.lower() for s in
                ("key", "token", "secret", "password", "auth", "credential", "endpoint", "url", "path", "directory", "cwd"))}
        if isinstance(v, list):
            return [clean(x) for x in v]
        return v
    return {k: clean(v) for k, v in value.items() if k in CONFIG_KEYS}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def allowed(relative):
    p = Path(relative)
    return (not p.is_absolute() and ".." not in p.parts and bool(p.parts) and
        not any(x.startswith(".") for x in p.parts) and
        (relative in {"SOUL.md", "AGENTS.md", "INSTRUCTIONS.md"} or p.parts[0] == "skills"))


def capture(home):
    files, encodings, modes = {}, {}, {}
    candidates = [home / n for n in ("SOUL.md", "AGENTS.md", "INSTRUCTIONS.md")]
    candidates += sorted((home / "skills").rglob("*"))
    size = 0
    for path in candidates:
        if not path.is_file() or path.is_symlink() or home.resolve() not in path.resolve().parents:
            continue
        relative = path.relative_to(home).as_posix()
        if not allowed(relative):
            continue
        raw = path.read_bytes()
        size += len(raw)
        if len(raw) > 512_000 or size > 8_000_000 or len(files) >= 1500:
            raise ValueError("Profile definition exceeds 1,500 files, 512 KB per file or 8 MB total")
        try:
            content = raw.decode("utf-8")
        except UnicodeError:
            if not relative.startswith("skills/"):
                raise ValueError("Identity instructions must be UTF-8 text")
            content = base64.b64encode(raw).decode()
            encodings[relative] = "base64"
        files[relative] = content
        modes[relative] = 0o700 if path.stat().st_mode & 0o111 else 0o600
    config_path = home / "config.yaml"
    cfg = yaml.safe_load(config_path.read_text()) or {} if config_path.is_file() else {}
    value = {"contract": "ara-definition/1", "files": files, "encodings": encodings, "modes": modes, "config": portable_config(cfg),
        "excluded": ["credentials", "model accounts", "channels", "schedules", "MCP connections", "memory", "sessions", "machine paths", "tool grants"]}
    if len(json.dumps(value).encode()) > 11_000_000:
        raise ValueError("Encoded profile definition exceeds the 11 MB transport limit")
    return {**value, "revision": digest(value)}


def atomic(path, raw, *, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, delete=False) as stream:
        os.chmod(stream.name, mode)
        stream.write(raw.encode() if isinstance(raw, str) else raw)
        staged = Path(stream.name)
    os.replace(staged, path)


def apply(home, definition, *, force=False, initial=False, expected_local=None):
    import fcntl
    with (home / ".ara-assets.lock").open("a") as assets_lock, (home / ".ara-policy.lock").open("a") as policy_lock:
        fcntl.flock(assets_lock, fcntl.LOCK_EX)
        fcntl.flock(policy_lock, fcntl.LOCK_EX)
        if expected_local is not None and capture(home)["revision"] != expected_local:
            raise ValueError("Node files changed after the preview; reload before applying")
        return _apply(home, definition, force=force, initial=initial)


def _apply(home, definition, *, force=False, initial=False):
    if definition.get("contract") != "ara-definition/1" or digest({k: v for k, v in definition.items() if k != "revision"}) != definition.get("revision"):
        raise ValueError("Invalid profile definition manifest")
    files = definition.get("files")
    if (not isinstance(files, dict) or len(files) > 1500 or len(json.dumps(definition).encode()) > 12_000_000 or
            any(not allowed(k) or not isinstance(v, str) or len(v.encode()) > 720_000 for k, v in files.items()) or
            portable_config(definition.get("config", {})) != definition.get("config", {})):
        raise ValueError("Invalid profile definition assets")
    record = home / ".ara-definition.json"
    previous = json.loads(record.read_text()) if record.exists() else {"files": {}, "config": {}}
    base, conflicts, updates = previous.get("files", {}), [], []
    def raw(manifest, key):
        if key not in manifest.get("files", {}):
            return None
        value = manifest["files"][key]
        encoding = manifest.get("encodings", {}).get(key)
        if encoding not in {None, "base64"} or encoding == "base64" and not key.startswith("skills/"):
            raise ValueError("Invalid definition asset encoding")
        result = base64.b64decode(value, validate=True) if encoding else value.encode()
        if len(result) > 512_000:
            raise ValueError("Definition assets must be below 512 KB")
        return result
    for relative in files:
        raw(definition, relative)  # Validate every file before changing any target.
    # Three-way comparison keeps local edits as explicit overlays. Deletions are
    # represented by paths present in the base but absent in the new manifest.
    for relative in sorted(set(base) | set(files)):
        target = home / relative
        parts = Path(relative).parts
        if (any(home.joinpath(*parts[:i]).is_symlink() for i in range(1, len(parts) + 1)) or
                home.resolve() not in target.resolve().parents):
            raise ValueError("Definition assets cannot follow links")
        current = target.read_bytes() if target.is_file() else None
        incoming = raw(definition, relative)
        current_exec = bool(target.stat().st_mode & 0o111) if target.is_file() else False
        incoming_exec = definition.get("modes", {}).get(relative) == 0o700
        mode_changed = current is not None and incoming is not None and current_exec != incoming_exec
        if (not force and relative in base and incoming == raw(previous, relative) and
                incoming_exec == (previous.get("modes", {}).get(relative) == 0o700)):
            continue  # Keep a local overlay when the published side did not change.
        if not force and current != incoming and current != raw(previous, relative) and relative in base:
            conflicts.append(relative)
        elif not force and not initial and current != incoming and relative not in base and current is not None:
            # Native seeded skills and pre-existing assets need an explicit merge.
            conflicts.append(relative)
        elif current != incoming or mode_changed:
            updates.append((target, incoming))
    cfgpath = home / "config.yaml"
    cfg = yaml.safe_load(cfgpath.read_text()) or {}
    cfg_updates = {}
    for key in set(previous.get("config", {})) | set(definition.get("config", {})):
        incoming = definition.get("config", {}).get(key)
        baseline = previous.get("config", {}).get(key)
        current = cfg.get(key)
        if not force and key in previous.get("config", {}) and incoming == baseline:
            continue
        if not force and current != incoming and current != baseline and key in previous.get("config", {}):
            conflicts.append("config:" + key)
        elif current != incoming:
            cfg_updates[key] = incoming
    if conflicts:
        return {"state": "conflict", "revision": previous.get("revision"), "offered_revision": definition["revision"], "conflicts": conflicts}
    for target, content in updates:
        if content is None:
            target.unlink(missing_ok=True)
        else:
            mode = definition.get("modes", {}).get(target.relative_to(home).as_posix(), 0o600)
            atomic(target, content, mode=0o700 if mode == 0o700 else 0o600)
    for key, value in cfg_updates.items():
        if value is None:
            cfg.pop(key, None)
        else:
            cfg[key] = value
    if cfg_updates:
        atomic(cfgpath, yaml.safe_dump(cfg, sort_keys=False))
    atomic(record, json.dumps(definition))
    (home / ".ara-definition-state.json").unlink(missing_ok=True)
    return {"state": "synced", "revision": definition["revision"], "conflicts": []}


def status(home):
    """Report local overlays separately from unresolved publication conflicts."""
    import time
    path = home / ".ara-definition-state.json"
    cached = json.loads(path.read_text()) if path.exists() else {}
    if cached.get("checked", 0) > time.time() - 15:
        return cached["status"]
    record = home / ".ara-definition.json"
    if not record.exists():
        return None
    baseline = json.loads(record.read_text())
    local = capture(home)
    changed = sorted(p for p in set(local["files"]) | set(baseline["files"]) if
        local["files"].get(p) != baseline["files"].get(p) or
        local.get("encodings", {}).get(p) != baseline.get("encodings", {}).get(p))
    dirty = bool(changed or local["config"] != baseline.get("config", {}))
    value = {"state": "local_changes" if dirty else "synced", "revision": baseline["revision"],
        "local_revision": local["revision"], "changed": changed, "config_changed": local["config"] != baseline.get("config", {})}
    atomic(path, json.dumps({"checked": time.time(), "status": value}))
    return value
