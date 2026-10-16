from __future__ import annotations

import hashlib
import io
import json
import tempfile
import uuid
import zipfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select

from . import config, runtime
from .store import Entity, Event, Problem, create, listing, transaction, wire


def cipher():
    return Fernet(config.private_file("recovery.key", lambda: Fernet.generate_key().decode()).encode())


async def backup():
    with transaction() as session:
        if any(r["state"] in {"running", "accepted", "waiting"} for r in listing(session, "run")):
            raise Problem("work_in_progress", "Wait for active managed work to settle before taking a recovery bundle.", 409)
        rows = [wire(row) for row in session.scalars(select(Entity).where(Entity.kind != "backup"))]
        events = [{"sequence": e.sequence, "entity_id": e.entity_id, "type": e.type, "data": e.data,
                   "created_at": e.created_at.isoformat()} for e in session.scalars(select(Event).order_by(Event.sequence))]
    destination = config.STATE / "backups"
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    id = str(uuid.uuid4())
    with tempfile.TemporaryDirectory(dir=config.STATE, prefix="backup-") as tmp:
        native = Path(tmp) / "native.zip"
        await runtime.call({"operation": "backup", "output": str(native)})
        manifest = {"format": "ara-recovery-v1", "runtime_revision": config.UPSTREAM_REVISION,
            "native_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
            "scope": "Native WAL-safe database snapshots and Agent OS records; external vaults, memory services and workspaces excluded",
            "consistency": "native_databases_consistent; application_and_external_services_have_separate_capture_boundaries"}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
            archive.writestr("application.json", json.dumps(rows))
            archive.writestr("events.json", json.dumps(events))
            archive.write(native, "native.zip")
            for row in rows:
                if row["kind"] == "replica":
                    replica = config.STATE / "replicas" / Path(row["filename"]).name
                    if not replica.is_file():
                        raise Problem("replica_missing", "A received node snapshot is missing. Resolve it before taking a complete recovery bundle.", 409)
                    archive.write(replica, "replicas/" + replica.name)
        encrypted = cipher().encrypt(buffer.getvalue())
        path = destination / (id + ".ara")
        path.write_bytes(encrypted)
        path.chmod(0o600)
    with transaction() as session:
        return create(session, "backup", {"filename": path.name, "scope": manifest["scope"], "sha256": hashlib.sha256(encrypted).hexdigest(), "bytes": len(encrypted), "state": "verified_snapshot"}, id=id)


def unpack(source: Path, key: Path, destination: Path):
    if destination.exists() and any(destination.iterdir()):
        raise Problem("restore_target_not_empty", "Restore into an empty directory to preserve existing work.", 409)
    try:
        plaintext = Fernet(key.read_bytes().strip()).decrypt(source.read_bytes())
    except (InvalidToken, ValueError):
        raise Problem("invalid_recovery_key", "This key cannot decrypt the recovery bundle.")
    with zipfile.ZipFile(io.BytesIO(plaintext)) as archive:
        if len(archive.infolist()) > 20000 or sum(i.file_size for i in archive.infolist()) > 1024 * 1024 * 1024:
            raise Problem("backup_too_large", "Prototype recovery bundles are limited to 1 GB expanded.")
        manifest = json.loads(archive.read("manifest.json"))
        native = archive.read("native.zip")
        if manifest.get("format") != "ara-recovery-v1" or hashlib.sha256(native).hexdigest() != manifest["native_sha256"]:
            raise Problem("backup_integrity", "The recovery bundle did not pass integrity checks.")
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        (destination / "native.zip").write_bytes(native)
        (destination / "application-import.json").write_bytes(archive.read("application.json"))
        if "events.json" in archive.namelist():
            (destination / "event-import.json").write_bytes(archive.read("events.json"))
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2))
        for entry in archive.infolist():
            path = Path(entry.filename)
            if path.parts[:1] == ("replicas",):
                if len(path.parts) != 2 or not path.name.endswith(".ara") or not all(c in "0123456789abcdef.ara" for c in path.name):
                    raise Problem("backup_integrity", "The recovery bundle contains an invalid replica path.")
                replicas = destination / "replicas"; replicas.mkdir(exist_ok=True, mode=0o700)
                target = replicas / path.name
                target.write_bytes(archive.read(entry)); target.chmod(0o600)
        # Received node snapshots use the same recovery key as this envelope.
        (destination / "recovery.key").write_bytes(key.read_bytes().strip())
        (destination / "recovery.key").chmod(0o600)
    return manifest
