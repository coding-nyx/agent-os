from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
from pathlib import Path

import yaml

from . import config
from .store import Problem

WORKER = Path(__file__).with_name("native_worker.py")


def home(profile: dict | None = None) -> Path:
    return config.RUNTIME_HOME / "profiles" / profile["native_name"] if profile else config.RUNTIME_HOME


async def frames(request: dict, profile: dict | None = None):
    if profile and profile.get("_runtime_target", {}).get("machine_id", "local") != "local":
        from .runtime_commands import frames as remote_frames
        async for frame in remote_frames(profile, request):
            yield frame
        return
    if not config.RUNTIME_PYTHON.exists():
        raise Problem("runtime_not_installed", "Install the Agent OS runtime using scripts/setup.sh.", 503)
    env = config.runtime_env()
    env["HERMES_HOME"] = str(home(profile))
    env["ARA_STATE_DIR"] = str(config.STATE)
    process = await asyncio.create_subprocess_exec(str(config.RUNTIME_PYTHON), str(WORKER),
        cwd=config.RUNTIME_SOURCE, env=env, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=12 * 1024 * 1024)
    process.stdin.write((json.dumps(request) + "\n").encode())
    await process.stdin.drain()
    process.stdin.close()
    # Drain bounded native logs separately; never expose environment or credential output.
    async def discard_logs():
        while await process.stderr.read(16384):
            pass
    drain = asyncio.create_task(discard_logs())
    errored = False
    try:
        while line := await process.stdout.readline():
            try:
                frame = json.loads(line)
            except (ValueError, UnicodeError):
                continue
            if isinstance(frame, dict) and frame.get("ara_frame"):
                if frame["type"] in {"error", "unknown"}:
                    errored = True
                yield frame
        code = await process.wait()
        if code and not errored:
            raise Problem("runtime_failed", "The agent runtime stopped. Its native state is retained.", 503)
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), 5)
            except TimeoutError:
                process.kill()
        await drain


async def call(request: dict, profile: dict | None = None):
    result = None
    async for frame in frames(request, profile):
        if frame["type"] == "error":
            raise Problem("runtime_error", frame["data"]["detail"], 502, "Inspect the connection or resume the native session.")
        if frame["type"] == "unknown":
            raise Problem("unknown_outcome", frame["data"]["detail"], 409, "Inspect the native session before retrying.")
        if frame["type"] == "result":
            result = frame["data"]
    return result


async def native_http(method: str, path: str, body=None, profile: dict | None = None, query=None):
    result = await call({"operation": "http", "method": method, "path": path,
                         "params": {**(query or {}), **({"profile": profile["native_name"]} if profile else {})}, "body": body}, profile)
    if result["status"] >= 400:
        detail = result["body"].get("detail", "The native operation was refused.")
        raise Problem("native_operation_refused", str(detail)[:800], result["status"])
    return result["body"]


def safe_asset(profile: dict, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise Problem("invalid_path", "Use a profile-relative asset path.")
    allowed = path.as_posix() in {"SOUL.md", "config.yaml", "memories/MEMORY.md", "memories/USER.md"} or path.parts[0] == "skills"
    if not allowed or any(x.startswith(".") for x in path.parts):
        raise Problem("asset_not_editable", "This asset is managed through its dedicated connection or runtime controls.", 403)
    root = home(profile).resolve()
    target = root / path
    if (any(root.joinpath(*path.parts[:i]).is_symlink() for i in range(1, len(path.parts) + 1)) or
            root not in target.resolve().parents):
        raise Problem("invalid_path", "Asset links outside this profile are not editable.", 403)
    return target


def read_asset(profile: dict, relative: str):
    path = safe_asset(profile, relative)
    content = path.read_text() if path.exists() else ""
    if len(content) > 512_000:
        raise Problem("asset_too_large", "Use node tools for files larger than 512 KB.", 413)
    if relative == "config.yaml":
        # Use native scoped config routes for provider secrets/settings; raw config is read-only in UI.
        value = yaml.safe_load(content) or {}
        content = yaml.safe_dump(redact(value), sort_keys=False)
    return {"path": relative, "content": content, "hash": hashlib.sha256(content.encode()).hexdigest()}


def write_asset(profile: dict, relative: str, content: str, expected_hash: str):
    if relative == "config.yaml":
        raise Problem("use_configuration_api", "Edit configuration through the profile settings controls.", 409)
    path = safe_asset(profile, relative)
    before = read_asset(profile, relative)
    if before["hash"] != expected_hash:
        raise Problem("asset_conflict", "This file changed outside the editor. Reload and compare before saving.", 409)
    if len(content.encode()) > 512_000:
        raise Problem("asset_too_large", "Keep editable assets below 512 KB.", 413)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False, encoding="utf-8") as temp:
        temp.write(content)
        staged = Path(temp.name)
    os.replace(staged, path)
    return read_asset(profile, relative)


def redact(value):
    if isinstance(value, dict):
        return {k: ("[configured]" if isinstance(v, str) and any(s in k.lower() for s in ("api_key", "token", "secret", "password", "authorization")) and v else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value
