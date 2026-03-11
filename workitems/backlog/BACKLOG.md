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
   - **Titan/Soma domain features** — Sprint 7 planned. See `workitems/sprints/SPRINT_7.md` and `docs/product/TITAN_PRODUCT_STRATEGY_REVIEW.md` for full scope.
   - Ledger intelligence tracks (cross-verification, document receipts/invoices, schema hardening).
   - Atlas/Scout/Forge module refinement tracks.

## Recommended Sprint 7 Scope (Titan Module Review & Refinement)
**PM Review Completed.** Full strategy document at `docs/product/TITAN_PRODUCT_STRATEGY_REVIEW.md`.

Sprint 7 execution plan at `workitems/sprints/SPRINT_7.md`. Key items:
- **S7-001 (P0):** Exercise identity data model — Exercise library + PersonalRecord + e1RM tracking
- **S7-002 (P0):** Soma tab cleanup — remove Biomarkers/Sleep/Recovery/Diagnosis from Titan; 3-tab structure
- **S7-003 (P0):** Training calendar — 7-day week view in Training tab
- **S7-004 (P1):** PR board — top exercises + e1RM sparklines in Progress tab
- **S7-005 (P1):** AI Mode / Logbook Mode toggle — resolves power-user friction
- **S7-006 (P1):** Mesocycle data model upgrade — link routines to cycles, deload week, auto-advance phases
- **S7-007 (P1):** Onboarding simplification — 3-question AI chat → instant plan; remove medical phase from Titan

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
- [x] **Module Review & Refinement (PM Strategy Review):** Full product strategy analysis completed. See `docs/product/TITAN_PRODUCT_STRATEGY_REVIEW.md`. Sprint 7 execution plan at `workitems/sprints/SPRINT_7.md`.
  - Key decisions: Remove Biomarkers/Sleep/Recovery/Diagnosis tabs from Titan (scope creep). Soma boundary defined. Exercise identity data model required (P0 blocker). Training calendar + PR board = critical missing features. Onboarding simplified to 3-question AI chat. Mesocycle data model upgraded.
- [ ] **Physical Sovereign Architecture:** Consolidate *all physical performance data* into Titan. Soma remains the medical/health authority. See boundary definition in `docs/product/TITAN_PRODUCT_STRATEGY_REVIEW.md` Section 5 and 11.
    - [ ] **Exercise Identity (Sprint 7 S7-001):** Canonical `Exercise` entity, `PersonalRecord[]`, e1RM calculation, exercise library seed.
    - [ ] **Training Calendar (Sprint 7 S7-003):** 7-day week view in Training tab.
    - [ ] **PR Board (Sprint 7 S7-004):** Top exercises + e1RM sparklines in Progress tab.
    - [ ] **Mesocycle Data Model (Sprint 7 S7-006):** Link routines to cycles, deload week, auto-advance phases.
    - [x] **Layer 1: The Baseline (Clinical SoT):** Soma owns. Titan reads via NSV + soma-data-service. Boundary defined.
    - [x] **Layer 2: The Activity (Performance):** Workout logs, PR tracking (Sprint 7), routines, RPE coaching.
    - [x] **Medical Clearance Handshake:** Soma issues; Titan enforces as banner in Training tab (Sprint 7 S7-002).
- [ ] **Soma Tab Cleanup (Sprint 7 S7-002):** Remove Biomarkers/Sleep/Recovery/Diagnosis from Titan. 3-tab structure: Training | Progress | Cycles.
- [ ] **AI Mode / Logbook Mode Toggle (Sprint 7 S7-005):** `preferenceMode: 'coach' | 'logbook'` resolves power-user friction.
- [ ] **Onboarding Simplification (Sprint 7 S7-007):** 3-question AI chat → instant plan. Remove medical phase from Titan onboarding.
- [x] **Biomarker Analysis:** Delegated to Soma via `soma-titan-delegation-service`. Titan receives clearance output.
- [x] **Soma Service Layer:** `soma-titan-delegation-service`, `soma-data-service`, `clearance-service` implemented.
- [ ] **Routine Builder Integration:** Mount existing `RoutineBuilder` and wire to profile persistence (Sprint 7).
- [ ] **Custom Fields in LLM Context:** Active custom field values must be injected into session prompt (Sprint 7 P2).

## 4. Financial (Ledger)
- [x] **Module Review & Refinement (Design Audit):** Comprehensive UX/UI audit of the Ledger module completed. Full report at `workitems/LEDGER_DESIGN_CRITIQUE.md`. Key findings: 4× duplicate "Recent Transactions" JSX block in `LedgerDashboard.tsx`, `Math.random()` used in Cash Flow chart data, hardcoded fake financial events, `useMemo` containing a profile-mutating side effect in `LedgerWorkspace.tsx`, core data structures (`transactions`, `budgetCategories`, `financialGoals`) stored via `as any` cast outside `LedgerIntakeProfile` type, fast-track form creates zero-amount expense records, random hex color generation for budget categories, and hardcoded "Quick Wins" in `AIFinancialAdvisor`. Full accessibility audit included (missing ARIA tablist/tab roles, icon-only buttons without aria-labels, silent form validation failures). Tax UX design spec included. Top 10 priority changes documented with effort/impact matrix. `todos: design-agent → done`.
- [x] **Module Review & Refinement (PM Strategy Review):** Full product strategy analysis completed. See `docs/product/LEDGER_PRODUCT_STRATEGY_REVIEW.md`. `todos: product-manager-agent → done`.
  - Key decisions: Dashboard charts confirmed as 100% mock data (P0 blocker). `SavingsGoal.currentAmount` type mismatch confirmed (P0 bug). `monthlyIncome: number` must migrate to `IncomeSource[]` for multi-income users. AI autonomous write actions (`add_transaction`, `update_goal_progress`, `set_budget_actual`) are the critical unlock for dual-mode product promise. New `ledger-aggregation-service.ts` required before any dashboard or budget feature work. Tax tagging, debt avalanche/snowball, smart alerts, and spending trend charts are P1. Retirement planning, investment portfolio, and direct tax filing explicitly descoped. 5 user stories cover casual → power user range. MoSCoW table with 8 Must-Haves, 8 Should-Haves, 9 Could-Haves, 9 Won't-Haves defined. 4-sprint execution plan grounded in `INSTRUCTIONS.md` priority order (structure before features).
- [ ] **Ledger Cross-Verification Engine (Active ROI):** Implement the intelligence to automatically correlate encrypted spending events with Spine-reported wellness shifts (stress spending, recovery ROI).
- [ ] **Ledger Document Intelligence (Receipts/Invoices):** Expand the document parsing service to handle receipts and invoices with automated ledger entry and categorization. (Module-scoped; complements the shared Document Intelligence Capability in §8.)
- [ ] **Ledger Debt & Savings Modeling:** Implement interactive modeling for debt payoff strategies and savings goal projections based on real-time cashflow.
- [ ] **Unified Ledger Shell:** Refactor `LedgerDashboard` and `LedgerWorkspace` into a single 5-tab shell (Overview, Budget, Goals, Transactions, Fields).
- [ ] **Ledger Schema Hardening:** Remove keyword-based validation and move to LLM-driven semantic domain validation for custom fields.

## 5. Planning (Atlas)
- [x] **Module Review & Refinement (Design Audit):** Comprehensive UX/UI audit of the Atlas module completed. Full report at `docs/design/ATLAS_DESIGN_AUDIT.md`. Key findings: TodaysPlanCard wired to wrong property (`taskGraph` vs `tasks`), FocusView chat button receives `noop`, `handleAddField` is a console.log stub, WeeklyReviewModal never triggered from UI, Week view renders identical content to Today view, and no first-day post-onboarding experience. Top 10 ranked design recommendations documented with specific file targets and code-level guidance. `todos: atlas-design → done`.
- [x] **Module Review & Refinement (PM Strategy Review):** Full product strategy analysis completed. See `docs/product/ATLAS_PRODUCT_STRATEGY_REVIEW.md`. `todos: atlas-pm → done`.
  - Key decisions: Atlas defaults to `conversational` preferenceMode (AI-first philosophy confirmed). Predictive Service is highest-value unbuilt feature (P0 blocker for core thesis). 15 missing user stories written and prioritized. External calendar sync, team features, and gamification explicitly rejected as anti-features.
- [x] **Sprint 8 Bug Fixes + AI-First Foundation:** Six confirmed production bugs fixed. Two new AI-first components built. See `workitems/sprints/SPRINT_9.md` (Atlas Sprint 8 items carried as SPRINT_9).
  - [x] `TodaysPlanCard` — reads `profile.tasks` (not `taskGraph`); live habit streak display with `atRiskThresholdMs()`
  - [x] `QuickAddForm` — habit frequency selector (daily/weekdays/weekends/weekly/custom) + minimumViableVersion field
  - [x] `handleAddField` in `AtlasPage.tsx` — wired to `ai.handleSendMessage(...)` (was `console.log` stub)
  - [x] `MorningCheckIn.tsx` — new dismissible daily brief card with `shouldShowMorningCheckIn()` localStorage gate
  - [x] `PriorityInbox.tsx` — new top-3 task selector with energy-fit ranking
  - [x] `EnhancedAtlasDashboard.tsx` — WeekGrid mounted in week view, WeeklyReviewModal mounted + triggered, FocusView chat wired, MorningCheckIn + PriorityInbox integrated
- [ ] **Sprint 9 — The Intelligent Loop:** Proactive check-ins, PredictiveService activation, recurrence engine.
  - [ ] Morning brief auto-trigger (Spine MORNING_BRIEF event on daily first-open instead of user-initiated)
  - [ ] Evening check-in component (`EveningCheckIn.tsx`) — mirrors MorningCheckIn, triggers 19:00–22:00 window
  - [ ] `AtlasPredictiveService` state machine evaluation — Normal → Compressed → Overloaded → Recovery transitions currently typed but never run; wire evaluation on profile load
  - [ ] Recurrence engine — recurring tasks (`recurrenceRule?: 'daily'|'weekdays'|'weekly'|'monthly'`) auto-respawn on completion
  - [ ] Weekly review auto-trigger — Spine event on Sunday evening → `WEEKLY_REVIEW_DUE` → shows trigger badge on review tab
  - [ ] `generate_daily_schedule` AI action — missing from ActionHub entirely; takes today's tasks + energy budget and returns ordered schedule
- [ ] **Sprint 10 — Power User & Memory:** Historical data, advanced visualizations, velocity tracking.
  - [ ] Historical aggregate sub-collection: `atlas_profiles/{uid}/daily_snapshots/{date}` — task completion rate, drift score, habit streaks per day
  - [ ] Habit heatmap — GitHub-style annual contribution grid for each habit
  - [ ] Goal velocity chart — completion rate trend over rolling 30/90 days
  - [ ] Time-block calendar view (hour-grid) — schedule blocks as draggable cells across the day
  - [ ] `executionVelocity` NSV auto-compute — derive from `completedAt` vs `scheduledSlot` deltas; write to `cognitive.executionVelocity` after each task completion
  - [ ] `preferenceMode: 'conversational' | 'structured'` toggle — structured mode shows form panels alongside chat
- [ ] **Energy Wave Charting:** Visualizer for daily energy peaks/valleys to optimize task scheduling.
- [ ] **Task Graph Architecture:** Complex task dependencies with energy-cost estimation.
- [ ] **Atlas Failure Notification Loop:** Spine-driven cross-module escalation when Atlas detects missed workouts (→ Titan) or missed sessions (→ Agnes).

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
- [ ] **Debug Mode (Developer Overlay):** Add a "Debug Mode" toggle to the Profile view. When enabled, surfaces internal runtime state across the entire app with zero performance cost when off.
    - **Profile toggle:** Switch in ProfilePage (or collapsible "Developer" section); persisted to `localStorage` via `useDebugMode()` hook.
    - **Model badge:** Live pill in every chat header — `"⚡ Running on: claude-3-opus"` alternating with a `"↔ linkstable"` / connected indicator; reads from `AIProvider` context active model.
    - **Thought button:** Collapsible chip above every AI message bubble showing: (a) raw reasoning / scratchpad, (b) action tags extracted from message, (c) action tags dispatched to ActionHub, (d) side effects executed (`updateGlobalSoul`, `emitSpineEvent`, `markProfileDirty`, etc.). Requires optional `debugMeta` field on `ChatMessage` type populated by the LLM engine when debug is active.
    - **API call snippet:** First 500 chars of raw request body + HTTP status + latency (ms) inside the thought panel, sourced from a fetch interceptor in the model registry.
    - **Soul activity tag:** Pulsing `"Soul: active"` tag to the right of every module title; shows last Spine event type as a fading label (3 s TTL). Source: `useSpineEvent()` + NSV write timestamp tracking.
    - **Components to create:** `DebugThoughtPanel.tsx`, `ModelBadge.tsx`, `SoulActivityTag.tsx`. Amber/yellow accent palette to visually separate debug chrome from normal UI. All debug subtrees guarded by `if (!debugMode) return null` — zero render cost in production.
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
