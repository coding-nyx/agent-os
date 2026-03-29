# Multi-Agent End-to-End Flow Audit

Date: 2026-03-30
Scope: module flows (input -> processing -> output), agent/runtime pipeline (input -> analysis -> processing -> output -> streaming -> UI updates)
Method: parallel static audits by 3 sub-agents + local verification + flow-audit scripts

## Executive Summary

- Confirmed: core runtime path is wired (`UI -> useModuleAI -> AIProvider/CognitiveAgent/Orchestrator -> action execution -> persistence/events -> UI`).
- Confirmed: onboarding guided-intake stream path is wired.
- Critical and high-risk breakpoints exist in cross-module event contracts, event re-entry, and interruption/error handling.
- Flow registry validation passes, but generated audits still show major coverage gaps and registry/runtime drift.

## Critical Findings

1) Scout export flow recursion (event self-loop)
- `openExportDialog` emits `EXPORT_REQUESTED`; Scout also subscribes to `EXPORT_REQUESTED` and re-calls `openExportDialog`.
- Impact: synchronous re-entry loop, repeated dispatch, UI instability.
- Refs: `src/modules/scout/ScoutPage.tsx:487`, `src/modules/scout/ScoutPage.tsx:566`, `src/lib/spine/spine-event-bus.ts:133`

## High Findings

1) Atlas -> Titan commitment handoff dropped
- Atlas emits `COMMITMENT_MISSED` as domain `C`; Titan handler discards unless domain `B` or `data.domain === physical`.
- Impact: missed Titan adaptation for commitment failures.
- Refs: `src/modules/atlas/AtlasPage.tsx:236`, `src/modules/titan/TitanContent.tsx:261`, `src/modules/titan/TitanContent.tsx:266`

2) `SOMA_READINESS_UPDATED` contract mismatch (cascade dead)
- Titan emits `{ readinessScore }`, while cascade rules require `event.data.score`.
- Impact: readiness-driven cascades never fire from Titan-sourced readiness updates.
- Refs: `src/modules/titan/services/actions/core-actions.ts:225`, `src/lib/spine/cascade-rules.ts:635`, `src/lib/spine/cascade-rules.ts:670`

3) Intelligence pipeline branch effectively dead
- Pipeline expects `level === critical`; Soma readiness levels are `optimal|good|fair|poor`.
- Impact: derived overtraining insight path is unreachable.
- Refs: `src/lib/services/intelligence-pipeline.ts:34`, `src/modules/soma/actions/soma-field-actions.ts:193`

4) Nexus cross-module blocker can remain busy until TTL
- Pending-target clear logic is limited to `query_result`/`VITAL_UPDATED` patterns.
- Impact: false busy state and delayed interaction recovery.
- Refs: `src/lib/hooks/use-nexus-cross-module-blocker.ts:63`, `src/lib/hooks/use-nexus-cross-module-blocker.ts:84`

5) Main module stream interruption can silently no-op
- Orchestrator marks interruptions, but `useModuleAI` does not branch on `response.isInterrupted` after completion.
- Impact: user turn can end without explicit failure signal.
- Refs: `src/llm-engine/engine/Orchestrator.ts:109`, `src/lib/hooks/use-module-ai.ts:978`, `src/core/intake/use-guided-chat-intake.ts:60`

## Medium Findings

1) Atlas emits `MODULE_PROFILE_UPDATED` even on action failure
- `ActionHub.execute` resolves to `boolean`; Atlas ignores result and emits update regardless.
- Impact: optimistic UI/state desync and false positive update telemetry.
- Refs: `src/modules/atlas/AtlasPage.tsx:452`, `src/lib/actions/action-hub.ts:247`

2) Agnes crisis event may be double-emitted
- Combined service + action-layer emission patterns can duplicate `CRISIS_DETECTED` path.
- Refs: `src/lib/services/module-ai-action-execution-service.ts:288`, `src/modules/agnes/services/actions.ts:108`

3) Quiet-hours suppression appears partially wired (inference)
- Suppression helper exists, but no runtime call-sites found in dispatch path.
- Impact: quiet-hours config may not consistently suppress delivery.
- Refs: `src/modules/notifications/services/notification-service.ts:102`

4) Event persistence omits `info` priority events
- Impact: reduced observability for normal-path flows.
- Ref: `src/lib/spine/spine-event-bus.ts:178`

5) Forge profile persistence failures are swallowed
- Logs + continue behavior can mask failed writes.
- Ref: `src/modules/forge/services/forge-session-service.ts:171`

## Agent Runtime Path Audit

Confirmed path:
1. UI invokes `handleSendMessage` (`useModuleAI`).
2. `useModuleAI` constructs history/context and calls `streamMessage`.
3. `AIProvider.streamMessage` delegates to `CognitiveAgent.chat`.
4. `CognitiveAgent` delegates to `Orchestrator.sendMessage`.
5. `Orchestrator` streams chunks via SSE, sanitizes deltas/state.
6. `useModuleAI` batches chunks to `streamingText`, executes action tags, persists state/events.
7. Chat UI renders streaming deltas and committed assistant messages.

## Module Flow Coverage (Input -> Processing -> Output)

- Agnes: wired; break risk in crisis duplicate path and session-mode UI no-op areas.
- Atlas: wired; breakpoints in delegation completion contract and success/failure signaling.
- Titan: wired; blocked by Atlas domain mismatch + readiness payload mismatch.
- Ledger: primary CRUD/action flow wired; event coverage gaps persist in audits.
- Soma: readiness/clearance eventing wired; contract mismatch with other consumers exists.
- Scout: research flow wired; export event re-entry is critical.
- Forge: execution flow wired; persistence error propagation weak.
- Notifications: inbox/settings wired; suppression enforcement uncertain in runtime.
- Nexus: routing/delegation wired; blocker clearing and synthesis freshness gaps exist.
- Hub: event-driven visuals wired; low integration test coverage.

## Registry & Coverage Audit Snapshot

From regenerated reports (`docs/nexus-flow-audit.md`, `docs/flow-audit-report.md`):
- Registry validation: pass
- Significant no-emitter/no-listener counts remain
- Large action-label and action-handler coverage gaps remain
- Runtime usage includes unknown or dynamic event strings that reduce static verifiability

## Missing Tests (Priority)

1. Scout: regression test preventing `EXPORT_REQUESTED` recursion.
2. Atlas/Titan: `COMMITMENT_MISSED` compatibility test (domain/payload).
3. Titan/Cascade: `SOMA_READINESS_UPDATED` payload schema contract tests.
4. `useModuleAI`: interruption handling (`response.isInterrupted`) + streaming fallback tests.
5. Nexus blocker: delegated completion contract matrix tests.
6. Notifications: e2e quiet-hours suppression enforcement test.
7. Forge: persistence failure propagation tests.

## Recommended Fix Order

1. Break Scout export recursion.
2. Align event contracts (`COMMITMENT_MISSED` and `SOMA_READINESS_UPDATED`).
3. Add explicit interruption handling in `useModuleAI` parity with guided-intake.
4. Make Atlas profile-update emit conditional on action success.
5. Tighten Nexus pending-clear contract and broaden accepted completion signals.
6. Wire/verify quiet-hours suppression in live notification dispatch path.

