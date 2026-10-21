"""Standalone release installer/supervisor; deliberately uses only Python's stdlib."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

CONTRACT = "ara-node-update/1"
MAX_PACKAGE = 64 * 1024 * 1024


def atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        os.chmod(stream.name, 0o600)
        json.dump(value, stream, sort_keys=True)
        name = stream.name
    os.replace(name, path)


def read(path, default=None):
    return json.loads(Path(path).read_text()) if Path(path).is_file() else default


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def valid_build(value):
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def payload_path(value):
    p = PurePosixPath(value)
    safe = not p.is_absolute() and ".." not in p.parts and all(not x.startswith(".") for x in p.parts)
    return safe and (value in {"LICENSE", "agent-os/pyproject.toml", "agent-os/uv.lock", "agent-os/compatibility.lock.json",
        "agent-os/README.md", "agent-os/THIRD_PARTY_NOTICES.md", "agent-os/CHANGELOG.md",
        "agent-os/docs/NODE-RUNTIMES.md", "agent-os/docs/NODE-UPDATES.md"} or
        len(p.parts) >= 4 and p.parts[:3] == ("agent-os", "src", "ara_os") and p.suffix == ".py" or
        len(p.parts) == 3 and p.parts[:2] == ("agent-os", "scripts") and p.suffix in {".py", ".sh"})


def unpack(package, destination, descriptor):
    """Verify the archive and every member before extracting any payload file."""
    if package.stat().st_size != descriptor["size"] or package.stat().st_size > MAX_PACKAGE:
        raise ValueError("Package size does not match the release")
    if hashlib.sha256(package.read_bytes()).hexdigest() != descriptor["sha256"]:
        raise ValueError("Package checksum does not match the release")
    with tarfile.open(package, "r:gz") as archive:
        members = archive.getmembers()
        if len(members) > 3000 or sum(m.size for m in members) > MAX_PACKAGE or any(not m.isfile() for m in members):
            raise ValueError("Package contains unsupported archive members")
        names = [m.name for m in members]
        if len(names) != len(set(names)) or "agent-os/release.json" not in names:
            raise ValueError("Package has duplicate members or no manifest")
        manifest = json.load(archive.extractfile("agent-os/release.json"))
        identity = dict(manifest)
        build_id = identity.pop("build_id", None)
        if (build_id != descriptor["build_id"] or not valid_build(build_id) or
                hashlib.sha256(canonical(identity)).hexdigest() != build_id or
                manifest.get("contract") != CONTRACT or manifest.get("version") != descriptor["version"] or
                manifest.get("runtime_revision") != descriptor["runtime_revision"]):
            raise ValueError("Package manifest does not match the requested release")
        expected = manifest.get("files", {})
        if set(names) != set(expected) | {"agent-os/release.json"} or any(not payload_path(n) for n in expected):
            raise ValueError("Package paths do not match its manifest")
        payloads = {}
        for name, entry in expected.items():
            data = archive.extractfile(name).read()
            if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"] or entry["mode"] not in {0o600, 0o700}:
                raise ValueError("Package file failed integrity verification")
            payloads[name] = data
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name, data in payloads.items():
            path = destination / name
            if any(p.is_symlink() for p in [path, *path.parents]):
                raise ValueError("Refusing a linked release path")
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(data)
            path.chmod(expected[name]["mode"])
        atomic(destination / "agent-os/release.json", manifest)
        return manifest


def fetch(enrollment, path, destination=None, limit=MAX_PACKAGE):
    host = enrollment["host"].rstrip("/")
    parsed = urlsplit(host)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError("Invalid enrolled coordinator address")
    if parsed.scheme == "http" and not enrollment.get("allow_insecure_http"):
        import ipaddress
        hostname = parsed.hostname.lower()
        safe = hostname == "localhost" or hostname.endswith((".local", ".ts.net"))
        try:
            ip = ipaddress.ip_address(hostname)
            safe = safe or ip.is_loopback or any(ip in ipaddress.ip_network(net) for net in
                ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"))
        except ValueError:
            pass
        if not safe:
            raise ValueError("Release downloads require HTTPS or an explicitly configured private link")
    request = Request(host + path, headers={"X-ARA-Node-Key": enrollment["token"]})
    # Never forward a node credential to a redirect target.
    from urllib.request import HTTPRedirectHandler, build_opener
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError("Release downloads cannot redirect to another address")
    with build_opener(NoRedirect).open(request, timeout=60) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Release response exceeds its size limit")
    if destination:
        Path(destination).write_bytes(data)
    else:
        return json.loads(data)


def prepare(root, state, enrollment, descriptor, *, native=None, progress=lambda phase: None, run=subprocess.run):
    root, state = Path(root).resolve(), Path(state).resolve()
    build_id = descriptor.get("build_id")
    if not valid_build(build_id) or descriptor.get("contract") != CONTRACT:
        raise ValueError("Unsupported release identity or update contract")
    directory = state / "node-releases" / build_id
    if directory.is_symlink() or directory.parent.is_symlink():
        raise ValueError("Refusing a linked release directory")
    ready = directory / "prepared.json"
    if ready.is_file():
        plan = read(ready)
        if Path(plan["python"]).is_file():
            return plan
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    archive = directory / "package.tar.gz"
    progress("downloading")
    fetch(enrollment, f"/api/v1/releases/{build_id}/package", archive)
    progress("verifying")
    unpack(archive, directory, descriptor)
    project = directory / "agent-os"
    log = directory / "install.log"
    env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT"}}
    env.update(ARA_STATE_DIR=str(state), ARA_CLI_BIN_DIR=str(directory / "bin"), UV_CACHE_DIR=str(state / "update-cache"))
    uv = shutil.which("uv")
    if not uv:
        raise ValueError("Install uv on this node before updating")
    def command(args, cwd=project):
        with log.open("ab") as output:
            os.chmod(log, 0o600)
            result = run(args, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=900)
        if result.returncode:
            raise ValueError("Release setup failed; inspect the node's private install.log")
    progress("installing_dependencies")
    command([uv, "sync", "--frozen", "--no-dev", "--python", sys.executable, "--project", str(project)])
    python = project / ".venv/bin/python"
    previous = read(root / "compatibility.lock.json", {})
    native = native or {"source": str(root / ".runtime/ara-agent"), "python": str(root / ".runtime/env/bin/python"), "tools": str(root / ".runtime/tools")}
    if previous.get("runtime", {}).get("revision") != descriptor["runtime_revision"] or not Path(native["python"]).exists():
        progress("installing_runtime")
        runtime_python = read(project / "compatibility.lock.json")["runtime"]["python"]
        command([uv, "python", "install", "--no-bin", "--no-registry", runtime_python])
        command([str(python), str(project / "scripts/setup_runtime.py")])
        native = {"source": str(project / ".runtime/ara-agent"), "python": str(project / ".runtime/env/bin/python"), "tools": str(project / ".runtime/tools")}
    progress("checking")
    command([str(python), "-c", "from ara_os import __version__; from ara_os import cli, node_updates, node_install; "
        f"assert __version__ == {descriptor['version']!r}"])
    active = read(state / "node-active-release.json") or {}
    install_root = active.get("installation_root") or os.environ.get("ARA_INSTALL_ROOT") or (state.parent if state.name == ".state" else root)
    plan = {"project": str(project), "python": str(python), "native": native, "installation_root": str(install_root),
        "build_id": build_id, "version": descriptor["version"], "runtime_revision": descriptor["runtime_revision"]}
    atomic(ready, plan)
    return plan


def activate(state, plan):
    state = Path(state)
    active = state / "node-active-release.json"
    previous = read(active)
    if previous and previous.get("build_id") == plan["build_id"]:
        return
    atomic(state / "node-previous-release.json", previous)
    atomic(active, plan)


def child_env(state, plan):
    env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "ARA_COORDINATOR_ONLY"}}
    env["ARA_STATE_DIR"] = str(state)
    if plan and plan.get("installation_root"):
        env["ARA_INSTALL_ROOT"] = plan["installation_root"]
    if plan and (Path(plan["project"]).parent / "bin").is_dir():
        env["PATH"] = str(Path(plan["project"]).parent / "bin") + os.pathsep + env.get("PATH", "")
    native = (plan or {}).get("native", {})
    for key, value in (("source", "ARA_RUNTIME_SOURCE"), ("python", "ARA_RUNTIME_PYTHON"), ("tools", "ARA_RUNTIME_TOOLS")):
        if key in native:
            env[value] = native[key]
    return env


def booted(state, process, plan):
    health = read(Path(state) / "node-worker-health.json", {})
    return health.get("pid") == process.pid and health.get("build_id") == plan.get("build_id")


def install_command(root, state, plan):
    """Publish a stable command after a verified release has been activated."""
    project = Path(plan["project"])
    code = (f"import sys; sys.path.insert(0, {str(project / 'src')!r}); "
        "from ara_os.launchers import install_ara_cli, ensure_shell_path; from pathlib import Path; import os; "
        f"root=Path({str(Path(root).resolve())!r}); source=Path({str(project)!r}); state=Path({str(Path(state).resolve())!r}); "
        "directory=Path(os.environ['ARA_CLI_BIN_DIR']) if os.environ.get('ARA_CLI_BIN_DIR') else Path.home()/'.local/bin'; "
        "\ntry: command=install_ara_cli(root, directory, source_root=source, state=state)"
        "\nexcept FileExistsError: command=install_ara_cli(root, root/'.state/bin', source_root=source, state=state)"
        "\nensure_shell_path(command.parent); print('ARA command: '+str(command))")
    subprocess.run([plan["python"], "-I", "-c", code], check=True, env=child_env(state, plan), timeout=30)
    atomic(Path(state) / "node-cli-status.json", {"state": "installed", "version": plan.get("version"), "build_id": plan.get("build_id")})


def supervise(root, state, mode="work", *, popen=subprocess.Popen, now=time.monotonic, sleep=time.sleep, boot_timeout=60):
    """One stable parent owns the worker PID and can roll back a failed new boot."""
    root, state = Path(root).resolve(), Path(state).resolve()
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / ".node-worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("A node worker supervisor is already running for this state directory")
        stopping = False
        def stop(signum, frame):
            nonlocal stopping
            stopping = True
        handlers = {s: signal.signal(s, stop) for s in (signal.SIGINT, signal.SIGTERM)}
        try:
            while not stopping:
                plan = read(state / "node-active-release.json")
                project, python = (Path(plan["project"]), plan["python"]) if plan else (root, str(root / ".venv/bin/python"))
                entry = "_" + mode if (project / "src/ara_os/node_updates.py").is_file() else mode
                process = popen([python, "-m", "ara_os.cli", "--state", str(state), "node", entry],
                    cwd=project, env=child_env(state, plan))
                deadline, healthy = now() + boot_timeout, not plan
                while process.poll() is None and not stopping:
                    if plan and booted(state, process, plan):
                        healthy = True
                    if not healthy and now() >= deadline:
                        break
                    sleep(.2)
                if stopping or process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait()
                if stopping:
                    return 0
                if plan and not healthy:
                    previous = read(state / "node-previous-release.json")
                    receipt = read(state / "node-update.json", {})
                    if previous and previous.get("build_id") == plan.get("build_id"):
                        atomic(state / "node-update.json", {**receipt, "phase": "failed", "detail": "The restored worker also failed its boot check; inspect its startup logs"})
                        return process.returncode or 1
                    atomic(state / "node-active-release.json", previous)
                    atomic(state / "node-update.json", {**receipt, "phase": "failed", "detail": "New worker failed its boot check; restored the previous release"})
                    continue
                if process.returncode != 75:
                    return process.returncode
                receipt = read(state / "node-update.json", {})
                if receipt.get("phase") != "waiting_for_idle" or not receipt.get("plan"):
                    raise ValueError("Worker requested restart without a verified prepared release")
                activate(state, receipt["plan"])
                atomic(state / "node-update.json", {**receipt, "phase": "restarting"})
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)


def main():
    parser = argparse.ArgumentParser(description="Install ARA node update support without replacing node data")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--state", type=Path)
    parser.add_argument("--build")
    args = parser.parse_args()
    root = args.root.resolve()
    state = (args.state or root / ".state").resolve()
    enrollment = read(state / "node-connection.json")
    if not enrollment:
        raise ValueError("Run this installer from the paired agent-os directory, or provide --root and --state")
    descriptor = fetch(enrollment, "/api/v1/releases/current", limit=64000)
    if args.build and descriptor["build_id"] != args.build:
        raise ValueError("The host release changed; copy a fresh update command from the dashboard")
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / ".node-worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Stop the existing node worker before running the installer. Use dashboard updates while it is running.")
        plan = prepare(root, state, enrollment, descriptor, progress=lambda phase: print(phase, flush=True))
        activate(state, plan)
        install_command(root, state, plan)
    raise SystemExit(supervise(root, state))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
