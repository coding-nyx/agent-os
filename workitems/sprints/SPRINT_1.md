# SPRINT 1 — Migration Foundations + Cross-Domain Design
**Duration:** 1–2 weeks  
**Objective:** Establish the migration substrate (data layer, vault gating, soul/spine contracts) and capture cross-domain design decisions (Atlas, Ledger, Orchestrator, Soma) to unblock implementation sprints.

## Goals
- Decouple data access via `NexusDataLayer` with an in-memory adapter for offline/dev (Product Definition §12.4 #1–#4; Backlog §1, line 6).
- Enforce vault gating for episodic/trauma data and document vault policies (Product Definition §8; Backlog §1, line 10).
- Provide filtered Global Soul/NSV reads with ownership-aware selectors (Product Definition §§4.4, 4.5, 12.1).
- Define Spine event schema and stubs for cascade-ready publish/subscribe (Product Definition §10.4; Backlog §1, line 7).
- Produce design spikes for Atlas predictive service, Ledger behavioral analysis, Orchestrator conflict-resolution UI, and Soma identity decision (Product Definition §§11.3, 12.4).

## In Scope
- Interfaces, adapters, stubs, and design documents; no production vendor cutover.
- Vault gating rules and episodic memory encryption hook.
- Read-only Global Soul/NSV surfaces with permission filters.
- Spine event schema and contract tests.
- Design artifacts for Atlas/Ledger/Orchestrator/Soma directions.

## Out of Scope
- Full module rewrites or production data migrations.
- Advanced RAG/memory consolidation or dashboard polish.
- New LLM engine features (engine remains a black box boundary).

## Sprint Items
1. **S1-001: NexusDataLayer interface + InMemory adapter**  
   - Acceptance: CRUD + event emitters work in tests; no Firebase types leak into the interface.
   - Refs: Backlog line 6; Product Definition §12.4 #1, #3.

2. **S1-002: Data layer wiring for shared contexts**  
   - Acceptance: Auth/Vault/GlobalSoul contexts consume `NexusDataLayer` via injected adapter; swapping adapters requires no code change.  
   - Refs: Backlog line 6; Product Definition §12.4 #1.  
   - Dependency: S1-001.

3. **S1-003: Vault gating rules + episodic encryption hook**  
   - Acceptance: Vault-gated collections/fields documented and tested; episodic writes encrypt with vault key and carry vault flag; casual browsing bypasses per policy.  
   - Refs: Backlog line 10; Product Definition §8.

4. **S1-004: Global Soul read API with NSV filters**  
   - Acceptance: Modules get filtered snapshots per ownership matrix; selectors update on NSV changes; unauthorized dimensions are redacted.  
   - Refs: Product Definition §§4.4, 4.5, 12.1.

5. **S1-005: Spine event schema + pub/sub stubs**  
   - Acceptance: Spine events serialize to schema; missing required fields are rejected; mock publish reaches subscribers in tests.  
   - Refs: Backlog line 7; Product Definition §10.4.

6. **S1-006: Module profile store alignment**  
   - Acceptance: Module stores depend only on shared core types/local adapters; cross-module writes are blocked with validation.  
   - Refs: Product Definition §12.1.

7. **S1-007: Migration map v1 (modules → data layer)**  
   - Acceptance: Map lists current collections/fields to target `NexusDataLayer` entities per module with ownership noted; no cross-module overwrites.  
   - Refs: Backlog line 6; Product Definition §12.3.

8. **S1-008: Anti-pattern guardrails scan**  
   - Acceptance: Lint/tests fail on cross-module writes, NSV bypass, or hardcoded schemas; actionable messages provided.  
   - Refs: Product Definition §12.3; Backlog §8 (Systemic Tech Debt).

9. **S1-009: Atlas predictive service design spike**  
   - Acceptance: Design doc with state machine, signals (NSV, task graph, recovery), data needs, API surface, and success metrics; reviewed/approved.  
   - Refs: Product Definition §11.3 (Atlas gap); Backlog §5 (Energy Wave/Task Graph).

10. **S1-010: Ledger behavioral analysis design spike**  
    - Acceptance: Design doc for spending-emotion correlation, data inputs (transactions, NSV emotional/biological), feature toggles, and ActionHub hooks; reviewed/approved.  
    - Refs: Product Definition §11.3 (Ledger gap); Backlog §4 (Automated Statement Therapy, Resonance ROI).

11. **S1-011: Orchestrator conflict-resolution UI spec**  
    - Acceptance: Wireframes + flow for conflict detection/resolution leveraging ActionHub outputs; includes scoped conversation UX and notification pattern; reviewed/approved.  
    - Refs: Product Definition §11.3 (Orchestrator gap); Backlog §8 (Scoped Conversations, Ghost UI).

12. **S1-012: Soma identity decision note**  
    - Acceptance: Decision document (merge vs separate) with guardrails, data ownership, and migration implications; approved.  
    - Refs: Product Definition §11.3 (Soma gap); Product Definition §12.1.

## Dependencies
- S1-002 depends on S1-001. All other items can run in parallel.

## Risks / Notes
- Keep LLM engine untouched; treat it as an external boundary.
- Avoid premature production data migrations; focus on interfaces, docs, and tests.
- Enforce module isolation and NSV ownership in all new code/tests.
