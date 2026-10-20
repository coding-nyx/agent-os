from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.environ.get("ARA_STATE_DIR", ROOT / ".state")).resolve()
RUNTIME_SOURCE = Path(os.environ.get("ARA_RUNTIME_SOURCE", ROOT / ".runtime/ara-agent"))
RUNTIME_PYTHON = Path(os.environ.get("ARA_RUNTIME_PYTHON", ROOT / ".runtime/env/bin/python"))
RUNTIME_HOME = STATE / "runtime"
DATABASE_URL = os.environ.get("ARA_DATABASE_URL", "postgresql+psycopg://ara_os:ara_os_local@127.0.0.1:55432/ara_os")
API_URL = os.environ.get("ARA_API_URL", "http://127.0.0.1:8787")
UPSTREAM_REVISION = json.loads((ROOT / "compatibility.lock.json").read_text())["runtime"]["revision"]


def private_file(name: str, factory= lambda: secrets.token_urlsafe(32)) -> str:
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = STATE / name
    try:
        with path.open("x", encoding="utf-8") as stream:
            path.chmod(0o600)
            stream.write(factory())
    except FileExistsError:
        pass
    return path.read_text().strip()


def runtime_env() -> dict[str, str]:
    env = {**os.environ, "HERMES_HOME": str(RUNTIME_HOME),
           "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools"),
           "HERMES_DASHBOARD_SESSION_TOKEN": private_file("runtime-token"),
           "HERMES_DISABLE_LAZY_INSTALLS": "1", "PYTHONPATH": str(RUNTIME_SOURCE),
           "UV_CACHE_DIR": os.environ.get("UV_CACHE_DIR", str(ROOT / ".runtime/cache"))}
    driver = next((p for p in (ROOT / ".runtime/tools").glob("cua-driver*/cua-driver") if p.is_file()), None)
    if driver:
        env["HERMES_CUA_DRIVER_CMD"] = str(driver)
        env["PATH"] = f"{driver.parent}:{env.get('PATH', '')}"
    return env
