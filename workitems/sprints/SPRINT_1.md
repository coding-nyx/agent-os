# SPRINT 1 — Migration Foundations, Design UX & AI Resilience
**Duration:** 1–2 weeks  
**Objective:** Establish the migration substrate (data layer, vault gating, soul/spine contracts), capture cross-domain design decisions, and implement critical UI/AI stability enhancements (Ghost UI, Fallback, Scoped Context).
**Status:** Closed — Completed (March 10, 2026)

## Sprint Closeout
- All Sprint 1 items (S1-001 through S1-017) are complete.
- Remaining related platform work is tracked in `workitems/backlog/BACKLOG.md`.
- Active execution has moved to `workitems/sprints/SPRINT_2.md`.

## Goals
- Decouple data access via `NexusDataLayer` with an in-memory adapter for offline/dev (Product Definition §12.4 #1–#4; Backlog §1, line 6).
- Enforce vault gating for episodic/trauma data and document vault policies (Product Definition §8; Backlog §1, line 10).
- Provide filtered Global Soul/NSV reads with ownership-aware selectors (Product Definition §§4.4, 4.5, 12.1).
- Define Spine event schema and stubs for cascade-ready publish/subscribe (Product Definition §10.4; Backlog §1, line 7).
- Produce design spikes for Atlas predictive service, Ledger behavioral analysis, Orchestrator conflict-resolution UI, and Soma identity decision (Product Definition §§11.3, 12.4).
- Enhance UX through Ghost UI (NeuralDrafts), Vault top-level routing, and systemic UI standardization.
- Improve LLM resilience with Pending Completion Recovery and Scoped Conversations.

## In Scope
- Interfaces, adapters, stubs, and design documents; no production vendor cutover.
- Vault gating rules, episodic memory encryption hook, and Vault safe-landing routing.
- Read-only Global Soul/NSV surfaces with permission filters.
- Spine event schema and contract tests.
- Design artifacts for Atlas/Ledger/Orchestrator/Soma directions.
- Ghost UI implementation and `<EmptyState>`/formatting standardization.
- AI Chat fallback mechanisms and entity-specific chat modes.

## Out of Scope
- Full module rewrites or production data migrations.
- Advanced RAG/memory consolidation or dashboard polish.
- New LLM engine features beyond scoped context and recovery.

## Sprint Items
1. **S1-001: NexusDataLayer interface + InMemory adapter**  
   - [x] Acceptance: CRUD + event emitters work in tests; no Firebase types leak into the interface.
   - Refs: Backlog line 6; Product Definition §12.4 #1, #3.

2. **S1-002: Data layer wiring for shared contexts**  
   - [x] Acceptance: Auth/Vault/GlobalSoul contexts consume `NexusDataLayer` via injected adapter; swapping adapters requires no code change.  
   - Refs: Backlog line 6; Product Definition §12.4 #1.  
   - Dependency: S1-001.

3. **S1-003: Vault gating rules + episodic encryption hook**  
   - [x] Acceptance: Vault-gated collections/fields documented and tested; episodic writes encrypt with vault key and carry vault flag; casual browsing bypasses per policy.  
   - Refs: Backlog line 10; Product Definition §8.

4. **S1-004: Global Soul read API with NSV filters**  
   - [x] Acceptance: Modules get filtered snapshots per ownership matrix; selectors update on NSV changes; unauthorized dimensions are redacted.  
   - Refs: Product Definition §§4.4, 4.5, 12.1.

5. **S1-005: Spine event schema + pub/sub stubs**  
   - [x] Acceptance: Spine events serialize to schema; missing required fields are rejected; mock publish reaches subscribers in tests.  
   - Refs: Backlog line 7; Product Definition §10.4.

6. **S1-006: Module profile store alignment**  
   - [x] Acceptance: Module stores depend only on shared core types/local adapters; cross-module writes are blocked with validation.  
   - Refs: Product Definition §12.1.

7. **S1-007: Migration map v1 (modules → data layer)**  
   - [x] Acceptance: Map lists current collections/fields to target `NexusDataLayer` entities per module with ownership noted; no cross-module overwrites.  
   - Refs: Backlog line 6; Product Definition §12.3.

8. **S1-008: Anti-pattern guardrails scan**  
   - [x] Acceptance: Lint/tests fail on cross-module writes, NSV bypass, or hardcoded schemas; actionable messages provided.  
   - Refs: Product Definition §12.3; Backlog §8 (Systemic Tech Debt).

9. **S1-009: Atlas predictive service design spike**  
   - [x] Acceptance: Design doc with state machine, signals (NSV, task graph, recovery), data needs, API surface, and success metrics; reviewed/approved.  
   - Artifact: `docs/design/atlas-predictive-service.md`
   - Refs: Product Definition §11.3 (Atlas gap); Backlog §5 (Energy Wave/Task Graph).

10. **S1-010: Ledger behavioral analysis design spike**  
    - [x] Acceptance: Design doc for spending-emotion correlation, data inputs (transactions, NSV emotional/biological), feature toggles, and ActionHub hooks; reviewed/approved.  
    - Artifact: `docs/design/ledger-behavioral-analysis.md`
    - Refs: Product Definition §11.3 (Ledger gap); Backlog §4 (Automated Statement Therapy, Resonance ROI).

11. **S1-011: Orchestrator conflict-resolution UI spec**  
    - [x] Acceptance: Wireframes + flow for conflict detection/resolution leveraging ActionHub outputs; includes scoped conversation UX and notification pattern; reviewed/approved.  
    - Artifacts: `docs/design/orchestrator-conflict-ui.md`, `docs/design/orchestrator-conflict-resolution.md`
    - Refs: Product Definition §11.3 (Orchestrator gap); Backlog §8 (Scoped Conversations, Ghost UI).

12. **S1-012: Soma identity decision note**  
    - [x] Acceptance: Decision document (merge vs separate) with guardrails, data ownership, and migration implications; approved.  
    - Artifact: `docs/design/soma-identity-decision.md`
    - Refs: Product Definition §11.3 (Soma gap); Product Definition §12.1.

13. **S1-013: Ghost UI (NeuralDrafts) implementation**
    - [x] Acceptance: Dashed-border approval flow for AI-proposed actions implemented to bridge autonomous AI action and user sovereignty.
    - Refs: Core Platform.

14. **S1-014: Vault Access Refactor (Shell vs. Private)**
    - [x] Acceptance: Decouple Vault from page routing; top-level dashboards visible while Vault is locked.
    - Refs: Vision Alignment.

15. **S1-015: Pending Completion Recovery (Chat Fallback)**
    - [x] Acceptance: Unfinished AI completions persist locally and prompt for recovery on next session load.
    - Refs: Global AI.

16. **S1-016: Scoped Conversations**
    - [x] Acceptance: Implement ephemeral, entity-specific chat modes to reduce context noise and token usage.
    - Refs: Global AI.

17. **S1-017: Systemic UI Consistency**
    - [x] Acceptance: Standardize `<EmptyState>` components and number/currency formatting across modules.
    - Refs: Systemic Tech Debt.
