# Nexus: Master Product Backlog

This backlog tracks the prioritized features, enhancements, and architectural shifts for the Nexus (AGNES) ecosystem.

**Current Sprint:** `None` (Sprint 7 planning queue)  
**Completed Sprint:** `workitems/sprints/SPRINT_6.md` (Closed March 10, 2026)

## Priority Order (Effective March 10, 2026)
1. **P0 — Core/Spine completion and safety**
   - [x] Data Layer Decoupling (remaining shared-runtime Firebase -> `NexusDataLayer` migration and provider parity guardrails).
   - [x] Soma/Titan Data-Level Delegation (service handshake + Soma-sovereign biomarker/clearance writes).
   - [x] Utility Guardrails (NSV Integrity for Scout/Forge read-only enforcement).
2. **P1 — Cross-module reliability and orchestration**
   - Atlas Failure Notification Loop (Spine-driven cross-module escalation).
   - Dynamic Field System Expansion + Global Soul Writing Protocol.
   - Document Intelligence Capability hardening as shared platform service.
3. **P2 — Module feature expansion**
   - Titan/Soma domain features (physical sovereign architecture, biomarkers, clearance workflow).
   - Ledger intelligence tracks (cross-verification, document receipts/invoices, schema hardening).
   - Atlas/Scout/Forge module refinement tracks.

## Recommended Sprint 7 Scope
- Completed on March 10, 2026 as immediate P0 execution:
- Data Layer Decoupling (shared runtime migration slice + guardrails).
- Soma/Titan Data-Level Delegation (write delegation + read-only Titan consumption path).
- Utility Guardrails (ActionHub/runtime + static guardrails for Scout/Forge NSV read-only).

## 1. Core Platform & Spine
- [ ] **Data Layer Decoupling (The AGNES Data Spine):** Implement a comprehensive architectural shift to make Nexus vendor-agnostic. Extract Firestore logic into a unified `NexusDataLayer` interface with dependency injection, refactor Cloud Functions to separate trigger logic from business logic, and implement a mock `InMemoryDataProvider` for offline development.
- [x] **Spine Cascade Rules (v2):** Implement deep-dive rules for burnout detection and automated energy wave flattening. Completed in Sprint 6 with targeted test coverage.
- [x] **Memory Consolidation (Tracked in Sprint 2):** Automatic RAG retrieval for past session context using Google GenAI embeddings. Sprint 2 carryover (`S2-006`) closed in Sprint 6 via web/native adapter contracts and retrieval guardrails.
- [x] **Enforce E2EE for Episodic Memory Sync (Plan B):** Refactor `ModuleMemoryService.commitSession` and module-specific handlers to require an `encryptionKey`. Ensure all episodic history snapshots are encrypted with the Vault master key before Firestore storage, preventing plaintext history leaks.

## 2. Therapy (Agnes)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Agnes module.
- [ ] **Somatic Therapy:** (NEW) Bridge talk therapy with physical grounding. AI should suggest breathing/grounding exercises based on Spine-detected stress or heart rate spikes.
- [ ] **Belief Graph Visualization:** An interactive 2D graph showing how user beliefs are evolving over time.

## 3. Physical (Titan - The Sovereign Module)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Titan and Soma modules.
- [ ] **Physical Sovereign Architecture:** Consolidate *all* physical data into Titan as a single, comprehensive "Physical Soul."
    - [ ] **Layer 1: The Baseline (Clinical SoT):** Integration of labs, DNA, biomarkers, medical history, and passive biometrics (HRV, Sleep).
    - [ ] **Layer 2: The Activity (Performance):** Dynamic workout logs, PR tracking, routines, and RPE-based coaching.
    - [ ] **Medical Clearance Handshake:** Implementation of a gatekeeping system where "Baseline" metrics (recovery, iron levels, sleep) automatically grant or deny "Activity" permissions.
- [ ] **Biomarker Analysis:** (NEW) Automated parsing of PDF/Image lab reports with structured commit to the Physical Soul.
- [ ] **Soma Service Layer:** Implement specialized services for biomarkers, readiness computation, and clearance management.
- [ ] **Medical Clearance Workflow:** Implement the PAR-Q self-assessment questionnaire and clearance issuance system in the Recovery tab.
- [ ] **Routine Builder Integration:** Mount the existing `RoutineBuilder` component in the UI and wire it to profile persistence.
- [ ] **Bug Fix: Biometric Charts:** Fix BarChart Y-axis tick deduplication and resolve dynamic Tailwind class purging in `RestPeriodCalculator` and `ClearanceStatus`.

## 4. Financial (Ledger)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Ledger module.
- [ ] **Ledger Cross-Verification Engine (Active ROI):** Implement the intelligence to automatically correlate encrypted spending events with Spine-reported wellness shifts (stress spending, recovery ROI).
- [ ] **Ledger Document Intelligence (Receipts/Invoices):** Expand the document parsing service to handle receipts and invoices with automated ledger entry and categorization. (Module-scoped; complements the shared Document Intelligence Capability in §8.)
- [ ] **Ledger Debt & Savings Modeling:** Implement interactive modeling for debt payoff strategies and savings goal projections based on real-time cashflow.
- [ ] **Unified Ledger Shell:** Refactor `LedgerDashboard` and `LedgerWorkspace` into a single 5-tab shell (Overview, Budget, Goals, Transactions, Fields).
- [ ] **Ledger Schema Hardening:** Remove keyword-based validation and move to LLM-driven semantic domain validation for custom fields.

## 5. Planning (Atlas)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Atlas module.
- [ ] **Energy Wave Charting:** Visualizer for daily energy peaks/valleys to optimize task scheduling.
- [ ] **Task Graph Architecture:** Complex task dependencies with energy-cost estimation.
- [ ] **Interactive Planning Dashboard:** Implement entity selection (tasks, habits, goals) and scoped conversation panels for focused editing.
- [ ] **Weekly Review Flow:** Implement a guided multi-step modal for reviewing task completion, habit streaks, and goal progress.
- [ ] **Energy Wave Enhancements:** Overlay scheduled tasks and recovery windows on the energy wave chart.
- [ ] **Mount Planning Components:** Wire `QuickAddForm`, `TodaysPlanCard`, `FocusView`, and `ViewSwitcher` into the Atlas dashboard.

## 6. Research & Knowledge (Scout)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Scout module.
- [ ] **Scout Search Proxy Service:** (NEW) Implement/stabilize a separate Node.js or Cloudflare Worker proxy for Tavily search to securely handle API keys outside the browser bundle (currently running in direct-to-Tavily dev mode).
- [ ] **Information Firewall (Signal):** Active curation of news/trends to protect cognitive focus.
- [ ] **Evidence Source Verification:** Fact-checking engine with citation reliability scores.

## 7. Execution (Forge)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Forge module.
- [ ] **Life Ops Pivot (Executor Refinement):** Refocus Forge from a "Coding Tool" to a "Life Admin" executioner (email drafting, call execution, admin tasks). Note: Scheduling remains an Atlas-domain planning activity; Forge only initiates the execution.
- [ ] **Nexus-Link Bridge:** Secure terminal for remote system management.

## 8. Global AI & Systemic Enhancements
- [ ] **Dynamic Field System Expansion:** Enable custom field creation/deletion via chat globally, removing hardcoded category logic.
- [ ] **Global Soul Writing Protocol (Architectural):** Implement the "Soul-Authority" protocol to ensure all chat-driven schema changes (field creation/deletion) are routed through the domain-authoritative agent for validation before being committed.
- [ ] **Document Intelligence Capability (Shared Library):** Formalize the Documents module as a shared service/plugin. Implement robust cross-document indexing and retrieval that core agents (Ledger, Soma, Atlas) can invoke to find historical context without creating a separate agent persona. (Platform-wide; Ledger’s receipts feature should reuse this where possible.)
- [ ] **AI Validation Enhancements:** Implement batch field validation, learning feedback loops from user corrections, and module-specific validator fine-tuning.
- [ ] **Data Portability v2:** Add persistent backup storage in Firestore, intelligent field-level merge strategies, and scheduled automatic exports.
- [ ] **Systemic Tech Debt:**
    - [ ] **Code Cleanup & Hygiene Pass:** Remove dead/duplicated code paths, normalize service/hook naming, tighten TypeScript surfaces, and prune stale TODOs/logging across active modules without changing product behavior.
    - [ ] Resolve conditional hook behavior in `TitanPage.tsx` greeting logic.
    - [ ] Fix tab panel `id` / `aria-controls` mismatch in `TitanPage.tsx`.

## 9. Vision Alignment & Architectural Integrity
- [x] **Dirty State Remediation — Route Truth Drift (Critical, tracked in Sprint 4):** Align all product/docs/contracts to runtime route truth in `src/App.tsx`.
  - [x] Update `README.md` and `AGENTS.md` to treat app routes as canonical source of truth.
  - [x] Remove stale public references to legacy route identities (`/therapy`, `/trainer`, `/pulse`) and unsupported claims (`/admin/login`).
  - [x] Add explicit guidance that module identity is owned by route + manifest runtime contracts, not historical naming.
  - **Acceptance:** Route map in docs matches `App.tsx` exactly and contains no dead route claims.

- [x] **Dirty State Remediation — Pulse Full Decommission (Critical, tracked in Sprint 4):** Remove Pulse as a product/runtime concept.
  - [x] Remove `/pulse` routing behavior and delegation references.
  - [x] Remove Pulse from orchestrator persona payload examples and alias/gender defaults.
  - [x] Remove Pulse from user-data registry and transfer/storage mappings.
  - [x] Remove Pulse backlog/module taxonomy where it is represented as an active module identity.
  - **Acceptance:** No runtime, manifest, type, or routing contract can resolve or delegate to `pulse`.

- [x] **Dirty State Remediation — Documents Library Conversion (High, tracked in Sprint 4):** Convert Documents from standalone module/page into shared capability.
  - [x] Remove standalone `/documents` page routing and module-manifest identity.
  - [x] Replace cross-module `navigate('/documents')` handoff flows with in-module document-intelligence invocation.
  - [x] Formalize shared document capability API/hook for upload, parse, persist, and AI prompt injection.
  - [x] Preserve encrypted persistence + module-scoped context usage after migration.
  - **Acceptance:** Ledger/Scout/Titan/Atlas can invoke document intelligence in-context without leaving their module.

- [x] **Dirty State Remediation — Soma + Encryption Boundary ADR (High, tracked in Sprint 4):** Produce decision-complete architecture recommendation before implementation.
  - [x] Decision Report: Soma identity model (absorbed UI vs sovereign routed module) with tradeoffs and migration plan.
  - [x] ADR: Vault encryption model decision (single master key vs per-module key derivation), threat model impact, and rollout path.
  - [x] Define explicit sequencing and rollback plan for whichever option is selected.
  - **Acceptance:** Signed-off ADR and implementation blueprint committed; no ambiguous ownership remains for Soma identity or key strategy.

- [x] **Dirty State Remediation — LLM Runtime Boundary Hardening (High, tracked in Sprint 4):** Re-enforce app/engine separation contract.
  - [x] Remove direct app-layer imports of `llm-engine` internals (engine services/private helpers) outside approved interfaces.
  - [x] Route app behavior through sanctioned boundaries (`useAI`, `AIProvider`, `useModuleAI`, app-layer adapters).
  - [x] Add static conformance checks/tests to prevent future boundary leakage.
  - **Acceptance:** No forbidden import paths remain from `src/llm-engine/*` internals in app-layer modules.

- [x] **Dirty State Remediation — Onboarding Mode Separation + Fast-Track Validation (High, target Sprint 5):** Split onboarding orchestration by module requirement class and add LLM validation gating for fast-track flows.
  - [x] Define module onboarding mode taxonomy and contracts: `required`, `optional`, `hybrid`.
  - [x] Separate onboarding orchestration paths so modules can explicitly opt into one mode without route-level hacks.
  - [x] Implement fast-track onboarding validation with LLM + schema guardrails (required fields, confidence threshold, fallback to full onboarding).
  - [x] Add module capability flags and runtime checks to prevent accidental onboarding bypass for `required` modules.
  - [x] Document migration plan for existing modules (`therapy`, `trainer`, `ledger`, `soma`, `atlas`, `scout`, `forge`) to declared onboarding modes.
  - **Acceptance:** Each routed module declares one onboarding mode; fast-track can only complete when validation passes; fallback path is deterministic and test-covered.

- [x] **Soma/Titan Data-Level Delegation (Architectural):** Refactor the Titan/Soma integration to use **Agent-to-Agent delegation** while maintaining UI unity.
    - [x] **Handshake:** Implemented service-level delegation where Titan routes biomarker/clearance mutations to Soma-owned services.
    - [x] **Data Sovereignty:** Biomarker and clearance mutations now commit through Soma paths into `soma_profiles`.
    - [x] **Contract:** Titan now consumes Soma health snapshot for clearance decisions (read-only medical-state consumption).
- [ ] **Atlas Failure Notification Loop:** Implement the Spine-driven notification system where Atlas alerts Agnes (emotional impact) or Titan (physical relevance) when user commitments fail.
- [x] **Utility Guardrails (NSV Integrity):** Audited Scout/Forge action sets and enforced read-only NSV contract via ActionHub runtime guard + static anti-pattern guardrails + tests.

## 10. Icebox / Future Expansion (Scope Creep Guard)
- [ ] **Medical Image Analysis:** Specialized review tool for MRI/X-Ray report summaries. (Moved from Titan to maintain focus)
- [ ] **Ledger Tax Strategy & Deduction Tracker:** Implement specialized logic for estimating tax liability, tracking deductible spending categories, and organizing records for filing preparation. (Moved from Ledger to maintain focus)

## 11. Architecture & Portability
- [ ] **Logic & Functionality Separation (LLM / Spine / RAG / UI):** Create a portability-focused architecture guide that isolates `llm-engine`, Spine, RAG retrieval, action tag creation/handling, data models, and UI/state contracts. (Doc delivered in Sprint 3; leave open only if additional iterations are needed beyond current guidance.)
  - Story: As a platform integrator I need an entrypoint story describing how modules, agents, and Nexus services stay in sync so that the LLM experience can be ported to another stack (KMP/native/hybrid) without losing context, actions, or UI fidelity.
  - Deliverables:
    - Interface contracts linking module contexts and ActionHub agents to RAG/Nexus regardless of hosting stack or runtime (mobile/web/KMP, etc.).
    - Context compaction and maintenance guidance covering summary/fact persistence, metadata hygiene, active history trimming, and recovery-friendly checkpoints.
    - Action-tag lifecycle documentation (creation, parsing, execution) that spans the engine, spine, and module adapters, ensuring tags survive porting and remain actionable.
    - Live data model synchronization guidance so profiles, NSV, and module state updates continue driving the UI and alive data model surfaces during and after migration.
    - Portability migration checklist for runtime bindings, adapters, persistence/sync responsibilities, Spine cascade contracts, and UI hooks.
  - Scope add-ons:
    - Describe how to link agents and modules to RAG/Nexus while respecting vault/E2EE boundaries and pending completion recovery.
    - Capture how consolidation, retrieval injection, and context compaction participate in the migration story without leaking plaintext memories.
    - Define UI contracts for alive data model visuals, integrated context cards, and action-tag-aware responders so ported shells remain coherent.
