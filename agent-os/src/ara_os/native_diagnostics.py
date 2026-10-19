"""Bounded, read-only diagnostics for the pinned native session receipt format.

Never repair immutable policies here. A new conversation is a new native identity;
the original transcript and admission history must remain intact.
"""
from __future__ import annotations

import json
from contextlib import closing
from pathlib import Path
import sqlite3


POLICY_PREFIX = "gateway.local_policy.v1:"


def session_recovery(home: Path, *, session_id: str | None = None,
                     request_id: str | None = None) -> dict | None:
    if not session_id and not request_id:
        return None
    try:
        # mode=ro does not create a missing store or run native schema migrations.
        with closing(sqlite3.connect((home / "state.db").resolve().as_uri() + "?mode=ro",
                                    uri=True, timeout=1)) as db:
            if session_id:
                rows = db.execute("SELECT value FROM state_meta WHERE key=?",
                                  (POLICY_PREFIX + session_id,))
            else:
                rows = db.execute("""SELECT value FROM state_meta WHERE key GLOB ?
                    AND json_extract(CASE WHEN json_valid(value) THEN value ELSE '{}' END,
                                     '$.request_id')=? LIMIT 2""",
                                  (POLICY_PREFIX + "*", request_id))
            matches = rows.fetchall()
            if len(matches) != 1:
                return None
            receipt = json.loads(matches[0][0])
            if receipt.get("profile_id") != str(home.resolve()):
                return None
            if request_id and receipt.get("request_id") != request_id:
                return None
            policy = receipt.get("policy")
            if not isinstance(policy, dict):
                return None
            model = policy.get("model")
            if isinstance(model, str) and not model.strip():
                return {
                    "code": "native_session_model_missing",
                    "action": "start_new_conversation",
                    "detail": "This conversation was created before a model was selected. "
                              "Its frozen native settings have no model. After configuring "
                              "a model, start a fresh conversation; the old history is preserved "
                              "and no message will be resent automatically.",
                }
    except (sqlite3.Error, OSError, ValueError, TypeError, AttributeError):
        # Missing, locked, malformed or incompatible storage is not proof of a model issue.
        return None
    return None
