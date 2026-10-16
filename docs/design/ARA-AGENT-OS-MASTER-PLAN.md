# ARA Agent OS — consolidated product and implementation plan

Status: architecture and delivery contract, with a working local v0.1 implementation in [agent-os](../../agent-os/README.md). This is the entry point and decision authority for the complete plan. It supersedes the earlier recommendation to make the primary ARA client a modified Hermes dashboard. The native Hermes dashboard remains supported for runtime administration. The local prototype implements the native runtime adapter, versioned API, data modules, dashboard, imports, passive node snapshots and encrypted recovery. Active distributed routing, credential sharing/failover, remote bot handoff, Android and Firebase deployment remain planned. The implementation README records capability limits and verification evidence.

Delivery priority: **web and local services → installed Hermes-based runtime and distributed operation → Android**. One user initially, with explicit owner/workspace boundaries for later multiuser work. Finance, training and private notebooks are example modules, not a fixed limit on the platform. Scout's rich research experience is later scope; its module/surface contract is initial scope.

Detailed subordinate contracts: [native Hermes compatibility](ARA-UPSTREAM-AND-PROFILE-COMPATIBILITY.md), [host/node sync and recovery](ARA-HOST-NODE-SYNC-AND-RECOVERY.md), and [provider connections, gateways and conversations](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md). Sections 15–17 below define product-wide behavior, edge cases and release criteria. The [V2 technical notes](ARA-V2-IMPLEMENTATION-PLAN.md) retain useful native implementation detail; this document controls any conflicting product/deployment/UI decision.

## 1. Architecture choices and recommendation

Host and node are deployment responsibilities, not the only architecture choices.

| Option | Benefit | Cost / fit |
| --- | --- | --- |
| Extend only the native Hermes dashboard | Fast native runtime administration; inherit UI changes | ARA rich domain UI and mobile contracts still need independent service design; ties primary web releases to upstream UI. |
| Deeply rewrite Hermes into one ARA application | Initially one codebase/process tree to reason about | Larger downstream patch burden and stronger coupling between runtime, domain data and clients. |
| Separate host and stripped node forks | Different default footprints | Duplicated upstream merges and behavior drift; offline node capability must be rebuilt. |
| **Independent ARA clients/services with a thin Hermes adapter and one minimal fork** | Stable web/Android/domain contracts, flexible hosting, native runtime compatibility | We own the ARA API/client UX and must test the adapter; recommended for the complete requirements. |

Use one maintained Hermes fork, preferably with no core patches until extension interfaces prove insufficient. Keep ARA application code outside the fork. Do not implement a second model/tool loop in the ARA API. Do not add an alternate OpenClaw runtime in the first release. An adapter boundary reduces coupling; it does not promise a free future engine replacement.

## 2. Logical components, independent of hosting

```text
CLIENTS
  ARA Web (React)      Android (later)      native Hermes CLI/TUI
        |                    |                      |
        +---- ARA API -------+                native gateway
                |
APPLICATION SERVICES — one modular service initially
  profile/preset/module registry | owner/workspace context
  domain operations | integration bindings | machine/owner routing
  conversations / run and delivery projections | native file/version operations
  model connection / credential coordination | channel routing and ownership
  sync/recovery coordination | resumable operation and capability management
        |                       |                       |
    PostgreSQL            artifacts/backups       runtime adapter
    domain + ARA data      local/S3-compatible           |
                                                   ARA-Hermes
                                                   gateway/agent loop
                                                   native profiles/state
                                                   providers/tools/skills
                                                         |
                                      native tools + domain/external MCP
```

The ARA API accepts client operations, validates ARA scopes, calls domain services or forwards native operations to the actual runtime owner. It exposes durable status, events and selected artifacts. Native gateway session authority and native tool approvals remain authoritative for their execution; ARA cannot bypass them with a second approval ledger.

Domains expose validated application functions through both REST and MCP/native tools. ARA's orchestrator is a Hermes profile with scoped dataset access and delegation tools, not another Python/TypeScript orchestration engine. Remote delegation adds durable routing and receipts around native owner execution.

## 3. Deployment combinations

Choose components and responsibilities per installation. No additional source fork is needed.

| Installation | Components and behavior |
| --- | --- |
| Standalone desktop/server | Local web/API, PostgreSQL, objects and Hermes; complete one-machine system. |
| Self-hosted coordinator plus nodes | Coordinator API/data/backups and optionally Hermes; nodes run full Hermes with local state and sync agent. |
| Headless node | Hermes, selected profiles/tools and durable synchronization; local CLI/gateway works independently. ARA local UI/API and domain services optional. |
| Cloud frontend plus local server | Static web on Firebase Hosting or another CDN; API/data/runtime on reachable ARM Linux/Mac mini. |
| Cloud application services plus local runners | Web/CDN and API/managed PostgreSQL/object storage in cloud; Hermes on registered machines or always-on runners. |
| Cloud-only | API/data plus an always-on compatible Hermes runner; clients use the same APIs. Machine/hardware-specific tools remain constrained by that runner. |
| Client-only browser/Android | Access paired services, cache allowed data/drafts; does not become a full unattended Hermes machine runtime. |

“Host” may mean UI hosting, coordinator, data location, runtime owner or backup destination. Store these as explicit endpoints/roles rather than assuming they are always one computer. A standalone install enables all required roles. V1 can use one coordinator and explicit ownership transfer; do not introduce distributed leader election or multiple active coordinators.

## 4. Firebase without redesigning the product

Initial deployment is entirely local: a multi-architecture Linux service/container setup or macOS services, PostgreSQL, local artifact storage and a real Hermes runtime. Cloud SDKs are not prerequisites for the domain model, client or runtime.

Firebase can later contribute independently:

| Service | Optional responsibility | Boundary |
| --- | --- | --- |
| Firebase Hosting | Serve the static ARA web build and routing assets | Same web bundle/API contracts as self-hosting; no embedded model secrets. |
| Cloud Run / Functions | Candidate deployment targets for suitable stateless APIs, webhooks or background handlers | Validate lifecycle, networking, persistence and streaming; long-lived native runners are separately deployed unless proven suitable. |
| Cloud Storage | Artifact or encrypted recovery-object adapter | Same object inventory/checksum/recovery contracts; not native profile filesystem ownership. |
| FCM | Android notification delivery | Notification hints prompt an authorized API fetch; not the authoritative run/event ledger. |
| Firebase Auth | Optional future identity adapter | Deferred; cannot replace model OAuth. Map identities into application owner/workspace scopes if introduced. |
| Firestore | Optional narrowly scoped read projection if later justified | Not a second canonical ledger/profile database; no blanket PostgreSQL-to-Firestore dual writes. |

If application services move to Google Cloud, PostgreSQL can remain PostgreSQL on an appropriate managed service. Using Firebase Hosting does not require changing the database or running Hermes inside Firebase Functions.

Network recipes must be explicit: private LAN/VPN access, a protected HTTPS endpoint, or an authenticated outbound node connection through a reachable coordinator/relay. A Firebase page does not automatically reach a private home server. Remote access needs device/control authorization even in a single-user product. Deployment-specific CORS/CSP, redirect URLs and stream endpoints are configured, not hardcoded into domain components. Relays transport/reroute operations; they do not become an implicit second runtime owner.

Long-running jobs have durable IDs/status and reconnection, not a requirement to keep one request alive indefinitely. Short REST operations and event streams can use different endpoints if a hosting path requires it. Cloud deployment remains a gated recipe; no platform timeout or streaming compatibility is assumed verified here. Direct documentation fetches were blocked by the environment proxy during this planning turn; only the current repository's Firebase configuration was inspected.

## 5. Data module, agent preset, profile and view are separate

| Concept | Responsibility |
| --- | --- |
| Data module | Schema/migrations, validated operations, REST/MCP adapters, events and import/export. |
| Dataset | Independent instance of a module's data, owned by workspace/user; usable with agents disabled. |
| UI surface | A module's web/Android presentation contract and implementation. |
| Agent preset | Installable native SOUL/config/skills/tool defaults, module requirements and suggested surfaces. |
| Profile | Logical assistant identity, published definition, learning defaults and explicit dataset/tool bindings. |
| Runtime instance | Isolated native Hermes home with its own sessions, curated memory and effective configuration. Several instances may belong to one profile. |
| Deployment | An instance installed on a machine with actual paths, dependencies, credentials and active/passive ownership. |
| Connection | Model account or messaging integration with its own credential/receiver/sender authority, independently placed where supported. |
| Orchestrator profile | Agent with permitted data access plus scoped delegation to other profiles. |

Example: the finance module owns a transaction dataset. Ledger's preset suggests the finance workspace and finance MCP tools. Another custom profile may use that same dataset and workspace. Disabling/deleting Ledger removes neither transactions nor the finance UI. Scout similarly binds a research module; it does not become the owner of every source/document schema.

Profile presets include disable/clone/customize/export and template origin/version. Updates propose diffs rather than overwrite user identity or learned artifacts. Creating profiles remains available locally; a managed-node restriction is optional policy. A profile created offline can operate locally and register/sync later.

## 6. Module contract and customized views

Each registered module declares ID/version, compatible API/data-schema versions, service operations, event types, migrations, import/export, offline/replication policy, required integrations and supported client surfaces. Surface identifiers are stable; installed client capabilities determine the renderer. A metadata manifest does not carry permission to execute arbitrary downloaded code.

Illustrative finance registration:

```yaml
id: ara.finance
version: 1.0.0
api_namespace: /api/v1/modules/finance
schema_version: 1
surfaces:
  - id: finance.workspace
    web_renderer: finance.workspace.web.v1
    android_renderer: finance.workspace.android.v1
    fallback: records.table.v1
    required_capabilities: [finance.read]
tools: [finance.list_transactions, finance.propose_posting]
events: [finance.transaction.created, finance.posting.committed]
offline_policy: cached_reads_and_drafts
```

The module package supplies service/schema definitions and web components; Android ships its corresponding approved renderer. Initially compile first-party modules into each client, with manifest-driven registration and enablement. Avoid a remotely downloaded arbitrary-plugin runtime as an unnecessary first-release dependency.

Presets compose surfaces, not only one fixed page: Ledger can default to finance transactions/summary tabs plus conversation; training to program/active-session/history tabs; Scout later to sources/research/evidence tabs. A profile's surface bindings map each surface's logical dataset roles to actual dataset IDs. The API returns these bindings and allowed actions; each client renders its registered implementation. A user can customize this composition without transferring ownership of the datasets to the profile. Service authorization enforces the same action scopes even if a client renders an incorrect button.

| Module/surface | Web behavior | Android behavior using the same services |
| --- | --- | --- |
| Finance / Ledger | Transaction table, filters, account summaries, import/reconciliation and posting review | Paged transaction list, summary screens, detail/edit/review flows. |
| Training / workout | Program/calendar, exercise details, session/set editor and progress | Active-workout flow, set entry, program and history screens. |
| Private notebook | Note timeline/editor, source-linked observations and explicit sharing scope | Note list/editor, capture and scoped history; no automatic orchestrator access. |
| Research / Scout, later UI | Sources/documents, research sessions, citations, findings and evidence/artifact panels | Source/detail/session flows and evidence views; rich graphs can follow later. |
| Custom | Schema-based tables/forms/charts and optional approved bespoke surface | Generic schema-based renderer or a shipped custom native renderer. |

The common API returns typed records, queries, aggregates, artifacts, available actions and surface metadata. It does not return React components for Android to execute. UI/UX differs appropriately by platform; validation and operation semantics remain server-owned. Unknown/missing renderers show the generic supported fallback and unsupported capabilities explicitly. Restricted web surfaces could be embedded later, but native UI does not depend on that strategy.

Custom data initially supports JSON-Schema-validated JSONB datasets and declared typed operations/indexes. More complex custom database schemas require a versioned module with migrations or an external service/MCP adapter. Agent creation does not automatically generate privileged tables or arbitrary SQL tools. Domain creation can precede every agent.

## 7. Shared API and event contracts

Use versioned REST/OpenAPI for client operations, JSON Schema for module/data contracts and a versioned stream envelope. Generate TypeScript and Kotlin clients from the same exported contracts. MCP is for agent-facing integration, not a requirement that Android speak MCP for ordinary UI requests.

Illustrative API groups:

| Surface | Example operations |
| --- | --- |
| Discovery | `GET /api/v1/capabilities`, `/modules`, `/presets`, `/surfaces` |
| Datasets | `GET/POST /api/v1/datasets`; independent schema, bindings, imports/exports and backup status |
| Finance | `GET /api/v1/modules/finance/datasets/{id}/transactions`; typed posting/import commands |
| Training | `GET /api/v1/modules/training/datasets/{id}/programs`; session/set operations |
| Research | `GET /api/v1/modules/research/datasets/{id}/sources`; sessions/findings/citations when implemented |
| Profiles | `/api/v1/profiles`, `/{id}/bindings`, `/{id}/surfaces`, `/{id}/learning` |
| Instances/conversations | `/{profile-id}/instances`, `/api/v1/conversations`, admission-key messages and explicit reply audiences |
| Native files | `/{profile-id}/assets` and revision-aware reads/proposed edits via native asset adapter |
| Runtime | `/api/v1/profiles/{id}/runs`, run status/cancel, session history and native approval projections |
| Authentication | `/api/v1/model-connections`, native auth flow start/status/cancel targeting a specific credential owner |
| Channels/delivery | `/api/v1/channel-connections`, routing/transfer/status and `/api/v1/deliveries/{id}` |
| Machines | `/api/v1/machines`, deployments, capabilities, ownership transfer and connectivity |
| Recovery | Profile manifests/acknowledgements, recoverable bundles, backup/export and restore preflight |
| Integrations | MCP/plugin/memory/vault registration, bindings, capabilities, health and setup requirements |
| Artifacts/events | Authorized artifact reads/uploads and cursor-based event subscriptions |

Standardize owner/workspace/dataset context, opaque IDs, cursor pagination, filter semantics, revision/ETag checks, idempotency keys, decimal money/currency and unit/timezone encoding, validation errors and API capability negotiation. No monetary rounding through arbitrary binary floats. Version public schemas and migration/export contracts independently from client UI versions.

Stream envelope: event ID, schema version, origin sequence, workspace, profile/dataset/run references, timestamp and typed payload. Clients reconnect using an acknowledged cursor; on retention gaps, fetch a fresh projection. Native streaming fragments may be ephemeral; durable run/session status can always be fetched. Preserve required native tool/session IDs and sidecars through the adapter; a simplified activity feed is not a replacement for native persistence.

Example finance mutation path:

```text
Web form ---------- REST command ----+
Android form ------ same command ----+--> finance application service
Hermes finance tool / MCP -----------+      validate scope + domain invariants
                                           approval policy, then commit
                                           PostgreSQL mutation + outbox event
                                                    |
                                      all clients refresh the same records
```

Accepted asynchronous commands return an operation ID, not a false completed result. Offline drafts/pending commands remain visibly pending until accepted by their service. Duplicate submissions reuse the operation identity. Desktop CLI/native workflows are observed through the runtime bridge rather than forced to call a browser backend before native local execution.

## 8. Native runtime, providers and integration boundary

One pinned Hermes fork supplies the real harness: sessions, context assembly/compression, provider routing/auth, terminal/browser backends, tool calls/approvals, managed workers, gateway/channels/schedules, native memory and skill learning. Upstream provider support remains available; the earlier restricted-provider allowlist is withdrawn. ChatGPT/Codex, Grok and other OAuth/subscription connections depend on the pinned upstream's actual supported flows; keys/custom endpoints retain explicit compatible protocol selection.

ARA's runtime adapter covers native profile lifecycle, asset validation, session/run operations, event projections, approval controls, model login/status, skills/plugins, learning settings and backup/restore. Prefer existing APIs/CLI/plugins. Record every needed patch and test gap; do not claim the inspected canonical gateway already provides complete remote federation or every operation.

ARA's Python services do not instantiate a second agent framework to duplicate Hermes. A new framework is justified only by a demonstrated feature gap. Profile and tool configuration must remain usable through native CLI/config files; preserve unknown native fields and export/source metadata. Keep the native dashboard available for direct administration, optionally add ARA links/status plugins, and make it optional for headless nodes.

Model setup in web targets a host/profile's native credential owner. Sync account references/status normally; encrypted static-key provisioning, supported OAuth handoff or separate native login are explicit policies. Do not blindly synchronize active OAuth refresh grants to multiple owners. Recovery may require login again; restored profile state is distinct from a usable provider account.

The [connection/conversation contract](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md) makes this operational: ARA manages model-connection setup/bindings/health; native Hermes owns supported authentication and inference. Model credential owner, runtime/session owner and bot connection owner are distinct. A native gateway may multiplex several isolated profiles; per-profile management does not imply a process per profile. Channel bindings, inbox positions, native delivery obligations and explicit sender authority survive migration. A split host-channel/node-runtime bridge is a tested feature gate, not an assumed native capability.

MCP/domain tools call the same validated services as clients. External MCP, native plugins, vaults, model providers and memory providers have separate connector types with capabilities and health. If an agent-to-agent protocol is needed later, expose an adapter around the durable delegation contract rather than confuse it with data access or file replication.

## 9. Files, memory, learning and datasets

Native SOUL, config, complete skill packages and provenance, MEMORY/USER files, session state and plugin configuration remain native-owned. Project AGENTS/context discovery retains actual precedence/provenance; imported identity files are mapped explicitly rather than inventing native semantics. ARA revisions and UI projections do not replace these sources of truth.

Learning is configured per profile: off, review or automatic with visible effective native controls. Map background review, skill/memory write approval and budgets separately; external memory capture is a distinct setting. Approved improvements carry source evidence/history and rollback. SOUL edits remain explicit identity changes. Learning cannot silently change data schemas, permissions, credentials or canonical domain facts.

Hindsight is an optional pinned native memory-provider integration with per-profile bank and capture/recall configuration. Respect the native one-active-external-provider limit. Verify local ARM/macOS deployment; use service-supported backup/export. Obsidian is a user-owned vault with logical IDs/path bindings, read/write scope and one chosen vault-sync owner. It may coexist as a tool/resource alongside Hindsight. Source notes/attachments and bank content need their own protection, not only connector config.

Use PostgreSQL for canonical ARA domain data and registry/sync metadata with separately migrated schemas. Native SQLite remains native session state; a separate local SQLite journal can serve the node sync outbox. External services retain their own private stores/migrations. Use object storage for artifacts/recovery blobs. Browser IndexedDB and Android Room hold scoped caches/drafts, not duplicate authoritative agent/session stores.

## 10. Sync, independence, recovery and environment

The [detailed sync contract](ARA-HOST-NODE-SYNC-AND-RECOVERY.md) is mandatory for distributed operation:

- One active deployment per native runtime instance/conversation; passive replicas use explicit transfer/takeover. One logical profile may have several isolated active instances with explicit routing and memory/definition sharing. Never merge their live native databases. Exclusive channel/credential/trigger ownership is managed separately.
- Durable local work/outbox; committed definition/skill/memory changes target a 2-second debounce/5-second normal flush, runtime events batch, recovery bundles follow turns, active snapshots target 60 seconds. These are targets, not loss guarantees.
- Show local revision, host-received revision and last coherent recovery bundle separately. Hash manifests, resumable deduplicated chunks, tombstones, conflict detection and verified acknowledgement prevent silent overwrite or false backup claims.
- Native WAL-safe backup/restore plus a consistent profile boundary; never merge live native DBs or replace a DB under a running gateway. Preserve unknown-task outcomes and avoid replaying side effects after restore.
- Offline nodes keep CLI/gateway/tools/memory and available model access. Host-only data/orchestration/integrations are unavailable unless locally provisioned. Internet absence and coordinator absence are different.
- Default orchestrator is a host-owned profile; optional node-local orchestrator is a separate authority. Scoped delegation has durable IDs/receipts and explicit unknown resolution.
- Credentials, workspace files, external vault/bank content and data-service recovery each have explicit inclusion/availability. Restore performs dependency/path/OS/backend/credential preflight; synchronized config is not a clone of running processes or hardware.
- A returning stale owner is fenced at shared services and retains a divergent branch. Offline independent processes cannot be universally stopped across a partition; V1 does not promise automatic exactly-once failover.
- Host backups are separate from node replicas. PostgreSQL and recovery objects need independent backup/retention/restore checks. Only acknowledged, included state is recoverable after permanent node loss.

Initial per-domain offline policies: cached reads and drafts are available to clients where enabled; authoritative commits require the data service. Independent node domain commits require that module's local service and explicit replication/conflict implementation. Do not advertise generic multiwriter/offline finance just because profile files synchronize.

## 11. Web information architecture and view behavior

Use an application shell with workspace/connection selector, navigation, global activity/approvals and a persistent view of the selected profile's execution machine. Data navigation works independently of profiles. A profile workspace combines its registered module surfaces with chat/activity; mobile layouts switch panels into focused screens.

| View | Primary content/actions | Required state behavior |
| --- | --- | --- |
| Home | Attention items, recent work, pinned dataset/profile widgets | Distinguish stale cached data, disconnected services and inactive agents. |
| Data library | Dataset catalog, create/import/export, bindings and retention | Fully usable without enabled agents; deletion affects data only through explicit data operations. |
| Dataset workspace | Module-specific table/editor/chart or generic schema renderer | Pagination/filtering, empty/import state, validation, conflicts and pending drafts. |
| Profiles/presets | Install, create, clone, enable/disable and requirements | Show native deployment owner, missing dependencies and preset/user differences. |
| Profile workspace | Custom module tabs, conversation, tools, artifacts and approvals | Custom surface and chat share dataset context; always show execution target. |
| Identity/context | SOUL editor, preset diff, actual project context | Revision checks; distinguish saved from effective in running sessions. |
| Skills | Packages, requirements/provenance, enable/update, review and rollback | Preserve supporting assets; display local/received/backup positions. |
| Memory/learning | Curated files, external provider, learning policy and proposals | Separate capture/learning/history; visible cost/scope and unavailable service. |
| Knowledge | Vault browser/notes, folder scope and indexing | External-edit conflicts, real source availability, selected sync owner. |
| Providers | Accounts/endpoints/models, native login and destination | Show credential owner, OAuth flow status and usable/degraded connection. |
| Channels/conversations | Connection owners/routes, platform threads, live app projections, explicit reply audiences and delivery status | Model completion is separate from platform delivery; conflicting ownership parks only the affected connection. |
| Integrations | MCP/plugins/memory/vault registry, setup, health and bindings | Supported platforms, dependencies, permission scope and restore coverage. |
| Orchestrator | Authorized datasets/agents, task plan/delegations and receipts | Scope visible; blocked/unknown work is not shown as successful or retried blindly. |
| Runs/jobs/channels | Native sessions, tool outcomes, cancellation, schedules and bot ownership | Correct owner controls and explicit uncertainty/recovery; no duplicate activation. |
| Machines/sync | Capabilities, connectivity, owners/replicas, conflicts and transfer | Local vs received vs recoverable status, pending upload/incomplete backup. |
| Recovery/settings | Export/restore preview, environment mapping, object/data backups | Missing external resources and secrets appear as preflight requirements. |

Design baseline: restrained typography/color, accessible keyboard/focus/contrast, dense readable tables, consistent filter/detail patterns, responsive panels and deliberate loading/empty/error/disconnected states. Produce wireframes/component specifications for these views before full visual implementation. Detailed pixel designs are a subsequent deliverable; this contract defines what each must support.

## 12. Projects, stack and maintenance

Proposed repositories; these are logical targets, not repositories already created:

```text
ara-os/                                 Primary product repository
  apps/web/                             React + TypeScript + Vite
  services/api/                         Python FastAPI/Pydantic modular service
    core/                               Profile/module/integration/owner registry
    domains/                            Domain functions + REST/MCP adapters
    runtime_bridge/                     Hermes client/adapter; no model loop
    replication/                        Sync/recovery routing and coordination
  packages/contracts/                   Exported OpenAPI/JSON Schema + client generation
  modules/<module-id>/                  Manifests, module contracts, web surfaces
  presets/<preset-id>/                  Native templates, bindings, requirements
  node/                                 Sync agent, machine bridge, local service lifecycle
  deploy/local/ linux/ macos/ cloud/     Packaging and deployment recipes
  compatibility.lock.json               Tested runtime/plugin/contract versions

ara-hermes/                              One minimal upstream-tracking fork
  native Hermes runtime/CLI/gateway/dashboard
  documented minimal patch queue

ara-android/                             Later Kotlin/Compose client
  generated API models/client, Room, modules/surfaces
```

Backend: Python/uv, FastAPI/Pydantic, SQLAlchemy/psycopg, Alembic, PostgreSQL. Keep core/domain services in one deployable API initially; separate processes only for runtime ownership/lifecycle, sync needs or genuinely independent services. PostgreSQL transaction outbox supports durable application events/jobs without requiring Redis/Kafka initially. Use thin generated client packages, not duplicated handwritten business logic.

Web: React/TypeScript/Vite, accessible reusable components, query/cache layer and a simple client state store. Native Hermes web SDK is optional integration tooling, not the primary application's required runtime. Android: Kotlin/Compose, generated OpenAPI types/client, Room caches/drafts and platform-appropriate module renderers. Object abstraction: local files first, S3-compatible/cloud adapter later. Linux systemd/compatible containers and macOS launchd; validate ARM64 dependencies/images rather than assuming portability.

Preserve pristine Hermes upstream tracking, a small downstream patch inventory and pinned compatibility windows. Upstream changes enter reviewable update branches and baseline/adapter/restore checks before release. ARA app/API releases are independent of upstream dashboard layout. Native CLI/profile/provider behavior is a compatibility gate, not a best-effort afterthought.

Existing `ara`, `ara-web`, `ara-server` and Android code provide source/design/migration references. Build the new API/domain/client boundaries cleanly and migrate selected usable pieces rather than perpetuate the old browser-owned engine. Inventory/version exports and verify record counts/attachments before cutover; provider credentials require explicit native setup/migration. No unrequested deletion/deployment is part of this planning change. Remove proven-unused legacy engine/dependency paths as their replacements ship; do not prune useful upstream providers or native capabilities merely to reduce dependency count.

## 13. Delivery phases and acceptance gates

| Phase | Deliverable | Gate before claiming completion |
| --- | --- | --- |
| 0 — contracts and runtime feasibility | Module/profile/deployment IDs, versioned APIs; real pinned Hermes bridge proof; core view wireframes | Native CLI plus API streaming run, tool call/approval/cancel, native file edit, OAuth flow and coherent backup/restore demonstrated. |
| 1 — web/data vertical slice | Local web/API/PostgreSQL; finance module + Ledger preset; generic datasets/custom profile; native model setup and one real Telegram connection | Manual/API/agent operations share invariants; browser can close while bot runs; web observes the same authorized conversation and accurate delivery status; disabling Ledger preserves data/views. |
| 2 — web breadth and integrations | Training/notebook surfaces, profiles/files/skills/providers/learning/knowledge; real native jobs/channels exposed as supported | Scoped access, restart persistence, learning controls, native editor changes, vault/memory integration and missing-service states verified. |
| 3 — complete installed runtime and machine operation | Node packaging, independent CLI/local gateway, multi-instance registration/routing, sync, backups/transfer and scoped orchestration | Real-machine offline/reconnect/conflict/crash/recovery; model/channel ownership and native environment gates; preserve uncertain effects. Certify combined channel/instance transfer first, split remote transport separately. |
| 4 — distribution hardening | Upstream update pipeline, migration/cutover tools, ARM/macOS recipes and optional Firebase/cloud recipe | Native compatibility and upgrade/restore suites, same API journey through local and chosen hosted frontend, target-machine footprint measurements. |
| 5 — Android | Same API/data/run/approval/profile features with native module surfaces, cache/drafts and optional notifications | Cross-client data/action parity, contract-version negotiation, reconnect behavior and device authorization. |
| Later — Scout and extensions | Rich research surface/flows, additional custom modules and optional richer plugin distribution | Research data remains independent; source/citation/artifact operations work through documented APIs, including non-web clients. |

Web-first includes the minimum real Hermes integration needed to validate the API; it does not postpone all runtime feasibility until after building a large frontend. Full node distribution and federation follow the web/data foundation. Android contracts and renderer IDs are initial work even though Android UI delivery is last. Do not implement every hypothetical deployment/module before proving the vertical slice.

## 14. Requirements coverage and practical limits

| Requirement discussed | Owning contract / planned behavior |
| --- | --- |
| Clean UI for every view | Section 11 navigation/view-state contract; wireframes in phase 0, module surfaces in phases 1–2. |
| Web → installed runtime → Android | Phase sequence; shared API from day one, minimum real harness proof early. |
| Sustainable Hermes/OpenClaw reuse | Hermes selected; one minimal fork, native compatibility, upstream update gates. No dual-engine promise. |
| Presets, disable and custom agents | Versioned native templates; local create/manage; registry/deployment separation. |
| Finance/notebook/workout/custom stores | Independent PostgreSQL modules/datasets; not created/owned/deleted by profiles. |
| Data → agent → orchestrator relationship | Explicit dataset bindings, same validated tools, scoped orchestrator plus delegation. |
| Specialized Ledger/workout/Scout UI | Module surface manifests and distinct web/native renderers; Scout rich UI deferred, extension contract immediate. |
| Android API sharing | OpenAPI/JSON Schema, generated TS/Kotlin clients, typed commands/events; no React-to-Android assumption. |
| MCP and custom integrations | Domain service MCP adapters plus external connector registry; data/control/delegation protocols kept distinct. |
| Keys, endpoints, OAuth and broad providers | Native provider contracts and destination-aware web flows; enabled upstream methods, not fabricated OAuth support. |
| Model auth sharing/sync | Credential ownership and explicit provisioning/handoff; no duplicate active refresh owners. |
| Per-profile bot/gateway management | Channel registry/routes/state, native multiplexer isolation and exclusive receiver/sender authority. |
| Bot migration and multiple instances | Sequential channel handoff or certified pinned-channel remote bridge; independent runtime/session homes. |
| Web/Android/gateway conversation/output sync | One native conversation authority, cursor-based app projections, explicit audiences and target-specific native delivery receipts. |
| Self-learning per profile | Native review/write controls, approvals, budgets and provenance; separate external capture. |
| SOUL/skills/memory/other files | Native source ownership, complete assets/provenance, revisions/exports and actual context precedence. |
| Hindsight and Obsidian | Pinned optional connectors, actual provider/vault content protection and platform checks. |
| Same harness on web and node | Web submits through runtime adapter to native owner; no browser-side replacement engine. |
| Offline machine independence | Full local runtime remains; unavailable remote models/data/tools are explicit unless locally provided. |
| Host replica and sync frequency | Durable manifests/outbox, specified batching/recovery cadence and three distinct acknowledgement positions. |
| Node loss, replacement host and returning node | Verified restore/preflight, explicit ownership transfer, unknown-task handling, divergent branch preservation. |
| Tools/environment portability | Declarative dependency/backend/path manifest and preflight; no promise to copy RAM/hardware/browser sessions. |
| Local ARM Linux/Mac mini | First-class local recipes and real target-platform validation; no mandatory Firebase. |
| Firebase now/later and split deployment | Component roles and adapters; same contracts across local/CDN/cloud, explicit private-network path. |
| Single-user now, multiuser later | Context/scopes encapsulated now; account administration later; device/control access still required. |
| Dependency/engine modernization | Reuse native harness, remove replaced legacy paths with evidence; no blanket trimming of upstream features. |
| Existing application/data continuity | Versioned export/import and record/artifact validation; source changes/cutover are future implementation work. |
| Graceful behavior throughout the product | Sections 15–17: lifecycle contracts, cross-feature failure matrix, honest operation states and release gates. |

This covers the discussed cases as design responsibilities, dependencies and delivery gates. It does not make every capability initial scope or erase platform constraints: lost unsynced data cannot be recovered, offline nodes cannot use unreplicated host services, and rich arbitrary native UI needs a renderer. Those limits must remain visible in product behavior and release claims.

## 15. Product-wide behavior contract

Every feature specification must name: user goal and entry point; source of truth and current owner; dependencies/capabilities; setup and normal operation; interactions with other features; state and synchronization boundaries; allowed mutations/effects; permissions/audience; failure outcomes and recovery actions; removal/upgrade behavior; observable acceptance scenarios. A feature name or API route alone is not a complete specification.

Apply these rules across the product:

1. **Capability-specific availability.** Compute readiness from actual dependencies, account scope, platform, installed module/renderer version and ownership. An expired model login blocks affected inference, not finance browsing. An unsupported bot transfer blocks that operation, not local profile editing. Unknown capability is reported as unverified/unsupported; do not infer support from successful installation.
2. **Desired versus observed state.** Enabling a profile/channel records intent, then validates/starts it. Show starting, ready, degraded or blocked with the actual reason; do not render a toggle as proof the service runs. Shared gateway health includes per-profile state and truthful process-wide outages.
3. **Precise operation outcomes.** Distinguish draft, queued, accepted, running, waiting, succeeded, partial, failed, cancelled and outcome-unknown. A long operation has a durable ID, step receipts and last safe resume point. ARA/native/external stores are not one transaction: reconcile acknowledgement gaps rather than claim cross-system atomicity.
4. **Durable acknowledgement.** A committed domain write and its outbox event share a transaction. Native admissions/snapshots use native durable mechanisms. A file save, host receipt, recoverable bundle and external send acknowledgement mean different things. UI/API must identify which succeeded. On unavailable/full storage, refuse affected new work or preserve an honest local draft; never report uncommitted work saved.
5. **Bounded automatic recovery.** Safe transient operations retry with jitter, provider retry-after and one shared retry budget across layers. Circuit breakers, queue bounds and expirations prevent storms and endless loading. A changed/expired queued command is revalidated against current scope, data revision and target before execution. Uncertain irreversible effects are reconciled, not blindly replayed.
6. **Scoped failure containment.** Validate config/contracts before activation; use per-adapter exception boundaries and per-surface UI error boundaries. Retain last known good configuration when safe. Quarantine a failing optional plugin/renderer or malformed event without discarding unrelated records or leaking a different profile's secrets. A process supervisor recovers process crashes; supervision does not make an in-flight effect safe to repeat.
7. **Useful partial operation.** Keep known-safe functions available and identify what's unavailable. Cached reads are labeled stale; offline edits remain drafts unless an installed local service can commit them. Do not silently route to another model, machine, dataset, memory backend or public audience to hide a failure. Explicit configured fallback is allowed when its capability/scope checks pass.
8. **Concurrency with defined granularity.** Independent datasets/profiles/instances/conversations operate concurrently. Use expected revisions for shared edits, native queues for a single session and exclusivity only for the resource that requires it. Surface conflicts with a diff, route or transfer action; do not prohibit all concurrency or choose an arbitrary winning writer.
9. **Permission and audience continuity.** Revalidate grants at execution and delivery, not only setup. Future multiuser context remains explicit. Untrusted bot messages, imported skills and external documents cannot widen scopes. Data restrictions also constrain memory capture, artifacts, diagnostics and output destinations. If an integration cannot enforce a required exclusion, disable that capture/path locally and explain why.
10. **Safe lifecycle changes.** Define drain/pause, detach, archive, delete and revoke as distinct operations. Disable prevents new managed autonomous admissions/triggers while allowing inspect/config/data views; in-flight work drains unless explicitly cancelled. A shared connection may continue serving other bindings. Cascading effects are previewed, and unrelated data/accounts are not silently removed.
11. **Visible recovery controls.** State the affected resource, what was saved/sent/unknown and the next useful action: resume, reconnect, login, inspect diff, change target, retry delivery, export or restore. Routine read/reversible operations proceed within existing authorization; avoid approval dialogs merely because components are separate. Native/dataset policies still govern meaningful approvals.
12. **Versioned support, not unlimited promises.** Mark capability status as planned, experimental, supported, degraded or retired with supported versions/platforms/topologies. Unknown API/event versions get a readable fallback and preserve data. No design can enumerate every future defect; structured failure containment and fault testing are release requirements, not an assurance of zero bugs.

“Disable” applies to ARA-managed deployments/admissions/triggers. An intentionally invoked native CLI session can remain a supported manual operation; it must not implicitly reactivate disabled bots/jobs, and its activity is reflected in the dashboard. If a policy is intended to prohibit even manual native execution, enforcement must live at the native/OS boundary and be tested; a hidden UI button or ARA database flag is not that enforcement.

## 16. Feature lifecycle and edge-case matrix

Each row must be exercised through relevant UI/API/native paths, including setup/restart/configuration changes/removal. The detailed provider/channel matrix is in the [connection contract](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md).

| Feature/journey | Interactions and edge cases | Required product behavior and recovery |
| --- | --- | --- |
| First install / reconnect | No runtime/model account yet; missing PostgreSQL; incompatible ARM dependency; imported settings from another machine | Persist resumable setup steps; support draft profiles and standalone data where available; show exact missing component. Do not pretend a static webpage runs a bot or CLI service. |
| Dataset/module creation | Data exists before agent; module/schema dependency missing; interrupted migration; custom schema change | Independent dataset lifecycle with validated schema/version; draft/failed setup can resume. Preserve existing data and migration position; no destructive auto-recreate. |
| Domain writes | Duplicate submit; concurrent user/agent edit; changed schema; money precision, units/timezones and correction semantics | Typed validation and operation identity; expected revisions/conflict resolution; appropriate domain invariants/transactions. Separate a proposed change from a committed one. |
| Import/export and legacy migration | Duplicate source items; invalid rows; attachment missing; interrupted upload; unsupported source version | Staged preview/validation, provenance and dedup policy, bounded batches and resumable progress. Report rejected/partial items; never equate partial import with complete migration. |
| Preset install/customization | Required dataset/integration absent; preset update overlaps learned/user edits; clone includes a shared bank reference | Install as draft or resume requirement setup. Choose existing/create dataset deliberately. Versioned changes show diffs; identity/memory/channel/account sharing is explicit. |
| Profile enable/disable/clone/remove | Active runs, schedules and shared channels; one profile disabled while others use the dataset/account | Per-instance readiness; stop new managed admissions/triggers and drain/cancel explicitly. Clone gets isolated state; no implicit duplicate bots/jobs. Remove/archive profile without deleting independent data. |
| Custom module/renderer | New schema or unsupported renderer/API version; component throws; missing Android implementation | Generic supported data surface or clear unavailable feature; isolate renderer failure; preserve underlying records and history. Native bespoke UI remains a separate deliverable. |
| Provider auth/model change | Flow abandoned/expired; login succeeds but entitlement fails; refresh owner offline; shared account revoked; context/tool protocol changes | Destination-bound native flows/status; current runs use captured settings unless native supports safe change. Pause affected inference and offer usable authorized connection/relogin; no hidden fallback. |
| Conversations and output | Two clients submit; restart mid-turn; token stream lost; cancelled run has partial text; gateway send fails | One native admission authority per conversation, stable IDs/history recovery and accurate partial/unknown states. Keep model completion separate from delivery; do not rerun tools to resend text. |
| Native approvals/tool execution | Approval expires; target owner/data revision changes; two clients answer; tool disconnects or call times out after effect | Revalidate approval/action identity and target; native committed outcome wins. Cancellation is requested until acknowledged and does not undo completed effects. Surface uncertainty and supported reconciliation. |
| Orchestrator/delegation | Agent disabled mid-plan; cyclic/recursive delegation; task budget exceeded; partial specialist result; private dataset not granted | Scoped discovery/dispatch with depth/time/token/tool budgets. Preserve task receipts and partial evidence; stop only blocked branches or plan if required. No automatic privilege escalation or duplicate unknown task. |
| Skills/plugins | Install dependencies fails; external edit during learning; broken skill update; executable asset unsupported on destination | Stage/validate and pin compatible packages; show requirements/conflicts. Preserve prior known-good package when safe; disable failing feature and support rollback without deleting skill content. |
| SOUL/context/memory edits | Native editor races web; running session has frozen prompt; unsafe file name/symlink; profile instance diverges | Expected hashes, actual context precedence and effective-session revision. Preserve both conflicting edits; allow explicit publish/branch review; no arbitrary path writes. |
| Self-learning | Turn fails; review budget exhausted; concurrent learned writes; policy switched off mid-review; capture policy differs from memory policy | Track review state/provenance and cost; revalidate policy before commit. Off stops new automatic review/commit under policy; preserve pending proposals, native history and independent explicit capture setting. |
| Hindsight/external memory | Service down, retain succeeds but receipt lost, bank removed/shared unexpectedly; capture exclusion cannot be enforced | Optional recall unavailable with visible effect; bounded idempotent retention if supported, no duplicate-retention assumption. Validate bank mapping; quarantine prohibited capture and preserve canonical data. |
| Obsidian/external files | Vault missing/unmounted, moved path, concurrent external edits, competing sync software, attachment unavailable | Logical path remap and selected sync owner; mark source unavailable rather than deleted. Hash conflicts and selected export/attachment inventory; no overwrite or automatic remote capture. |
| MCP/external integration | Process exits; tool schema changes; missing scope; OAuth expires; result malformed/too large | Time/size/capability bounds, re-discovery/version check and structured tool error. Park affected tool; preserve logs/task state and other integrations. No silent parse-as-success. |
| Gateways/bots | Duplicate bot token/account, webhook change ambiguous, platform rate limit, group/topic permissions, unsupported media, unknown update | Resource-scoped connection lifecycle, durable intake/delivery identities, platform capability handling and visible uncertainty. No competing adapter activation or silent destination broadening. |
| Schedules/channels/triggers | Sleep/clock/DST change; missed firing; disable/update/migration during trigger; repeated webhook | Stable trigger occurrence identity and owner, explicit timezone/misfire/coalescing/expiry policy. Revalidate before delayed work; no automatic burst of stale high-impact tasks or cloned triggers. |
| Multiple instances/deployments | Shared definition but different tools/accounts/memory; same conversation routed twice; node goes offline | Distinct native homes, explicit definition publication and session pinning. Share datasets through their services; capability-check routing. Standby is not an active writer; no native DB merging. |
| Sync and offline | Missed watcher event; long outage/backpressure; tombstone conflicts; old web draft; expired/revoked permissions | Durable local outbox, hashes/reconciliation, resumable chunks and conflict UI. Show local/received/recoverable separately; revalidate pending commands; retain explicit offline branches. |
| Artifacts/attachments | Upload partial, checksum mismatch, unsupported size/type, referenced blob removed or node-only path | Stage and verify before availability; progress/retry/missing status. Scope downloads and transfer artifacts to the actual sender; retain authorized links or clear unsupported result instead of crashing. |
| Machine/connection transfer | Runtime, model grant and bot owners differ; source unreachable; target lacks macOS app/hardware; transfer interrupted | Persisted transfer steps and independent ownership generations; preflight dependencies. Pin connections where supported, otherwise combined handoff; uncertain source requires actual fencing before exclusive activation. |
| Recovery/disaster | Node/host disk loss, incomplete latest backup, missing recovery key/blob, newer native schema, unsynced work | Keep latest verified bundle and protected independent host backups; integrity/compatibility preflight and explicit scope of loss. Restore tools/data separately and preserve unknown effects. No claim of complete recovery from config alone. |
| Web/Android reconnect | Old client schema, stale cache, API cursor expired, multiple devices, notification arrives before commit | Negotiate capabilities/version, refetch current authorized projection, dedup by IDs; show cached/draft state. Notifications are hints; no bot/model secret required on client. |
| Update/rollback | Upstream changes API/native DB/plugin; interrupted update; active work; rollback binary incompatible with migrated state | Preflight/drain/checkpoint with tested compatibility. Resume/rollback through recorded version/data boundary; use matching data restore when required. Preserve user/native files and service lifecycle. |
| Archive/delete/revoke/uninstall | Data referenced by agents/artifacts/memories/backups; shared connection; learned derivative still exists | Dependency preview and distinct detach/archive/delete policies. Tombstones and approved derived-memory deletion propagation; disclose external/backup retention limits. Do not revoke shared credentials or delete external vaults as an incidental uninstall. |
| Privacy/ownership boundaries | Private note context in group reply, imported identity scope, removed device still cached data, future multiuser | Enforce scopes at read/tool/capture/delivery, explicit linking/audiences, revoke future access. Existing downloaded copies/backups need explicit retention/erasure behavior; no false remote-wipe guarantee. |
| Resources/unknown failures | Disk full, database down, CPU/RAM pressure, hung plugin, malformed event, repeated crash | Backpressure and budgets, bounded diagnostics, circuit breaker/quarantine and supervisor. Reject unsafe new effects when durable admission is impossible; preserve usable cache/config and provide a correlation ID/action. |

Domain modules own richer invariants than this matrix can list: finance includes exact amounts/currency and correction/reconciliation rules; training includes exercise/program version and units; notebooks include note-version/source links and capture/privacy; research includes citation/source/artifact lineage. Each module must add its own operation/error/undo/import/export cases before release. Generic storage is not a substitute for those contracts.

## 17. Cross-feature journeys, support policy and verification

Use complete journeys to validate interactions, not isolated mocks:

1. **Setup → manual data → agent:** first install without a model, create/import finance data and use its view, add native model auth, install Ledger and bind the existing dataset. Disable Ledger and verify the data/UI remains usable.
2. **Web → bot → second client:** configure Telegram, close browser, receive a threaded bot message, run a scoped data tool, inspect the same conversation and delivery status from an API-only client; app-private input must not leak into that thread.
3. **Failure during action:** lose connection before native admission, during a tool effect and after a platform send, separately. Confirm stable operation IDs, correct retry versus unknown state, preserved history and bounded recovery without an accidental repeated effect.
4. **Learning → edit → update:** learn a skill, concurrently edit from CLI/web, change learning policy, publish to another instance and update its preset/upstream version. Preserve conflicts, provenance and effective-session settings.
5. **Private data → memory → output:** bind a private notebook to a specialist while a group bot uses the same logical profile; exercise memory capture and artifact creation. Every read/capture/delivery must respect the relevant scopes; no implicit shared-memory bypass.
6. **Offline → reconnect → multi-instance:** run node-local work, modify definition/memory, queue permitted data drafts, revoke/change a binding at the coordinator and reconnect. Revalidate scope and revisions; retain divergent work without granting stale authority or merging native DBs.
7. **Move → crash → recover:** move an instance with bot/credential owners colocated and separately pinned, inject a crash at each handoff step, recover on another machine with a missing tool/account and reconnect the old machine. Report missing/unknown resources and never auto-activate two exclusive connectors.
8. **Module → clients → cloud:** add a custom dataset/module, render on web and a generic API client, simulate missing Android renderer/API version, then use a hosted static frontend against the same API. Unsupported UI does not make records inaccessible or force Firestore adoption.
9. **Upgrade → restore → removal:** capture a complete recovery bundle, apply a version/schema change, fail startup, recover a compatible version/data pair, then detach an agent/integration. Verify independent datasets, credentials used elsewhere and selected backup content are preserved.

Support is declared per capability, module, platform and topology. Start with one coordinator, one runtime instance and one supported channel; allow additional independent profiles/instances as their individual contracts pass. Do not forbid all concurrency to simplify the implementation, and do not label untested cross-machine/channel combinations supported merely because a feature works locally.

Risk-based verification combines domain invariant tests, public API/adapter contract tests, representative end-to-end client journeys, process/network/storage fault injection and targeted pairwise feature combinations. Explicitly test high-impact three-way cases (migration + in-flight effect + gateway delivery; learning + external edit + update; privacy + external memory + group output). It is not feasible to test every mathematical permutation; runtime validation and scoped recovery handle combinations outside the supported matrix.

A supported feature must have a documented source of truth/owner, setup and removal paths, available/degraded/unsupported UI states, bounded resource/retry behavior, recoverable persisted operations where needed, a compatibility entry and relevant passing journey/failure checks. A release lists planned/experimental capabilities honestly and includes actionable operational diagnostics. Visual polish, a running process or one successful demo does not establish this gate.
