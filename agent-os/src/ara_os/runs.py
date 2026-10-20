from __future__ import annotations

import asyncio
import hashlib
import logging
from . import profiles, runtime
from .store import Entity, Problem, change, create, event, get, listing, transaction

TASKS: dict[str, asyncio.Task] = {}
MISSING_FAILURE_DETAIL = "The native turn failed without an error detail. Inspect its native receipt and history."


def view(run: dict) -> dict:
    # Historical projections may predate structured diagnostics. Do not invent a cause.
    if run.get("state") == "failed" and not run.get("error"):
        return {**run, "error": MISSING_FAILURE_DETAIL}
    return run


def persist(run_id, type, data):
    with transaction() as session:
        event(session, run_id, type, data)


def apply_frame(session, run_id, conversation_id, frame):
    kind, payload = frame["type"], frame.get("data") or {}
    if kind == "session":
        change(session, conversation_id, {"native_session_id": payload["session_id"]})
        change(session, run_id, {"native_session_id": payload["session_id"], "generation": payload.get("execution_generation", 0)})
    elif kind == "admission":
        change(session, run_id, {"state": "running", "admission_id": payload["admission_id"], "generation": payload.get("execution_generation")})
    elif kind == "event":
        type, data = payload["type"], payload.get("payload", {})
        event(session, run_id, type, data)
        patch = {}
        if payload.get("execution_generation") is not None:
            patch["generation"] = payload["execution_generation"]
        if type in {"approval.request", "clarify.request"}:
            patch.update(state="waiting", prompt=data)
        elif type in {"approval.settled", "clarify.settled"}:
            patch.update(state="running", prompt=None)
        elif type == "message.complete":
            state = "cancelled" if data.get("status") == "interrupted" else "failed" if data.get("error") or data.get("status") in {"error", "failed"} else "succeeded"
            patch.update(state=state, output=data.get("text", ""), usage=data.get("usage"),
                error=data.get("error") or (MISSING_FAILURE_DETAIL if state == "failed" else None), prompt=None)
        if patch:
            change(session, run_id, patch)
    elif kind in {"error", "unknown"}:
        change(session, run_id, {"state": "unknown" if kind == "unknown" else "failed",
            "error": payload.get("detail", "Inspect the native session outcome."), "error_code": payload.get("code"),
            "error_stage": payload.get("stage"), "recovery_action": payload.get("action"), "prompt": None})
    elif kind == "receipt":
        change(session, run_id, terminal_patch(payload))


def request_for(run, conversation, text, model=None):
    req = {"operation": "run", "session_id": conversation.get("native_session_id"),
        "conversation_id": conversation["id"], "submission_id": run["id"], "title": conversation["title"], "text": text}
    if model:
        req["model"] = model
    return req


async def execute(run: dict, profile: dict, conversation: dict, text: str):
    try:
        with transaction() as session:
            change(session, run["id"], {"state": "running"})
        conn = profiles.resolve_model_connection(profile)
        async for frame in runtime.frames(request_for(run, conversation, text, (conn or {}).get("model")), profile):
            with transaction() as session:
                apply_frame(session, run["id"], conversation["id"], frame)
    except Exception:
        logging.getLogger("ara").exception("Run %s transport failed", run["id"])
        with transaction() as session:
            change(session, run["id"], {"state": "unknown", "error": "The runtime connection stopped. Inspect the native session before retrying."})
    finally:
        TASKS.pop(run["id"], None)


def submit(conversation_id: str, text: str, operation_id: str):
    id = hashlib.sha256(f"run:{conversation_id}:{operation_id}".encode()).hexdigest()
    with transaction() as session:
        from sqlalchemy import select
        session.scalar(select(Entity).where(Entity.id == conversation_id, Entity.kind == "conversation").with_for_update())
        conversation = get(session, conversation_id, "conversation")
        profile = get(session, conversation["profile_id"], "profile")
        if session.get(Entity, id):
            prior = get(session, id)
            if prior["input"] != text:
                raise Problem("idempotency_conflict", "This operation ID was already used with another message.", 409)
            return prior
        if not profile["enabled"]:
            raise Problem("profile_disabled", "Enable this profile before starting managed work.", 409)
        from .runtime_commands import selected, enqueue
        profile = selected(profile, machine_id="local" if not conversation.get("runtime_owner") and conversation.get("native_session_id") else None,
            pinned=conversation.get("runtime_owner"))
        owner = profile["_runtime_target"]
        if not conversation.get("runtime_owner"):
            conversation = change(session, conversation_id, {"runtime_owner": owner})
        remote = owner["machine_id"] != "local"
        if not remote and profile.get("provision_state") != "ready":
            raise Problem("profile_not_ready", "Finish the profile's runtime setup first.", 409)
        if not remote and not profiles.resolve_model_connection(profile):
            raise Problem("model_not_configured", "Configure a model connection for this profile before starting a conversation.", 409)
        turns = [r for r in listing(session, "run") if r.get("conversation_id") == conversation_id]
        if any(r["state"] in {"running", "waiting", "accepted", "cancel_requested", "unknown"} for r in turns):
            raise Problem("conversation_busy", "This conversation already has a pending turn. Wait or cancel it first.", 409)
        if not remote and (conversation.get("native_session_id") or turns):
            from .native_diagnostics import session_recovery
            recovery = session_recovery(runtime.home(profile), session_id=conversation.get("native_session_id"),
                                        request_id=conversation["id"])
            if recovery:
                raise Problem(recovery["code"], recovery["detail"], 409, recovery["action"])
        run = create(session, "run", {"profile_id": profile["id"], "conversation_id": conversation_id,
            "input": text, "output": "", "state": "accepted", "audience": "application", "runtime_owner": owner}, id=id)
        if remote:
            command_id = enqueue(session, owner, request_for(run, conversation, text), operation_id=id,
                run_id=id, conversation_id=conversation_id)
            change(session, id, {"runtime_command_id": command_id})
            return run
    TASKS[id] = asyncio.create_task(execute(run, profile, conversation, text))
    return run


def conversation_recovery(conversation: dict, turns: list[dict]) -> dict | None:
    if (conversation.get("runtime_owner") or {}).get("machine_id", "local") != "local":
        return None  # Remote diagnostics belong to native history on the owner.
    if not turns or turns[-1]["state"] != "failed":
        return None
    if any(r["state"] in {"running", "waiting", "accepted", "cancel_requested", "unknown"} for r in turns):
        return None
    from .native_diagnostics import session_recovery
    with transaction() as session:
        profile = get(session, conversation["profile_id"], "profile")
    return session_recovery(runtime.home(profile), session_id=conversation.get("native_session_id"),
                            request_id=conversation["id"])


def restart_conversation(conversation_id: str):
    # The source row serializes repeated recovery clicks. No prompt is submitted.
    from sqlalchemy import select
    with transaction() as session:
        row = session.scalar(select(Entity).where(Entity.id == conversation_id,
            Entity.kind == "conversation").with_for_update())
        if row is None:
            raise Problem("not_found", "This conversation no longer exists.", 404)
        conversation = get(session, conversation_id, "conversation")
        if conversation.get("recovery_conversation_id"):
            return get(session, conversation["recovery_conversation_id"], "conversation")
        turns = [r for r in listing(session, "run") if r.get("conversation_id") == conversation_id]
        if not conversation_recovery(conversation, turns):
            raise Problem("recovery_unavailable", "No confirmed missing-model session can be replaced. "
                          "Inspect pending or uncertain work before starting again.", 409)
        profile = get(session, conversation["profile_id"], "profile")
        if not profile.get("enabled") or profile.get("provision_state") != "ready":
            raise Problem("profile_not_ready", "Enable the profile and finish its runtime setup first.", 409)
        if not profiles.resolve_model_connection(profile):
            raise Problem("model_not_configured", "Select a model in Connections before starting a fresh conversation.", 409)
        replacement = create(session, "conversation", {"profile_id": profile["id"],
            "title": conversation["title"][:110] + " · fresh", "audience": "application",
            "recovery_of": conversation_id})
        change(session, conversation_id, {"recovery_conversation_id": replacement["id"]})
        return replacement


async def control(run: dict, action: str, choice: str | None = None):
    with transaction() as session:
        profile = get(session, run["profile_id"], "profile")
    from .runtime_commands import selected
    profile = selected(profile, machine_id="local" if not run.get("runtime_owner") else None, pinned=run.get("runtime_owner"))
    if not run.get("native_session_id") or not run.get("admission_id"):
        raise Problem("not_admitted", "The native runtime has not admitted this turn yet.", 409)
    params = {"session_id": run["native_session_id"], "execution_generation": run.get("generation") or 0}
    if action == "cancel":
        receipt = await runtime.call({"operation": "rpc", "method": "prompt.receipt", "params": {
            "session_id": run["native_session_id"], "admission_id": run["admission_id"], "include_result": True}}, profile)
        if receipt["status"] == "terminal":
            return {"state": "already_terminal", "receipt": receipt}
        if receipt["status"] == "queued":
            result = await runtime.call({"operation": "rpc", "method": "prompt.cancel", "params": {
                "session_id": run["native_session_id"], "admission_id": run["admission_id"]}}, profile)
            with transaction() as session:
                change(session, run["id"], {"state": "cancelled"})
            return result
        if receipt["status"] == "unknown":
            raise Problem("unknown_outcome", "This task has an uncertain outcome. Inspect its native history before resolving it.", 409)
        params["execution_generation"] = receipt.get("execution_generation") or params["execution_generation"]
        method = "session.interrupt"
    else:
        prompt = run.get("prompt") or {}
        method = "clarify.respond" if prompt.get("kind") == "clarify" else "approval.respond"
        if not prompt.get("prompt_id"):
            raise Problem("no_pending_approval", "There is no pending approval for this run.", 409)
        params.update(prompt_id=prompt["prompt_id"])
        params["answer" if method == "clarify.respond" else "choice"] = choice
    result = await runtime.call({"operation": "rpc", "method": method, "params": params}, profile)
    return result


def terminal_patch(receipt):
    result = receipt.get("result") or {}
    outcome = receipt.get("outcome")
    return {"state": "succeeded" if outcome == "completed" else "cancelled" if outcome in {"interrupted", "cancelled"} else "failed",
            "output": result.get("final_response", result.get("text", "")) if isinstance(result, dict) else str(result),
            "error": (result.get("error") if isinstance(result, dict) else None) or (
                MISSING_FAILURE_DETAIL
                if outcome not in {"completed", "interrupted", "cancelled"} else None),
            "usage": receipt.get("usage"), "prompt": None, "receipt": receipt}


async def reconcile(run):
    if not run.get("native_session_id") or not run.get("admission_id"):
        raise Problem("no_native_receipt", "The runtime did not confirm admission. Inspect native history before resubmitting.", 409)
    with transaction() as session:
        profile = get(session, run["profile_id"], "profile")
    from .runtime_commands import selected
    profile = selected(profile, machine_id="local" if not run.get("runtime_owner") else None, pinned=run.get("runtime_owner"))
    receipt = await runtime.call({"operation": "rpc", "method": "prompt.receipt", "params": {
        "session_id": run["native_session_id"], "admission_id": run["admission_id"], "include_result": True}}, profile)
    with transaction() as session:
        if receipt["status"] == "terminal":
            return change(session, run["id"], terminal_patch(receipt))
        # Inspection never submits a prompt or certifies an unobserved completion.
        return change(session, run["id"], {"receipt": receipt,
            "error": "Native outcome: " + receipt["status"] + ". Inspect again or stop native work before starting another turn."})
