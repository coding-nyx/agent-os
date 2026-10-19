"""Pinned Hermes adapter implementation; loaded only in the native environment."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path


def run_worker(request):
    from gateway.run import _profile_runtime_scope
    from hermes_cli.config import load_config
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from hermes_state import SessionDB
    from run_agent import AIAgent
    from tools.delegate_tool import _build_child_agent, _run_single_child
    from tools import delegate_tool
    from tools.terminal_tool import record_session_cwd, set_approval_callback

    with _profile_runtime_scope(Path(os.environ["HERMES_HOME"])):
        cfg = load_config()
        model = cfg.get("model") or {}
        if not isinstance(model, dict) or not model.get("default"):
            raise ValueError("Configure a model on this execution node before running a swarm.")
        resolved = resolve_runtime_provider(requested=model.get("provider"), target_model=model["default"])
        if resolved.get("auth_error"):
            raise ValueError("The configured native account could not be resolved.")
        # Deliberately exclude MCP, delegation, memory writes and computer control.
        # New tool capabilities need an explicit adapter policy, not automatic inheritance.
        tools = request["toolsets"]
        if not isinstance(tools, list) or any(t not in {"file", "terminal", "web"} for t in tools):
            raise ValueError("Unsupported swarm worker tool grant.")
        configured = cfg.get("platform_toolsets") or {}
        if "cli" in configured:
            from toolsets import resolve_toolset
            selected = configured["cli"]
            if not isinstance(selected, list):
                raise ValueError("Invalid native profile CLI tool policy")
            allowed = {tool for name in selected for tool in resolve_toolset(name, include_registry=False)}
            if any(not set(resolve_toolset(name, include_registry=False)).issubset(allowed) for name in tools):
                raise ValueError("A requested worker toolset exceeds the native profile's configured CLI capabilities")
        if set(tools) & {"file", "terminal"} and (cfg.get("terminal") or {}).get("backend", "local") not in {"local", ""}:
            raise ValueError("Swarm workspace routing currently requires the local terminal backend")
        # This process executes exactly one bounded leaf. A user's broader native
        # delegation settings must not silently grant recursion or a second worktree.
        delegate_tool._get_max_spawn_depth = lambda: 1
        delegate_tool._get_orchestrator_enabled = lambda: False
        delegate_tool._get_worktree_isolation = lambda: False
        workspace = Path(request["workspace"]).resolve(strict=True)
        scope = str(request["worker_id"])
        db = SessionDB()
        parent = None
        finished = threading.Event()
        try:
            kwargs = {k: resolved[k] for k in ("api_key", "base_url", "provider", "api_mode") if resolved.get(k) is not None}
            parent = AIAgent(model=model["default"], **kwargs, enabled_toolsets=tools,
                disabled_toolsets=["delegation", "computer_use", *((cfg.get("agent") or {}).get("disabled_toolsets") or [])], quiet_mode=True,
                skip_memory=True, skip_context_files=True, session_db=db,
                max_iterations=request["max_iterations"], ephemeral_system_prompt="ARA scoped swarm coordinator.")
            parent._current_task_id = scope
            record_session_cwd(scope, str(workspace))
            def watch_cancel():
                from agent.interrupt_compat import request_hard_interrupt
                while not finished.wait(.2):
                    if Path(request["cancel_path"]).exists():
                        request_hard_interrupt(parent, "ARA swarm cancelled", tool_reason="ARA swarm cancelled")
                        return
            threading.Thread(target=watch_cancel, daemon=True).start()
            # No stdin prompts or blanket approval bypass for unattended workers.
            set_approval_callback(lambda *args, **kw: "deny")
            child = _build_child_agent(task_index=0, goal=request["goal"], context=request.get("context"),
                toolsets=tools, model=None, max_iterations=request["max_iterations"], task_count=1, parent_agent=parent)
            # Bind the native handle durably before inference/tools. A lost
            # transport must not erase the identity needed to inspect its outcome.
            # This is ARA's separate journal, never the native session database.
            from task_journal import Journal
            task_id, worker_id = request["worker_id"].split(":", 1)
            journal = Journal(Path(request["cancel_path"]).parent.parent)
            admission = journal.read(task_id)
            if admission["state"] != "running" or admission["request"]["native_name"] != Path(os.environ["HERMES_HOME"]).name:
                raise ValueError("No matching active ARA admission for this native worker")
            journal.append(task_id, "swarm.worker_bound", {"worker_id": worker_id,
                "native_session_id": getattr(child, "session_id", None)})
            request["_stage"] = "worker.execute"
            result = _run_single_child(0, request["goal"], child=child, parent_agent=parent)
            # Only publish supported result fields, never the resolved credential bundle.
            return {"native_session_id": getattr(child, "session_id", None),
                **{k: result[k] for k in ("status", "summary", "error", "exit_reason", "truncated",
                    "api_calls", "duration_seconds", "input_tokens", "output_tokens", "estimated_cost_usd", "tokens", "cost_usd", "cost_status", "model", "failure_reason", "tool_trace") if k in result}}
        finally:
            finished.set()
            if parent is not None:
                parent.close()
            db.close()


def workspace_operation(request):
    """Git-only workspaces: no silent downgrade to concurrent writes in the source."""
    from tools.subagent_worktree import _run_git
    from hermes_cli._subprocess_compat import noninteractive_repo_git_env
    source = Path(request["source"]).resolve(strict=True)
    target = Path(request["target"]).resolve()
    env = noninteractive_repo_git_env(str(source))
    if env is None:
        raise ValueError("Cannot safely prepare the configured Git workspace")
    def git(args, cwd=source):
        result = _run_git(args, str(cwd), env=env)
        if result.returncode:
            raise ValueError("Git workspace operation failed: " + result.stderr[:500])
        return result.stdout
    if request["action"] == "prepare":
        base = git(["rev-parse", "HEAD"]).strip()
        if git(["status", "--porcelain"]):
            raise ValueError("Commit or stash workspace changes before starting isolated coding workers")
        if target.exists():
            raise ValueError("An execution workspace already exists; inspect it instead of retrying work")
        git(["worktree", "add", "--detach", str(target), base])
        inherited = request.get("prior_artifacts", [])
        for i, artifact in enumerate(inherited):
            if artifact.get("truncated"):
                raise ValueError("A prior stage has incomplete artifacts; inspect before integration")
            if artifact.get("diff"):
                patch = target.parent / f"prior-{i}.patch"
                patch.write_text(artifact["diff"])
                git(["apply", "--check", str(patch)], target)
                git(["apply", str(patch)], target)
            for entry in artifact.get("untracked_files", []):
                relative = Path(entry["path"])
                destination = target / relative
                if relative.is_absolute() or ".." in relative.parts or ".git" in relative.parts or destination.is_symlink() or target not in destination.resolve().parents:
                    raise ValueError("A prior stage contains an unsafe artifact path")
                if destination.exists():
                    raise ValueError("Prior-stage artifacts conflict; inspect before integration")
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(entry["content"])
        if inherited and git(["status", "--porcelain"], target):
            git(["add", "--all"], target)
            git(["-c", "user.name=ARA stage handoff", "-c", "user.email=ara@localhost", "commit", "-m", "ARA inherited stage artifacts"], target)
        prepared = git(["rev-parse", "HEAD"], target).strip()
        (target.parent / "workspace-base.json").write_text(json.dumps({"base_commit": prepared, "source_commit": base}))
        return {"path": str(target), "base_commit": prepared, "source_commit": base, "isolation": "git_worktree"}
    if request["action"] != "collect" or not target.is_dir():
        raise ValueError("Invalid workspace operation")
    baseline = json.loads((target.parent / "workspace-base.json").read_text())
    diff = git(["diff", "--binary", baseline["base_commit"]], target)
    untracked = git(["ls-files", "--others", "--exclude-standard"], target).splitlines()
    files = []
    remaining = max(0, 1_000_000 - len(diff.encode()))
    for relative in untracked[:100]:
        path = target / relative
        if path.is_symlink() or not path.is_file() or target not in path.resolve().parents:
            continue
        size = path.stat().st_size
        if size <= min(remaining, 100000):
            try:
                content = path.read_text()
            except (UnicodeError, OSError):
                continue
            files.append({"path": relative, "content": content})
            remaining -= size
    return {"path": str(target), **baseline,
        "diff": diff[:1_000_000], "untracked_files": files, "truncated": len(diff) > 1_000_000 or len(files) != len(untracked),
        "integration": "not_applied", "isolation": "git_worktree"}


def computer_control(request):
    from tools.computer_use.cua_backend_driver import resolve_cua_driver_cmd
    if request.get("action") == "status":
        import platform
        binary = resolve_cua_driver_cmd()
        return {"installed": bool(binary), "platform": platform.system().lower(),
                "backend": "native", "ready": None,
                "detail": "Driver installed; live readiness is checked on capture." if binary else
                          "Run hermes computer-use install on this execution machine."}
    if not resolve_cua_driver_cmd():
        raise ValueError("Computer control is unavailable: the native driver is not installed.")
    args = request["arguments"]
    if args.get("action") == "capture":
        # Dashboard observation must not invoke an auxiliary vision model or bill
        # inference. Return native pixels/tree directly, not a textual base64 blob.
        from tools.computer_use.cua_backend import CuaDriverBackend
        backend = CuaDriverBackend(permission_mode="standard")
        try:
            backend.start()
            cap = backend.capture(mode=args.get("mode", "vision"), app=args.get("app"))
            return {"success": True, "frame_base64": cap.png_b64, "metadata": {
                "width": cap.width, "height": cap.height, "format": "jpeg" if cap.image_mime_type == "image/jpeg" or (cap.png_b64 or "").startswith("/9j") else "png",
                "app": cap.app, "window_title": cap.window_title,
                "elements": [{"role": e.role, "label": e.label} for e in cap.elements[:200]]}}
        finally:
            backend.stop()
    from tools.computer_use.tool import handle_computer_use, set_approval_callback
    # The owning ARA process already authorized this exact action, not a model argument.
    set_approval_callback(lambda *args, **kw: "once" if request.get("authorized") is True else "deny")
    value = handle_computer_use(args, session_id="ara-managed-computer")
    value = json.loads(value) if isinstance(value, str) else value
    return {"success": not bool(value.get("error")) and value.get("ok", True),
            "output": json.dumps(value), "error": value.get("error"), "metadata": value}
