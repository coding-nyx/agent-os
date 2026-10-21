"""User service for the node control plane; inference stays in native Hermes."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

from . import config, instances, runtime
from .store import Problem


def service(action):
    digest = hashlib.sha256(str(config.STATE).encode()).hexdigest()[:12]
    if sys.platform == "darwin":
        executable = shutil.which("launchctl")
        if not executable:
            raise Problem("service_unavailable", "launchctl is required for macOS node service management", 409)
        name = f"com.ara.node.{digest}"
        path = Path.home() / "Library/LaunchAgents" / f"{name}.plist"
        domain = f"gui/{os.getuid()}"
        def ctl(*args):
            return subprocess.run([executable, *args], text=True, capture_output=True)
        def loaded():
            return ctl("print", f"{domain}/{name}").returncode == 0
        if action == "install":
            path.parent.mkdir(parents=True, exist_ok=True)
            ara = shutil.which("ara") or str(Path(sys.executable).parent / "ara")
            plist = {
                "Label": name,
                "ProgramArguments": [ara, "--state", str(config.STATE), "node", "daemon"],
                "WorkingDirectory": str(config.ROOT),
                "RunAtLoad": True,
                "KeepAlive": True,
                "Umask": 0o077,
                "StandardOutPath": str(config.STATE / "logs/node-service.log"),
                "StandardErrorPath": str(config.STATE / "logs/node-service-error.log"),
                "EnvironmentVariables": {"ARA_STATE_DIR": str(config.STATE),
                    "PATH": str(Path.home() / ".local/bin") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"},
            }
            config.STATE.joinpath("logs").mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".plist.tmp")
            temporary.write_bytes(plistlib.dumps(plist, fmt=plistlib.FMT_XML, sort_keys=True))
            temporary.chmod(0o600)
            os.replace(temporary, path)
            path.chmod(0o600)
            if loaded() and ctl("bootout", f"{domain}/{name}").returncode:
                raise Problem("service_restart_unconfirmed", "The existing node service could not be stopped before updating its LaunchAgent", 409)
            result = ctl("bootstrap", domain, str(path))
            if result.returncode:
                raise Problem("service_install_unconfirmed", "The LaunchAgent was written but launchd did not confirm startup. Inspect with launchctl print " + domain + "/" + name, 409)
        elif action == "remove":
            if loaded() and ctl("bootout", f"{domain}/{name}").returncode:
                raise Problem("service_stop_unconfirmed", "launchd did not confirm shutdown; the LaunchAgent file was preserved", 409)
            path.unlink(missing_ok=True)
        state = "running" if loaded() else "stopped"
        return {"service": name, "state": state, "unit": str(path), "scope": "user",
            "boot": "Starts at graphical login and stays running while that user session is active"}
    if sys.platform != "linux" or not shutil.which("systemctl"):
        raise Problem("service_unavailable", "Automatic node service management requires Linux systemd user services or macOS launchd", 409)
    name = "ara-node-" + digest + ".service"
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
            if link is not None and link.done() and link.result() == 75:
                return 75
            if connection.exists() and (link is None or link.done()):
                from .cli import node_command
                from argparse import Namespace
                link = asyncio.create_task(node_command(Namespace(action="_work", once=False)))
            await asyncio.sleep(20)
    finally:
        if link:
            link.cancel()
            await asyncio.gather(link, return_exceptions=True)
