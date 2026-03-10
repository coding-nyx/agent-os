# SPRINT 3 — LLM Portability Story & Entrypoint Documentation
**Duration:** 1 week  
**Objective:** Capture the LLM runtime entrypoint story, portability requirements, and migration checklist needed to keep modules, Spine, and RAG aligned while porting the AGNES stack to new runtimes.
**Status:** Closed — Completed March 10, 2026

## Sprint Start
- Sprint 3 kicked off immediately to document the LLM entrypoint story referenced in the backlog.  
- Execution order is S3-001 -> S3-002 -> S3-003.
- Sprint work is anchored in `docs/architecture/llm-entrypoint-runtime.md` plus any supporting portability notes.

## Goals
- Describe the current LLM runtime boot chain and module integration surface.
- Spell out the portability story that links agents, RAG retrieval, action tags, context compaction, and the alive data model contracts.
- Produce a verified migration checklist so the runtime can be ported to other stacks without losing context, actions, or UI alignment.

## In Scope
- Updating `docs/architecture/llm-entrypoint-runtime.md` with story-level sections and actionable migrations notes.
- Cataloging interface requirements that keep Spine, Nexus, and modules in sync during context compaction and retrieval.
- Defining action-tag creation/handling, alive data model, and UI impacts for ported environments.

## Out of Scope
- Engine refactors inside `src/llm-engine/*`.
- Sprint 2 items (consolidation, retrieval injection, verification) unless they are specifically referenced by the portability story.

## Sprint Items
1. **S3-001: LLM Entrypoint Story**
   - [x] Acceptance: Story section in the architecture docs that explains who the stakeholders are, what the runtime responsibility split is, and why the portability story matters.
2. **S3-002: Interface & Context Compaction Notes**
   - [x] Acceptance: Documentation of interface contracts, context compaction, metadata hygiene, and recovery touches that a new stack must honor.
3. **S3-003: Action Tags & Alive Data Model Guidance**
   - [x] Acceptance: Guidance on how action tags are created/handled, how the live data model and UI stay alive, and how modules link to RAG/Nexus during migration.
4. **S3-004: Migration Checklist**
   - [x] Acceptance: Checklist covering runtime bindings, adapters, persistence flows, Spine/Nexus integration, and UI hooks for a migrating stack.
5. **S3-005: RAG Linking & Vault Boundaries (Backlog §11)**
   - [x] Acceptance: Portability doc section that spells out how modules/agents link to RAG providers while preserving vault/E2EE constraints and pending completion recovery; includes adapter notes for non-web runtimes.
6. **S3-006: Consolidation/Recovery Safety in Ported Stacks (Backlog §11)**
   - [x] Acceptance: Explicit guidance on keeping consolidation thresholds, summaries/facts, and recovery checkpoints intact during migration, with references to `MemoryManager`/`useConsolidation` and failure modes to test.

## Sprint Closeout
- All items S3-001 through S3-006 are documented in `docs/architecture/llm-entrypoint-runtime.md`.
- Backlog §11 portability requirements are now covered; no additional code changes were required.
- Handoff: Sprint 2 remains the active execution track for consolidation and retrieval behavior validation.
