# Native agents on nodes

Each instance owns a native Hermes profile on its machine. Hermes owns inference,
tools, sessions, memory, accounts, channels and schedules. ARA supplies deployment
controls, instance selection and a durable coordinator connection. Standalone
instances need neither pairing nor PostgreSQL.

## Standalone use

From `agent-os`:

```sh
bash scripts/setup-node.sh --profile my-agent
# Open a new terminal, or apply the PATH command printed by setup.
ara runtime my-agent -- model
ara node start my-agent
ara chat my-agent
```

`ara node list` shows local instance IDs. `ara node stop my-agent` parks that
native profile. `ara runtime my-agent -- …` opens native account, skill, memory
and gateway controls. Imports register locally without an application database.
Node setup installs a local MCP server for native swarms and computer tools;
swarm policy and computer view/input grants remain explicit node-local controls.

Setup publishes `ara` in `~/.local/bin` independently of existing Hermes commands
and adds its directory to the login and interactive shell startup files. If that
command belongs to another installation, it preserves it and uses `.state/bin`.
`ARA_CLI_BIN_DIR` selects an explicit command directory. The launcher follows the
active release and retains the original state directory after an update. Use
`ara --version` and `ara node status` from any directory to inspect it.

Export a portable profile with `ara export my-agent --output ./my-agent.tar.gz`.
The file is private, existing files are preserved, credentials are scrubbed, and
channels/schedules stay inactive. Preview an import with
`ara import native ./my-agent.tar.gz --name imported-agent`, then add `--apply`
to install it. Both operations work without PostgreSQL or a connected dashboard.

On Linux with systemd user services or macOS with launchd, `ara node service
install` installs the supervisor and optional coordinator link. `ara node
service status` reports it. Linux boot startup follows the user manager;
startup before login requires the usual linger configuration. On macOS, the
LaunchAgent starts at graphical login and runs only in that user's session.
`ara node service remove` removes the ARA control service; `ara node stop NAME`
stops an individual native instance.

## Dashboard

Pair the machine, then run `ara node work` or install its node service. Deploy
from an agent's **Deployments** tab. Select **Agent runtime**, configure that
instance's provider in **Connections**, then open **Conversation**.

Deployment assignment and native runtime readiness are separate. The deployment
card reports the node's observed runtime state and native failure reason. Use
**Check runtime** to query Hermes on that machine, or **Start runtime** to request
native startup without submitting inference. These controls require the updated
code on both the host and node. An offline node's last receipt does not establish
current readiness; selecting a model alone does not establish usable credentials.

The selector scopes identity, skills, memory, role preferences, native history,
voice, integrations, channels and automations. Requests carry their machine
selection. Conversations retain the instance and ownership epoch captured at
creation. Changing the default machine affects new conversations. A disabled or
replaced owner never redirects historical turns to another machine.

The Create agent form supports a node directly, without provisioning a native
host profile. Pairing reports existing standalone instances without claiming
them. **Adopt an existing standalone instance** explicitly links one to a logical
agent while retaining its native account, memory and sessions on that node.

## Profile definition sync

**Publish selected instance** captures actual SOUL and instruction files, skill
files including binary assets and executable flags, and supported portable
configuration. Deployment uses this versioned artifact rather than a stale seed.

Nodes compare published files with their prior base and current files. Local
edits are retained when only the node changed a file; edits on both sides produce
a conflict. Removed managed paths become tombstones. Unmanaged files and
configuration fields stay local. **Review published changes** previews paths
before an explicit apply; both published and local revisions must still match.
Publishing from a node shares its definition edits with the other instances.

Credentials, OAuth refresh ownership, sessions, memory, channels, schedules,
MCP connections, workspaces and tool grants remain local. Definition sync never
merges live SQLite stores. Explicit exports use native coherent snapshots, scrub
credentials and disable imported channels and schedules. Remote exports are
limited to 32 MB. Definitions allow 1,500 files, 512 KB per file, 8 MB of source
content and 11 MB encoded. Unsupported configuration categories are listed as
excluded in the manifest.

## Coordinator without local Hermes

After installing the application dependencies, PostgreSQL and web build, use
`ara serve --coordinator-only`. This persists coordinator mode; later `ara serve`
starts retain it. `--with-local-runtime` explicitly switches back. Startup creates
logical definitions without local profiles or model accounts. Coordinator
backups also work without a native runtime installation.

## Existing nodes and recovery

The **Node software** panel in **Machines & sync** reports installed/available
versions, packages and update progress. Legacy nodes need its one-time upgrade
command; workers with update support can be updated directly from the dashboard.
See [release/update behavior](NODE-UPDATES.md) for staging, restart and rollback.

Install this updated checkout on each node, refresh its dependencies with the
node setup script if needed, and restart `ara node work` or its node service.
The machine's bootstrap command in **Machines & sync** downloads the current
host bundle, including these workspace changes. Stop the previous worker before
running the upgraded worker.
Native commands require the node's `ara-runtime/1` advertisement and confirmed
instance ownership. Existing managed profiles can publish their actual native
definition after upgrade; unrelated standalone profiles require adoption.

The node journals encrypted commands and ordered events locally. The coordinator
acknowledges sequences after committing their projection. A crashed observer
reconnects to an admitted native receipt without resubmitting the prompt. Missing
admission evidence or a lost journal produces an uncertain outcome requiring
native history inspection. Deployment generations and instance ownership epochs
fence work intended for previous owners.

Python compilation and the production web build passed. Multi-machine inference,
outage, service restart and physical desktop acceptance checks have not been run
for this change.
## Desktop setup on a node

With node version 0.2.1, open **System Control**, select the node's desktop and
use **Check driver & permissions**. Existing driver installations are reused;
the dashboard reports the selected executable and checks separately for macOS
Screen Recording and Accessibility. Opening the page never installs a driver,
opens a permission dialog, or captures the screen automatically.

**Request macOS permissions** opens the native CuaDriver flow on that Mac.
Approve CuaDriver in **System Settings → Privacy & Security → Screen Recording
and Accessibility**, then check again. The dashboard requests permissions; macOS
and the local user grant them. Use **Install managed driver** only when the
existing driver cannot be found and a managed installation is wanted.

Then explicitly enable the dashboard's observation/input switches, choose a
control mode, grant an assigned agent access, and use **Snapshot** to verify
capture. Setup works while observation is disabled; agent tools cannot invoke
these operator controls or grant themselves access. The local emergency stop
remains effective. Nodes without the setup capability must be updated first.

CLI alternatives in the node's graphical login session:

```bash
hermes computer-use permissions status --json
hermes computer-use permissions grant
ara cua remote --allow-view --allow-input --mode supervised
ara cua configure --profile NATIVE_NAME --allow-view --allow-input --mode supervised
ara node work
```
