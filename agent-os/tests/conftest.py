import os
import socket
import subprocess
import time
import uuid
from pathlib import Path

import httpx
import psycopg
from psycopg import sql
import pytest

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def system(tmp_path_factory):
    state = tmp_path_factory.mktemp("ara-state")
    db = "ara_test_" + uuid.uuid4().hex[:10]
    with psycopg.connect("postgresql://ara_os:ara_os_local@127.0.0.1:55432/postgres", autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db)))
    port, provider_port = free_port(), free_port()
    env = {**os.environ, "ARA_STATE_DIR": str(state), "ARA_DATABASE_URL": f"postgresql+psycopg://ara_os:ara_os_local@127.0.0.1:55432/{db}", "ARA_API_URL": f"http://127.0.0.1:{port}"}
    logs = (state / "api.log").open("w")
    provider_logs = (state / "provider.log").open("w")
    provider = subprocess.Popen([str(ROOT / ".venv/bin/python"), "-m", "uvicorn", "tests.provider_fixture:app", "--host", "127.0.0.1", "--port", str(provider_port)], cwd=ROOT, env=env, stdout=provider_logs, stderr=subprocess.STDOUT)
    process = subprocess.Popen([str(ROOT / ".venv/bin/python"), "-m", "uvicorn", "ara_os.app:app", "--host", "127.0.0.1", "--port", str(port)], cwd=ROOT, env=env, stdout=logs, stderr=subprocess.STDOUT)
    client = httpx.Client(base_url=f"http://127.0.0.1:{port}/api/v1", timeout=120)
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError((state / "api.log").read_text()[-4000:])
            try:
                if client.get("/health").status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(.5)
        else:
            raise RuntimeError("Agent OS test API did not become ready")
        yield {"client": client, "state": state, "env": env, "provider_url": f"http://127.0.0.1:{provider_port}/v1", "port": port}
    finally:
        client.close()
        process.terminate(); provider.terminate()
        for child in (process, provider):
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
        # Ask the native supervisor to stop only this test installation.
        native_env = {**env, "HERMES_HOME": str(state / "runtime"), "HERMES_RUNTIME_DIR": str(ROOT / ".runtime/tools"), "HERMES_DISABLE_LAZY_INSTALLS": "1"}
        subprocess.run([str(ROOT / ".runtime/env/bin/python"), "-m", "hermes_cli.main", "gateway", "stop"], cwd=ROOT / ".runtime/ara-agent", env=native_env, capture_output=True, timeout=30)
        logs.close(); provider_logs.close()
        with psycopg.connect("postgresql://ara_os:ara_os_local@127.0.0.1:55432/postgres", autocommit=True) as conn:
            conn.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(db)))
