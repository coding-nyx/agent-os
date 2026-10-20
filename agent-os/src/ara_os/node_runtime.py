"""Node-owned native commands and reconnectable event transport."""
from __future__ import annotations

import asyncio
import fcntl
import json
import os
import subprocess
import sys

import httpx

from . import config, instances, runtime
from .runtime_journal import RuntimeJournal


def launch(id, *, observe=False):
    subprocess.Popen([sys.executable, "-m", "ara_os.cli", "node", "_runtime_worker", id, *(["--observe"] if observe else [])],
        env={**os.environ, "ARA_STATE_DIR": str(config.STATE)}, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


async def worker(id, *, observe=False):
    journal = RuntimeJournal()
    lock = (journal.root / (id + ".lock")).open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        return
    if not journal.claim(id, observe=observe):
        lock.close()
        return
    envelope = journal.read(id)["request"]
    executing = False
    try:
        from .runtime_commands import permitted
        if envelope.get("contract") != "ara-runtime/1" or not permitted(envelope["request"]):
            raise ValueError("Unsupported native command")
        owner = instances.assert_enabled(envelope["instance_id"], envelope["generation"])
        if owner.get("owner_epoch") != envelope.get("owner_epoch"):
            raise ValueError("Native instance ownership changed; inspect historical work before starting a new conversation")
        if owner["native_name"] != envelope["native_name"] or owner.get("logical_agent_id") != envelope["profile_id"]:
            raise ValueError("Native command owner mismatch")
        executing = True
        request = envelope["request"]
        if observe:
            saved = journal.frames(id, limit=100000)
            sid = next(item["frame"]["data"]["session_id"] for item in reversed(saved) if item["frame"]["type"] == "session")
            admission = next(item["frame"]["data"]["admission_id"] for item in reversed(saved) if item["frame"]["type"] == "admission")
            request = {"operation": "observe", "session_id": sid, "admission_id": admission}
        async for frame in runtime.frames(request, {"native_name": owner["native_name"]}):
            journal.append(id, frame)
        journal.finish(id)
    except Exception as exc:
        # A worker/transport failure after admission cannot prove native failure.
        journal.append(id, {"type": "unknown" if executing or observe else "error", "data": {
            "detail": getattr(exc, "detail", str(exc))[:1000], "code": "native_command_stopped"}}, terminal=True)
    finally:
        lock.close()


async def exchange(enrollment):
    from .node_execution import validate_connection
    validate_connection(enrollment)
    journal = RuntimeJournal()
    base = enrollment["host"].rstrip("/") + "/api/v1/nodes/runtime"
    headers = {"X-ARA-Node-Key": enrollment["token"]}
    async with httpx.AsyncClient(timeout=20, trust_env=False, headers=headers) as client:
        response = await client.post(base + "/poll", json={"machine_id": enrollment["machine_id"],
            "instances": [{k: r.get(k) for k in ("instance_id", "native_name", "logical_agent_id", "state", "enabled")}
                          for r in instances.listing()][:128]})
        response.raise_for_status()
        data = response.json()
        from .node_deployments import reconcile
        await reconcile(data.get("bindings", []), provision=False)
        for command in data["commands"]:
            id = command["id"]
            missing = not journal.contains(id) and (command["ack"] > 0 or command["state"] == "running" or
                (journal.root / "accepted" / id).is_file())
            row = journal.admit(id, command["envelope"])
            if missing:
                journal.quarantine(id, command["ack"])
                row = journal.read(id)
            journal.acknowledge(id, command["ack"])
            if command.get("revoked") and row["state"] == "queued":
                journal.append(id, {"type": "error", "data": {"code": "instance_revoked",
                    "detail": "The node rejected this command before native admission because its deployment was revoked or expired."}}, terminal=True)
            elif row["state"] == "queued":
                launch(id)
            else:
                if journal.recover(row):
                    launch(id, observe=True)
        for row in journal.rows():
            batch = journal.frames(row["id"], row["ack"])
            if not batch and row["state"] != "finished":
                continue
            if not batch and row.get("delivered"):
                continue
            terminal = row["state"] == "finished" and not journal.frames(row["id"], batch[-1]["sequence"] if batch else row["ack"], 1)
            result = await client.post(base + "/events", json={"machine_id": enrollment["machine_id"],
                "command_id": row["id"], "events": batch, "terminal": terminal})
            result.raise_for_status()
            journal.acknowledge(row["id"], result.json()["acknowledged_sequence"])
            if terminal:
                journal.delivered(row["id"])


async def run(enrollment):
    while True:
        try:
            await exchange(enrollment)
        except (httpx.HTTPError, ValueError, OSError):
            pass  # Native work and its durable outbox remain owned by this node.
        await asyncio.sleep(1)
