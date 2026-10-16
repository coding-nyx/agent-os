from __future__ import annotations

import asyncio
import hashlib
import logging


from . import runtime
from .store import Entity, Problem, change, create, event, get, listing, transaction

TASKS: dict[str, asyncio.Task] = {}


def persist(run_id, type, data):
    with transaction() as session:
        event(session, run_id, type, data)


async def execute(run: dict, profile: dict, conversation: dict, text: str):
    last_generation = None
    try:
        with transaction() as session:
            change(session, run["id"], {"state": "running"})
        async for frame in runtime.frames({"operation": "run", "session_id": conversation.get("native_session_id"),
            "conversation_id": conversation["id"], "submission_id": run["id"], "title": conversation["title"], "text": text}, profile):
            kind, payload = frame["type"], frame["data"]
            if kind == "session":
                with transaction() as session:
                    change(session, conversation["id"], {"native_session_id": payload["session_id"]})
                    change(session, run["id"], {"native_session_id": payload["session_id"], "generation": payload.get("execution_generation", 0)})
            elif kind == "admission":
                with transaction() as session:
                    change(session, run["id"], {"admission_id": payload["admission_id"], "generation": payload.get("execution_generation")})
            elif kind == "event":
                type, data = payload["type"], payload.get("payload", {})
                if payload.get("execution_generation") is not None and payload["execution_generation"] != last_generation:
                    last_generation = payload["execution_generation"]
                    with transaction() as session:
                        change(session, run["id"], {"generation": payload["execution_generation"]})
                persist(run["id"], type, data)
                if type in {"approval.request", "clarify.request"}:
                    with transaction() as session:
                        change(session, run["id"], {"state": "waiting", "prompt": data, "generation": payload.get("execution_generation")})
                elif type in {"approval.settled", "clarify.settled"}:
                    with transaction() as session:
                        change(session, run["id"], {"state": "running", "prompt": None})
                elif type == "message.complete":
                    with transaction() as session:
                        state = "cancelled" if data.get("status") == "interrupted" else "failed" if data.get("error") or data.get("status") in {"error", "failed"} else "succeeded"
                        change(session, run["id"], {"state": state, "output": data.get("text", ""), "usage": data.get("usage"), "error": data.get("error"), "prompt": None})
            elif kind in {"error", "unknown"}:
                with transaction() as session:
                    change(session, run["id"], {"state": "unknown" if kind == "unknown" else "failed", "error": payload.get("detail", "Inspect the native session outcome.")})
            elif kind == "receipt":
                with transaction() as session:
                    change(session, run["id"], terminal_patch(payload))
    except Exception:
        logging.getLogger("ara").exception("Run %s transport failed", run["id"])
        with transaction() as session:
            change(session, run["id"], {"state": "unknown", "error": "The runtime connection stopped. Inspect the native session before retrying."})
    finally:
        TASKS.pop(run["id"], None)


def submit(conversation_id: str, text: str, operation_id: str):
    id = hashlib.sha256(f"run:{conversation_id}:{operation_id}".encode()).hexdigest()
    with transaction() as session:
        conversation = get(session, conversation_id, "conversation")
        profile = get(session, conversation["profile_id"], "profile")
        if not profile["enabled"]:
            raise Problem("profile_disabled", "Enable this profile before starting managed work.", 409)
        if profile.get("provision_state") != "ready":
            raise Problem("profile_not_ready", "Finish the profile's runtime setup first.", 409)
        if session.get(Entity, id):
            prior = get(session, id)
            if prior["input"] != text:
                raise Problem("idempotency_conflict", "This operation ID was already used with another message.", 409)
            return prior
        if any(r.get("conversation_id") == conversation_id and r["state"] in {"running", "waiting", "accepted", "cancel_requested", "unknown"} for r in listing(session, "run")):
            raise Problem("conversation_busy", "This conversation already has a pending turn. Wait or cancel it first.", 409)
        run = create(session, "run", {"profile_id": profile["id"], "conversation_id": conversation_id,
            "input": text, "output": "", "state": "accepted", "audience": "application"}, id=id)
    TASKS[id] = asyncio.create_task(execute(run, profile, conversation, text))
    return run


async def control(run: dict, action: str, choice: str | None = None):
    with transaction() as session:
        profile = get(session, run["profile_id"], "profile")
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
            "error": result.get("error") if isinstance(result, dict) else None,
            "usage": receipt.get("usage"), "prompt": None, "receipt": receipt}


async def reconcile(run):
    if not run.get("native_session_id") or not run.get("admission_id"):
        raise Problem("no_native_receipt", "The runtime did not confirm admission. Inspect native history before resubmitting.", 409)
    with transaction() as session:
        profile = get(session, run["profile_id"], "profile")
    receipt = await runtime.call({"operation": "rpc", "method": "prompt.receipt", "params": {
        "session_id": run["native_session_id"], "admission_id": run["admission_id"], "include_result": True}}, profile)
    with transaction() as session:
        if receipt["status"] == "terminal":
            return change(session, run["id"], terminal_patch(receipt))
        # Inspection never submits a prompt or certifies an unobserved completion.
        return change(session, run["id"], {"receipt": receipt,
            "error": "Native outcome: " + receipt["status"] + ". Inspect again or stop native work before starting another turn."})
