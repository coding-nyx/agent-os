"""Release integrity, staging, restart/rollback and authenticated update receipts."""
import hashlib
import io
import json
from pathlib import Path
import shutil
from types import SimpleNamespace

import pytest

from ara_os import config, node_install, node_updates, releases


def test_release_version_has_one_python_authority():
    import tomllib
    from ara_os import __version__
    root = Path(__file__).resolve().parents[1]
    metadata = tomllib.loads((root / "pyproject.toml").read_text())
    assert "version" not in metadata["project"]
    assert "version" in metadata["project"]["dynamic"]
    assert metadata["tool"]["hatch"]["version"]["path"] == "src/ara_os/__init__.py"
    assert json.loads((root / "compatibility.lock.json").read_text())["version"] == __version__
    assert json.loads((root / "web/package.json").read_text())["version"] == __version__
    frontend_lock = json.loads((root / "web/package-lock.json").read_text())
    assert frontend_lock["version"] == frontend_lock["packages"][""]["version"] == __version__


@pytest.fixture
def release_tree(tmp_path, monkeypatch):
    root = tmp_path / "project/agent-os"
    (root / "src/ara_os").mkdir(parents=True)
    (root / "src/ara_os/__init__.py").write_text('__version__ = "0.2.0"\n')
    (root / "src/ara_os/node_updates.py").write_text('VALUE = "first"\n')
    (root / "src/ara_os/node_install.py").write_text('# installer fixture\n')
    (root / "pyproject.toml").write_text('[project]\nname="ara-agent-os"\ndynamic=["version"]\n')
    (root / "uv.lock").write_text('version = 1\n')
    (root / "compatibility.lock.json").write_text(json.dumps({"version": "0.2.0", "api_version": 1, "runtime": {"revision": "a" * 40}}))
    (root / ".state").mkdir()
    (root / ".state/secret").write_text("never ship this")
    (root / ".env").write_text("SECRET=never-ship")
    (root / "node-enrollment.json").write_text('{"token":"never-ship"}')
    (root / "src/ara_os/linked.py").symlink_to(root / ".state/secret")
    monkeypatch.setattr(config, "ROOT", root)
    monkeypatch.setattr(config, "STATE", tmp_path / "state")
    return root


def test_packages_are_allowlisted_immutable_and_reproducible(release_tree, tmp_path):
    first = releases.current()
    archive, _ = releases.package(first["build_id"])
    original = archive.read_bytes()
    assert releases.current() == first
    manifest = node_install.unpack(archive, tmp_path / "unpacked", first)
    names = set(manifest["files"])
    assert not any("secret" in p or ".env" in p or "enrollment" in p or "linked.py" in p for p in names)
    assert manifest["version"] == "0.2.0"
    assert all(releases.allowed(p) for p in names)
    # Rebuild into a different cache: the archive itself has deterministic bytes.
    config.STATE = tmp_path / "other-cache"
    rebuilt = releases.current()
    assert rebuilt["sha256"] == first["sha256"]
    (release_tree / "src/ara_os/node_updates.py").write_text('VALUE = "second"\n')
    second = releases.current()
    assert second["version"] == first["version"] and second["build_id"] != first["build_id"]
    assert archive.read_bytes() == original


def test_corrupt_package_never_writes_payload(release_tree, tmp_path):
    release = releases.current()
    source, _ = releases.package(release["build_id"])
    bad = tmp_path / "bad.tar.gz"
    bad.write_bytes(source.read_bytes()[:-1] + b"!")
    destination = tmp_path / "destination"
    with pytest.raises(ValueError, match="checksum"):
        node_install.unpack(bad, destination, release)
    assert not destination.exists()


@pytest.mark.parametrize("kind", ["traversal", "link", "duplicate", "file_tamper"])
def test_manifest_does_not_allow_archive_substitution(release_tree, tmp_path, kind):
    import tarfile
    release = releases.current()
    source, _ = releases.package(release["build_id"])
    bad = tmp_path / "substitution.tar.gz"
    with tarfile.open(source) as original, tarfile.open(bad, "w:gz") as modified:
        for item in original.getmembers():
            data = original.extractfile(item).read()
            if kind == "file_tamper" and item.name.endswith("__init__.py"):
                data = b'__version__ = "9.9.9"\n'
                item.size = len(data)
            modified.addfile(item, io.BytesIO(data))
        if kind != "file_tamper":
            item = tarfile.TarInfo("../escape" if kind == "traversal" else "agent-os/src/ara_os/__init__.py")
            if kind == "link":
                item.type = tarfile.SYMTYPE
                item.linkname = "../escape"
            modified.addfile(item, io.BytesIO(b""))
    descriptor = {**release, "sha256": hashlib.sha256(bad.read_bytes()).hexdigest(), "size": bad.stat().st_size}
    with pytest.raises(ValueError):
        node_install.unpack(bad, tmp_path / "destination", descriptor)
    assert not (tmp_path / "destination").exists()
    assert not (tmp_path / "escape").exists()


def test_prepare_stages_a_new_environment_and_retains_state(release_tree, tmp_path, monkeypatch):
    release = releases.current()
    source, _ = releases.package(release["build_id"])
    monkeypatch.setattr(node_install, "fetch", lambda enrollment, path, destination: shutil.copy2(source, destination))
    monkeypatch.setattr(node_install.shutil, "which", lambda name: "/fixture/uv")
    state = tmp_path / "node-state"
    state.mkdir()
    (state / "node-connection.json").write_text('{"token":"keep-this"}')
    phases, commands = [], []
    def install(args, **kwargs):
        commands.append(args)
        if args[1] == "sync":
            python = Path(args[-1]) / ".venv/bin/python"
            python.parent.mkdir(parents=True)
            python.write_text("fixture interpreter")
        return SimpleNamespace(returncode=0)
    plan = node_install.prepare(release_tree, state, {}, release, native={"python": __file__, "source": "native-source", "tools": "native-tools"},
        progress=phases.append, run=install)
    assert "--frozen" in commands[0] and "--no-dev" in commands[0]
    assert Path(plan["project"]).is_relative_to(state / "node-releases")
    assert not (state / "node-active-release.json").exists()
    assert json.loads((state / "node-connection.json").read_text())["token"] == "keep-this"
    assert phases == ["downloading", "verifying", "installing_dependencies", "checking"]
    node_install.activate(state, plan)
    assert node_install.read(state / "node-active-release.json")["build_id"] == release["build_id"]


async def test_node_rejects_a_stale_downgrade_request(release_tree, monkeypatch):
    updater = node_updates.NodeUpdater({})
    descriptor = {"version": "0.1.0", "build_id": "b" * 64}
    request = {"id": "stale", **descriptor, "descriptor": descriptor}
    def prepare(*args, **kwargs):
        pytest.fail("A stale downgrade must not prepare or activate a release")
    monkeypatch.setattr(node_updates, "prepare", prepare)
    await updater.prepare_request(request, {"id": request["id"], "build_id": request["build_id"]})
    assert node_install.read(updater.path)["phase"] == "failed"
    assert not (config.STATE / "node-active-release.json").exists()


def test_failed_install_keeps_running_pointer(release_tree, tmp_path, monkeypatch):
    release = releases.current()
    source, _ = releases.package(release["build_id"])
    state = tmp_path / "node-state"
    node_install.atomic(state / "node-active-release.json", {"build_id": "old"})
    monkeypatch.setattr(node_install, "fetch", lambda enrollment, path, destination: shutil.copy2(source, destination))
    monkeypatch.setattr(node_install.shutil, "which", lambda name: "/fixture/uv")
    with pytest.raises(ValueError, match="setup failed"):
        node_install.prepare(release_tree, state, {}, release, run=lambda *args, **kwargs: SimpleNamespace(returncode=1))
    assert node_install.read(state / "node-active-release.json") == {"build_id": "old"}


def test_supervisor_activates_then_observes_new_worker_health(release_tree, tmp_path):
    state = tmp_path / "supervisor"
    new = {"build_id": "b" * 64, "project": str(release_tree), "python": "/fixture/new-python"}
    node_install.atomic(state / "node-update.json", {"id": "update", "phase": "waiting_for_idle", "plan": new})
    calls = []
    class Process:
        def __init__(self, index):
            self.pid, self.returncode, self.count = 9000 + index, None, 0
            self.index = index
        def poll(self):
            self.count += 1
            if self.index == 0:
                self.returncode = 75
            elif self.count > 2:
                self.returncode = 0
            else:
                node_install.atomic(state / "node-worker-health.json", {"pid": self.pid, "build_id": new["build_id"]})
            return self.returncode
    def spawn(args, **kwargs):
        result = Process(len(calls))
        calls.append(args)
        return result
    assert node_install.supervise(release_tree, state, popen=spawn, sleep=lambda _: None) == 0
    assert len(calls) == 2 and calls[1][0] == "/fixture/new-python"
    assert node_install.read(state / "node-active-release.json")["build_id"] == new["build_id"]


def test_failed_new_boot_rolls_back_before_starting_old_worker(release_tree, tmp_path):
    state = tmp_path / "rollback"
    old = {"build_id": "a" * 64, "project": str(release_tree), "python": "/fixture/old-python"}
    new = {**old, "build_id": "b" * 64, "python": "/fixture/new-python"}
    node_install.atomic(state / "node-active-release.json", old)
    node_install.activate(state, new)
    node_install.atomic(state / "node-update.json", {"id": "update", "phase": "restarting"})
    calls = []
    class Process:
        def __init__(self, index): self.index, self.pid, self.returncode, self.count = index, 9000 + index, None, 0
        def poll(self):
            self.count += 1
            if self.index == 0: self.returncode = 1
            elif self.count > 2: self.returncode = 0
            else: node_install.atomic(state / "node-worker-health.json", {"pid": self.pid, "build_id": old["build_id"]})
            return self.returncode
    def spawn(args, **kwargs):
        process = Process(len(calls)); calls.append(args); return process
    assert node_install.supervise(release_tree, state, popen=spawn, sleep=lambda _: None) == 0
    assert [args[0] for args in calls] == [new["python"], old["python"]]
    assert node_install.read(state / "node-active-release.json") == old
    assert node_install.read(state / "node-update.json")["phase"] == "failed"


def test_version_order_and_same_version_build_updates():
    assert node_updates.version_key("0.2.0-rc.9") < node_updates.version_key("0.2.0-rc.10") < node_updates.version_key("0.2.0")
    target = {"version": "0.2.0", "build_id": "b" * 64}
    software = {"version": "0.2.0", "build_id": "a" * 64, "contract": releases.CONTRACT}
    assert node_updates.describe({"software": software}, target)["update_available"]
    assert node_updates.describe({"software": {**software, "version": "0.3.0"}}, target)["ahead"]
    assert node_updates.describe({}, target)["bootstrap_required"]


def test_draining_waits_for_native_observers(tmp_path, monkeypatch):
    from ara_os.runtime_journal import RuntimeJournal
    from ara_os import swarm_runner
    monkeypatch.setattr(config, "STATE", tmp_path)
    node_install.atomic(tmp_path / "node-update.json", {"phase": "waiting_for_idle"})
    updater = object.__new__(node_updates.NodeUpdater)
    updater.path = tmp_path / "node-update.json"
    monkeypatch.setattr(RuntimeJournal, "rows", lambda self: [{"state": "observing"}])
    monkeypatch.setattr(swarm_runner, "journal", lambda: SimpleNamespace(pending=lambda: []))
    assert not updater.ready(SimpleNamespace(job=None))
    monkeypatch.setattr(RuntimeJournal, "rows", lambda self: [{"state": "finished"}])
    assert updater.ready(SimpleNamespace(job=None))


def test_authenticated_update_request_and_receipts(system):
    client = system["client"]
    enrollment = client.post("/machines", json={"name": "Versioned update node"}).json()["enrollment"]
    id = enrollment["machine_id"]
    headers = {"X-ARA-Node-Key": enrollment["token"]}
    release = client.get("/releases/current").json()
    legacy = client.post(f"/machines/{id}/update", json={"build_id": release["build_id"]})
    assert legacy.status_code == 409 and legacy.json()["error"]["code"] == "node_updater_required"
    command = client.get(f"/machines/{id}/update/bootstrap").json()["command"]
    assert "install-update.sh" in command and enrollment["token"] not in command
    software = {"version": "0.1.0", "build_id": "a" * 64, "runtime_revision": release["runtime_revision"], "contract": releases.CONTRACT}
    assert client.post("/nodes/updates/poll", json={"machine_id": id, "software": software}).status_code == 401
    assert client.post("/nodes/updates/poll", headers=headers, json={"machine_id": id, "software": software}).status_code == 200
    requested = client.post(f"/machines/{id}/update", json={"build_id": release["build_id"]}).json()["request"]
    assert requested["phase"] == "queued"
    assert client.post(f"/machines/{id}/update", json={"build_id": release["build_id"]}).json()["request"]["id"] == requested["id"]
    receipt = {"id": requested["id"], "build_id": release["build_id"], "phase": "complete"}
    # The old process cannot certify installation of the new build.
    response = client.post("/nodes/updates/poll", headers=headers, json={"machine_id": id, "software": software, "receipt": receipt})
    assert response.json()["update"]["phase"] == "queued"
    response = client.post("/nodes/updates/poll", headers=headers, json={"machine_id": id, "software": release, "receipt": receipt})
    assert response.json()["update"] is None
    status = client.get(f"/machines/{id}/update").json()
    assert status["status"] == "up_to_date" and status["request"]["phase"] == "complete"
    downloaded = client.get(release["download_path"].removeprefix("/api/v1"))
    assert downloaded.status_code == 200
    assert hashlib.sha256(downloaded.content).hexdigest() == release["sha256"]
    assert "immutable" in downloaded.headers["cache-control"]
    script = client.get("/nodes/install-update.sh").text
    assert release["build_id"] in script and "Installer checksum mismatch" in script


def test_queued_update_can_be_cancelled_only_before_delivery(system):
    client = system["client"]
    enrollment = client.post("/machines", json={"name":"Cancellable update fixture"}).json()["enrollment"]
    id = enrollment["machine_id"]
    headers = {"X-ARA-Node-Key":enrollment["token"]}
    release = client.get('/releases/current').json()
    software = {"version":"0.1.0","build_id":"a"*64,"contract":releases.CONTRACT}
    client.post('/nodes/updates/poll',headers=headers,json={"machine_id":id,"software":software}).raise_for_status()
    queued = client.post(f'/machines/{id}/update',json={"build_id":release["build_id"]}).json()
    assert queued["can_cancel"]
    assert client.post(f'/machines/{id}/update/cancel',json={"request_id":"stale-id"}).status_code == 409
    cancelled = client.post(f'/machines/{id}/update/cancel',json={"request_id":queued["request"]["id"]})
    assert cancelled.status_code == 200 and cancelled.json()["request"]["phase"] == "cancelled"
    poll = client.post('/nodes/updates/poll',headers=headers,json={"machine_id":id,"software":software})
    assert poll.json()["update"] is None
    next_request = client.post(f'/machines/{id}/update',json={"build_id":release["build_id"]}).json()["request"]
    assert next_request["id"] != queued["request"]["id"]
    client.post('/nodes/updates/poll',headers=headers,json={"machine_id":id,"software":software}).raise_for_status()
    assert not client.get(f'/machines/{id}/update').json()["can_cancel"]
    refused = client.post(f'/machines/{id}/update/cancel',json={"request_id":next_request["id"]})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "update_already_delivered"


def test_one_time_installer_refuses_a_running_supervisor_before_activation(tmp_path, monkeypatch):
    import fcntl
    import sys
    state = tmp_path / '.state'
    node_install.atomic(state / 'node-connection.json', {"machine_id":"fixture"})
    monkeypatch.setattr(sys,'argv',['installer','--root',str(tmp_path),'--state',str(state)])
    monkeypatch.setattr(node_install,'fetch',lambda *a,**kw:{"build_id":"a"*64})
    def unexpected(*a,**kw): pytest.fail('A running installation must not be prepared or activated')
    monkeypatch.setattr(node_install,'prepare',unexpected)
    with (state / '.node-worker.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with pytest.raises(ValueError,match='Stop the existing node worker'):
            node_install.main()
    assert not (state / 'node-active-release.json').exists()


async def test_update_progress_is_reported_while_preparation_runs(release_tree, monkeypatch):
    import asyncio
    import threading
    started, finish = threading.Event(), threading.Event()
    descriptor = {"version": "0.2.0", "build_id": "b" * 64}
    request = {"id": "request", **descriptor, "descriptor": descriptor}
    calls = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, path, **kwargs):
            calls.append(kwargs["json"])
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"update": request})
    def prepare(*args, **kwargs):
        kwargs["progress"]("installing_dependencies")
        started.set()
        assert finish.wait(3)
        return {"project": "prepared", "build_id": descriptor["build_id"]}
    monkeypatch.setattr(node_updates.httpx, "AsyncClient", Client)
    monkeypatch.setattr(node_updates, "prepare", prepare)
    updater = node_updates.NodeUpdater({"host": "http://127.0.0.1:8787", "token": "test-only", "machine_id": "node"})
    try:
        await updater.exchange()
        assert await asyncio.to_thread(started.wait, 2)
        await updater.exchange()
        assert calls[-1]["receipt"]["phase"] == "installing_dependencies"
    finally:
        finish.set()
        await asyncio.wait_for(updater.preparation, 2)
    assert node_install.read(updater.path)["phase"] == "waiting_for_idle"
