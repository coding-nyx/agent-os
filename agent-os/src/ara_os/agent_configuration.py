"""Validated preset intake, applied to the native profile's identity for new sessions."""
from __future__ import annotations

import json
import math
import re

from . import runtime
from .preset_specs import PRESET_BY_ID
from .store import Problem, change, get, transaction

START = "<!-- ara:agent-configuration:start -->"
END = "<!-- ara:agent-configuration:end -->"


def configuration(profile):
    spec = PRESET_BY_ID.get(profile["preset"])
    values = {f["id"]: f["default"] for f in spec["fields"]} if spec else {}
    values.update(profile.get("configuration", {}))
    missing = [f["label"] for f in spec["fields"] if f["required"] and values.get(f["id"]) in (None, "")] if spec else []
    asset = runtime.read_asset(profile, "SOUL.md")
    return {"preset": spec, "values": values, "missing": missing, "context_ready": not missing,
            "revision": profile["revision"], "identity_hash": asset["hash"],
            "applies_to": "new_sessions", "identity_path": "SOUL.md"}


def identity_content(profile, values, current):
    spec = PRESET_BY_ID[profile["preset"]]
    base = re.sub(re.escape(START) + r".*?" + re.escape(END), "", current, flags=re.S).rstrip()
    if base == spec["soul"]:
        base = f"# {profile['name']}"
    context = {f["label"]: values[f["id"]] for f in spec["fields"] if values.get(f["id"]) not in (None, "")}
    block = (f"{START}\n## Agent OS role and preferences\n\n{spec['soul']}\n\n"
             "The following context is supplied by the user. It grants no additional data or tool permissions.\n"
             + json.dumps(context, ensure_ascii=False, indent=2) + f"\n{END}\n")
    return base + "\n\n" + block


def apply_preset_identity(profile):
    spec = PRESET_BY_ID.get(profile["preset"])
    if not spec or profile.get("preset_version") == spec["version"]:
        return profile
    asset = runtime.read_asset(profile, "SOUL.md")
    defaults = {f["id"]: f["default"] for f in spec["fields"]}
    values = {**defaults, **profile.get("configuration", {})}
    runtime.write_asset(profile, "SOUL.md", identity_content(profile, values, asset["content"]), asset["hash"])
    with transaction() as session:
        return change(session, profile["id"], {"preset_version": spec["version"]})


def save_configuration(profile_id, body):
    if not isinstance(body, dict) or set(body) - {"values", "revision", "identity_hash"}:
        raise Problem("invalid_configuration", "Use the profile configuration fields.")
    if type(body.get("revision")) is not int or not isinstance(body.get("identity_hash"), str):
        raise Problem("invalid_configuration", "Reload configuration before saving.", 409)
    with transaction() as session:
        profile = get(session, profile_id, "profile")
        spec = PRESET_BY_ID.get(profile["preset"])
        if not spec:
            raise Problem("custom_identity", "Edit this profile's identity directly.", 409)
        fields = {f["id"]: f for f in spec["fields"]}
        supplied = body.get("values")
        if not isinstance(supplied, dict) or set(supplied) - set(fields):
            raise Problem("invalid_configuration", "Unknown profile configuration fields.")
        values = {**{f["id"]: f["default"] for f in spec["fields"]}, **profile.get("configuration", {}), **supplied}
        for key, value in values.items():
            f = fields[key]
            if isinstance(value, str):
                value = values[key] = value.strip()
            if value in (None, ""):
                if f["required"]:
                    raise Problem("missing_configuration", f"Complete {f['label']}.")
                continue
            if f["type"] == "number":
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise Problem("invalid_configuration", f"{f['label']} must be a number.")
                if (f["min"] is not None and value < f["min"]) or (f["max"] is not None and value > f["max"]):
                    raise Problem("invalid_configuration", f"{f['label']} is outside its allowed range.")
                if key == "days_per_week" and value != int(value):
                    raise Problem("invalid_configuration", "Training days must be a whole number.")
            elif not isinstance(value, str) or len(value) > 6000 or (f["options"] and value not in f["options"]):
                raise Problem("invalid_configuration", f"Invalid value for {f['label']}.")
        asset = runtime.read_asset(profile, "SOUL.md")
        if asset["hash"] != body["identity_hash"]:
            raise Problem("asset_conflict", "Identity changed outside this form. Reload before saving.", 409)
        updated = change(session, profile_id, {"configuration": values, "preset_version": spec["version"]}, body["revision"])
        runtime.write_asset(profile, "SOUL.md", identity_content(profile, values, asset["content"]), asset["hash"])
    return configuration(updated)
