from __future__ import annotations

from . import domains
from .store import Problem, get, transaction

TOOLS = [
    {"name": "ara_list_datasets", "description": "List this agent's explicitly bound ARA datasets and permissions.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "ara_list_records", "description": "Read records from a bound ARA dataset. Financial amounts are exact decimal strings.", "inputSchema": {"type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"], "additionalProperties": False}},
    {"name": "ara_add_record", "description": "Commit a validated record to a dataset with write access. Use a stable operation_id to prevent duplicate writes.", "inputSchema": {"type": "object", "properties": {"dataset_id": {"type": "string"}, "payload": {"type": "object"}, "operation_id": {"type": "string"}}, "required": ["dataset_id", "payload", "operation_id"], "additionalProperties": False}},
    {"name": "ara_list_agents", "description": "List only the specialist profiles explicitly permitted for delegation.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "ara_delegate_task", "description": "Start one scoped specialist task. Returns a task ID; inspect it using ara_get_task. Reuse operation_id on retries.", "inputSchema": {"type": "object", "properties": {"profile_id": {"type": "string"}, "text": {"type": "string"}, "operation_id": {"type": "string"}}, "required": ["profile_id", "text", "operation_id"], "additionalProperties": False}},
    {"name": "ara_get_task", "description": "Inspect a specialist task started by this profile. A pending or unknown task is not permission to run it again.", "inputSchema": {"type": "object", "properties": {"run_id": {"type": "string"}}, "required": ["run_id"], "additionalProperties": False}},
]


def invoke(profile_id: str, name: str, args: dict):
    import hashlib
    from .store import Entity, create
    from . import runs
    delegation = None
    with transaction() as session:
        profile = get(session, profile_id, "profile")
        if not profile["enabled"]:
            raise Problem("profile_disabled", "This profile is disabled.", 403)
        bindings = {b["dataset_id"]: b["access"] for b in profile.get("bindings", [])}
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
