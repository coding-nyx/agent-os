"""Exact-window desktop transport, loaded only inside the pinned native runtime."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import time
import uuid


def process_identity(pid):
    import psutil
    try:
        process = psutil.Process(pid)
        return {"pid": process.pid, "started": process.create_time()}
    except (psutil.Error, TypeError, ValueError) as exc:
        raise ValueError("Target process cannot be verified; capture a fresh window") from exc


def observation_directory():
    state = Path(os.environ.get("ARA_STATE_DIR", Path(__file__).resolve().parents[2] / ".state"))
    directory = state / "computer-observations"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # References expire quickly; durable input receipts live in a separate directory.
    for path in directory.glob("*.json"):
        try:
            if time.time() - path.stat().st_mtime > 120:
                path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass
    return directory


def check_policy(directory, request):
    path = directory.parent / "computer-policy.json"
    epoch = json.loads(path.read_text())["epoch"] if path.exists() else 0
    if request.get("policy_epoch") != epoch:
        raise ValueError("Computer policy changed before dispatch; capture a fresh window")


def window_identity(backend, target):
    windows = [w for w in backend.list_windows() if all(w.get(k) == target.get(k) for k in ("pid", "window_id"))]
    if len(windows) != 1 or windows[0].get("off_screen"):
        raise ValueError("The observed window is unavailable or ambiguous; capture a fresh window")
    window = windows[0]
    return {k: window[k] for k in ("pid", "window_id", "app_name", "title")}


def metadata(cap):
    return {"width": cap.width, "height": cap.height,
        "format": "jpeg" if cap.image_mime_type == "image/jpeg" or (cap.png_b64 or "").startswith("/9j") else "png",
        "app": cap.app, "window_title": cap.window_title,
        "elements": [{"index": e.index, "role": e.role, "label": e.label, "bounds": list(e.bounds)} for e in cap.elements[:200]]}


def control(request):
    from .native_computer_setup import driver, status
    if request.get("action") == "status":
        return status()
    if not driver()[0]:
        raise ValueError("Computer control is unavailable: this worker cannot locate the native driver. Check desktop setup.")
    if request.get("authorized") is not True or not isinstance(request.get("actor"), str) or not request["actor"]:
        raise ValueError("A managed computer action requires an authorized actor")

    from tools.bot_desktop import lease, runtime as desktop_runtime
    from tools.computer_use import tool
    from tools.computer_use.cua_backend import CuaDriverBackend, desktop_identity
    admitted = lease.assert_agent_may_act()
    desktop_runtime.ensure_started_for_tool()
    session = "ara-managed-" + uuid.uuid4().hex
    args = dict(request["arguments"])
    directory = observation_directory()
    try:
        with tool._backend_for_call(session) as backend:
            if not isinstance(backend, CuaDriverBackend):
                raise ValueError("This configured backend has no validated exact-window adapter")
            desktop = desktop_identity()
            if args.get("action") == "capture":
                cap = backend.capture(mode=args.get("mode", "vision"), app=args.get("app"))
                result = {"success": True, "frame_base64": cap.png_b64, "metadata": metadata(cap)}
                if not cap.png_b64 and args.get("mode", "vision") != "ax":
                    raise ValueError("The native backend returned no screenshot")
                if cap.png_b64:
                    if cap.width <= 0 or cap.height <= 0:
                        raise ValueError("The native capture has no valid geometry")
                    target = window_identity(backend, backend._last_target or {})
                    reference = uuid.uuid4().hex
                    value = {"actor": request["actor"], "created": time.time(), "desktop": desktop,
                        "target": target, "target_process": process_identity(target["pid"]),
                        "owner_process": process_identity(request["owner_pid"]),
                        "width": cap.width, "height": cap.height, "policy_epoch": request.get("policy_epoch")}
                    with (directory / (reference + ".json")).open("x") as stream:
                        os.chmod(stream.name, 0o600)
                        json.dump(value, stream)
                    result["metadata"]["observation_ref"] = reference
                if lease.get().epoch != admitted.epoch:
                    raise ValueError("Desktop authority changed during capture; capture a fresh window")
                return result

            reference = request.get("observation_ref", "")
            if not isinstance(reference, str) or not re.fullmatch(r"[a-f0-9]{32}", reference):
                raise ValueError("Capture a fresh target window before sending input")
            try:
                observed = json.loads((directory / (reference + ".json")).read_text())
            except (FileNotFoundError, ValueError) as exc:
                raise ValueError("Observation is unavailable; capture a fresh window") from exc
            if (observed["actor"] != request["actor"] or time.time() - observed["created"] > 15 or
                    observed["desktop"] != desktop or observed["policy_epoch"] != request.get("policy_epoch") or
                    process_identity(observed["owner_process"]["pid"]) != observed["owner_process"] or
                    process_identity(observed["target_process"]["pid"]) != observed["target_process"]):
                raise ValueError("Observation authority or desktop changed; capture a fresh window")
            target = observed["target"]
            if window_identity(backend, target) != target:
                raise ValueError("The observed target changed; capture a fresh window")
            # A native exact capture selects the target through the supported API.
            # The same backend remains locked through the native safety dispatch.
            cap = backend.capture(mode="vision", app=target["app_name"], pid=target["pid"], window_id=target["window_id"])
            if not cap.png_b64 or (cap.width, cap.height) != (observed["width"], observed["height"]):
                raise ValueError("Target geometry changed; capture a fresh window")
            if (window_identity(backend, target) != target or lease.get().epoch != admitted.epoch or
                    time.time() - observed["created"] > 15 or
                    desktop_identity() != desktop or
                    process_identity(target["pid"]) != observed["target_process"] or
                    process_identity(observed["owner_process"]["pid"]) != observed["owner_process"]):
                raise ValueError("The observed target or authority changed; capture a fresh window")
            check_policy(directory, request)
            # app is a native mismatch guard; PID/window IDs are never model arguments.
            args["app"] = target["app_name"]
            from tools.approval import approve_session, clear_session
            from tools.approval_context import set_current_session_key, reset_current_session_key
            # Native unattended gates intentionally ignore an interactive callback.
            # This unique session contains exactly one authorized background action;
            # no permanent grant or general approval bypass is installed.
            token = set_current_session_key(session)
            approve_session(session, f"cua:{args['action']}:background")
            try:
                request["_stage"] = "computer.execute"
                value = tool.handle_computer_use(args, session_id=session)
            finally:
                clear_session(session)
                reset_current_session_key(token)
            value = json.loads(value) if isinstance(value, str) else value
            return {"success": not bool(value.get("error")) and value.get("ok", True),
                "output": json.dumps(value), "error": value.get("error") or
                    (value.get("message") if value.get("ok") is False else None), "metadata": value}
    finally:
        tool.release_computer_use_session(session)
