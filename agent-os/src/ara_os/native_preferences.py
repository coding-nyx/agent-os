"""Instance-owned role preferences, applied through the native identity file."""
from __future__ import annotations

import fcntl
import json
import math
import re

from native_definition import atomic
from native_instance import asset
from preset_specs import PRESET_BY_ID

START = "<!-- ara:agent-configuration:start -->"
END = "<!-- ara:agent-configuration:end -->"


def preferences(home, request):
    profile = request["profile"]
    spec = PRESET_BY_ID.get(profile["preset"])
    path = home / ".ara-preferences.json"
    with (home / ".ara-assets.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = json.loads(path.read_text()) if path.exists() else {"values": profile.get("configuration", {}), "revision": 0}
        fields = {f["id"]: f for f in spec["fields"]} if spec else {}
        values = {**{k: f["default"] for k, f in fields.items()}, **previous["values"]}
        identity = asset(home, {"path": "SOUL.md"}, locked=True)
        if request.get("write"):
            body = request["body"]
            if not spec or not isinstance(body.get("values"), dict) or set(body["values"]) - set(fields):
                raise ValueError("Use this preset's configuration fields")
            if body.get("revision") != previous["revision"] or body.get("identity_hash") != identity["hash"]:
                raise ValueError("Instance preferences or identity changed; reload before saving")
            values.update(body["values"])
            for key, value in values.items():
                f = fields[key]
                if isinstance(value, str):
                    value = values[key] = value.strip()
                if value in (None, ""):
                    if f["required"]:
                        raise ValueError("Complete " + f["label"])
                    continue
                if f["type"] == "number":
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                        raise ValueError(f["label"] + " must be a finite number")
                    if f["min"] is not None and value < f["min"] or f["max"] is not None and value > f["max"]:
                        raise ValueError(f["label"] + " is outside its allowed range")
                    if key == "days_per_week" and value != int(value):
                        raise ValueError("Training days must be a whole number")
                elif not isinstance(value, str) or len(value) > 6000 or f["options"] and value not in f["options"]:
                    raise ValueError("Invalid value for " + f["label"])
            current = re.sub(re.escape(START) + r".*?" + re.escape(END), "", identity["content"], flags=re.S).rstrip()
            context = {f["label"]: values[f["id"]] for f in spec["fields"] if values.get(f["id"]) not in (None, "")}
            content = current + f"\n\n{START}\n## Agent OS role and preferences\n\n{spec['soul']}\n\nUser context; no additional data or tool grants:\n" + json.dumps(context, ensure_ascii=False, indent=2) + f"\n{END}\n"
            identity = asset(home, {"path": "SOUL.md", "write": True, "hash": identity["hash"], "content": content}, locked=True)
            previous = {"values": values, "preset": profile["preset"], "revision": previous["revision"] + 1,
                "context_ready": not any(f["required"] and values.get(f["id"]) in (None, "") for f in fields.values())}
            atomic(path, json.dumps(previous))
        missing = [f["label"] for f in fields.values() if f["required"] and values.get(f["id"]) in (None, "")]
        return {"preset": spec, "values": values, "missing": missing, "context_ready": not missing,
            "revision": previous["revision"], "identity_hash": identity["hash"], "applies_to": "new_sessions", "identity_path": "SOUL.md"}
