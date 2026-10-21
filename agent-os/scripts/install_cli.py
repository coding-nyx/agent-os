"""Install the ARA command independently of any existing Hermes installation."""
import os
from pathlib import Path
import shlex
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))
from ara_os.launchers import ensure_shell_path, install_ara_cli

directory = Path(os.environ["ARA_CLI_BIN_DIR"]) if os.environ.get("ARA_CLI_BIN_DIR") else None
state = Path(os.environ.get("ARA_STATE_DIR", root / ".state"))
try:
    command = install_ara_cli(root, directory, state=state)
except FileExistsError as exc:
    if directory is not None:
        raise
    print(str(exc))
    command = install_ara_cli(root, root / ".state/bin", state=state)
    print("Preserved the existing ara command; this installation takes precedence in new shells.")
for path in ensure_shell_path(command.parent):
    print("Added ARA CLI to " + str(path))
print("ARA CLI installed: " + str(command))
print('For this terminal, run: export PATH=' + shlex.quote(str(command.parent)) + ':"$PATH"')
