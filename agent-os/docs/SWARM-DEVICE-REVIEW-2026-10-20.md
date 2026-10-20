# Swarm and device control review — 20 October 2026

Reviewed ARA commit `669e913` and Pentest-Swarm-AI commit
`5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979`. This is a source review with
isolated reproductions, not certification of physical desktop control or a
performance comparison. No production profiles, grants or tasks were changed.

Follow-up: the five findings were addressed on 20 October 2026 under the
[fix plan](SWARM-DEVICE-FIX-PLAN.md). The findings and reproduction results below
describe the reviewed commit; see [verification](VERIFICATION.md) for subsequent
implementation evidence and physical-validation limits.

## Findings

### 1. P1 — native input loses the target selected by capture

Location: `src/ara_os/native_execution.py:181–195`,
`src/ara_os/runtime.py:27–29`.

Capture constructs a `CuaDriverBackend`, captures, and stops that backend.
Input calls `handle_computer_use` in another native subprocess. The native
backend stores its active process/window and snapshot tokens in memory; the
new backend has no selected window. Passing `app` is a mismatch guard, not
target selection. ARA retains only image size, app name and title.

Reproduction with the actual pinned native backend and fake startup/capture:
capture succeeds, then a click returns `ok: false` with
`No active window — call capture() first.` No physical device is touched.

Fix: retain an actor/device-scoped native execution session across capture and
input, including exact target identity and freshness. Alternatively, bind and
validate the exact previously observed target inside the action process before
delivery. Re-selecting an arbitrary foreground window would not preserve the
operator's observed target.

### 2. P1 — queued autonomous input bypasses a later supervised policy

Location: `src/ara_os/cua/engine.py:148–172`, `:74–90`.

The supervised approval check happens before acquiring the cross-process device
lock. If an input waits behind another operation and the operator switches from
autonomous to supervised, `_execute` snapshots the new policy epoch after
acquiring the lock. Its watcher sees no change. The authorization check inside
`invoke` checks grants, kill switch and view-only mode, but does not require
approval in supervised mode.

Reproduction: hold the device lock; enqueue a granted agent's autonomous click;
switch to supervised; release the lock. The fake device receives one input,
the result is successful, and zero approval files exist.

Fix: re-evaluate approval requirements under the device lock immediately before
dispatch. Bind an approval to its exact actor, action, observation and applicable
policy rather than relying solely on an earlier mode check.

### 3. P2 — queued accessibility reads survive grant revocation

Location: `src/ara_os/cua/engine.py:222–229`.

`get_ui_tree` authorizes before waiting for the device lock, then calls the
provider without checking authority again. A revocation while it waits becomes
the baseline epoch when `_execute` finally starts, so the policy watcher does
not reject the read.

Reproduction: hold the lock, enqueue a granted actor's accessibility read,
revoke its grants, then release the lock. The provider is called and its fake
private-window data is returned.

Fix: recheck observation authority after acquiring the lock and before calling
the provider. Use the same dispatch-boundary checks for all observation paths.

### 4. P2 — artifact errors erase unknown execution outcomes

Location: `src/ara_os/swarm_runner.py:144–164`.

A timeout or lost native connection correctly creates an `unknown` worker
result. Artifact collection then executes outside that error-handling block.
If collection fails, `run_one` replaces the worker result with `failed`. The
final swarm is marked failed even though prior model/tool side effects remain
unconfirmed, and the worker receipt loses the original uncertainty.

Reproduction: return `unknown_outcome` from a fake worker and fail its subsequent
artifact collection. The published worker and swarm states are both `failed`.

Fix: retain the execution outcome and native handle; report artifact collection
as a separate failure. An artifact error must not overwrite an unknown outcome.

### 5. P2 — cancellation during synthesis becomes partial completion

Location: `src/ara_os/swarm_runner.py:174–192`.

The final state is calculated before synthesis. If cancellation arrives during
the synthesis worker, its interrupted result changes the state to `partial`,
without checking cancellation again.

Reproduction: complete a fake task worker; request cancellation during the
coordinator call; return an interrupted synthesis. The journal contains
`cancel_requested: true` but final state `partial`.

Fix: calculate the final state after synthesis, preserving unknown outcomes and
honoring cancellation while retaining completed worker artifacts/results.

## Implemented capabilities and limits

- Generic presets and custom roles execute through real pinned Hermes child
  sessions. Coding uses ordered architecture, implementation and review stages.
  Equal-stage custom workers run concurrently. Research/analysis use parallel
  initial workers followed by another stage. Every successful/partial run may
  also invoke a separate coordinator for synthesis.
- Clean Git worktrees and bounded patch/text artifacts support stage handoff.
  They isolate collaboration, not the operating system: file/terminal grants
  execute as the node user. Original repository changes are not automatically
  integrated.
- Atomic SQLite claims, operation fingerprints, immutable event replay,
  authenticated node polling and separate native-snapshot acknowledgements are
  substantive recovery mechanisms. Unknown tasks are not automatically rerun.
- Device discovery and the managed engine expose `local_desktop`. The older
  Linux/macOS/Android provider files remain in the tree but are not registered
  by default or routed through the managed engine. The CUA document's assertion
  that those source files were removed should be corrected.
- Observation uses periodic screenshots with a one-second delay between
  captures, not H.264 hardware streaming. Remote desktop routing, Android/iOS
  control and arbitrary semantic scripting are unavailable through this path.
- Device policy defaults to view-only with no agent grants. REST and WebSocket
  operator capabilities, actor-specific observations, single-use approvals,
  operation receipts and controller leases are present. These govern managed
  ARA operations, not every process running as the same OS user.

## Comparison with Pentest-Swarm-AI

The projects serve different workloads. ARA's current scheduler is a bounded
staged team executor. Pentest-Swarm-AI's optional swarm runner dispatches agents
when typed findings match their subscriptions. Both contain real concurrent
execution; neither architecture by itself establishes better task quality.

| Area | ARA | Inspected Pentest-Swarm-AI |
| --- | --- | --- |
| Coordination | Predefined integer stages; parallel workers inside a stage | Finding subscriptions and agent trigger predicates |
| Shared task information | Earlier results, bounded context and Git artifacts | Queryable typed findings, decay weights and supersession |
| Adaptation | Worker list fixed at admission; no cross-stage feedback loop | New findings can trigger more agent work during a campaign |
| Purpose | General research, coding and analysis; user-defined roles | Security reconnaissance, classification, exploitation and reporting |
| Model selection | Initiating native profile's effective model | Per-role provider/model configuration in the campaign runner |
| Resource controls | Per-worker iterations/timeouts; per-run concurrency; usage reporting | Aggregate cost meter and cost-stop polling, campaign time limits, scheduler concurrency and budget interfaces |
| Execution durability | Separate local SQLite receipts; node event and snapshot acknowledgements | Inspected swarm runner constructs an in-memory blackboard; a PostgreSQL implementation exists separately |
| Output verification | Worker reports explicitly remain self-reports | Security-specific corroboration and optional external verification oracles |
| Device control | Dedicated managed desktop policy and adapter, with findings above | Inspected swarm runner focuses on security tools; no equivalent desktop-control subsystem was identified |

Primary source links at the inspected commit:

- [Agent interface and trigger contract](https://github.com/Armur-Ai/Pentest-Swarm-AI/blob/5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979/internal/swarm/agent.go)
- [Scheduler](https://github.com/Armur-Ai/Pentest-Swarm-AI/blob/5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979/internal/swarm/scheduler.go)
- [Runner, model routing, aggregate cost meter and board construction](https://github.com/Armur-Ai/Pentest-Swarm-AI/blob/5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979/internal/engine/swarm_runner.go)
- [In-memory blackboard](https://github.com/Armur-Ai/Pentest-Swarm-AI/blob/5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979/internal/swarm/blackboard/memory.go)
- [Blackboard and budget interfaces](https://github.com/Armur-Ai/Pentest-Swarm-AI/blob/5aa2a7b2d8ac05d44dcfc90f07dd3583da1ff979/internal/swarm/blackboard/board.go)

Do not carry over the other project's reliability claims without checking the
implementation. In the inspected memory board, subscriptions have a 32-entry
buffer, and replay/live publication use nonblocking sends with an empty default
branch: excess findings can be dropped. The active runner constructs this memory
board. The per-agent token-budget interface exists, but the scheduler only calls
`ChargeAgent(..., 0)`; no positive production call was found in the inspected
source. Aggregate cost metering is implemented separately in the campaign runner.
Finding queries order by creation time, not by a global pheromone priority queue.

## Suggested work order

1. Repair native capture/input target continuity and reproduce it against the
   pinned adapter before deliberately validating physical hardware.
2. Fix policy/approval/revocation checks at dispatch and add queued-operation
   regression coverage.
3. Preserve uncertainty and cancellation through artifact collection/synthesis.
4. Add aggregate task/profile resource controls and optional per-worker model
   routing, preserving credential ownership.
5. Introduce durable typed findings and predicate-driven tasks for research and
   analysis where feedback is useful. Keep explicit dependencies for code
   implementation and review. Add acknowledged consumption/backpressure so a
   full buffer cannot silently discard work. Treat confidence and recency as
   scheduling signals, not proof of correctness.

## Validation performed

Command: `.venv/bin/pytest -q tests/test_swarms.py tests/test_execution.py tests/test_cua.py`

Result: **30 passed in 61.15 seconds**, one Starlette/HTTPX deprecation warning.
The fixture creates a disposable PostgreSQL database and native state and uses
a local provider fixture. Device tests use fake providers.

All five findings were additionally reproduced in isolated temporary state.
The native-target reproduction uses real pinned backend/dispatch code with
startup and screen capture faked. Review scripts were saved in
`/tmp/ara-review-repro.py` and `/tmp/ara-review-native-repro.py`; these are
temporary review artifacts, not committed regression tests. No real desktop
capture/input, external scanning, paid inference or upstream performance tests
were performed. Production code is unchanged by this review.
