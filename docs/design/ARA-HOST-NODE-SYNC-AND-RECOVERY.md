# ARA host/node execution, synchronization and recovery

Status: proposed implementation contract under the [consolidated Agent OS master plan](ARA-AGENT-OS-MASTER-PLAN.md). “Host” below denotes the coordinator/recovery responsibilities; web hosting, data services and runtimes can be deployed separately. The local v0.1 implements passive acknowledged node snapshots and encrypted recovery; active remote routing, bidirectional replication and automatic failover remain future work. See the [implementation guide](../../agent-os/README.md) for current limits. Timing values below are initial targets to validate, not measured guarantees or existing Hermes behavior.

Ownership granularity is refined by the [connections/conversations contract](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md): a logical profile may have several isolated runtime instances; each native home/conversation has one active owner. Replication below protects an instance, not a merged multiwriter profile directory. Model grant owners, bot connector owners and trigger authorities transfer separately. Whole-product lifecycle and failure rules are in master-plan sections 15–17.

## 1. Concrete operating model

Install the **same versioned ARA-Hermes distribution on every machine that runs profiles**, including the host when it has a runtime role. The distribution preserves the native Hermes agent loop, profile manager, CLI/TUI, gateway, providers, skills, memory and terminal backends. Independent ARA services/clients add domain views/APIs, machine registration, replication and cross-machine routing through a thin native adapter, plugins and narrowly scoped patches where necessary.

The initial self-hosted host includes a full runtime with additional responsibilities. The master plan also permits separating web hosting, API/data coordination and runtime machines, including Firebase-hosted clients. A full node is an independent runtime that does not ask the coordinator for every model/tool call.

```text
Web browser / later Android
          |
Host: ARA dashboard + control API
      profile registry / routing / orchestration
      PostgreSQL domain services + recovery storage
      ARA-Hermes gateways for HOST-OWNED profiles
          |
          | authenticated machine link: commands, events, sync
          |
Node: ARA-Hermes gateway for NODE-OWNED profiles
      native agent loop / providers / skills / tools
      local profile state + durable sync journal
      local workspaces / optional local data services
```

For a node-owned runtime instance, the host keeps a **passive replica and verified recovery bundles**. It does not start a second live writer of that instance. Put replicas outside native profile-discovery directories so the native gateway/multiplexer cannot accidentally activate them. On explicit promotion, materialize a validated native home and activate its native authority only after ownership, credentials and environment checks. Several profiles/instances on one machine may be served by the native multiplexing gateway; no process-per-profile requirement is implied.

The dashboard can display/configure a node-owned instance without running it on the host. Sending a message routes to the conversation's assigned instance owner; new conversations use an explicit/default instance or a supported router. The model loop, native session writes, tool approvals and tool execution remain there. CLI and web use the same native authority; there is no separate browser AI engine.

## 2. Identity and ownership

Keep separate identifiers for:

| Record | Meaning |
| --- | --- |
| Profile ID | Stable logical assistant identity across migration; native name/home is mapped per machine. |
| Instance ID | Isolated native home/session authority under the logical profile; shared definition/data do not imply shared native memory/DB. |
| Deployment ID | Installation of an instance on one machine, including host path and environment mapping. |
| Replica ID | Passive received state; has no agent execution authority. |
| Machine ID | Paired host/node identity and reported capabilities. |
| Ownership epoch | ARA transfer generation used to reject stale commands and synchronization writes. |
| Native runtime epoch | Hermes' own session-authority epoch; preserve it and its recovery semantics. |
| Run/task ID | Durable operation identity, destination owner and outcome/unknown state. |
| Conversation/connection IDs | Native session mapping versus model/channel connection authority; preserve each resource's scope and generation. |

ARA's ownership epoch is an outer routing/transfer contract, not a replacement for the native session ledger. Exactly one synchronized deployment owns a native instance at a time. Several sessions/managed workers are possible under its native authority; this rule does not prohibit native subagents or other isolated instances of the logical profile.

Host and node may run different profiles or isolated instances of one profile simultaneously. Choose one-instance-plus-standby, several independent instances sharing published definitions/authorized datasets, or a new logical clone. Supported conversation routing can distribute different conversations without two authorities owning one session. Make memory-bank/channel/schedule sharing explicit and never disguise an active independent instance as a standby replica.

## 3. Physical structure

Illustrative ARA-managed paths; native homes still resolve through Hermes' profile manager and `HERMES_HOME`.

```text
HOST
  ~/.hermes/profiles/<native-name>/      Only active host-owned homes
  <ara-state>/
    replicas/<profile-id>/<instance-id>/<node-id>/
      manifests/<revision>.json          Immutable file-set inventories
      recovery/<bundle-id>.json          Verified coherent recovery descriptors
      acknowledgements.json             Received revision / recovery position
    objects/<content-hash>               Deduplicated file and snapshot chunks
    secret-capsules/                     Separate encrypted recovery payloads
    restore-staging/                     Validate before native publication
    machine-bindings/                    Host-specific mappings, no shared paths
  PostgreSQL
    ara_core                            Registry, ownership, revisions, commands
    ara_<domain>                        Independent canonical domain datasets

NODE
  <resolved-native-profile-home>/
    config.yaml, SOUL.md
    memories/MEMORY.md, memories/USER.md
    skills/...                          Full packages and native install records
    plugins/...                         Native plugin configuration/packages
    state.db, sessions/..., cron/...     According to pinned native version
    .env, auth.json                     Native secret owners where present
  <ara-state>/deployments/<deployment-id>/
    sync-journal.sqlite                 Durable outbox, hashes, receipts, retries
    recovery-staging/                    Consistent native snapshots
    environment.json                    Requirements + local path bindings
```

The node's ARA journal is a separate local SQLite database; never add ARA replication tables to native `state.db`. Node domain data, when enabled, uses its own PostgreSQL service and domain protocol. Lightweight installations need neither local PostgreSQL nor full offline datasets unless their declared functionality requires them.

## 4. What gets synchronized

| Class | Included state | Ownership and restoration |
| --- | --- | --- |
| Definition | SOUL, native nonsecret config, presentation, learning policy, approvals/configuration where portable | Native files authoritative on active owner; ARA stores immutable revisions. |
| Skills/plugins | SKILL.md, scripts, references, assets, settings, source/version/hash, native installation/provenance metadata | Preserve complete packages and native update semantics; reinstall platform dependencies. |
| Curated memory | MEMORY.md, USER.md and approved learned artifacts | Same file revision mechanism; retain provenance and native session-effectiveness rules. |
| Session/runtime state | WAL-safe native DB snapshot with complete runtime ledgers, relevant session files, schedules and portable channel state | Native backup/restore adapter, not raw live SQLite file replication or transcript-only reconstruction. |
| Artifacts/workspaces | Profile attachments and generated artifacts; separately selected repositories/workspaces, dirty files and untracked content | Explicit inventories and content chunks. Git commit refs alone do not back up uncommitted work. |
| ARA domain data | Dataset references, schemas/versions and acknowledged domain mutations | Independent data-service replication/export; not copied inside the profile DB. |
| External memory/vaults | Hindsight bank or Obsidian vault references plus configured backup/export content | Provider/vault-specific adapter and recovery position; a URL or bank ID is not a content backup. |
| Environment | Tool/backend requirements, dependency locks, images, platform constraints, workspace/path mappings | Declarative rebuild and preflight, not a process or machine image. |
| Credentials | Secret references and usability status normally; optional encrypted recovery/handoff payload | Separate secret policy and native credential owner; never activate copied OAuth refresh tokens on two machines. |

Classify files before upload. Native backups may include `.env`, `auth.json` and vault secrets; do not send a full native archive through the ordinary nonsecret file channel. Use a tested filtered export or an encrypted recovery capsule with restricted access. Native session snapshots/transcripts can themselves contain sensitive tool content and require protected storage; “nonsecret channel” does not mean public data.

An integration must declare exportable content, external references, secrets, dependency requirements and excluded files. Unknown plugin state is reported as unclassified/incomplete rather than claiming a full restore. Allowlisted paths, normalized names, symlink handling and file-mode preservation prevent a sync manifest from escaping its registered roots.

The default protection inventory covers profile assets, native state and profile artifacts. Workspaces, external banks/vaults, local model weights and machine files have visible separate inclusion policies. The UI must list what is missing from protection. A native filesystem rollback checkpoint is distinct from a full profile recovery bundle, and may exclude container paths, large files or nested repository content.

## 5. Synchronization protocol

Use an authenticated persistent machine link for control/events and resumable HTTP streams for bulk content. Reuse native gateway contracts for native session operations; add versioned ARA remote-control/replication endpoints only where needed. Hermes' inspected hosted-profile control sockets are same-machine OS-authenticated interfaces, not an existing certified cross-machine federation API.

1. A native committed change or filesystem watcher marks an asset dirty. Debounce until a stable file version exists; record an immutable content hash and manifest revision durably. A watcher is not an atomic transaction with every arbitrary external editor, so reconciliation scans repair missed observations.
2. ARA-owned domain mutations commit their event/outbox in the same PostgreSQL transaction. ARA-owned file edits validate the expected hash, stage/journal the operation and atomically replace the file; startup reconciles interrupted operations.
3. The sender offers manifest/event positions. The host requests missing hashes/chunks, verifies them and durably stores them before acknowledging. Retries use stable event IDs, origin sequence and content hashes; duplicates do not repeat domain mutations.
4. Only after all referenced required objects are durable does the host publish the received manifest. Interrupted uploads remain incomplete staging, never the latest good replica.
5. A recovery bundle additionally binds a consistent native snapshot, compatible definition revisions, relevant artifacts, runtime/plugin versions and dataset/provider recovery references. Publish its own acknowledgement separately.
6. Compact acknowledged outbox entries and unreferenced objects under retention rules. Never discard the last verified recovery bundle merely because a newer partial upload exists.

A web edit is a command to the active owner with an expected asset hash. It succeeds after owner validation/commit and displays backup acknowledgement separately. If the owner is offline, save a **pending proposal**, not a second authoritative edit. On reconnection compare its base revision with current local changes; do not silently overwrite a locally learned skill or merge arbitrary YAML/Markdown. Show a three-way diff for conflicts. Binary/native DB conflicts are not auto-merged. Deletions use tombstones so a stale replica cannot resurrect removed skills.

The paragraph above describes editing a particular instance's native assets. Publishing shared logical profile definition revisions is a separate expected-revision operation; installations adopt the published revision through native validation. Curated memory/session state remains instance-scoped unless an explicitly supported shared knowledge service is bound. Do not apply a common file-sync stream to several active native homes as if they had one writer.

Do not run an LLM to decide whether a change is significant. Use deterministic commit boundaries, known file classes, hashes, priority, size and maximum flush intervals. Learning changes use the same sync pipeline as manual changes once approved/committed.

## 6. Proposed default cadence

| Trigger | Initial target while host reachable |
| --- | --- |
| SOUL, config, skills, curated memory, integration/settings change | Queue when committed; debounce 2 seconds, flush within 5 seconds under normal load. |
| Accepted input, approval, tool intent/result, task terminal event | Journal at native/ARA durable boundaries; batch replication up to 2 seconds. Actual hook coverage must be verified per runtime version. |
| Token/display streaming | Interactive stream only; not a recovery snapshot per token. |
| Completed conversation turn/run | Request a coherent recovery bundle; coalesce very short turns to at most one routine bundle per 10 seconds. |
| Long active run | Request native state snapshot every 60 seconds; only label a coherent bundle restorable when its consistency conditions are met. |
| Large attachments/workspace files | Immediate resumable background queue; bandwidth caps, chunk deduplication, UI progress. |
| Idle machine | 20-second health heartbeat; no unchanged profile upload. |
| Missed watcher event / reconnection | Incremental manifest reconciliation every 5 minutes and immediately after reconnect. |
| Shutdown, ownership transfer, upstream migration | Attempt final coherent bundle and await acknowledgement where reachable. Abrupt power loss cannot provide a final sync. |
| Manual “Back up now” | Wait for a verified recovery bundle including required in-scope objects, or report exactly what is pending. |

These are scheduling targets, not upper bounds on data loss: disconnection, backpressure, upload size and a busy snapshot boundary can extend lag. Retry transient failures with jittered exponential backoff, capped at 60 seconds; reconnect resumes promptly. Prioritize profile definitions/control receipts over bulk attachments without falsely marking an incomplete bundle recoverable.

The UI shows three positions: **local revision**, **host-received revision**, and **last verified recoverable bundle**. Event receipt is useful for visibility/auditing but does not imply the native database can be reconstructed by replaying those events. Implement safe delta restore only if a future tested native contract supports it.

## 7. Native snapshot consistency

The audited native implementation already uses SQLite's backup API for WAL-safe snapshots. Reuse its supported backup/restore machinery and preserve native ledgers. Never copy just live `state.db`, transfer mismatched WAL/SHM files, merge two databases or restore over a running gateway.

A DB-consistent snapshot alone is not an atomic snapshot of SOUL, skills, schedules, artifacts and external services. For a coherent recovery bundle, capture at an owner-coordinated boundary: briefly block new relevant mutations, wait for native/learning writers or mark their pending status, snapshot state and inventory stable file revisions. Release the boundary once local staged capture is complete; network upload happens afterward. Detect external editor changes during capture and retry the affected inventory. If the native hooks cannot provide this boundary, use a narrowly scoped maintenance adapter or quiesce the owner; report older recovery coverage rather than claiming consistency.

During a long tool operation, a safe snapshot can still contain a started task. Restore must preserve native **unknown outcome** handling. It cannot resume an in-flight model HTTP request, shell process or tool transaction from RAM. Workspace file consistency and external service backups have separate adapters/watermarks; do not claim a distributed point-in-time transaction across all of them.

## 8. Independence and orchestration

The default orchestrator is a separate host-owned Hermes profile. It receives authorized dataset tools and routes durable tasks to other profiles through their owners. It does not own their files or supervise every token. Native same-machine delegation remains native; ARA remote delegation needs authenticated destination binding, idempotent submission/receipts and unknown-outcome reconciliation.

If the host is unavailable, a full node can still start its CLI/TUI/local dashboard and gateway, use local identity/skills/memory, call an available configured model and execute local tools/channels/schedules. Sync changes remain durable locally. **Host unavailable** and **internet unavailable** are different: a cloud model can work without the ARA host, while completely offline inference requires a local model endpoint.

Host-only PostgreSQL/MCP services, remote Hindsight, host-owned credentials and host orchestration are unavailable unless separately replicated/reachable. Do not silently substitute a different dataset/model/tool. Tools expose available, unavailable or deferred status. For full offline domain work, install that domain service locally and implement its declared dataset replication/conflict rules. Finance postings, research additions and private-note edits need appropriate domain rules; this plan does not promise generic multiwriter merging for every database.

A node can optionally own its own local orchestrator profile for node-local workflows. That is a distinct profile/authority, not an automatically cloned simultaneously active host orchestrator. While the host is down, cross-machine workflows cannot be promised beyond the configured reachable peers.

## 9. Lost node and host promotion

Example: `research` is active on a laptop, protected by the Mac mini host.

1. Laptop disappears. The dashboard retains profile files/history and reports the last received revision, recoverable bundle time and excluded/pending content. It does not automatically start another gateway just because a heartbeat stopped.
2. Explicit recovery selects the latest verified bundle, preserves the original replica and stages a new native home on the host or another registered node.
3. Check runtime/plugin compatibility, dataset/bank/vault reachability, required assets, tool/backend support, workspace mappings and usable model/tool credentials. Rebuild dependencies. Report blockers; allow inspection even when execution cannot start.
4. Confirm transfer, advance ARA ownership epoch and activate the destination gateway. If the old owner is reachable, drain/stop it and obtain a final bundle first. If it is lost, record an explicit takeover with the possible unsynced interval.
5. Preserve native unknown-task semantics. Do not automatically replay started payments, shell commands, sent messages or other effects merely because their result was not synchronized. Reconcile receipts/effects and require an explicit resolution where needed.
6. Activate schedules/channels only after their separate transfer and endpoint ownership checks. A channel may stay pinned to the server while execution moves if the remote bridge is certified. Otherwise perform a confirmed source-stop/destination-start combined handoff. A restored task definition/token is not permission to run a duplicate schedule or bot subscription; unresolved source ownership may require platform token/session invalidation.
7. If the laptop returns, reject its old-epoch writes to the shared profile. Retain new local changes as a divergent branch for inspection/import; stop or reassign its managed deployment after reconnection. Do not overwrite either branch or merge native session DBs.

The host can recover **acknowledged in-scope state**, with native execution continuation bounded by the last coherent recovery bundle. Anything created only on a permanently lost node after that point is unrecoverable. Newer acknowledged standalone file revisions may be recoverable individually, but applying them to an older session bundle is an explicit operation, not a claim of historical atomicity.

Network partitions create a real limit: a fully independent offline node may continue working while another machine declares it lost. An ARA ownership epoch fences centralized APIs and reconnecting peers; it cannot stop an unreachable process from issuing a local shell command or calling an independently authenticated external service. Therefore V1 uses explicit takeover, keeps offline branches and avoids automatic dual execution. Do not claim both unrestricted offline operation and universal exactly-once automatic failover.

The host itself also needs backup: local node replication protects against node loss, not loss of the host disk. Use independent encrypted host/object-store backups plus PostgreSQL base backups/WAL retention and periodic restore verification. Retain a second copy of required recovery keys separately from the machine being protected. Initial history policy: immutable file revisions plus 24 hours of hourly recovery points and 30 daily recovery points, size-budgeted; always keep the latest verified bundle. Pruning releases object references only after recovery-set completeness checks. This retention schedule is distinct from the much faster sync cadence.

## 10. Harness, tool and environment parity

Both deployments use the same native Hermes harness: model routing/auth, context assembly, tool registration/approvals, session persistence, compression, memory and learning. Pin runtime and plugin versions in a compatibility manifest; upgrades require compatibility/restore gates. The web submits to the owning harness and never reimplements that loop in TypeScript.

Execution is always labeled with **profile owner, tool/backend target and workspace**. A web-started shell call for a node-owned profile normally runs on that node. A host-restored profile's local shell runs on the host. If configured, native SSH/container or a tested remote backend can target a reachable environment; it cannot use a vanished laptop.

Portable environment manifest:

- Runtime/plugin versions, skill source hashes, Python/Node/tool dependency locks and required CLI capabilities.
- Terminal/browser backend, sandbox/isolation policy, image digest and architecture-specific image variant where relevant.
- Logical workspace IDs, repository refs plus backed-up dirty/untracked files, mount/path mappings and allowed roots.
- Required OS/architecture, hardware/apps, network services, MCP capabilities, credential references and resource requirements.
- Model route/protocol, selected model, effective prompt/config/learning settings and required restart behavior.

Recreate environments through native installers/backend APIs; do not copy virtualenvs, node_modules, PIDs, open terminals, sockets, OS keychains, browser login profiles or running processes. Workspaces/volumes need their own backups. ARM Linux and macOS may require different dependency artifacts; containers help portability but do not emulate macOS-only apps or attached hardware. Native rollback checkpoints are not a backup contract for sandbox files.

Thus behavior and interfaces should match when capabilities/configuration match. Exact output is not deterministic, and a missing tool cannot be hidden behind an apparently healthy cloned profile. Preflight marks the deployment ready, degraded with listed unavailable capabilities, or blocked; required tools do not silently disappear or change targets.

## 11. Model credentials during web setup and recovery

Login in web must name its credential destination. Host-owned profile: complete native login at the host. Node-owned profile: the dashboard brokers the supported flow to that node's native credential owner. Browser redirect/device-flow support is provider-specific and must be tested; arbitrary token copying is not a substitute.

To share a connection across machines, use an explicit connection policy: separate native logins, permitted static-key encrypted provisioning, or a tested host credential/model broker. A host broker centralizes refresh but introduces host dependency; it is not the default for profiles that promise independent execution. Local profiles may share native root auth on the same machine according to upstream semantics.

The host may hold a separately encrypted **backup-only credential capsule** if configured as a trusted recovery destination. It must not refresh inactive OAuth grants. On deliberate failover, use supported ownership handoff or reauthenticate; provider rotation/revocation may make a saved token unusable. UI readiness distinguishes profile restored from model account usable. Backed-up credentials never imply two refresh owners are safe.

## 12. Implementation order and verification gates

1. **Host-only web first:** real Hermes runtime behind the dashboard, PostgreSQL domain services, native file editors/history, environment manifest and restore/export contract. This already proves that web and CLI use one harness.
2. **Two local deployments:** run isolated native homes/services with separate simulated machine identities; add registration, owner routing, immutable file manifests, durable outbox and passive replicas. Reuse native operations before adding any patch.
3. **Recovery bundles:** native consistent snapshots, artifact inventory, secret classification/capsules, host promotion and compatibility/path/tool/auth preflight. Add recovery positions to the web UI.
4. **Real node installation:** same pinned distribution on ARM Linux/macOS, systemd/launchd lifecycle, local CLI/gateway/dashboard, reconnect/backpressure and explicit transfer. Orchestrator remote delegation follows these ownership contracts.
5. **Independent data recovery:** implement each domain's local replication/conflict policy when required, plus Hindsight/vault export/recovery adapters. Do not advertise complete offline domain operation before these exist.

Acceptance scenarios: web and CLI edits converge without lost changes; partial uploads never replace good replicas; restart/crash resumes the outbox; offline learning survives reconnection; stale web edits show conflicts; missing required blobs prevent a complete-backup acknowledgement; restore preserves native session/unknown-work semantics; a lost node can promote to the host with compatible tools; returning stale owners are fenced at shared services; secrets never enter ordinary exports; unavailable external banks/vaults are reported; upstream upgrades preserve native compatibility and restoration. Test abrupt process/disk/network failure rather than only clean shutdowns.

## Native evidence and boundaries

Audited Hermes snapshot: `201b32361592bd9ac230d33fd592e101b8cca4af`. These sources support native profiles/session authority, WAL-safe snapshots and terminal backends; they do not establish that ARA remote replication exists.

- [Native profiles, clone exclusions and OAuth ownership](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/user-guide/profiles.md)
- [Session authority, runtime ledgers and unknown-work recovery](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/developer-guide/session-storage.md)
- [WAL-safe backup implementation](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/hermes_cli/backup_sqlite.py)
- [Native backup inventory and secret inclusion](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/hermes_cli/backup.py)
- [Filesystem rollback checkpoint scope and limitations](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/user-guide/checkpoints-and-rollback.md)
- [Terminal backend plugin contract](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/developer-guide/terminal-environment-plugin.md)
- [Same-machine hosted-profile owners and private socket boundary](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/developer-guide/hosted-profile-owners.md)
