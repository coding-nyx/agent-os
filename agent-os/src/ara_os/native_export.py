"""Native coherent portable snapshot creation; credentials and channels are scrubbed."""
from pathlib import Path
import os
import shutil


def portable(source_home, output, name):
    import tempfile
    import tarfile
    from types import SimpleNamespace
    from hermes_cli.backup import _write_full_zip_backup, run_import
    from hermes_cli.profile_channels import strip_channel_settings
    from hermes_cli.profiles import _scrub_export_secrets
    with tempfile.TemporaryDirectory(dir=source_home.parent, prefix="ara-portable-") as tmp:
        tmp = Path(tmp)
        snapshot = _write_full_zip_backup(tmp / "native.zip", source_home)
        if not snapshot:
            raise RuntimeError("Cannot capture a consistent native snapshot.")
        stage = tmp / "profile"
        os.environ["HERMES_HOME"] = str(stage)
        if run_import(SimpleNamespace(zipfile=str(snapshot), force=True)):
            raise RuntimeError("Cannot validate the captured native snapshot.")
        strip_channel_settings(stage, include_state=True)
        _scrub_export_secrets(stage)
        for credential_name in (".env", "auth.json", ".anthropic_oauth.json", "vault.key", "vault.json.enc"):
            (stage / credential_name).unlink(missing_ok=True)
        if (stage / "cron").exists():
            disabled = stage / "imported-cron-disabled"
            if disabled.exists():
                shutil.rmtree(disabled)
            (stage / "cron").rename(disabled)
        with tarfile.open(str(output), "w:gz") as archive:
            archive.add(stage, arcname=name)
