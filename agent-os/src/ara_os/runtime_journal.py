"""Durable native command inbox/event outbox, independent of PostgreSQL."""
from __future__ import annotations

import json
import fcntl
import os
import re
import sqlite3
import time
from contextlib import contextmanager

from cryptography.fernet import Fernet

from . import config
from .task_journal import fingerprint


class RuntimeJournal:
    def __init__(self):
        self.root = config.STATE / "runtime-commands"
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.root / "inbox.sqlite3"
        self.cipher = Fernet(config.private_file("runtime-command.key", lambda: Fernet.generate_key().decode()).encode())
        with self.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS commands (
                    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, request TEXT NOT NULL,
                    instance_id TEXT NOT NULL, state TEXT NOT NULL, pid INTEGER, ack INTEGER NOT NULL DEFAULT 0,
                    created REAL NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS frames (
                    command_id TEXT NOT NULL, sequence INTEGER NOT NULL, value TEXT NOT NULL,
                    PRIMARY KEY(command_id, sequence));
            """)
            if "delivered" not in {r[1] for r in db.execute("PRAGMA table_info(commands)")}:
                db.execute("ALTER TABLE commands ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0")
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def admit(self, id, request):
        if not isinstance(id, str) or not re.fullmatch(r"[0-9a-f]{64}", id):
            raise ValueError("Invalid native command identity")
        with self.db() as db:
            db.execute("INSERT OR IGNORE INTO commands(id,fingerprint,request,instance_id,state,pid,ack,created) VALUES(?,?,?,?,?,?,?,?)", (
                id, fingerprint(request), self.cipher.encrypt(json.dumps(request).encode()).decode(),
                request["instance_id"], "queued", None, 0, time.time()))
            row = db.execute("SELECT fingerprint FROM commands WHERE id=?", (id,)).fetchone()
            if row[0] != fingerprint(request):
                raise ValueError("Runtime command identity conflict")
        accepted = self.root / "accepted"
        accepted.mkdir(exist_ok=True, mode=0o700)
        path = accepted / id
        if not path.exists():
            with path.open("x") as stream:
                path.chmod(0o600)
                stream.write(fingerprint(request))
                stream.flush()
                os.fsync(stream.fileno())
        return self.read(id)

    def contains(self, id):
        with self.db() as db:
            return db.execute("SELECT 1 FROM commands WHERE id=?", (id,)).fetchone() is not None

    def quarantine(self, id, cursor):
        with self.db() as db:
            if cursor:
                placeholder = {"type": "unknown", "data": {"detail": "Prior event body is unavailable on this restored node"}}
                db.execute("INSERT OR IGNORE INTO frames VALUES(?,?,?)", (id, cursor, self.cipher.encrypt(json.dumps(placeholder).encode()).decode()))
            db.execute("UPDATE commands SET ack=? WHERE id=?", (cursor, id))
        self.append(id, {"type": "unknown", "data": {"code": "native_journal_missing",
            "detail": "This node lost its previous native command journal. Inspect native history before starting replacement work."}}, terminal=True)

    def read(self, id):
        with self.db() as db:
            row = db.execute("SELECT * FROM commands WHERE id=?", (id,)).fetchone()
            if row is None:
                raise ValueError("Runtime command is not admitted")
            result = dict(row)
            result["request"] = json.loads(self.cipher.decrypt(result["request"].encode()))
            return result

    def rows(self):
        with self.db() as db:
            ids = [r[0] for r in db.execute("SELECT id FROM commands ORDER BY created")]
        return [self.read(id) for id in ids]

    def claim(self, id, *, observe=False):
        with self.db() as db:
            return bool(db.execute("UPDATE commands SET state=?,pid=? WHERE id=? AND state=?",
                                   ("observing" if observe else "running", os.getpid(), id, "observe_pending" if observe else "queued")).rowcount)

    def append(self, id, frame, *, terminal=False):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            sequence = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM frames WHERE command_id=?", (id,)).fetchone()[0]
            db.execute("INSERT INTO frames VALUES(?,?,?)", (id, sequence, self.cipher.encrypt(json.dumps(frame).encode()).decode()))
            if terminal:
                db.execute("UPDATE commands SET state='finished' WHERE id=?", (id,))
        return sequence

    def frames(self, id, after=0, limit=64):
        with self.db() as db:
            result, size = [], 0
            for row in db.execute("SELECT sequence,value FROM frames WHERE command_id=? AND sequence>? ORDER BY sequence LIMIT ?", (id, after, limit)):
                raw = self.cipher.decrypt(row[1].encode())
                if result and size + len(raw) > 10_000_000:
                    break
                size += len(raw)
                result.append({"sequence": row[0], "frame": json.loads(raw)})
            return result

    def finish(self, id):
        with self.db() as db:
            db.execute("UPDATE commands SET state='finished' WHERE id=?", (id,))

    def delivered(self, id):
        with self.db() as db:
            db.execute("UPDATE commands SET delivered=1 WHERE id=?", (id,))

    def acknowledge(self, id, sequence):
        with self.db() as db:
            maximum = db.execute("SELECT COALESCE(MAX(sequence),0) FROM frames WHERE command_id=?", (id,)).fetchone()[0]
            if not 0 <= sequence <= maximum:
                raise ValueError("Invalid runtime event acknowledgement")
            db.execute("UPDATE commands SET ack=MAX(ack,?) WHERE id=?", (sequence, id))

    def recover(self, row):
        if row["state"] not in {"running", "observing", "observe_pending"}:
            return
        with (self.root / (row["id"] + ".lock")).open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            if self.read(row["id"])["state"] not in {"running", "observing", "observe_pending"}:
                return
            saved = self.frames(row["id"], limit=100000)
            if any(item["frame"]["type"] in {"receipt", "result", "error", "unknown"} or
                    item["frame"].get("data", {}).get("type") == "message.complete" for item in saved):
                self.finish(row["id"])
                return
            kinds = {item["frame"]["type"] for item in saved}
            if row["request"]["request"].get("operation") == "run" and {"session", "admission"} <= kinds:
                with self.db() as db:
                    db.execute("UPDATE commands SET state='observe_pending',pid=NULL WHERE id=?", (row["id"],))
                return True
            # Never replay a native prompt across a worker crash.
            self.append(row["id"], {"type": "unknown", "data": {"code": "owner_restarted",
                "detail": "Native command owner exited. Inspect its native receipt before retrying."}}, terminal=True)
