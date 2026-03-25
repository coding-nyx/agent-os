# Nexus Flow System Roadmap (Full Refactor, 4–6 Weeks)

## Summary
- Deliver a robust, end-to-end flow system with a central Flow Registry, generated artifacts, deterministic intent-to-action routing, and CI/runtime validation gates.
- Phased milestones with concrete deliverables and acceptance criteria.

## Milestones & Deliverables

### Phase 0 — Baseline & Alignment (Week 0–1)
Deliverables
- Freeze current audit outputs and establish baseline metrics (unknown events, unlabeled actions, unplanned intents).
- Define Flow Registry schema (intents, capabilities, actions, events, proposals, ownership, mutability, risk).

Acceptance criteria
- Schema approved and versioned.
- Baseline metrics published and linked to CI dashboard or report artifact.

### Phase 1 — Flow Registry + Codegen (Week 1–2)
Deliverables
- Implement Flow Registry (single source of truth).
- Generate artifacts:
  - Action labels
  - Allowed action lists per module
  - Spine event catalog
  - Proposal lifecycle handlers (confirm/dismiss/approve)

Acceptance criteria
- Generated artifacts replace hand-maintained ones without behavior regressions.
- No missing labels for registered actions.

### Phase 2 — Deterministic Routing + Planner Coverage (Week 2–4)
Deliverables
- Extend planner/dispatch coverage to all `CommandIntentType` intents.
- Define deterministic fallback paths (proposal-first for mutating actions without direct mapping).
- Unify intent routing with planner so every intent has a canonical handling route.

Acceptance criteria
- 100% intents supported by planner or explicit proposal flow.
- No free-form-only intents without deterministic fallback.

### Phase 3 — Validation Gates (Week 4–5)
Deliverables
- CI checks:
  - Unknown event strings
  - Actions missing labels
  - Missing proposal lifecycle handlers
  - Missing intent-to-action coverage
- Runtime guardrails:
  - Log and route unhandled events/actions to incident queue

Acceptance criteria
- CI fails on drift.
- Runtime guardrails visible in command center with actionable signals.

### Phase 4 — Module Refactor + Cleanup (Week 5–6)
Deliverables
- Migrate module action wiring to registry-driven definitions.
- Normalize delegation and rerouting flows across modules.
- Remove deprecated or unused events and stale labels.

Acceptance criteria
- No unknown event strings in repo.
- 0 unlabeled actions.
- Delegation events always have at least one listener.

## Test Plan
- CI validation gates pass on a clean branch.
- Smoke test per module: intent → planner → action → event → proposal lifecycle flow.
- Regression checks: no increase in unknown event strings or unlabeled actions.

## Assumptions
- Full refactor scope includes module wiring and UI updates where proposal lifecycle or delegation UIs need adjustment.
- Delivery horizon is 4–6 weeks with phased rollout and validation gates before cleanup.
