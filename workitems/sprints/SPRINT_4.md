# SPRINT 4 — Route Truth Cleanup, Pulse Decommission, and Documents Library Migration
**Duration:** 1 week  
**Objective:** Resolve product/runtime drift by making app routes canonical, fully removing Pulse, converting Documents into an embedded shared capability, and delivering architecture decisions for Soma identity plus per-module keying.
**Status:** Closed — Completed March 10, 2026

## Sprint Start
- Sprint 4 started as the active sprint.
- Execution order is S4-001 -> S4-002 -> S4-003 -> S4-004 -> S4-005.
- This sprint supersedes Sprint 2 as the active execution track; Sprint 2 remains open for deferred memory tasks.

## Goals
- Align docs/contracts with runtime truth (`src/App.tsx` routes).
- Eliminate Pulse from runtime, manifests, routing, and profile contracts.
- Remove standalone Documents routing and embed document-intel flows directly inside module workspaces.
- Produce a decision-complete report + ADR for Soma identity and vault key derivation strategy.

## In Scope
- Route/docs/module identity cleanup.
- Pulse decommission across code, tests, and registries.
- Documents library migration for module-embedded use (Ledger/Scout initial integration).
- Architecture artifacts for item-2/item-4 discussion outcome.

## Out of Scope
- Structural refactors inside `src/llm-engine/*`.
- Broad UI redesign unrelated to route/module identity cleanup.
- Full per-module key implementation (decision artifacts only in this sprint).

## Sprint Items
1. **S4-001: Route Truth Canonicalization**
   - [x] Acceptance: `README.md` + `AGENTS.md` route/module listings match `src/App.tsx` exactly and remove stale route claims.

2. **S4-002: Pulse Full Decommission**
   - [x] Acceptance: No `/pulse` route, no Pulse module delegation hints, and no Pulse profile/storage mappings in active runtime contracts.

3. **S4-003: Documents Library-Only Migration**
   - [x] Acceptance: `/documents` route removed; Ledger/Scout invoke document intelligence in-context without navigation to a standalone documents page.

4. **S4-004: Discussion Output for Item 2 + Item 4**
   - [x] Acceptance: Decision report + ADR delivered for Soma identity model and vault key derivation model, with migration sequencing and rollback notes.

5. **S4-005: Verification**
   - [x] Acceptance: `npm run build` passes and targeted tests for updated contracts/routing are green.

6. **S4-006: LLM Runtime Boundary Hardening**
   - [x] Acceptance: app-layer direct imports of `llm-engine` internals are routed through `src/lib/ai-adapters/*`, and a guardrail test prevents regressions.

## Sprint Closeout
- Verification completed on March 10, 2026:
  - `npm run build` passed.
  - `npm run test -- src/guardrails/anti-patterns.test.ts src/lib/constants.test.ts` passed.
- LLM boundary guardrails were implemented with adapter routing and static anti-pattern checks.
