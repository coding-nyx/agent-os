# Swarm and device control fix plan

Status: implemented, 20 October 2026; physical hardware readiness requires the
separate exercise described below. Based on the five reproduced findings in
[the implementation review](SWARM-DEVICE-REVIEW-2026-10-20.md).

The three implementation groups below have regression coverage. Recorded
validation is in [the verification report](VERIFICATION.md). Reactive
swarm scheduling, worker model routing and aggregate budgets are subsequent
feature work with separate acceptance criteria.

## 1. Recheck device authority at dispatch

Addresses findings 2 and 3: supervised-mode bypass and accessibility reads after
grant revocation.

Files: `src/ara_os/cua/engine.py`, `src/ara_os/cua/policy.py`,
`tests/test_cua.py`.

- Consolidate the decision immediately after acquiring the cross-process device
  lock: current actor authority, mode, stop state, controller lease, observation
  freshness, and any approval attached to the exact request.
- For an agent input, decide whether approval is required using the current
  policy. An operation enqueued under autonomous mode that starts under
  supervised mode must produce a pending approval without calling the driver.
- Apply the post-lock authorization check to accessibility reads and captures
  as well as input. A queued request whose grant was revoked must not call its
  provider. If authority changes during a read, discard its result.
- Bind approval evidence to the actor, device, operation fingerprint,
  observation identity and policy revision. Consume it once; invalidate it on
  policy changes. Operator actions retain their explicit operator authority and
  still obey view-only and stop controls.
- Keep atomic single-use approval consumption and existing operation ID
  semantics. Repeated operations return their current receipt rather than
  emitting a second input or approval. Refresh observations explicitly when
  they have expired.

Acceptance tests must control lock acquisition using synchronization events,
without relying on arbitrary timing sleeps:

1. Autonomous input queues; policy becomes supervised; dispatch creates one
   approval and delivers zero inputs. Approving once delivers one input.
2. Queued input/read loses its required grant; provider call count remains zero.
3. Queued observation expires; input is refused before native execution.
4. A policy update invalidates an old approval; repeated approval is refused.
5. View-only, controller contention, operator takeover, stop during execution
   and existing operation ID replay behavior continue to work.

## 2. Preserve the observed native target across subprocesses

Addresses finding 1: capture succeeds but subsequent native input has no target.

Files: `src/ara_os/native_execution.py`, `src/ara_os/runtime_adapter.py`,
`src/ara_os/cua/providers/native.py`, `src/ara_os/cua/engine.py`,
`tests/test_cua.py`, and focused native-adapter integration coverage.

Preferred design: retain the bounded subprocess lifecycle and rebind the exact
observed window within the input process. The pinned backend supports exact
`pid`/`window_id` capture. Capture and input must use the same configured native
backend selection and desktop identity.

- Capture creates an opaque observation reference. Store the adapter-owned
  target identity, desktop identity, relevant geometry/coordinate mapping,
  capture time and actor association in protected local state. A model may
  reference an observation but cannot supply or replace its target metadata.
- Inside the native input process, resolve that observation and validate the
  exact target against the live backend. Acquire the native target through an
  exact capture without auxiliary-model inference, then execute through the
  native safety/approval path using that same backend instance.
- Reject missing, ambiguous, replaced or unverifiable target identities and
  changed geometry; request a fresh observation. Do not select the current
  foreground window as a fallback. Include process/window generation evidence
  where the driver exposes it; refuse if continuity cannot be established.
- Preserve native hard blocks and effect/verification metadata. A delivered
  input with an unconfirmed effect remains visibly unconfirmed.
- Keep target/observation state usable across standalone MCP and operator
  approval processes, while ensuring one actor cannot reuse another actor's
  observation. Expire references and invalidate affected state after restart,
  policy changes or target loss. Observation expiry must not erase the durable
  operation receipts needed to prevent replay.
- Make capture and input cancellable by the existing intervention path. Any
  interrupted delivery with uncertain effects retains its unknown receipt.

Acceptance tests:

1. Run the actual pinned backend/dispatch implementation with a fake driver
   transport. Capture followed by click/type/key succeeds against the same
   process/window, with no auxiliary inference.
2. Switching foreground windows, including two windows of the same app, never
   redirects an input away from the recorded target.
3. A closed/replaced target, changed desktop or geometry, expired observation,
   or wrong actor causes zero inputs and a clear fresh-observation response.
4. Verify normalized coordinates against native/image dimensions, including
   display scaling and window movement; reject unsupported mappings.
5. Approval through a second local process retains exact target binding and
   single-use behavior. Restarts invalidate observation authority and preserve
   operation replay protection.

Implementation gate: prove exact target acquisition and native safety dispatch
can share the same backend through the pinned adapter. If the native API cannot
provide this, revise the design to a bounded persistent native session before
proceeding; do not emulate target continuity by assigning private target fields
or selecting a different window.

## 3. Preserve swarm outcomes through collection and synthesis

Addresses findings 4 and 5: unknown outcomes overwritten by artifact errors and
cancellation during synthesis reported as partial completion.

Files: `src/ara_os/swarm_runner.py`, `src/ara_os/swarms.py`,
`src/ara_os/node_execution.py` if projection compatibility requires it,
`web/src/agents.tsx`, `tests/test_execution.py`, `tests/test_swarms.py`.

- Separate execution outcome from artifact availability. Keep the worker's
  native session handle, execution error, summary and known usage; record
  collection status/error separately. Preparation failures can remain confirmed
  failures because no worker executed.
- Recover the native handle from the durable worker-bound event when transport
  loss prevents it arriving in a completion response.
- If collection fails after an unknown execution outcome, retain `unknown`.
  Preserve workspace paths so the operator can inspect them. Never repeat the
  worker automatically to repair its missing artifacts.
- Block dependent stages when required artifacts are missing, invalid or
  truncated, even when the producing worker's execution completed. Keep
  independent sibling results and artifacts.
- Calculate the final state after synthesis settles. Use one state reducer:
  unknown execution outcomes take precedence; then acknowledged cancellation;
  success requires all required worker, handoff and synthesis results; otherwise
  report partial when some execution completed, or failed when none completed.
- Serialize final cancellation inspection and terminal event publication using
  the journal transaction. Cancellation acknowledged before finalization must
  be reflected; a cancellation arriving after terminal publication must not
  relabel already completed work. Preserve immutable event replay.
- Extend worker events, API projections and the inspector with additive artifact
  diagnostics. Older receipts remain readable and retain their recorded states;
  absent diagnostics mean unavailable information, not confirmed artifact success.
  Keep existing terminal-state names and avoid rewriting prior receipts.

Acceptance tests:

1. Unknown worker plus collection failure stays unknown and retains its native
   handle, original execution error, workspace and separate collection error.
2. Completed worker plus collection failure retains its execution result, blocks
   dependent stages, and publishes a truthful partial result.
3. Cancellation before/during synthesis and immediately before finalization
   produces cancelled; unknown effects still take precedence over cancellation.
4. Synthesis failure without cancellation produces partial; completed results
   and known usage survive in every case.
5. Node upload/replay and host projection preserve terminal state and artifact
   diagnostics without duplicate execution. Older event payloads still replay.

## 4. Integration and readiness gate

- Run the focused swarm/execution/CUA tests after their corresponding changes.
  Then run the full regression suite once and build the web client after the
  inspector changes. Include cross-process locking and exact-target tests; a
  fake provider alone does not validate native adapter integration.
- Confirm the five original reproductions now satisfy their acceptance
  criteria. Add restart, policy-change and event-replay cases described above.
- Align README and CUA/Swarms documentation with actual supported capabilities,
  target handling, observation expiry, approval semantics and outcome reporting.
  Correct the statement that the legacy provider files were removed.
- Physical validation is a separate deliberate local exercise: capture a
  chosen harmless window, exercise one click/type/key, verify the actual effect,
  change foreground windows, revoke authority and exercise intervention.
  Record the tested OS/driver versions and results before claiming hardware
  readiness. Implementation/tests need no production grant changes.

Completion means all five findings have regression coverage, existing receipt
and node-sync behavior remains compatible, the pinned adapter passes its target
tests, and documented readiness matches the evidence actually obtained.
