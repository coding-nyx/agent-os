# Node-owned Hermes agents: implementation fix plan

Status: implementation added, 20 October 2026; live acceptance gates remain
unverified. Operational instructions are in [Native agents on nodes](NODE-RUNTIMES.md).
This plan corrects the incomplete deployment implementation
and follows the existing [runtime/connection ownership contract](../../docs/design/ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md)
and [sync/recovery contract](../../docs/design/ARA-HOST-NODE-SYNC-AND-RECOVERY.md).

## Required product behavior

An agent deployed to a node runs through that node's real Hermes runtime, with
its native profile, gateway, sessions, tools, model connection, memory and skills.
It can be installed and used on a standalone node without pairing, a host API or
PostgreSQL. Pairing adds remote management and synchronization. A host-managed
agent can have its only runtime instance on a node; creating or using it must
not require a host-side native profile or model connection.

Deploying one logical agent to several nodes creates isolated Hermes instances.
Each instance owns its native home and conversation state. The dashboard selects
an instance and displays the actual execution machine. Shared definitions and
explicit memory publication connect instances; live native databases are never
multiwriter shared directories.

## Current implementation findings

| Area | Current code behavior | Required correction |
| --- | --- | --- |
| Chat | `runs.submit/execute/control/reconcile` check the host profile/model and call the host runtime directly. | Resolve and persist the owning instance; execute and control its node-local native session. |
| Profile creation | `profiles.create_profile/provision/seed` create native homes on the host. | Separate logical definitions from runtime instances; allow coordinator-only hosting and node-only deployment. |
| Deployment | `node_deployments.reconcile` creates a native profile with a seed SOUL and default swarm settings, then records enabled state. | Install an actual versioned profile definition, resolve dependencies and reconcile native gateway service state. |
| Ongoing profile edits | Existing node homes receive deployment metadata; actual SOUL, skills, memory and native configuration changes are not continuously propagated. | Track manifests, content revisions, source ownership, conflicts and acknowledged application. |
| Sync | `ara node sync --watch` uploads scrubbed native portable archives to the host's passive replica store. | Keep recovery backups and add live definition updates plus separately scoped state/event replication. |
| Swarm admission | Host `spawn_swarm` builds requests using the host's installed native profile/config. | Validate the contract without a host runtime; owning node performs native policy/model admission. |
| Lifecycle | The host has a native `profile-state` bridge; node deployment mainly controls ARA markers and managed workers. | Reconcile start, pause, stop and readiness through the node's actual native gateway. |

The existing node workers already execute real Hermes child agents. The native
bridge already exposes session create/resume, prompt admission, events, receipts,
approvals and profile serving controls. Reuse these capabilities on the owning
node; do not introduce another agent loop.

## 1. Establish instance identity and node-local authority

- Add durable `logical_agent_id`, `instance_id`, `machine_id`, `native_name`,
  definition revision, ownership generation and desired/observed lifecycle state.
  Runtime identity must survive pairing, reconnects and process restarts.
- Keep the instance registry, control inbox, receipts and sync outbox on the
  node in local storage independent of the host database. Native Hermes remains
  authoritative for its own sessions and memory databases.
- Separate logical-agent enabled state, instance enabled state and machine
  connectivity. An offline instance can still be running locally.
- Allow standalone create/import/start/chat/status without enrollment or a host
  database lookup. Pairing can register an existing instance with a preview;
  it must not replace its profile or generate a second running copy.
- Make host runtime provisioning optional. Draft agents and definitions can
  exist in the coordinator registry before a destination runtime is selected.
- Migrate existing placement/deployment records into instance records, preserving
  native homes, credentials, session IDs and uncertain task receipts. Require
  explicit adopt-versus-clone handling for an existing destination profile.

Primary files: `profiles.py`, `deployments.py`, `cli.py`, node-local storage,
database migrations and runtime compatibility metadata.

## 2. Reconcile a complete native profile and service

- Build the deployment artifact from the actual source instance's native assets,
  or a published definition artifact for a new agent. The registry's seed `soul`
  field is not a replacement for edited `SOUL.md` and native configuration.
- Record a hash manifest, runtime/plugin compatibility, profile definition
  revision, path mappings, required tools and connection references. Preserve
  unknown native configuration fields through supported native adapters.
- Stage and validate an installation, preserve the current version for rollback,
  and publish it atomically. Record the applied manifest before reporting success.
  Recheck the latest desired generation after slow installation work.
- Reuse the native multiplexer and targeted profile serve/unserve controls.
  Support node service startup/restart independently of the host link; initially
  certify the current Linux installation, then add other OS service adapters.
- Expose separate states: installed, setup required, ready, idle/running, paused,
  stopping, stopped and error. A model name or profile directory alone does not
  establish usable runtime readiness. Starting a service does not submit inference.
- Undeploy pauses admission, interrupts/settles managed work, disables that
  instance's managed triggers/connectors as applicable, and confirms native
  service stop. Retain profile data. Other instances on the gateway stay available.
  Offline stop requests remain pending until acknowledged.
- Keep lifecycle/control messages independent of large profile transfers,
  provisioning and backup uploads. A slow installation must not delay a stop.

Primary files: `node_deployments.py`, `native_worker.py`, `runtime.py`,
`cli.py` and node service packaging.

## 3. Route all conversation operations to the owner

- Add a runtime dispatch interface shared by local and remote instances for
  create/resume session, submit turn, events, receipts, cancel, approvals,
  clarification, history and recovery inspection.
- Add a durable node control inbox and sequenced event outbox. An authenticated
  outbound control stream can carry multiplexed commands/events; restart and
  reconnect correctness must come from stored commands, native admission IDs,
  acknowledgements and deduplication, rather than socket lifetime.
- A node-local command owner calls the existing native Hermes gateway. Persist
  admission/session mappings before acknowledging them and reconcile native
  receipts after a crash. Never repeat uncertain inference/tool effects.
- Pin every conversation to its instance, native session and owner generation.
  Changing the default node only affects new conversations. Opening a different
  instance creates/selects its own conversation; moving an existing conversation
  requires a coherent, explicit migration.
- Remove host-local model/home checks from remote chat and swarm admission.
  Readiness, model selection, workspace and tool permissions come from the owner.
  An unavailable owner must not redirect execution to the host.
- Local CLI/native gateway work continues if the host disconnects. Events and
  results remain durable on the node and upload after reconnection. Host-only
  datasets/integrations report unavailable; they are not fabricated locally.

Primary files: `runs.py`, `swarms.py`, `node_execution.py`, `runtime_adapter.py`,
node command journal, conversation APIs and native session adapters.

## 4. Define profile synchronization precisely

| Content | Initial deployment | Ongoing synchronization |
| --- | --- | --- |
| SOUL, user instructions and approved agent preferences | Publish the selected definition revision. | Versioned files/config changes with hashes and compare-and-swap updates. |
| Skills and learning/tool configuration | Include approved content and required dependencies. | Publish committed revisions; preserve node overrides and intersect with node-local authority. |
| Provider/model settings | Carry portable choices and connection references. | Update supported nonsecret settings on their owner; track node overrides and connection readiness. |
| Credentials and OAuth grants | Resolve a usable destination connection as an explicit deployment step. | Remain in the selected native credential owner's store; never enter ordinary profile manifests. |
| Memories and learned assets | Offer a coherent source snapshot when cloning, with an explicit inclusion policy. | Each instance owns its evolving state; published cross-instance changes carry provenance and conflicts. |
| Sessions/history/native SQLite | Use a native consistent snapshot only for a chosen clone/transfer/recovery operation. | Replicate events and recovery bundles; never merge or overwrite live native databases. |
| Channels and scheduled triggers | Import definitions in an inactive state until ownership is assigned. | Activate one declared receiver/sender/trigger authority; cloning must not duplicate bot polling or scheduled effects. |
| Workspaces and machine paths | Validate destination paths/dependencies and selected artifacts. | Use explicit source/artifact transfer; machine-local repositories and hardware are not implied by profile sync. |

- Give each shared definition a declared revision authority. The dashboard edits
  that authority; node-native edits become committed revisions or preserved
  proposals when both sides changed the same base. Do not silently overwrite
  offline edits or executable skill changes. Keep per-instance overlays explicit.
- Track base/source/applied revisions, hashes, tombstones, node outbox cursors,
  host-received revisions and the last coherent recovery bundle separately.
- Sync stable committed assets after a short debounce, replay pending changes on
  reconnect and expose conflicts. Use the existing 2-second debounce/5-second
  flush goals as targets to measure, not current timing guarantees.
- Offer node-local connections for independent operation. Supported explicit
  static-key provisioning may be added as a separate credential grant flow.
  Keep rotating OAuth refresh ownership singular. A selected remote model owner
  must be labeled as an availability dependency; it cannot imply host-independent
  inference when that owner is the host.
- Preserve passive native backups as recovery artifacts. Restoring them remains
  a staged operation with dependency, credential and ownership checks.

Primary files: a definition/manifest service, node asset transfer/outbox,
`native_worker.py`, `recovery.py`, connection APIs and conflict UI.

## 5. Make the dashboard operate the selected instance

- Add a machine/instance selector to Conversation with a persistent execution
  label and node readiness. Show the same owner for tools, approvals and results.
- Scope Connections, model login, identity, skills, memory, history, channels and
  schedules to the selected instance. Native authentication runs on its owner;
  the browser receives supported setup/status information.
- Update deployment UX to include definition/source selection, connection setup,
  runtime preflight, observed service state and explicit pause/resume/undeploy.
- Show definition sync, conflicts and recovery status separately from connectivity
  and runtime health. Host-only runtime removal must not delete node instance data.
- Retain explicit per-run swarm targets and node-local computer grants. Publish
  local MCP capabilities on standalone nodes; host data access stays optional.

Primary files: conversation/deployment/connections UI and their instance-scoped
API contracts. Existing local-only routes remain compatible through a local
instance resolver rather than separate execution semantics.

## Delivery order and acceptance gates

1. **Instance identity and standalone service:** install/start an agent on a node
   with no enrollment, host API or PostgreSQL. Its native CLI/gateway can use a
   configured provider, local tools, memory and skills; pairing preserves it.
2. **Complete deploy and lifecycle:** node-only agent creation works on a
   coordinator with no Hermes runtime installed. Ready state reflects the actual
   node service. Stop/undeploy is acknowledged by the native lifecycle owner.
3. **Remote normal chat:** submit from the host dashboard and verify native
   inference/session/tool execution on the chosen node. Demonstrate approvals,
   cancellation and reconnect receipt recovery without duplicate actions.
4. **Profile sync and recovery:** deploy an edited definition and skills, verify
   node application, make offline node edits, then reconnect and resolve conflicts.
   Recover a coherent snapshot into a staging instance without replaying effects.
5. **Several independent instances:** deploy to two nodes, use distinct native
   sessions/homes, publish a shared definition update and retain each node's own
   evolving state. Pausing one instance must leave the other available.
6. **Failure and migration coverage:** test host shutdown, browser closure, node
   process/service restart, disconnect during install/turn/control, late receipts,
   stale owner generations, node-only authentication and unavailable dependencies.

These gates specify outstanding live verification. This implementation was
compiled and the production web bundle was built. No test suite, inference,
remote deployment or physical desktop acceptance checks were run for this change.
