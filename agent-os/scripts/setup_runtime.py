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
python_path = subprocess.check_output(["uv", "python", "find", "--managed-python", lock["runtime"]["python"]], text=True).strip()
stamp = root / ".runtime/build.json"
environment = root / ".runtime/env"
sys.path.insert(0, str(source))
os.environ["HERMES_HOME"] = str(root / ".state/runtime")
os.environ["HERMES_RUNTIME_DIR"] = str(root / ".runtime/tools")
expected_stamp = {"revision": revision, "extras": lock["runtime"]["extras"]}
previous_stamp = json.loads(stamp.read_text()) if stamp.exists() else {}
if not (environment / "bin/python").exists() or previous_stamp != expected_stamp:
    import pm
    pm.build_environment(source=source, out=environment, python=Path(python_path),
        cache=Path(os.environ["UV_CACHE_DIR"]), extras=lock["runtime"]["extras"], explicit=True)
subprocess.run([str(environment / "bin/python"), "-c", "import hermes_cli.gateway_client, fastapi, mcp, telegram; print('Agent OS native runtime imports verified')"], cwd=source, check=True, env={**os.environ, "PYTHONPATH": str(source)})
stamp.write_text(json.dumps(expected_stamp, indent=2))
