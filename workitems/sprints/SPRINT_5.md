# SPRINT 5 — Onboarding Mode Separation and Fast-Track Validation
**Duration:** 1 week  
**Objective:** Separate onboarding orchestration by module mode (`required`, `optional`, `hybrid`) and add deterministic fast-track validation with LLM + schema guardrails.
**Status:** Closed — Completed March 10, 2026

## Sprint Start
- Sprint 5 started as the active sprint.
- Execution order is S5-001 -> S5-002 -> S5-003 -> S5-004.
- Sprint 4 is closed and moved to completed sprints.

## Goals
- Formalize module onboarding mode contracts and registration.
- Implement separate onboarding flow handling by mode.
- Add fast-track validation with confidence and fallback gates.
- Define migration plan for all routed modules.

## In Scope
- Onboarding capability flags and runtime checks.
- Fast-track validation pipeline and fallback behavior.
- Tests for mode enforcement and fallback determinism.
- Documentation updates for module onboarding mode declarations.

## Out of Scope
- Refactors inside `src/llm-engine/*`.
- Non-onboarding product UI redesign.
- Deferred Sprint 2 memory adapter work.

## Sprint Items
1. **S5-001: Onboarding Mode Taxonomy + Contracts**
   - [x] Acceptance: each routed module declares `required` | `optional` | `hybrid` in a single source of truth.

2. **S5-002: Mode-Separated Orchestration**
   - [x] Acceptance: onboarding runtime chooses path by declared mode without route-level condition hacks.

3. **S5-003: Fast-Track Validation + Fallback**
   - [x] Acceptance: fast-track requires LLM + schema guardrails and deterministically falls back to full onboarding on validation failure.

4. **S5-004: Verification + Migration Notes**
   - [x] Acceptance: targeted tests cover mode enforcement/fallback and docs include migration mapping for `therapy`, `trainer`, `ledger`, `soma`, `atlas`, `scout`, `forge`.

## Sprint Closeout
- Implementation completed on March 10, 2026 with onboarding mode contracts, runtime gating, and fast-track validation fallback behavior.
- Verification completed:
  - `npm run build` passed.
  - Targeted tests for onboarding policy/manifest/constants/guardrails passed.
