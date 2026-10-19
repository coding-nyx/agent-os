"""Stage and validate native dependency refreshes without discarding a working env."""
from __future__ import annotations

from pathlib import Path
import tempfile
from uuid import uuid4


def refresh_environment(environment: Path, build, verify) -> Path | None:
    environment = environment.absolute()
    if environment.is_symlink():
        raise ValueError("Refusing to replace a linked runtime environment.")
    environment.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="runtime-build-", dir=environment.parent) as staging:
        candidate = Path(staging) / "env"
        build(candidate)
        verify(candidate)
        # Native PM builds relocatable environments. Keep the previous one recoverable
        # instead of deleting it, including when a post-promotion smoke check fails.
        previous = None
        if environment.exists():
            previous = environment.with_name("env-previous-" + uuid4().hex[:12])
            environment.rename(previous)
        try:
            candidate.rename(environment)
            verify(environment)
        except BaseException:
            if environment.exists():
                environment.rename(environment.with_name("env-failed-" + uuid4().hex[:12]))
            if previous:
                previous.rename(environment)
            raise
        return previous
