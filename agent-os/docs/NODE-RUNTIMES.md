# Native agents on nodes

Each instance owns a native Hermes profile on its machine. Hermes owns inference,
tools, sessions, memory, accounts, channels and schedules. ARA supplies deployment
controls, instance selection and a durable coordinator connection. Standalone
instances need neither pairing nor PostgreSQL.

## Standalone use

From `agent-os`:

```sh
bash scripts/setup-node.sh --profile my-agent
.venv/bin/ara runtime my-agent -- model
.venv/bin/ara node start my-agent
.venv/bin/ara chat my-agent
```

`ara node list` shows local instance IDs. `ara node stop my-agent` parks that
native profile. `ara runtime my-agent -- …` opens native account, skill, memory
and gateway controls. Imports register locally without an application database.
Node setup installs a local MCP server for native swarms and computer tools;
swarm policy and computer view/input grants remain explicit node-local controls.

On Linux with systemd user services, `ara node service install` installs the
supervisor and optional coordinator link. `ara node service status` reports it.
Boot startup follows the user manager; startup before login requires the usual
linger configuration. `ara node service remove` removes the ARA control service;
`ara node stop NAME` stops an individual native instance.

## Dashboard

Pair the machine, then run `ara node work` or install its node service. Deploy
from an agent's **Deployments** tab. Select **Agent runtime**, configure that
instance's provider in **Connections**, then open **Conversation**.

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
