"""Driver discovery and explicit setup, executed in the native environment."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def driver():
    from tools.computer_use.cua_backend_driver import resolve_cua_driver_cmd
    selected = resolve_cua_driver_cmd()
    if selected:
        return selected, "configured" if os.environ.get("HERMES_CUA_DRIVER_CMD") else "managed"
    if os.environ.get("HERMES_CUA_DRIVER_CMD"):
        return None, "invalid_override"  # Never silently replace an explicit selection.
    candidates = [(shutil.which("cua-driver"), "PATH")]
    # The user's ordinary Hermes installation can own a driver outside ARA's
    # shared runtime store. Read that installation's selection without installing.
    previous_store = os.environ.get("HERMES_RUNTIME_DIR")
    try:
        from hermes_constants import get_default_hermes_root
        from pm import installed_package
        os.environ["HERMES_RUNTIME_DIR"] = str(get_default_hermes_root() / "tools")
        package = installed_package("cua-driver")
        if package and package.binary:
            candidates.append((str(package.binary), "existing_hermes"))
    except (ImportError, OSError, ValueError):
        pass
    finally:
        if previous_store is None:
            os.environ.pop("HERMES_RUNTIME_DIR", None)
        else:
            os.environ["HERMES_RUNTIME_DIR"] = previous_store
    if sys.platform == "darwin":
        candidates += [(str(p / "CuaDriver.app/Contents/MacOS/cua-driver"), "existing_app")
            for p in (Path("/Applications"), Path.home() / "Applications")]
    for binary, source in candidates:
        if binary and Path(binary).is_file() and os.access(binary, os.X_OK):
            os.environ["HERMES_CUA_DRIVER_CMD"] = binary
            return binary, source
    return None, "not_detected"


def status():
    binary, source = driver()
    return {"installed": bool(binary), "driver_path": binary, "driver_source": source,
        "platform": sys.platform, "backend": "native", "ready": None,
        "detail": "Driver detected; check permissions, then capture explicitly to verify access." if binary else
            "The configured driver path is invalid; correct HERMES_CUA_DRIVER_CMD on this machine." if source == "invalid_override" else
            "Driver not found in this worker's runtime or PATH. Check the existing installation before installing another copy."}


def run(request):
    action = request.get("action")
    if action not in {"check", "request_permissions", "install"}:
        raise ValueError("Choose a supported desktop setup action")
    if action == "install":
        # An existing app/override is kept; installation is always an explicit action.
        binary, _ = driver()
        if not binary:
            from hermes_cli.tools_config_cua import install_cua_driver
            if not install_cua_driver(show_installer_progress=False):
                raise ValueError("Native driver setup failed; inspect the node's setup logs")
    result = status()
    binary = result["driver_path"]
    result.update(can_request_permissions=sys.platform == "darwin", accessibility=None, screen_recording=None,
        screen_recording_capturable=None, capture_verified=False)
    if not binary:
        return {"success": False, "diagnostics": result, "error": result["detail"]}
    from tools.computer_use.permissions import _child_env
    env = _child_env()
    if action == "request_permissions":
        if sys.platform != "darwin":
            raise ValueError("This operating system has no macOS permission dialogs")
        # cua-driver launches its signed app via LaunchServices for correct TCC
        # attribution. Starting this process is not proof that a user granted it.
        state = Path(os.environ["ARA_STATE_DIR"])
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (state / "computer-permissions.log").open("ab") as output:
            os.chmod(output.name, 0o600)
            process = subprocess.Popen([binary, "permissions", "grant"], env=env,
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        return {"success": True, "request_started": True, "pid": process.pid,
            "diagnostics": result, "detail": "Permission request started on this Mac. Approve CuaDriver in System Settings, then check again."}
    try:
        version = subprocess.run([binary, "--version"], env=env, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=3)
        result["version"] = version.stdout.strip()[:100] or None
        if sys.platform == "darwin":
            probe = subprocess.run([binary, "permissions", "status", "--json"], env=env, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, timeout=8)
            permissions = json.loads(probe.stdout)
            for key in ("accessibility", "screen_recording", "screen_recording_capturable"):
                result[key] = permissions.get(key) if isinstance(permissions.get(key), bool) else None
            if result["accessibility"] is not None and result["screen_recording"] is not None:
                result["ready"] = result["accessibility"] and result["screen_recording"]
    except (OSError, ValueError, subprocess.TimeoutExpired):
        result["detail"] = "Driver found, but its permission check did not complete. Inspect the installed driver and check again."
    return {"success": True, "diagnostics": result}
