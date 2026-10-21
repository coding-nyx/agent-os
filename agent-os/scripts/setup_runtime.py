"""Prepare the pinned runtime through its package manager, without altering core."""
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / "compatibility.lock.json").read_text())
source = root / ".runtime/ara-agent"
source.parent.mkdir(exist_ok=True)
if not source.exists():
    source.mkdir()
    subprocess.run(["git", "init", str(source)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(source), "remote", "add", "upstream", lock["runtime"]["source"]], check=True)
else:
    remotes = subprocess.check_output(["git", "-C", str(source), "remote"], text=True).split()
    if "upstream" not in remotes and "origin" in remotes:
        subprocess.run(["git", "-C", str(source), "remote", "rename", "origin", "upstream"], check=True)
revision = lock["runtime"]["revision"]
current = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"], text=True, capture_output=True)
if current.stdout.strip() != revision:
    if subprocess.run(["git", "-C", str(source), "diff", "--quiet"]).returncode:
        raise SystemExit("Runtime has local changes. Preserve them before updating the pinned revision.")
    subprocess.run(["git", "-C", str(source), "fetch", "--depth", "1", "upstream", revision], check=True)
    subprocess.run(["git", "-C", str(source), "sparse-checkout", "init", "--no-cone"], check=True)
    subprocess.run(["git", "-C", str(source), "sparse-checkout", "set", "/*", "!/apps/", "!/website/", "!/tests/", "!/tests-js/", "!/evals/", "!/contributors/", "!/web/", "!/ui-tui/", "!/assets/"], check=True)
    subprocess.run(["git", "-C", str(source), "checkout", "-B", lock["runtime"]["downstream_branch"], revision], check=True)
try:
    python_path = subprocess.check_output(["uv", "python", "find", "--managed-python", lock["runtime"]["python"]], text=True, stderr=subprocess.DEVNULL).strip()
except subprocess.CalledProcessError:
    python_path = subprocess.check_output(["uv", "python", "find", lock["runtime"]["python"]], text=True).strip()
stamp = root / ".runtime/build.json"
environment = root / ".runtime/env"
sys.path.insert(0, str(source))
os.environ["HERMES_HOME"] = str(root / ".state/runtime")
os.environ["HERMES_RUNTIME_DIR"] = str(root / ".runtime/tools")
expected_stamp = {"revision": revision, "extras": lock["runtime"]["extras"]}
previous_stamp = json.loads(stamp.read_text()) if stamp.exists() else {}
sys.path.insert(0, str(root / "src"))
from ara_os.runtime_setup import refresh_environment


def verify_environment(candidate):
    subprocess.run([str(candidate / "bin/python"), "-c",
        "import ruamel.yaml, anthropic, hermes_cli.main, hermes_cli.gateway_client, fastapi, mcp, telegram; "
        f"import sys; sys.path.insert(0, {str(root / 'src')!r}); "
        "from ara_os import native_definition, native_instance, native_preferences, swarm_policy; "
        "from agent.anthropic_adapter import _require_sdk; _require_sdk('Anthropic Messages'); "
        "print('Agent OS native runtime imports and provider adapters verified')"],
        cwd=source, check=True, env={**os.environ, "PYTHONPATH": str(source)})


needs_refresh = not (environment / "bin/python").exists() or previous_stamp != expected_stamp
if not needs_refresh:
    try:
        verify_environment(environment)
    except subprocess.CalledProcessError:
        print("Native dependency checks failed; staging a repair without discarding the current environment.")
        needs_refresh = True
if needs_refresh:
    import pm
    cache_dir = Path(os.environ.get("UV_CACHE_DIR", root / ".runtime/uv-cache"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    previous = refresh_environment(environment,
        lambda candidate: pm.build_environment(source=source, out=candidate, python=Path(python_path),
            cache=cache_dir, extras=lock["runtime"]["extras"], explicit=True), verify_environment)
    if previous:
        print("Previous native environment retained at " + str(previous))
        print("Restart active Hermes gateways before chatting so they load the refreshed dependencies.")
stamp.write_text(json.dumps(expected_stamp, indent=2))
from ara_os.launchers import install_cli

cli_env_dir = os.environ.get("ARA_CLI_BIN_DIR")
explicit_dir = Path(cli_env_dir) if cli_env_dir else None
fallback_dir = (root / ".state/bin") if explicit_dir is None else None

try:
    commands = install_cli(root, explicit_dir, fallback_directory=fallback_dir)
except FileExistsError as err:
    if explicit_dir is not None:
        raise
    fallback_dir = root / ".state/bin"
    print(f"\n[NOTICE] {err}")
    print(f"Preserving foreign command in ~/.local/bin. Installing Agent OS launchers to: {fallback_dir}")
    commands = install_cli(root, fallback_dir)

for command in commands:
    subprocess.run([str(command), "--help"], cwd=root.parent, check=True,
        env={key: value for key, value in os.environ.items() if key not in {"HERMES_HOME", "HERMES_RUNTIME_DIR", "PYTHONPATH"}},
        stdout=subprocess.DEVNULL, timeout=30)

if explicit_dir is None and commands[0].parent == (root / ".state/bin").resolve():
    print(f"Agent OS native commands installed in {commands[0].parent} (isolated from foreign host installations).")
    print(f"Tip: Prepend '{commands[0].parent}' to your PATH to run Agent OS's hermes commands directly.")
else:
    print("Agent OS native commands installed in " + str(commands[0].parent))
