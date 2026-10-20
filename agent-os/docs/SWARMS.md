# Native swarms and execution nodes

Agent OS owns the task contract, placement, policy, durable receipts and UI.
The pinned Hermes adapter supplies real child-agent execution. Any enabled preset
or custom profile may coordinate a swarm; Ara is not a required intermediary.
See the [migration plan](SWARM-AND-COMPUTER-CONTROL-PLAN.md).

## Profile configuration

Use the profile's Swarms panel to enable execution, select presets and triggering
guidance, and explicitly grant worker toolsets. Native config stores policy under
`ara.swarm`; app metadata is not its execution authority. Legacy metadata-only
toggles require explicit re-enabling before real execution.

Defaults are disabled, explicit triggering, four workers maximum, three concurrent
workers, twelve iterations per worker, and a 600-second timeout per worker.
Tool grants default to web only. File/terminal access must be selected explicitly;
MCP capabilities, computer control, shared memory writes and recursive delegation
are not inherited. Native unattended dangerous-command requests are denied.

Models and credentials resolve in the owning native profile on the execution
machine. Tasks carry no provider credentials. Native connection setup must already
be usable there. Host-requested tool grants and limits intersect with node-local
policy; neither can broaden the other.

Intelligent/explicit triggering instructions guide the initiating model; they are
not a semantic proof that the user requested a particular task. Capability checks,
limits and tool grants are enforced independently of these instructions.

## Coding and dependent stages

Coding runs architecture, implementation, then review. Research/analysis run
independent first-stage workers followed by verification/advice. Custom roles
accept a bounded integer `stage`: equal stages run concurrently; later stages
receive earlier results and workspace artifacts.

Configure a clean, committed Git workspace for coding. Each worker gets its own
detached worktree. Earlier-stage patches/new text files are applied into the next
stage's isolated workspace and snapshotted as its baseline. Conflicts, missing Git
support, dirty source trees and incomplete artifacts fail closed rather than
falling back to shared writes.

Original repository changes are **not automatically applied**. Results include
preserved workspace paths, patches, bounded new-file contents and native session
IDs. The coordinator synthesizes actual outputs; reports are self-reports, not
automatically verified facts. Worktrees are collaboration isolation, not OS
security sandboxes: granted terminal/file tools still run as the node user.

Execution and artifact collection have separate outcomes. A collection error
retains the native session handle, execution error/result, workspace and known
usage. Unknown execution stays unknown even if collection also fails. Missing,
invalid or truncated artifacts block dependent stages; the inspector shows the
collection diagnostics separately from the worker's execution state.

Finalization evaluates synthesis before choosing the terminal outcome. Unknown
effects take precedence over cancellation; cancellation acknowledged by the local
execution journal before terminal publication produces cancelled. Cancellation
and terminal publication are serialized in one journal transaction. Completed
worker results survive synthesis failure or cancellation. A late cancellation
cannot relabel an already terminal local task. Host cancellation is a request
until the execution owner acknowledges it. Existing event receipts remain immutable.

## Standalone node execution

Install ARA and its pinned runtime, and configure the native profile/model on the
node. No Agent OS web server or PostgreSQL service is required for local swarms.

For a fresh execution-only installation, use `bash scripts/setup-node.sh --profile
coding-agent`. It skips PostgreSQL and the web build. On an already-installed
runtime, `ara node init --profile coding-agent` creates only the native profile.
Both are idempotent and leave swarm execution disabled. Configure the account
with `hermes --profile coding-agent model` before granting tools/enabling swarms.
An optional `--computer-control` installs the driver without enabling device grants.

```bash
ara swarm configure --profile coding-agent --enabled yes \
  --workspace /absolute/path/to/clean-repository --toolsets file,terminal,web

ara swarm run --profile coding-agent --preset coding \
  --task "Implement and verify the requested change" --operation-id change-001
ara swarm status TASK_ID
ara swarm cancel TASK_ID
```

Add `--wait` to await terminal output; by default the CLI admits durable work and
starts a detached execution owner. Custom roles are supplied through `--roles
roles.json` with `--preset custom`.

ARA stores task/event receipts in `STATE/execution/tasks.sqlite3`, outside native
session databases. Each task is atomically claimed once. Reusing an operation ID
for different work is refused. Completion, partial failure, cancellation and
unknown outcomes are distinct. Restart reconciliation inspects dead owners and
does not automatically rerun uncertain work. A disconnect is not cancellation.
Native child sessions themselves do not transparently resume after owner exit.

## Connected execution and server sync

1. Enroll/pair the node using Machines & sync.
2. Assign the logical profile to that machine and its installed native profile
   in the Swarms execution settings.
3. Enable the node-local swarm policy and configure its model locally.
4. Run `ara node work` there. `--once` exchanges one batch and leaves admitted
   workers running independently.

The node pulls assigned tasks over its authenticated machine link, saves a receipt
before execution, and syncs ordered worker/status/result/artifact events. It works
without further host polling once admitted. Reconnection acknowledges immutable
event hashes and replays missing events without repeating model/tool execution.
Completed receipts are not reuploaded continuously when the server has them.

After terminal task events are acknowledged, the node captures a credential-
scrubbed native snapshot using native consistent database backup machinery.
Snapshots upload through the existing encrypted passive-replica path and receive
a separate recovery acknowledgement. A task result acknowledgement is **not** a
native snapshot acknowledgement. Snapshot publication does not activate a second
writer or transfer credential ownership.

Traffic to non-loopback servers requires HTTPS; a loopback SSH tunnel can carry
local HTTP. The default API still binds loopback, so a real remote installation
requires an operator-configured secure link. Do not publish the single-user
operator API on the public internet without an authenticated access proxy;
HTTPS alone is not operator authentication. Configure ARA_API_URL to the actual
service address when using a reverse proxy. Remote work does not mean cloud-model
inference works without internet. Missing host-only datasets are not substituted.

Patches/new text artifacts are bounded and incomplete results are labeled. Full
repositories, large/binary files, arbitrary device data and live native database
files are not blindly replicated. Keep node-local data until the required server
acknowledgements exist.

## Runtime transition

The adapter contract is `ara-execution/1`. Keep ARA task identities, events,
placement and permission contracts stable through v1. After v1, migrate
incrementally to the custom fork; do not spread native provider/session internals
through product services or build a second agent loop.
