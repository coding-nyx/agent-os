from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Integer, String, create_engine, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import DATABASE_URL


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __tablename__ = "ara_entities"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    workspace_id: Mapped[str] = mapped_column(String(80), default="personal", index=True)
    data: Mapped[dict] = mapped_column(JSONB)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Event(Base):
    __tablename__ = "ara_events"
    sequence: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column(String(120), index=True)
    type: Mapped[str] = mapped_column(String(100))
    data: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 3})
Session = sessionmaker(engine, expire_on_commit=False)


class Problem(Exception):
    def __init__(self, code: str, detail: str, status: int = 400, action: str = ""):
        self.code, self.detail, self.status, self.action = code, detail, status, action


def wire(row: Entity) -> dict:
    return {"id": row.id, "kind": row.kind, **row.data, "revision": row.revision,
            "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat()}


@contextmanager
def transaction():
    with Session.begin() as session:
        yield session


def event(session, entity_id: str, type: str, data: dict):
    session.add(Event(entity_id=entity_id, type=type, data=data))


def create(session, kind: str, data: dict, id: str | None = None) -> dict:
    row = Entity(id=id or str(uuid.uuid4()), kind=kind, data=data)
    session.add(row)
    session.flush()
    event(session, row.id, f"{kind}.created", {"revision": 1})
    return wire(row)


def get(session, id: str, kind: str | None = None) -> dict:
    row = session.get(Entity, id)
    if row is None or (kind and row.kind != kind):
        raise Problem("not_found", "This item no longer exists.", 404)
    return wire(row)


def listing(session, kind: str) -> list[dict]:
    return [wire(row) for row in session.scalars(select(Entity).where(Entity.kind == kind).order_by(Entity.created_at))]


def change(session, id: str, patch: dict, revision: int | None = None) -> dict:
    row = session.get(Entity, id)
    if row is None:
        raise Problem("not_found", "This item no longer exists.", 404)
    expected = row.revision if revision is None else revision
    data = {**row.data, **patch}
    result = session.execute(update(Entity).where(Entity.id == id, Entity.revision == expected).values(
        data=data, revision=expected + 1, updated_at=datetime.now(timezone.utc)).execution_options(synchronize_session=False))
    if not result.rowcount:
        raise Problem("revision_conflict", "This item changed. Reload it before saving.", 409, "Reload and review your changes.")
    session.expire(row)
    event(session, id, f"{row.kind}.updated", {"revision": row.revision})
    return wire(row)


def remove(session, id: str, kind: str | None = None) -> dict:
    row = session.get(Entity, id)
    if row is None or (kind and row.kind != kind):
        raise Problem("not_found", "This item no longer exists.", 404)
    data = wire(row)
    session.delete(row)
    session.flush()
    event(session, id, f"{row.kind}.deleted", {})
    return data


def initialize():
    from pathlib import Path
    from alembic.config import Config
    from alembic import command
    migration = Config()
    migration.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with engine.begin() as connection:
        connection.exec_driver_sql("SELECT pg_advisory_xact_lock(34821971)")
        migration.attributes["connection"] = connection
        command.upgrade(migration, "head")
    from .config import STATE
    pending = STATE / "application-import.json"
    if pending.exists():
        with transaction() as session:
            if session.scalar(select(Entity.id).limit(1)) is not None:
                raise Problem("restore_database_not_empty", "Restoring application data requires an empty PostgreSQL database.", 409)
            import json
            for row in json.loads(pending.read_text()):
                data = {k: v for k, v in row.items() if k not in {"id", "kind", "revision", "created_at", "updated_at"}}
                if row["kind"] == "profile":
                    data.update(enabled=False, provision_state="ready", model_connection=None)
                if row["kind"] == "machine":
                    data["state"] = "needs_reconnection" if row["id"] != "local" else "local"
                if row["kind"] == "runtime_command":
                    data.update(state="unknown", payload="")
                if row["kind"] == "channel":
                    data["state"] = "disabled_after_restore"
                if row["kind"] == "swarm_run" and data.get("state") in {"queued", "running"}:
                    # A restored application projection is not execution authority.
                    # Never manufacture a new local receipt and repeat admitted tools.
                    data.update(state="unknown", error="Restored task has no confirmed execution-owner authority. Inspect native history before retrying.")
                session.add(Entity(id=row["id"], kind=row["kind"], data=data,
                    revision=row.get("revision", 1), created_at=datetime.fromisoformat(row["created_at"]),
                    updated_at=datetime.fromisoformat(row["updated_at"])))
            history = STATE / "event-import.json"
            if history.exists():
                for item in json.loads(history.read_text()):
                    session.add(Event(sequence=item["sequence"], entity_id=item["entity_id"], type=item["type"],
                        data=item["data"], created_at=datetime.fromisoformat(item["created_at"])))
                session.flush()
                from sqlalchemy import text
                session.execute(text("SELECT setval(pg_get_serial_sequence('ara_events', 'sequence'), COALESCE((SELECT MAX(sequence) FROM ara_events), 1), EXISTS(SELECT 1 FROM ara_events))"))
        pending.rename(STATE / "application-import.applied.json")
    # An unclean process restart cannot prove the outcome of an executing native turn.
    with transaction() as session:
        for run in listing(session, "run"):
            if run.get("state") in {"running", "accepted", "waiting", "cancel_requested"} and not run.get("runtime_command_id"):
                change(session, run["id"], {"state": "unknown", "error": "Server restarted. Resume the native conversation to inspect its outcome."})
