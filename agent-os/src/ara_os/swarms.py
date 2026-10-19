"""Swarm coordination: multi-agent worker teams executing in tandem for complex tasks."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import uuid
from typing import Any

from . import profiles, runtime
from .store import Entity, Problem, change, create, event, get, listing, transaction

logger = logging.getLogger("ara.swarms")

SWARM_PRESETS: list[dict[str, Any]] = [
    {
        "id": "research",
        "name": "Research Swarm",
        "role": "Deep investigation, source gathering, and cross-verification",
        "description": "Deploys a lead investigator, an empirical source analyst, and an evidence verifier to research a topic thoroughly.",
        "icon": "compass",
        "workers": [
            {
                "id": "lead_researcher",
                "role": "Lead Researcher",
                "tag": "scoper",
                "objective": "Deconstruct the question into core investigative hypotheses, structure inquiry angles, and define search boundaries."
            },
            {
                "id": "source_analyst",
                "role": "Source & Evidence Analyst",
                "tag": "gatherer",
                "objective": "Gather empirical facts, extract relevant citations, datasets, and literature, and analyze source credibility."
            },
            {
                "id": "fact_checker",
                "role": "Fact Checker & Synthesizer",
                "tag": "verifier",
                "objective": "Audit claims for contradictions or unverified assumptions, cross-verify evidence, and synthesize findings."
            }
        ]
    },
    {
        "id": "coding",
        "name": "Coding Swarm",
        "role": "Architecture, modular implementation, and edge-case testing",
        "description": "Deploys a system architect, an implementation engineer, and a QA reviewer to build and verify software solutions in tandem.",
        "icon": "code",
        "workers": [
            {
                "id": "system_architect",
                "role": "System Architect",
                "tag": "architect",
                "objective": "Design modular component interfaces, file boundaries, data contracts, and implementation plan."
            },
            {
                "id": "code_engineer",
                "role": "Implementation Engineer",
                "tag": "coder",
                "objective": "Write clean, idiomatic, error-resilient code strictly implementing the architecture and edge cases."
            },
            {
                "id": "test_reviewer",
                "role": "Reviewer & QA Engineer",
                "tag": "reviewer",
                "objective": "Review code for correctness, security vulnerabilities, regression risks, and produce test scenarios."
            }
        ]
    },
    {
        "id": "analysis",
        "name": "Analysis Swarm",
        "role": "Multi-angle evaluation, risk assessment, and strategic recommendations",
        "description": "Deploys a data analyst, a critical risk evaluator, and a strategic advisor to dissect complex problems.",
        "icon": "activity",
        "workers": [
            {
                "id": "data_analyst",
                "role": "Data & Context Analyst",
                "tag": "analyst",
                "objective": "Map key variables, historical patterns, and establish the factual baseline."
            },
            {
                "id": "critical_evaluator",
                "role": "Critical Evaluator",
                "tag": "critic",
                "objective": "Challenge hypotheses, stress-test risks, failure modes, trade-offs, and second-order consequences."
            },
            {
                "id": "strategic_advisor",
                "role": "Strategic Advisor",
                "tag": "advisor",
                "objective": "Formulate prioritized recommendations, risk mitigations, and an actionable roadmap."
            }
        ]
    },
    {
        "id": "custom",
        "name": "Custom Swarm",
        "role": "User-defined worker roles working in tandem",
        "description": "Configurable worker swarm tailored to domain-specific workflows and custom objectives.",
        "icon": "bot",
        "workers": [
            {
                "id": "specialist_1",
                "role": "Specialist 1",
                "tag": "specialist",
                "objective": "Initial domain analysis and first-pass task execution."
            },
            {
                "id": "specialist_2",
                "role": "Specialist 2",
                "tag": "synthesizer",
                "objective": "Peer review, cross-enhancement, and consolidated synthesis."
            }
        ]
    }
]

SWARM_PRESET_MAP = {p["id"]: p for p in SWARM_PRESETS}
SWARM_TASKS: dict[str, asyncio.Task] = {}  # compatibility; execution belongs to local owner processes
SWARM_MARKER_START = "<!-- ara:agent-swarms:start -->"
SWARM_MARKER_END = "<!-- ara:agent-swarms:end -->"


def get_profile_swarm_config(profile):
    from . import swarm_policy
    legacy = {**(profile.get("swarms") or {}), "enabled": False}
    try:
        return swarm_policy.read(runtime.home(profile), legacy)
    except FileNotFoundError:
        return swarm_policy.validate(legacy)


def identity_with_swarms(current_soul, config):
    cleaned = re.sub(re.escape(SWARM_MARKER_START) + r".*?" + re.escape(SWARM_MARKER_END), "", current_soul, flags=re.S).strip()
    if not config["enabled"]:
        return cleaned
    mode = "INTELLIGENT SWARM TRIGGERING" if config["trigger_mode"] == "intelligent" else "EXPLICIT SWARM TRIGGERING"
    instruction = ("Delegate only when the user explicitly requests a swarm." if config["trigger_mode"] == "explicit" else
                   "Delegate independent complex work when useful; handle routine requests yourself.")
    return cleaned + f"\n\n{SWARM_MARKER_START}\n## Coordinated Swarm Capabilities\n{mode}\n{instruction}\n" + (
        f"Allowed presets: {', '.join(config['allowed_presets'])}. Use ara_spawn_swarm with a stable operation_id, "
        "then ara_get_swarm; ara_cancel_swarm requests a stop. Workers run on the assigned execution machine. "
        "Results are self-reports, not verified facts. Do not resubmit unknown work.\n" + SWARM_MARKER_END)


def save_profile_swarm_config(profile_id, body):
    from . import swarm_policy
    with transaction() as session:
        profile = get(session, profile_id, "profile")
        try:
            cfg = swarm_policy.validate({**get_profile_swarm_config(profile), **body})
            swarm_policy.write(runtime.home(profile), cfg)
        except (ValueError, TypeError) as exc:
            raise Problem("invalid_swarm_config", str(exc))
        asset = runtime.read_asset(profile, "SOUL.md")
        runtime.write_asset(profile, "SOUL.md", identity_with_swarms(asset["content"], cfg), asset["hash"])
        change(session, profile_id, {"swarms": cfg})
    return cfg


def list_swarms_for_profile(session, profile_id):
    return [r for r in listing(session, "swarm_run") if r.get("profile_id") == profile_id][::-1]


def spawn_swarm(session, profile_id, conversation_id, preset, task, operation_id, custom_roles=None):
    from . import swarm_runner
    from .task_journal import fingerprint
    profile = get(session, profile_id, "profile")
    if not profile.get("enabled"):
        raise Problem("profile_disabled", "Enable this profile before starting swarm work.", 409)
    cfg = get_profile_swarm_config(profile)
    if not cfg["enabled"]:
        raise Problem("swarms_disabled", "Swarms are disabled for this profile.", 403)
    if preset not in cfg["allowed_presets"]:
        raise Problem("preset_not_permitted", "This swarm preset is not allowed.", 403)
    placement = profile.get("execution_placement") or {"machine_id": "local", "native_name": profile["native_name"]}
    # Validate task/role shape on the host; the node rechecks its own installed policy.
    try:
        req = swarm_runner.request_for(profile["native_name"], preset, task, operation_id, custom_roles)
    except (ValueError, OSError) as exc:
        raise Problem("invalid_swarm_request", str(exc), 409)
    req["native_name"] = placement["native_name"]
    ident = hashlib.sha256(f"swarm:{profile_id}:{operation_id}".encode()).hexdigest()
    digest = fingerprint(req)
    if session.get(Entity, ident):
        prior = get(session, ident, "swarm_run")
        if prior.get("request_fingerprint") != digest:
            raise Problem("idempotency_conflict", "This operation ID already identifies different swarm work.", 409)
        return prior
    record = create(session, "swarm_run", {"profile_id": profile_id, "conversation_id": conversation_id,
        "preset": preset, "task": task, "operation_id": operation_id, "request": req, "request_fingerprint": digest,
        "owner_machine": placement["machine_id"], "state": "queued", "event_cursor": 0,
        "workers": [{**w, "state": "pending", "output": None, "error": None} for w in req["workers"]],
        "synthesized_output": None, "error": None}, id=ident)
    event(session, ident, "swarm.queued", {"workers_count": len(req["workers"]), "owner_machine": placement["machine_id"]})
    # Admission is committed before the supervisor launches any native worker.
    return record


def project_events(session, record, entries):
    workers = record["workers"]
    patch = {}
    cursor = record.get("event_cursor", 0)
    for e in entries:
        if e["sequence"] <= cursor:
            continue
        if e["sequence"] != cursor + 1:
            raise Problem("event_gap", "Synchronize missing task events before publishing later results.", 409)
        kind, data = e["type"], e["data"]
        # Diagnostic events may be added without changing the v1 state contract.
        # Retain them and advance the cursor even when no projection consumes them.
        if not isinstance(kind, str) or not kind.startswith("swarm.") or len(kind) > 128:
            raise Problem("invalid_task_event", "Unknown task event")
        if kind == "swarm.worker_bound":
            for worker in workers:
                if worker["id"] == data.get("worker_id"):
                    worker["native_session_id"] = data.get("native_session_id")
        if kind == "swarm.started":
            patch["state"] = "running"
        if kind in {"swarm.worker_started", "swarm.worker_finished"}:
            for worker in workers:
                if worker["id"] == data.get("worker_id", data.get("id")):
                    worker.update(state=("running" if kind.endswith("started") else
                        "completed" if data.get("status") == "completed" else data.get("status", "failed")),
                        output=data.get("summary"), error=data.get("error"))
                    if data.get("artifacts"):
                        worker["artifacts"] = data["artifacts"]
                    if data.get("native_session_id"):
                        worker["native_session_id"] = data["native_session_id"]
                    worker.update({k: data[k] for k in ("model", "tokens", "cost_usd", "cost_status", "api_calls") if k in data})
        if kind == "swarm.finished":
            from .task_journal import TERMINAL
            if data.get("state") not in TERMINAL:
                raise Problem("invalid_task_state", "Invalid terminal task state")
            patch.update({k: data.get(k) for k in ("state", "synthesized_output", "error", "usage")})
            for worker in workers:
                if worker["state"] == "pending":
                    worker.update(state="not_started", error="A prerequisite stage stopped or the swarm was cancelled")
        event(session, record["id"], kind, data)
        cursor = e["sequence"]
    if cursor != record.get("event_cursor", 0):
        change(session, record["id"], {**patch, "workers": workers, "event_cursor": cursor})
    return cursor


async def supervise():
    from . import swarm_runner
    from .task_journal import TERMINAL
    while True:
        try:
            with transaction() as session:
                records = [r for r in listing(session, "swarm_run") if r.get("owner_machine", "local") == "local"
                    and r["state"] not in TERMINAL]
            for record in records:
                if not record.get("request"):
                    with transaction() as session:
                        change(session, record["id"], {"state": "unknown", "error": "Legacy execution has no durable receipt. Inspect before retrying."})
                    continue
                try:
                    local = swarm_runner.journal().read(record["id"])
                except ValueError:
                    if record["state"] != "queued":
                        with transaction() as session:
                            change(session, record["id"], {"state": "unknown", "error": "Local execution receipt is missing. Inspect native history before retrying."})
                        continue
                    local = swarm_runner.admit(record["request"], record["id"])
                with transaction() as session:
                    owner = get(session, record["profile_id"], "profile")
                placement = owner.get("execution_placement") or {"machine_id": "local", "native_name": owner["native_name"]}
                if record.get("cancel_requested") or not owner.get("enabled") or placement != {"machine_id": "local", "native_name": record["request"]["native_name"]}:
                    swarm_runner.journal().cancel(record["id"])
                if local["state"] == "queued":
                    swarm_runner.launch(record["id"])
                local = swarm_runner.journal().reconcile(record["id"])
                with transaction() as session:
                    current = get(session, record["id"], "swarm_run")
                    project_events(session, current, local["events"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Swarm receipt reconciliation stopped; retrying without resubmitting admitted work")
        await asyncio.sleep(.5)
