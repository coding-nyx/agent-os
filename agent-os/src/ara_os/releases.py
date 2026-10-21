"""Immutable, allowlisted node releases. No installation state enters a package."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile
import threading

from . import __version__, config

CONTRACT = "ara-node-update/1"
_lock = threading.Lock()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def allowed(path):
    p = PurePosixPath(path)
    if p.is_absolute() or ".." in p.parts or any(part.startswith(".") for part in p.parts):
        return False
    return (path in {"agent-os/pyproject.toml", "agent-os/uv.lock", "agent-os/compatibility.lock.json",
            "agent-os/README.md", "agent-os/THIRD_PARTY_NOTICES.md", "agent-os/CHANGELOG.md", "LICENSE"} or
        len(p.parts) >= 4 and p.parts[:3] == ("agent-os", "src", "ara_os") and p.suffix == ".py" or
        len(p.parts) == 3 and p.parts[:2] == ("agent-os", "scripts") and p.suffix in {".py", ".sh"} or
        path in {"agent-os/docs/NODE-RUNTIMES.md", "agent-os/docs/NODE-UPDATES.md"})


def source(root=None):
    root = Path(root or config.ROOT)
    files = {}
    paths = list((root / "src/ara_os").rglob("*.py")) + list((root / "scripts").glob("*"))
    paths += [root / p for p in ("pyproject.toml", "uv.lock", "compatibility.lock.json", "README.md",
        "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "docs/NODE-RUNTIMES.md", "docs/NODE-UPDATES.md")]
    paths.append(root.parent / "LICENSE")
    for path in sorted(paths):
        relative = "LICENSE" if path == root.parent / "LICENSE" else "agent-os/" + path.relative_to(root).as_posix()
        if not allowed(relative) or not path.is_file() or path.is_symlink():
            continue
        if any(parent.is_symlink() for parent in path.parents if parent != root.parent):
            raise ValueError("Linked source directories cannot enter a release")
        data = path.read_bytes()
        files[relative] = (data, 0o700 if os.access(path, os.X_OK) else 0o600)
    version_text = files["agent-os/src/ara_os/__init__.py"][0].decode()
    version = re.search(r'__version__\s*=\s*"([^"]+)"', version_text).group(1)
    compatibility = json.loads(files["agent-os/compatibility.lock.json"][0])
    if compatibility["version"] != version:
        raise ValueError("Package version and compatibility metadata disagree")
    manifest = {"contract": CONTRACT, "version": version, "api_version": compatibility["api_version"],
        "runtime_revision": compatibility["runtime"]["revision"],
        "files": {p: {"sha256": hashlib.sha256(v[0]).hexdigest(), "size": len(v[0]), "mode": v[1]}
                  for p, v in sorted(files.items())}}
    manifest["build_id"] = hashlib.sha256(canonical(manifest)).hexdigest()
    return manifest, files


def installed():
    path = config.ROOT / "release.json"
    if path.is_file():
        value = json.loads(path.read_text())
        return {k: value[k] for k in ("version", "build_id", "runtime_revision", "contract")}
    manifest, _ = source()
    return {k: manifest[k] for k in ("version", "build_id", "runtime_revision", "contract")}


def current():
    with _lock:
        manifest, files = source()
        directory = config.STATE / "releases" / manifest["build_id"]
        descriptor = directory / "descriptor.json"
        if descriptor.is_file():
            return json.loads(descriptor.read_text())
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        name = f"ara-node-{manifest['version']}-{manifest['build_id'][:12]}.tar.gz"
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as temp:
            staged = Path(temp.name)
            with gzip.GzipFile(fileobj=temp, mode="wb", filename="", mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w") as archive:
                    payloads = {**files, "agent-os/release.json": (canonical(manifest), 0o600)}
                    for path, (data, mode) in sorted(payloads.items()):
                        item = tarfile.TarInfo(path)
                        item.size, item.mode, item.mtime = len(data), mode, 0
                        archive.addfile(item, io.BytesIO(data))
        package = directory / name
        staged.replace(package)
        value = {k: manifest[k] for k in ("version", "build_id", "runtime_revision", "contract", "api_version")}
        value.update(filename=name, sha256=hashlib.sha256(package.read_bytes()).hexdigest(), size=package.stat().st_size,
            download_path=f"/api/v1/releases/{manifest['build_id']}/package", notes_path="/api/v1/releases/current/notes")
        (directory / "manifest.json").write_bytes(canonical(manifest))
        descriptor.write_bytes(canonical(value))
        return value


def package(build_id):
    if not re.fullmatch(r"[a-f0-9]{64}", build_id):
        raise ValueError("Invalid release identity")
    directory = config.STATE / "releases" / build_id
    descriptor = directory / "descriptor.json"
    if not descriptor.is_file():
        raise FileNotFoundError("This release is unavailable; refresh the release catalog")
    value = json.loads(descriptor.read_text())
    return directory / value["filename"], value
