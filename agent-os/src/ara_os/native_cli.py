"""Select Agent OS's native home before entering the upstream CLI."""
from __future__ import annotations

import os
from pathlib import Path
import re
import shlex
import sys


def main() -> int:
    root = Path(os.environ.get("ARA_PROJECT_ROOT", Path(__file__).resolve().parents[2]))
    state = Path(os.environ.get("ARA_STATE_DIR", root / ".state")).resolve()
    runtime_home = state / "runtime"
    entry, *arguments = sys.argv[1:]
    managed_home = not os.environ.get("HERMES_HOME")
    if entry not in {"hermes", "hermes-agent", "hermes-acp"}:
        raise ValueError("Unknown native entry point")
    if managed_home:
        selected = state / "default-profile"
        home = runtime_home
        # Native `profile use` takes precedence over the initial Ara default.
        if selected.exists() and not (runtime_home / "active_profile").exists() and arguments[:2] != ["profile", "use"]:
            name = selected.read_text(encoding="utf-8").strip()
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name):
                print("Agent OS default profile is invalid. Select one with hermes profile use NAME.", file=sys.stderr)
                return 2
            home = runtime_home if name == "default" else runtime_home / "profiles" / name
            if not home.is_dir():
                print("Agent OS default profile is missing. Select one with hermes profile use NAME.", file=sys.stderr)
                return 2
        os.environ["HERMES_HOME"] = str(home)
    os.environ.setdefault("HERMES_RUNTIME_DIR", str(root / ".runtime/tools"))
    os.environ.pop("PYTHONPATH", None)
    os.environ.pop("PYTHONHOME", None)
    if entry == "hermes" and arguments[:1] == ["profiles"]:
        arguments = ["profile", *(arguments[1:] or ["list"])]
    sys.argv = [entry, *arguments]
    if entry == "hermes":
        # Upstream resolves -p/--profile and sticky profile selection during this import.
        from hermes_cli import main as cli
        from hermes_cli._parser import command_argv
        from hermes_cli.config_effective import load_user_config_effective
        from hermes_constants import get_hermes_home

        command = command_argv(sys.argv[1:])
        chat = not command or command[0] == "chat"
        informational = any(arg in {"-h", "--help", "-V", "--version"} for arg in sys.argv[1:])
        explicit_model = any(arg in {"-m", "--model"} or arg.startswith("--model=") for arg in sys.argv[1:])
        if chat and not informational and not explicit_model:
            home = get_hermes_home()
            cfg = load_user_config_effective(home / "config.yaml") or {}
            model = cfg.get("model")
            model = (model.get("default") or model.get("model")) if isinstance(model, dict) else model
            if not isinstance(model, str) or not model.strip():
                setup = (shlex.join(["hermes", "-p", home.name, "model"]) if home.parent.name == "profiles"
                         else f"HERMES_HOME={shlex.quote(str(home))} hermes model")
                print(f"Model not configured for {home.name}. Run `{setup}`, "
                      "or configure it in Agent OS Connections > Models. "
                      "On a fresh installation, start Agent OS first to create the preset profiles.", file=sys.stderr)
                return 2
        result = cli.main() or 0
        if managed_home and command == ["profile", "use", "default"] and result == 0:
            # Native switching to `default` removes active_profile; retain that choice over Ara.
            (state / "default-profile").write_text("default\n", encoding="utf-8")
        return result
    if entry == "hermes-agent":
        from agent.legacy_cli import main as legacy_main
        return legacy_main() or 0
    from acp_adapter.entry import main as acp_main
    return acp_main() or 0


if __name__ == "__main__":
    raise SystemExit(main())
