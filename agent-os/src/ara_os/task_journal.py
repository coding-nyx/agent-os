"""ARA-owned durable execution receipts. No application database or runtime imports."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

TERMINAL = {"succeeded", "partial", "failed", "cancelled", "unknown"}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class Journal:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = root / "tasks.sqlite3"
        with self.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, request TEXT NOT NULL,
                    state TEXT NOT NULL, pid INTEGER, cancel_requested INTEGER NOT NULL DEFAULT 0,
                    ack INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    task_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL,
                    data TEXT NOT NULL, created REAL NOT NULL, PRIMARY KEY(task_id, sequence));
                CREATE TABLE IF NOT EXISTS snapshots (
                    task_id TEXT PRIMARY KEY, path TEXT NOT NULL, sha256 TEXT NOT NULL);
            """)
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA busy_timeout=15000")
            with db:
                yield db
        finally:
            db.close()

    def admit(self, task_id, request):
        digest = fingerprint(request)
        with self.db() as db:
            db.execute("INSERT OR IGNORE INTO tasks(id,fingerprint,request,state,created) VALUES(?,?,?,?,?)",
                       (task_id, digest, json.dumps(request), "queued", time.time()))
            row = db.execute("SELECT fingerprint FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row[0] != digest:
                raise ValueError("idempotency_conflict: this operation already identifies different work")
        return self.read(task_id)

    def claim(self, task_id):
        with self.db() as db:
            return bool(db.execute("UPDATE tasks SET state='running',pid=? WHERE id=? AND state='queued'",
                                   (os.getpid(), task_id)).rowcount)

    def append(self, task_id, kind, data, state=None):
        # BEGIN IMMEDIATE serializes sequence allocation and state with the event.
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            seq = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE task_id=?", (task_id,)).fetchone()[0]
            db.execute("INSERT INTO events VALUES(?,?,?,?,?)", (task_id, seq, kind, json.dumps(data), time.time()))
            if state:
                db.execute("UPDATE tasks SET state=? WHERE id=?", (state, task_id))
        return seq

    def read(self, task_id):
        with self.db() as db:
            row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise ValueError("task_not_found")
            value = dict(row)
            value["request"] = json.loads(value["request"])
            value["events"] = [dict(e) for e in db.execute("SELECT * FROM events WHERE task_id=? ORDER BY sequence", (task_id,))]
            for e in value["events"]:
                e["data"] = json.loads(e["data"])
            return value

    def pending(self):
        with self.db() as db:
            ids = [r[0] for r in db.execute("SELECT id FROM tasks ORDER BY created")]
        return [self.read(i) for i in ids]

    def cancel(self, task_id):
        with self.db() as db:
            marks = ",".join("?" for _ in TERMINAL)
            return bool(db.execute(f"UPDATE tasks SET cancel_requested=1 WHERE id=? AND state NOT IN ({marks})",
                (task_id, *TERMINAL)).rowcount)

    def finish(self, task_id, data):
        """Commit cancellation inspection and one terminal event in the same transaction."""
        if data.get("state") not in TERMINAL:
            raise ValueError("invalid_terminal_state")
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT state,cancel_requested FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise ValueError("task_not_found")
            if row["state"] in TERMINAL:
                return row["state"]
            value = dict(data)
            if row["cancel_requested"] and value["state"] != "unknown":
                value.update(state="cancelled", error="Cancellation acknowledged; completed work and artifacts are retained.")
            seq = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE task_id=?", (task_id,)).fetchone()[0]
            db.execute("INSERT INTO events VALUES(?,?,?,?,?)", (task_id, seq, "swarm.finished", json.dumps(value), time.time()))
            db.execute("UPDATE tasks SET state=? WHERE id=?", (value["state"], task_id))
        return value["state"]

    def cancel_requested(self, task_id):
        with self.db() as db:
            row = db.execute("SELECT cancel_requested FROM tasks WHERE id=?", (task_id,)).fetchone()
        return bool(row and row[0])

    def acknowledge(self, task_id, sequence):
        value = self.read(task_id)
        if sequence < value["ack"] or sequence > len(value["events"]):
            raise ValueError("invalid_acknowledgement")
        with self.db() as db:
            db.execute("UPDATE tasks SET ack=? WHERE id=?", (sequence, task_id))

    def reconcile(self, task_id):
        value = self.read(task_id)
        if value["state"] == "running" and value["pid"]:
            try:
                os.kill(value["pid"], 0)
            except ProcessLookupError:
                self.finish(task_id, {"state": "unknown", "error":
                    "Execution owner exited. Inspect native history and artifacts before retrying."})
        return self.read(task_id)

    def snapshot(self, task_id):
        with self.db() as db:
            row = db.execute("SELECT * FROM snapshots WHERE task_id=?", (task_id,)).fetchone()
        return dict(row) if row else None

    def record_snapshot(self, task_id, path, sha256):
        with self.db() as db:
            db.execute("INSERT OR REPLACE INTO snapshots VALUES(?,?,?)", (task_id, str(path), sha256))
