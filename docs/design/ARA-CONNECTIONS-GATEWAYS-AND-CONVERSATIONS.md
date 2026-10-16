# ARA provider connections, gateways, deployments and conversations

Status: proposed implementation contract under the [master plan](ARA-AGENT-OS-MASTER-PLAN.md). This closes the credential/channel/session ownership gap. It also refines earlier blanket “one active owner per profile” wording: ownership is per native runtime instance, conversation, exclusive connection and scheduled trigger. Several isolated instances can belong to one logical profile; their live native databases are never merged or mounted together. No remote gateway federation or provider broker is claimed implemented.

Product rule: allow useful combinations and restrict only the resource with a demonstrated exclusivity requirement. Unsupported/unknown combinations return a typed capability result with a recovery action; they do not crash an entire profile or silently substitute another credential, destination or execution machine. This is an engineering contract backed by failure testing, not a promise that unknown software defects cannot occur.

## 1. Separate concepts and owners

| Concept | Meaning and authority |
| --- | --- |
| Logical profile | User-facing agent identity, definition revisions, preset lineage, dataset bindings and UI surfaces. |
| Runtime instance | A distinct native Hermes home/session authority and its local memory/learning state. Several instances may use one logical profile's published definition. |
| Deployment | A machine installation of an instance, active or passive. At most one deployment actively owns that instance. |
| Conversation | Stable ARA conversation ID mapped to one instance, native session/lineage and turn-admission authority. Web/Android are clients of it. |
| Model connection | Provider/protocol/account reference, credential owner, allowed bindings, health and sharing policy. |
| Credential owner | Native store/process responsible for a grant and its serialized refresh lifecycle. Separate from a profile's execution placement. |
| Gateway service | Supervised native gateway process, possibly multiplexing several profiles; not necessarily one process per profile. |
| Channel connection | Logical Telegram bot, Slack app/workspace, Discord bot, WhatsApp linked session, etc. Has a concrete adapter/receiver and sender owner. |
| Channel binding | Route from external chat/thread/command to a profile/instance/conversation plus permitted audiences/actions. |
| Delivery | A specific run result/message sent to a specific external destination by its authorized sender. |
| Trigger | Schedule/webhook/event subscription with one firing authority and stable operation IDs. |

The dashboard manages these records but does not itself refresh model grants or run Telegram polling in a browser. A web-created profile must be deployed to a runtime machine. If none is available, creation succeeds as a draft and enabling execution/channel response reports the missing runtime.

Resource ownership generations are separate: moving an instance need not move a bot or OAuth grant. Native runtime epochs remain native. ARA generations route/fence coordinated operations and do not magically revoke provider tokens on an unreachable computer.

## 2. ARA model-provider management

ARA owns the provider connection catalog, profile/instance bindings, setup orchestration, policy and status UI/API. Hermes owns native provider transports, supported login/refresh behavior and actual inference. No second token format or provider implementation is required merely to add web controls.

Connection metadata includes `connection_id`, provider/plugin and version, protocol, endpoint/model capabilities, credential-owner machine/store, credential reference/version, sharing mode, authorized profile/instance bindings, model choices and health. Tokens/keys are stored in protected native stores or an explicitly configured secret service, not plaintext connection rows, sync manifests, exports or client caches.

Web/Android setup flow:

1. Select provider/protocol, target credential owner and intended sharing mode. An OpenAI-compatible URL/key does not imply compatibility with every provider protocol.
2. ARA starts the pinned native key/device/browser flow on that owner and returns only required verification URL/code or supported redirect metadata. Bind flow state to the selected owner/profile; support cancel/expiry/reconnect.
3. The native owner commits credentials through its supported mechanism. ARA records a reference and checks actual connection usability; OAuth success alone does not prove model entitlement/inference access.
4. Apply profile/instance bindings. Native CLI auth changes are observed and invalidate ARA status without replacing native precedence. Root/shared native auth versus profile override remains explicit.
5. Show ready, owner-unavailable, expired/reauth-required, entitlement-denied, rate-limited, unsupported or setup-incomplete independently from profile health.

Sharing modes:

| Mode | Behavior and migration |
| --- | --- |
| Native local | Grant/key stays with the executing machine's native owner. Best independence. Migration needs permitted provisioning, supported handoff or destination login. |
| Explicit static-key provisioning | Encrypted delivery to approved machines if allowed; track/revoke each provisioned copy, respect provider limits. Does not imply moving OAuth refresh grants this way. |
| Separate native account/login per instance | Each owner has its own supported grant; actual provider session restrictions still apply. |
| Remote credential/model owner | A tested native-compatible broker/provider adapter sends allowed inference operations through one credential owner. Keeps the grant there but requires its availability. |

The broker is a capability-gated integration, not a claim that every subscription transport can be reduced to a generic OpenAI proxy. Preserve the actual provider's streaming/tool/reasoning semantics; unsupported routes use local login instead. Native local sharing on the same machine follows upstream's existing root/profile behavior.

For one rotating OAuth grant, serialize refresh at its native owner; do not copy it into independently refreshing stores. Retry transient refresh faults with bounds; invalid/revoked grants become reauth-required instead of looping. Explicit handoff stops the previous owner, transfers only through supported semantics and validates the destination. If the previous owner is unreachable, independent login/revocation may be required. A backup-only encrypted credential capsule must never auto-refresh.

Changing profile placement does not automatically change its model account. Preflight reports whether the destination will use a reachable remote owner, already provisioned usable connection or needs login. A blocked model leaves data views, configuration, history and other healthy instances usable. Model/account fallbacks require an explicit preconfigured policy, not a hidden switch.

## 3. Gateway and channel management per profile

The profile's **Channels** view lists its bound connections: provider/account identity, adapter owner, routing scope, polling/webhook/socket/linked-device mode, runtime destination, actual capabilities, queue/delivery health, allowed chats/users and desired/observed state. It supports create/bind/test, pause/resume, detach, reconfigure, rotate credential and transfer with preview.

A machine may host one native multiplexing gateway that isolates several profiles' adapters, homes and secrets. ARA manages logical per-profile channels without requiring a separate process/port for every profile. Restarting one channel/profile should use supported targeted controls; if a gateway-wide restart is necessary, report affected profiles before executing it. Do not depend on a retired/temporary standalone native flag without an explicit compatibility reason.

Channel registry fields include connection ID, actual external account ID, credential reference, adapter version, capability declaration, exclusive receiver/sender lane if applicable, owner/generation, bindings, session store references, intake checkpoint, delivery ledger reference and health. Identify a Telegram bot using validated bot identity, not only a token hash: rotating a token does not create a different bot.

Reserve exclusive resources transactionally before activation; reconcile native/CLI-created adapters and detect conflicting live registrations. A duplicate is parked as `conflict`, with its owner shown; do not crash all gateway profiles or endlessly start competing pollers. Managed controls cannot guarantee detection or shutdown of arbitrary unmanaged external programs with the same credential.

Channel capability metadata declares platform-specific receiver concurrency, supported sharding, webhook ownership, linked-session portability, media/reply/edit/thread support, replay/ack behavior and handoff/revocation methods. Do not apply “one physical connection universally” to protocols that legitimately support shards/partitions; one logical connection manager assigns supported lanes.

One bot can route to several profiles through a single connection and explicit deterministic chat/topic/command bindings. Freeze the selected profile/instance for a conversation; do not let message text silently switch privileged profiles. First delivery can default to one bot/one profile, then enable multi-profile routing when its scopes and state transitions are verified. Two profiles never need two competing pollers for the same bot.

## 4. Web-created Telegram example

Suppose Ledger is created through ARA Web while its runtime is on the server:

```text
Telegram
   |
server: channel connection tg-ledger
        native Telegram adapter, credential and durable intake/delivery
   |
connection binding -> Ledger conversation -> Ledger runtime instance on server
   |
native model/tools -> result -> authorized Telegram sender
   |
ARA conversation projection -> web / Android
```

The browser closes and the server gateway continues. Create the bot externally through the supported provider flow, or invoke a native creation flow if its pinned API supports it; do not invent BotFather automation. Web submits the credential securely to the selected owner, validates bot identity/access scope, checks conflicting connections and enables the native adapter only when ready.

When Ledger's runtime moves to a laptop, there are two supported placement strategies:

**A. Keep the channel on the server; move only execution.**

```text
Telegram <-> server native channel adapter
                       |
                durable authenticated remote bridge
                       |
               laptop Hermes Ledger instance
```

The bot token remains on the server. The laptop receives authorized input and returns output intents; it never starts a second Telegram adapter. Existing bot address/webhook stays stable. This is the preferred connected topology after the remote bridge is verified. If the laptop is offline, intake can queue within explicit limits and report availability; it does not silently execute the same in-progress task on another machine.

**B. Move execution and the channel owner together.**

Perform the handoff in section 5. The same Telegram bot/token can be used sequentially by the new adapter; it must not create two active pollers. Encrypted storage on two machines is different from permission for both to activate the credential. OAuth and other platforms may instead require reauthentication/re-pairing.

The split bridge is new ARA work: native platform adapters must admit remote input and deliver remote results without invoking a second local model loop. Verify platform metadata, commands, typing/streaming, media/replies, native approval context, session IDs and durable delivery receipts. Reuse supported hooks; record a small explicit transport patch if needed. Until that platform passes the bridge gate, co-locate execution/channel and offer an honest combined handoff. Do not advertise transparent remote transport simply because native same-machine profile routing works.

## 5. Planned and forced channel transfer

Planned transfer is a persisted state machine, with crash recovery at each step:

```text
active(source) -> preparing -> draining -> source-stopped
              -> state/capability-verified -> activating(target) -> active(target)
```

1. Prepare destination dependencies, credentials and connector capabilities with network activation disabled. Record transfer ID and expected generations.
2. Stop new run assignment at a known boundary; durably queue admitted input where configured. Drain or explicitly classify in-progress turns, tool effects and outgoing sends.
3. Stop the source adapter and its auto-restart/auto-discovery activation. Confirm termination; hand off inbox positions, routing/session mapping, pending native delivery obligations and required portable connection state. Preserve a recovery snapshot.
4. Advance connection ownership separately from instance placement. Provision destination secrets through the selected policy. Keep source secrets inactive/removed as configured.
5. For polling, start only the destination poller and preserve confirmed update positions/duplicate identities. Do not drop pending updates by default during a migration. For webhook mode, configure and verify the destination endpoint/secret with platform-specific reconciliation; retry the stable transfer operation after ambiguity instead of enabling an old poller.
6. Resume work in order under the confirmed destination. If activation fails, remain paused or perform a recorded reverse handoff to a confirmed stopped destination. Do not auto-start both as “rollback.”

Forced takeover cannot rely only on a database lease when an unreachable source still holds an external bot token. Managed lease/watchdog expiry can park that channel's receiver/sender while leaving local CLI/tools alive, but cannot revoke an unmanaged process or an HTTP call already in flight. If source stop cannot be established, require provider-supported invalidation: e.g. revoke/rotate Telegram bot token and set the destination endpoint, invalidate linked sessions, or re-pair/re-authenticate according to the platform. Otherwise report takeover-blocked/ownership-uncertain rather than declare uniqueness proven.

Offer per-connection partition policy: **continue locally while coordinator is unavailable** (supports independent local bot operation, requires explicit fencing before remote takeover), or **pause this shared connection when coordination is lost** (more controlled failover). Neither setting disables the whole profile. A bot pinned to a reachable server avoids transferring its token merely because a runtime moves.

Hermes' inspected Telegram implementation defaults to dropping pending updates on cold boot and has special conflict-recovery behavior. Managed migration must explicitly preserve its intake policy or implement the required adapter seam; do not assume native defaults guarantee no lost backlog. Telegram's pending retention and prior acknowledgements still bound recoverability.

## 6. Multiple deployments of the same profile

Expose explicit modes rather than an unrestricted “sync all live directories” toggle:

| Mode | Concurrency and state | Channel behavior |
| --- | --- | --- |
| One instance + standby deployments | One native writer, many passive backups; exact native state transferred on migration. | Bound channel routes to current owner, or moves through explicit handoff. Initial default. |
| Several isolated instances of one logical profile | Concurrent native homes/sessions, common published definition and selected shared datasets; per-instance curated memory/learning by default. | Distinct bot connections, or one connection routing distinct conversations to selected instances. No shared native DB. |
| Conversation-sharded instances | Connected router assigns each new conversation to one eligible instance; existing conversation remains pinned. | One channel ingress/sender can serve many conversations. Requires certified remote bridge and explicit admission/owner checks. |
| Explicit independent clone | New logical profile ID with chosen data/memory sharing; changes do not implicitly follow the original. | No channels/schedules automatically duplicated; configure or bind deliberately. |

Concurrent isolated instances are allowed where credentials/integrations support them. Conversation sharding is enabled only after its capability gate; it does not require forbidding all multi-instance operation until then. Unsupported combinations remain inspectable/configurable and can use a supported topology.

Definition sync: logical profile revisions for SOUL/config/skills are published with expected hashes. Each instance reports installed/effective revision; updates apply through native validation/safe boundaries. Learned changes are local proposals until explicitly/according to policy published. Concurrent changes produce reviewable diffs, not last-writer-wins replacement of identity.

Curated native memory and sessions belong to an instance. To share knowledge, bind common authorized datasets or an explicitly shared external bank. Sharing a memory bank does not share a conversation/permissions or safely merge two MEMORY.md files. A logical profile view aggregates source-labeled instance histories; it does not manufacture one canonical transcript by concatenating them.

Dataset sync is independent of profile files. Instances can use one reachable canonical PostgreSQL dataset concurrently through validated services. Offline/local copies have that module's replication/conflict policy and visible revision; unsupported offline writes become drafts. Learned statements never automatically become canonical finance/training/notebook mutations.

Schedules/subscriptions have one trigger authority. Different isolated instances may each run intentionally distinct schedules, but copying their definitions does not authorize duplicate firing. Remote tasks use stable operation IDs; uncertain tool effects do not become safe retries because another instance is available.

## 7. Canonical conversation and client synchronization

A conversation record maps:

```text
conversation_id, logical_profile_id, runtime_instance_id
native_session_id and lineage, current deployment/owner generation
origin connection and external chat/thread/topic/sender scope
authorized client bindings, event cursor, explicit reply audiences
```

Preserve native platform session-key semantics for group/DM/thread/observed-context behavior; verify the mapping rather than invent a universal key that collapses unrelated people/topics. An Android login or a single-user ARA workspace does not automatically authorize every person in a Telegram group. Account/identity linking and chat allowlists are explicit.

Telegram inbound is normalized into a durable admitted-input envelope, including connection ID, platform event ID/kind, chat/topic, sender, edit/reply metadata, attachments and native trust/context information. Deduplicate by actual platform identity including edit/event semantics; message text equality or message ID alone is insufficient. A connection's polling/webhook acknowledgement must follow its declared durable intake boundary. If the native adapter acknowledges earlier, close that gap before promising durable intake guarantees.

Route each accepted input once to the assigned conversation authority with a stable admission key. Retries resolve the same native admission/receipt through a tested idempotent bridge; where native API support is missing, add a focused durable admission seam. A transaction in ARA PostgreSQL is not atomic with a native SQLite admission, so reconcile lost acknowledgements rather than assume exactly-once RPC.

Web/Android subscribe to authorized conversation projections using cursors and fetch history/status on reconnect. The native runtime remains canonical for its session transcript; the ARA event/index projection retains native IDs, lineage and approved metadata. Separate cross-instance histories remain separate. Cached output is labeled stale/local/unconfirmed as appropriate; devices never infer that a message was delivered externally merely because a run completed.

Default output behavior:

| Interaction | Destination |
| --- | --- |
| Telegram inbound | Reply to its Telegram chat/thread through the owning connection; authorized clients also observe the result. |
| New web/Android private chat | Its application conversation only. No automatic Telegram send. |
| Web/Android opens a Telegram conversation | Observe the same history. Composer explicitly identifies “reply to Telegram”; private work starts a separate private conversation. |
| User enables a mirror/broadcast | Explicit scoped destinations create separate delivery records; never send to every installed client/bot by default. |
| Profile runs on a different machine | Execution placement changes, audience/connection binding does not implicitly change. |

Two clients sending into one conversation use the same native turn queue/order; they do not each start a model loop. Approvals/cancel are commands to that current authority with expected revision; competing actions converge to the committed native outcome. A private notebook context cannot be mirrored into a group just because both use one profile.

Android is a client, not another Telegram poller or OAuth-refresh owner by default. FCM is a wake-up hint; fetch actual state from the API. If an Android runtime is ever added, it must register a distinct instance and satisfy the same ownership/platform contract rather than silently behaving as a client and runner simultaneously.

## 8. Output delivery, retries and uncertainty

Keep **model result**, **tool effect** and **external delivery** as different states. A model result can be complete while Telegram delivery is pending/failed. The result remains visible in authorized clients and can be retried as a delivery without rerunning inference or its tools.

Use stable logical message IDs and target-specific delivery intents: connection, chat/thread, owner generation, payload/artifact refs, native obligation ID, attempt status and platform receipt IDs. One sender authority accepts a delivery intent. Repeated remote dispatch resolves its existing native obligation instead of opening another send loop. Native formatting/chunking/media and delivery ledger remain the platform adapter's responsibility; ARA stores projections/dispatch receipts, not a competing automatic retry engine for the same obligation.

Delivery states: pending, sending, delivered, retry-wait, failed-permanent, uncertain, expired/cancelled. A bounded retry is safe when the adapter proves the request was not accepted; respect provider retry-after. On timeout/crash after submission, use platform reconciliation where available. Otherwise keep uncertainty visible. A configured text-recovery policy may use native “recovered reply, possibly duplicate” behavior; do not claim universal exactly-once external delivery. Irreversible tool effects need separate reconciliation/explicit resolution and are never blindly replayed as message retries.

The inspected native Hermes ledger already permits bounded at-least-once recovery with visible duplicate markers in ambiguous send cases, and is best-effort if ledger writes fail. Preserve/declare that actual behavior. Stronger ARA durability or conservative delivery policies require a tested adapter/patch; do not silently describe native behavior as strict exactly-once or let two ledgers each retry.

Uploads/attachments are materialized at the sender through authorized artifact transfer; a laptop-local path is not a valid server attachment. Missing blobs become pending/unavailable delivery, not a crash or fabricated attachment. Platform size/type/thread support is capability-checked with explicit fallback (e.g. an authorized link) only when permitted. Multi-part receipts may be partial; do not mark the whole message unsent merely because one chunk failed.

## 9. Graceful capability and lifecycle behavior

Keep desired state separate from observed state per connection/instance. Suggested observed states: draft, validating, ready, active, draining, paused, waiting-for-owner, waiting-for-credential, conflict, retry-wait, degraded, unsupported, ownership-uncertain and failed-permanent. Stable error codes include scope, retryability, pending operation ID and recovery action. API errors and asynchronous failures render these states without crashing the UI or unrelated channels.

| Condition | Expected behavior |
| --- | --- |
| Same Telegram bot registered twice | Detect actual bot identity; park conflicting activation, offer route via existing connection, handoff or another bot. |
| One bot used by several profiles | One connection with explicit chat/topic/profile routing where supported; no competing receivers. |
| Destination lacks a channel's native dependency | Leave that channel blocked/degraded; permit data/UI/other tools and offer pinned-channel or combined-transfer alternative. |
| Provider login missing/expired | Pause new inference for affected bindings; preserve inputs/status and offer native login or configured alternate connection. |
| Rate limit/transient outage | Per-connection backoff/budget/circuit breaker; bounded queues and clear retry timing; other channels continue. |
| Runtime unavailable, channel still connected | Queue eligible inputs within limit/TTL, show waiting status, optionally send one availability notice; no automatic replay of expired high-impact commands. |
| Queue/storage quota reached | Stop accepting with an honest durable-error/availability response where possible; never acknowledge storage that did not commit. |
| Native connector process crashes | Supervisor restarts with bounded backoff; recover durable state; inspect ambiguous sends/started tasks. |
| One adapter fails inside a multiplexer | Catch/report at adapter boundaries and park/retry that adapter; if upstream fault kills the process, supervisor restores service and UI reports the broader affected set. |
| Unknown webhook/event kind | Preserve a bounded diagnostic/raw envelope as policy allows, mark unsupported/dead-letter and continue handling known events. |
| Plugin/config/schema mismatch | Validate/quarantine affected config, retain last known good state and expose upgrade/rollback; never silently borrow another profile's secrets. |
| Old node reconnects after transfer | Reject stale shared writes/sends, retain local branch/history and offer reconciliation/reassignment. |
| Uncertain external send/effect | Display uncertainty and supported reconciliation/recovery; no blanket hidden retry. |

Queue TTLs, quotas and retries are configurable, with defaults per operation class. Typed profile edits, connector setup/transfer and queue actions are idempotent and resumable. Routine operations use preflight and automatic safe retries; user decisions are reserved for real ambiguity, credential authorization or destructive effects. Optional unsupported features are capability-gated; they do not make every profile unusable.

Observability: per-connection/instance health, lag, queue size/age, owner/generation, last accepted input, last completed run, last delivery/uncertainty, credential status and structured correlation IDs. Logs redact credentials and use bounded retention. ARA's web/Android rendering must handle missing optional fields and unknown enum/event versions with an understandable fallback.

## 10. Data/API and implementation structure

Add core records (names illustrative): `runtime_instances`, `deployments`, `model_connections`, `credential_bindings`, `channel_connections`, `channel_bindings`, `connection_ownership`, `conversations`, `native_session_links`, `inbound_receipts`, `run_projections`, `delivery_projections`, `transfer_operations`, `trigger_ownership` and a transactional command/outbox store. Actual native session and delivery ledgers stay native. Local edge inbox/spool protects node acceptance while the coordinator is unavailable; its acknowledged recovery position remains visible.

API additions:

```text
/api/v1/model-connections                  catalog/setup/bind/status
/api/v1/model-connections/{id}/auth-flows   native flow start/status/cancel
/api/v1/profiles/{id}/instances            isolated instances and deployments
/api/v1/profiles/{id}/channels             logical connection bindings
/api/v1/channel-connections                validate/claim/configure/state
/api/v1/channel-connections/{id}/transfers  preview/start/status/reconcile
/api/v1/conversations                      discover/join permitted conversations
/api/v1/conversations/{id}/messages        send with admission key/explicit audience
/api/v1/conversations/{id}/events           cursor-based projections
/api/v1/deliveries/{id}                     actual destination/status/recovery
```

The connection manager, credential coordination, conversation router and delivery projections are modules of the initial ARA API, not necessarily separate microservices. Platform/model transports remain native; node bridge/sync agent supplies authenticated machine RPC. Published capability metadata drives both web and Android controls. Gateway/native compatibility manifests include admission, connector transport and delivery contracts, not only runtime version numbers.

## 11. Implementation and acceptance gates

1. **Single-server vertical slice:** web creates/deploys profile, native model auth works, one Telegram connection receives/replies with browser closed, web shows the same authorized conversation and accurate delivery status. Native multiplexer profile isolation and duplicate-bot detection verified.
2. **API-only second client:** fetch/send/approve/cancel against the same conversations using generated contracts. Demonstrate that app-private chat does not post to Telegram, and an explicit Telegram reply goes to its actual thread. This precedes Android UI implementation.
3. **Combined instance/channel transfer:** source stop/disable, coherent checkpoint/intake/delivery state, destination preflight/start; interrupted transfer recovers without two active managed connectors. Reauth/re-pair cases and bot token rotation tested.
4. **Independent concurrent instances:** separate native homes, shared dataset and definition revisions, separate session/memory authority, deliberate learning publication, no cloned channel/trigger activation. Unsupported shared integrations degrade locally.
5. **Split channel/runtime bridge:** test remote admissions/lost acknowledgements, media/replies/threads, native source scope, streaming/cancel/approvals, output dedup/uncertainty and node outage. Only then enable channel pinned to host with execution on a node; conversation sharding is a separately negotiated capability.
6. **Failure matrix and upstream updates:** crash before/after intake commit, native admission, model result and platform send; duplicate/redelivered/edited events; invalid/revoked token; rate limit; quota; partition; stale owner; unknown plugin/event; failed dependency; pending backlog. Verify bounded retries, retained work/diagnostics, accurate uncertainty and healthy unrelated capabilities.

The master delivery priority is unchanged: web/local services first, complete node operation next, Android later. The first bot/auth/conversation contracts are web foundations, not work deferred until the final node or mobile phase.

## Native evidence

Hermes snapshot `201b32361592bd9ac230d33fd592e101b8cca4af`. These sources establish native behavior, not completed ARA federation:

- [Profiles: OAuth refresh ownership and channel clone exclusions](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/user-guide/profiles.md)
- [Multi-profile gateways and current multiplexer lifecycle](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/user-guide/multi-profile-gateways.md)
- [Multiplexer profile/secret isolation](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/developer-guide/multiplexing-gateway.md)
- [Telegram polling/webhooks, intake and cold-boot policy](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/user-guide/messaging/telegram.md)
- [Native delivery ledger and possible-duplicate recovery](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/gateway/delivery_ledger.py)
- [Native session authority and unknown-work semantics](https://github.com/NousResearch/hermes-agent/blob/201b32361592bd9ac230d33fd592e101b8cca4af/website/docs/developer-guide/session-storage.md)
