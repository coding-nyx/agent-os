from __future__ import annotations

from . import domains
from .cua.tools import CUA_TOOLS, invoke_cua_tool
from .store import Problem, get, transaction

TOOLS = [
    {"name": "ara_list_datasets", "description": "List this agent's explicitly bound ARA datasets and permissions.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "ara_list_records", "description": "Read records from a bound ARA dataset. Financial amounts are exact decimal strings.", "inputSchema": {"type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"], "additionalProperties": False}},
    {"name": "ara_add_record", "description": "Commit a validated record to a dataset with write access. Use a stable operation_id to prevent duplicate writes.", "inputSchema": {"type": "object", "properties": {"dataset_id": {"type": "string"}, "payload": {"type": "object"}, "operation_id": {"type": "string"}}, "required": ["dataset_id", "payload", "operation_id"], "additionalProperties": False}},
    {"name": "ara_list_agents", "description": "List only the specialist profiles explicitly permitted for delegation.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "ara_delegate_task", "description": "Start one scoped specialist task. Returns a task ID; inspect it using ara_get_task. Reuse operation_id on retries.", "inputSchema": {"type": "object", "properties": {"profile_id": {"type": "string"}, "text": {"type": "string"}, "operation_id": {"type": "string"}}, "required": ["profile_id", "text", "operation_id"], "additionalProperties": False}},
    {"name": "ara_get_task", "description": "Inspect a specialist task started by this profile. A pending or unknown task is not permission to run it again.", "inputSchema": {"type": "object", "properties": {"run_id": {"type": "string"}}, "required": ["run_id"], "additionalProperties": False}},
    {"name": "ara_list_swarms", "description": "List available swarm presets and check whether swarm coordination is enabled for this profile.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "ara_spawn_swarm", "description": "Start scoped native workers on this profile's assigned machine. Dependent stages run in order; independent workers run concurrently. Results are self-reports, not verified facts. Reuse operation_id after disconnects.", "inputSchema": {"type": "object", "properties": {"preset": {"type": "string", "enum": ["research", "coding", "analysis", "custom"]}, "task": {"type": "string", "minLength": 1, "maxLength": 20000}, "operation_id": {"type": "string", "minLength": 1, "maxLength": 120}, "custom_roles": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"role": {"type": "string"}, "objective": {"type": "string"}, "stage": {"type": "integer", "minimum": 0, "maximum": 7}}, "required": ["role", "objective"], "additionalProperties": False}}}, "required": ["preset", "task", "operation_id"], "additionalProperties": False}},
    {"name": "ara_get_swarm", "description": "Inspect a swarm execution started by this profile. Returns worker status, worker outputs, and synthesized outcome.", "inputSchema": {"type": "object", "properties": {"swarm_id": {"type": "string"}}, "required": ["swarm_id"], "additionalProperties": False}},
    {"name": "ara_cancel_swarm", "description": "Request cancellation of a swarm owned by this profile. Cancellation is not confirmation that in-flight OS actions were undone.", "inputSchema": {"type": "object", "properties": {"swarm_id": {"type": "string"}}, "required": ["swarm_id"], "additionalProperties": False}},
] + CUA_TOOLS


def invoke(profile_id: str, name: str, args: dict):
    import hashlib
    from .store import Entity, create
    from . import runs, swarms
    delegation = None
    with transaction() as session:
        profile = get(session, profile_id, "profile")
        if not profile["enabled"]:
            raise Problem("profile_disabled", "This profile is disabled.", 403)
        bindings = {b["dataset_id"]: b["access"] for b in profile.get("bindings", [])}
        if name == "ara_list_swarms":
            cfg = swarms.get_profile_swarm_config(profile)
            return {
                "enabled": cfg["enabled"],
                "trigger_mode": cfg["trigger_mode"],
                "allowed_presets": [p for p in swarms.SWARM_PRESETS if p["id"] in cfg["allowed_presets"]]
            }
        if name == "ara_spawn_swarm":
            preset = args.get("preset", "research")
            task_text = args.get("task", "")
            op_id = args.get("operation_id", "")
            roles = args.get("custom_roles")
            swarm_record = swarms.spawn_swarm(session, profile_id, None, preset, task_text, op_id, roles)
            return {
                "swarm_id": swarm_record["id"],
                "state": swarm_record["state"],
                "preset": swarm_record["preset"],
                "owner_machine": swarm_record["owner_machine"],
                "workers": [{"id": w["id"], "role": w["role"], "objective": w["objective"]} for w in swarm_record.get("workers", [])]
            }
        if name in {"ara_get_swarm", "ara_cancel_swarm"}:
            task = get(session, args["swarm_id"], "swarm_run")
            if task.get("profile_id") != profile_id:
                raise Problem("swarm_not_owned", "This profile did not start that swarm.", 403)
            if name == "ara_cancel_swarm":
                from .store import change
                from .task_journal import TERMINAL
                if task["state"] not in TERMINAL:
                    task = change(session, task["id"], {"cancel_requested": True})
                return {"id": task["id"], "state": task["state"], "cancel_requested": task.get("cancel_requested", False)}
            return {
                "id": task["id"],
                "preset": task["preset"],
                "state": task["state"],
                "task": task["task"],
                "workers": task.get("workers", []),
                "synthesized_output": task.get("synthesized_output"),
                "error": task.get("error"),
                "owner_machine": task.get("owner_machine"), "event_cursor": task.get("event_cursor"),
                "native_snapshot_id": task.get("native_snapshot_id"), "usage": task.get("usage")
            }
        if name.startswith("ara_cua_"):
            raise Problem("async_control_required", "Computer tools require the asynchronous authorized dispatcher", 409)
        if name == "ara_list_agents":
            return [{k: p.get(k) for k in ("id", "name", "description", "enabled")} for target in profile.get("delegation_targets", []) for p in [get(session, target, "profile")]]
        if name == "ara_get_task":
            task = get(session, args["run_id"], "run")
            conversation = get(session, task["conversation_id"], "conversation")
            if conversation.get("delegated_by") != profile_id:
                raise Problem("task_not_owned", "This profile did not start that task.", 403)
            return {k: task.get(k) for k in ("id", "state", "output", "error")}
        if name == "ara_delegate_task":
            target = args.get("profile_id")
            if target not in profile.get("delegation_targets", []):
                raise Problem("agent_not_bound", "This specialist is not an allowed delegation target.", 403)
            if not str(args.get("text", "")).strip() or len(str(args["text"])) > 10000:
                raise Problem("invalid_task", "Provide a scoped task shorter than 10,000 characters.")
            cid = hashlib.sha256(f"delegation:{profile_id}:{target}:{args['operation_id']}".encode()).hexdigest()
            if session.get(Entity, cid) is None:
                create(session, "conversation", {"profile_id": target, "title": "Delegated task", "audience": "application", "delegated_by": profile_id}, id=cid)
            delegation = (cid, args["text"], args["operation_id"])
        if delegation is not None:
            pass
        elif name == "ara_list_datasets":
            return [{**get(session, id, "dataset"), "access": access} for id, access in bindings.items()]
        else:
            id = args.get("dataset_id")
            if id not in bindings:
                raise Problem("dataset_not_bound", "This profile does not have access to that dataset.", 403)
            if name == "ara_list_records":
                return domains.records(session, id)
            if name == "ara_add_record":
                if bindings[id] != "write":
                    raise Problem("read_only_binding", "This dataset binding is read-only.", 403)
                return domains.add_record(session, id, args["payload"], args["operation_id"])
            raise Problem("unknown_tool", "This tool is not registered.", 404)
    task = runs.submit(*delegation)
    return {"run_id": task["id"], "state": task["state"]}
