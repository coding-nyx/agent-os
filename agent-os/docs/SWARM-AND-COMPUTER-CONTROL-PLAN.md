# Swarms, node execution, and computer control

Status: planned implementation contract, not a claim of shipped functionality.
User decisions recorded 2026-10-19. This refines the swarm and computer-control
direction under the [master plan](../../docs/design/ARA-AGENT-OS-MASTER-PLAN.md)
and [node ownership contract](../../docs/design/ARA-HOST-NODE-SYNC-AND-RECOVERY.md).

Implementation checkpoint: native per-profile/custom-agent workers, isolated Git
stage handoff, standalone node execution, authenticated pull execution, replayable
task receipts, separate passive native snapshot acknowledgements, and policy-gated
native desktop control are implemented. See [swarms](SWARMS.md) and
[computer control](CUA_SYSTEM_CONTROL.md) for actual interfaces and limits.
Physical desktop/driver validation, remote-node dashboard streaming, additional
device backends and per-worker model overrides are not claimed implemented.
The post-v1 custom-fork migration remains the agreed direction, not a v1 rewrite.

## Product decisions

- Swarms are a capability of **any authorized agent profile**, including custom
  coding agents. Ara is a default coordinator, not a privileged execution path.
- An initiating agent coordinates its own temporary workers. Swarm roles are not
  additional permanent roster profiles, and do not require an Ara intermediary.
- A full node must run an entire local swarm, including coding tools, without
  requiring the Agent OS host to execute each worker or model/tool call.
- Through v1, reuse Hermes native delegation and computer-use capabilities behind
  an ARA-owned adapter. After v1, progressively move to our custom fork and remove
  upstream dependency assumptions. Do not build a second agent loop now.
- The profile, swarm, node, and device contracts must survive that transition.

## Runtime boundary

Agent OS owns profile policy, swarm definitions, task identities, node placement,
durable task/event records, UI/API contracts, and authorization requirements.
The runtime adapter executes agent turns and child workers, resolves native model
connections, exposes progress/artifacts, and translates approval/cancellation
operations. OS drivers perform device operations locally.

Define a versioned adapter contract for capability discovery, submission receipts,
status/events, approval responses, cancellation, and outcome reconciliation.
Native session IDs and other runtime-specific handles stay behind explicit
mappings; they are not the public task identity. Unsupported capabilities must
be reported, not emulated with successful placeholder results.

For v1 the adapter targets the pinned Hermes runtime. The post-v1 fork implements
the same contract, with migration/version checks for state and configuration.
Replace upstream-coupled components incrementally; preserve provenance and
applicable upstream licensing. Backend-specific configuration remains available
through a namespaced escape hatch, not embedded throughout ARA business logic.

## Swarm policy and execution

Each profile can enable/disable swarms, select explicit-only or automatic
triggering, allow presets/custom roles, and set worker/concurrency, iteration,
timeout, and usage limits. Model usage is reported; do not promise exact monetary
limits for providers that do not expose enforceable billing controls.

Workers use the initiating profile's effective model connection by default.
Explicit worker-model overrides require a valid connection on the execution node.
Use native credential resolution; never copy rotating grants into worker/task
records or silently substitute another provider.

Effective worker authority is the intersection of initiating-agent permissions,
run restrictions, node capabilities, and any device grants. Worker creation must
not grant all MCP tools or computer control automatically. Supply scoped task
context explicitly rather than assuming access to all personal memory/history.

Run independent tasks concurrently. Run dependent stages in order: implementation
must finish before reviewing its changes. Final synthesis consumes actual worker
results and evidence; child summaries are self-reports, not verified facts.
Represent partial failure, interruption, and unknown outcomes truthfully. No
production canned findings or unconditional success paths.

For coding, give parallel writers separate worktrees or enforced file ownership.
Separate conversation/terminal sessions alone do not isolate repository writes.
Collect diffs, test results, and artifacts, then perform a controlled integration
and verification stage before claiming completion.

## Node ownership and standalone operation

Initially place the whole swarm on one execution owner: normally the initiating
conversation's node, or another explicitly selected capable node. Every worker's
tools run there against that node's workspace. Host placement is the same contract
with the host acting as an execution node, not a special swarm engine.

A node-local CLI/runtime path must work without the host dashboard or its
PostgreSQL database. Persist ARA task receipts/events in a separate local journal,
not by adding application tables to the native session database. Stream or sync
events/artifacts to the host when available. Host-independent execution still
requires reachable model endpoints, local credentials, and any required services;
host-only datasets remain unavailable when disconnected.

Remote launch/control requires authenticated machine identity, authorized
destination binding, stable operation IDs, durable admission receipts, and event
reconciliation. On disconnect, do not assume cancellation or submit duplicate
work. On reconnect, inspect the existing owner and receipt. Native child workers
do not automatically survive runtime exit: report interrupted/unknown outcomes
and require a safe recovery decision rather than claiming transparent resumption.

Current passive snapshot support is not remote execution. Active node launch and
control are explicit v1 work. Distributing one swarm across several nodes is a
separate extension, not necessary for initial node-local swarms.

## Computer control

Reuse native computer-use execution through the adapter; replace the parallel
placeholder CUA path rather than expose both as independent authorities. Desktop
control stays on the machine owning the target device. Android requires its own
validated provider contract; native desktop support is not proof of Android support.

- Computer control and arbitrary OS scripting require separate, explicit grants.
- Enforce view-only/supervised/autonomous policy on the backend, not just the UI.
- Authenticate control/stream connections and validate browser origins.
- Permit only one active input controller per device; parallel workers may plan
  or research, but cannot race mouse/keyboard actions on the same desktop.
- Deliver captures as native image content and expose real backend capabilities.
- Keep intervention responsive during long operations. Define pause, cancellation,
  and in-flight stop semantics honestly, including any driver limitations.
- Deny unavailable actions or dependencies; simulation is explicit test-only mode.

Setup offers optional computer-control installation/readiness checks, supported
desktop-session probes, device selection, and profile grants. Installing a model
connection does not authorize computer control. Standalone node and connected
dashboard execution must enforce the same policy contract.

## Delivery order and acceptance

1. Define adapter/task/event contracts and remove fabricated-success behavior.
2. Wire real native swarms for any enabled preset or custom profile locally.
3. Add node-local standalone execution, authenticated remote control, and durable
   receipt/event reconciliation before claiming active node support.
4. Wire native computer control with explicit grants, device ownership, responsive
   intervention, real image results, and verified readiness.
5. Expose these controls in profile/node/setup surfaces and validate end to end.
6. After v1, introduce the custom fork behind the same adapter and migrate in
   tested increments rather than redesigning the product contracts.

Acceptance includes a custom coding agent running concurrent real workers on a
node; isolated repository writes and collected test evidence; failures/partial
completion; limits and denied tools; host disconnect/reconnect without duplicate
execution; restart reconciliation; credential-owner correctness; unauthorized
device/stream denial; and backend-enforced view-only/intervention behavior.
Use deterministic fixtures for automation, but do not count mock output as proof
that a provider, physical device, or remote execution path works.
