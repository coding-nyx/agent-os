from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import jsonschema

from .catalog import MODULES
from .store import Entity, Problem, change, create, get, listing


def datasets(session):
    return listing(session, "dataset")


def make_dataset(session, name: str, module: str, schema: dict | None = None):
    if module not in {x["id"] for x in MODULES}:
        raise Problem("unknown_module", "Choose an installed data module.")
    if schema:
        try:
            jsonschema.Draft202012Validator.check_schema(schema)
        except jsonschema.SchemaError as exc:
            raise Problem("invalid_schema", exc.message) from exc
    return create(session, "dataset", {"name": name, "module": module, "schema": schema or {"type": "object"}, "archived": False})


def records(session, dataset_id: str):
    get(session, dataset_id, "dataset")
    return [r for r in listing(session, "record") if r["dataset_id"] == dataset_id]


def validate_record(dataset: dict, payload: dict):
    if not isinstance(payload, dict) or len(json.dumps(payload).encode()) > 1_000_000:
        raise Problem("invalid_record", "Records must be objects smaller than 1 MB.")
    module = dataset["module"]
    text_fields = {"finance": ("description", "category", "account", "date"),
                   "training": ("title", "notes", "date"), "notebook": ("title", "content", "date"),
                   "research": ("title", "url", "notes", "content", "date")}.get(module, ())
    if any(key in payload and not isinstance(payload[key], str) for key in text_fields):
        raise Problem("invalid_record", "Text fields must contain text.")
    if module == "finance":
        try:
            amount = Decimal(str(payload.get("amount", "")))
            if not amount.is_finite() or amount == 0 or amount != amount.quantize(Decimal("0.01")) or abs(amount) > Decimal("999999999999.99"):
                raise ValueError()
            date.fromisoformat(payload["date"])
        except (InvalidOperation, ValueError, KeyError, TypeError):
            raise Problem("invalid_transaction", "Use a nonzero amount with at most two decimal places and a valid date.")
        currency = str(payload.get("currency", "INR")).upper()
        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise Problem("invalid_currency", "Use a three-letter currency code.")
        if not str(payload.get("description", "")).strip():
            raise Problem("missing_description", "A transaction needs a description.")
        payload = {**payload, "amount": str(amount.quantize(Decimal("0.01"))), "currency": currency}
    elif module == "training":
        if not payload.get("title"):
            raise Problem("invalid_workout", "Give the workout a name.")
        if not isinstance(payload.get("sets", []), list):
            raise Problem("invalid_set", "Workout sets must be a list of repetitions and weights.")
        for item in payload.get("sets", []):
            try:
                weight = Decimal(str(item.get("weight", 0)))
                reps = item.get("reps", 0)
                valid = isinstance(item, dict) and isinstance(reps, int) and not isinstance(reps, bool) and 0 <= reps <= 100000 and weight.is_finite() and weight >= 0
            except (AttributeError, InvalidOperation, ValueError, TypeError):
                valid = False
            if not valid:
                raise Problem("invalid_set", "Repetitions and weight must be nonnegative.")
    elif module == "notebook":
        if not str(payload.get("content", "")).strip():
            raise Problem("empty_note", "Write something before saving the note.")
    elif module == "research":
        if not payload.get("title"):
            raise Problem("missing_source", "Give this source or finding a title.")
    else:
        try:
            jsonschema.validate(payload, dataset["schema"])
        except jsonschema.ValidationError as exc:
            raise Problem("invalid_record", exc.message) from exc
    return payload


def add_record(session, dataset_id: str, payload: dict, operation_id: str):
    dataset = get(session, dataset_id, "dataset")
    if dataset.get("archived"):
        raise Problem("dataset_archived", "Restore this dataset before adding records.", 409)
    payload = validate_record(dataset, payload)
    id = hashlib.sha256(f"record:{dataset_id}:{operation_id}".encode()).hexdigest()
    prior = session.get(Entity, id)
    if prior:
        existing = get(session, id)
        if existing["payload"] != payload:
            raise Problem("idempotency_conflict", "This operation ID was used with different content.", 409)
        return existing
    return create(session, "record", {"dataset_id": dataset_id, "payload": payload}, id=id)


def update_record(session, id: str, payload: dict, revision: int):
    existing = get(session, id, "record")
    dataset = get(session, existing["dataset_id"], "dataset")
    if dataset.get("archived"):
        raise Problem("dataset_archived", "Restore this dataset before editing records.", 409)
    return change(session, id, {"payload": validate_record(dataset, payload)}, revision)


def summary(session, dataset_id: str):
    dataset = get(session, dataset_id, "dataset")
    rows = records(session, dataset_id)
    totals: dict[str, Decimal] = {}
    if dataset["module"] == "finance":
        for row in rows:
            p = row["payload"]
            totals[p["currency"]] = totals.get(p["currency"], Decimal(0)) + Decimal(p["amount"])
    return {"count": len(rows), "totals": {k: str(v) for k, v in totals.items()}}
