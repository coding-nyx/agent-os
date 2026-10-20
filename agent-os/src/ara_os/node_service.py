"""Linux user service for the node control plane; inference stays in native Hermes."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import config, instances, runtime
from .store import Problem


def service(action):
    if sys.platform != "linux" or not shutil.which("systemctl"):
        raise Problem("service_unavailable", "Automatic node service management currently requires Linux with systemd user services", 409)
    name = "ara-node-" + hashlib.sha256(str(config.STATE).encode()).hexdigest()[:12] + ".service"
    root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "systemd/user"
    path = root / name
    def ctl(*args):
        return subprocess.run(["systemctl", "--user", *args], text=True, capture_output=True)
    if action == "install":
        root.mkdir(parents=True, exist_ok=True)
        def quoted(value):
            return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$') + '"'
        command = " ".join(quoted(x) for x in [sys.executable, "-m", "ara_os.cli", "--state", str(config.STATE), "node", "daemon"])
        path.write_text("[Unit]\nDescription=ARA node runtime and coordinator link\nAfter=network.target\n\n[Service]\nType=simple\n"
            + "WorkingDirectory=" + quoted(config.ROOT) + "\nExecStart=" + command
            + "\nRestart=on-failure\nRestartSec=3\nUMask=0077\n\n[Install]\nWantedBy=default.target\n")
        path.chmod(0o600)
        if ctl("daemon-reload").returncode or ctl("enable", "--now", name).returncode:
            raise Problem("service_install_unconfirmed", "The unit was written but the user service manager did not confirm startup. Inspect systemctl --user status " + name, 409)
    elif action == "remove":
        if ctl("disable", "--now", name).returncode:
            raise Problem("service_stop_unconfirmed", "The user service manager did not confirm shutdown", 409)
        path.unlink(missing_ok=True)
        ctl("daemon-reload")
    state = ctl("is-active", name).stdout.strip()
    return {"service": name, "state": state or "unknown", "unit": str(path), "scope": "user",
        "boot": "Starts with the user manager; enable linger separately if required before login"}


async def daemon():
    link = None
    try:
        while True:
            for row in instances.listing():
                if row.get("enabled"):
                    try:
                        result = await runtime.call({"operation": "instance-lifecycle", "action": "status"}, row)
                        if result["state"] != "running":
                            result = await runtime.call({"operation": "instance-lifecycle", "action": "start"}, row)
                        instances.write(row["instance_id"], {"state": result["state"]})
                    except Exception:
                        instances.write(row["instance_id"], {"state": "error"})
            connection = config.STATE / "node-connection.json"
            if connection.exists() and (link is None or link.done()):
                from .cli import node_command
                from argparse import Namespace
                link = asyncio.create_task(node_command(Namespace(action="work", once=False)))
            await asyncio.sleep(20)
    finally:
        if link:
            link.cancel()
            await asyncio.gather(link, return_exceptions=True)
