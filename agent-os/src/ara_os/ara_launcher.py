"""Installation-bound CLI entry point; select an activated release before imports."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys


def selection(root, arguments):
    state = Path(os.environ.get("ARA_STATE_DIR", root / ".state"))
    for index, arg in enumerate(arguments):
        if arg == "--state" and index + 1 < len(arguments):
            state = Path(arguments[index + 1])
            break
        if arg.startswith("--state="):
            state = Path(arg.split("=", 1)[1])
            break
        if not arg.startswith("-"):
            break  # Profile arguments after the subcommand are not global flags.
    state = state.expanduser().resolve()
    pointer = state / "node-active-release.json"
    plan = json.loads(pointer.read_text()) if pointer.is_file() else None
    project = Path(plan["project"]) if plan else root
    python = Path(plan["python"]) if plan else root / ".venv/bin/python"
    if not python.is_file() or not (project / "src/ara_os/cli.py").is_file():
        raise ValueError("The selected ARA release is unavailable. Repair the installation before restarting the node.")
    env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"}}
    env["ARA_STATE_DIR"] = str(state)
    for key in ("source", "python", "tools"):
        if key in (plan or {}).get("native", {}):
            env["ARA_RUNTIME_" + key.upper()] = plan["native"][key]
    return project, python, env


def main():
    root = Path(os.environ.get("ARA_INSTALL_ROOT", Path(__file__).resolve().parents[2])).resolve()
    project, python, env = selection(root, sys.argv[1:])
    # -I keeps a working directory containing mcp.py or yaml.py from shadowing
    # dependencies. Only the selected release's package parent is added.
    code = f"import sys; sys.path.insert(0, {str(project / 'src')!r}); from ara_os.cli import main; main()"
    os.execve(python, [str(python), "-I", "-c", code, *sys.argv[1:]], env)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
