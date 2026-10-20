"""Coordinator definition registry. Native session stores never enter this registry."""
from __future__ import annotations

from . import runtime
from .native_definition import capture
from .store import Entity, Problem


def current(session, profile):
    row = session.get(Entity, "definition:" + profile["id"])
    return row.data if row else None


def publish(session, profile, manifest, *, expected=None, owner="local"):
    from sqlalchemy import select
    session.scalar(select(Entity).where(Entity.id == profile["id"]).with_for_update())
    previous = current(session, profile)
    if previous and expected != previous["manifest"]["revision"]:
        raise Problem("definition_conflict", "The published definition changed. Reload and compare before publishing", 409)
    value = {"profile_id": profile["id"], "owner_machine": owner, "manifest": manifest}
    row = session.get(Entity, "definition:" + profile["id"])
    if row:
        row.data = value
        row.revision += 1
    else:
        session.add(Entity(id="definition:" + profile["id"], kind="agent_definition", data=value))
    return value


def ensure(session, profile):
    value = current(session, profile)
    if value:
        return value
    home = runtime.home(profile)
    if not home.is_dir():
        raise Problem("definition_missing", "Publish a definition from its owning instance before deploying another copy", 409)
    return publish(session, profile, capture(home))
