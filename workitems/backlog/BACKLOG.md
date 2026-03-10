# Nexus: Master Product Backlog

This backlog tracks the prioritized features, enhancements, and architectural shifts for the Nexus (AGNES) ecosystem.

## 1. Core Platform & Spine
- [ ] **Data Layer Decoupling (The AGNES Data Spine):** Implement a comprehensive architectural shift to make Nexus vendor-agnostic. Extract Firestore logic into a unified `NexusDataLayer` interface with dependency injection, refactor Cloud Functions to separate trigger logic from business logic, and implement a mock `InMemoryDataProvider` for offline development.
- [ ] **Spine Cascade Rules (v2):** Implement deep-dive rules for burnout detection and automated energy wave flattening.
- [ ] **Memory Consolidation:** Automatic RAG retrieval for past session context using Google GenAI embeddings.
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
- [ ] **Ledger Document Intelligence (Receipts/Invoices):** Expand the document parsing service to handle receipts and invoices with automated ledger entry and categorization.
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
- [ ] **Information Firewall (Pulse):** Active curation of news/trends to protect cognitive focus.
- [ ] **Evidence Source Verification:** Fact-checking engine with citation reliability scores.

## 7. Execution (Forge)
- [ ] **Module Review & Refinement:** Comprehensive review, implementation of missing core features, UI/UX refinement, and overall enhancement of the Forge module.
- [ ] **Life Ops Pivot (Executor Refinement):** Refocus Forge from a "Coding Tool" to a "Life Admin" executioner (email drafting, call execution, admin tasks). Note: Scheduling remains an Atlas-domain planning activity; Forge only initiates the execution.
- [ ] **Nexus-Link Bridge:** Secure terminal for remote system management.

## 8. Global AI & Systemic Enhancements
- [ ] **Dynamic Field System Expansion:** Enable custom field creation/deletion via chat globally, removing hardcoded category logic.
- [ ] **Global Soul Writing Protocol (Architectural):** Implement the "Soul-Authority" protocol to ensure all chat-driven schema changes (field creation/deletion) are routed through the domain-authoritative agent for validation before being committed.
- [ ] **Document Intelligence Capability (Shared Library):** Formalize the Documents module as a shared service/plugin. Implement robust cross-document indexing and retrieval that core agents (Ledger, Soma, Atlas) can invoke to find historical context without creating a separate agent persona.
- [ ] **AI Validation Enhancements:** Implement batch field validation, learning feedback loops from user corrections, and module-specific validator fine-tuning.
- [ ] **Data Portability v2:** Add persistent backup storage in Firestore, intelligent field-level merge strategies, and scheduled automatic exports.
- [ ] **Systemic Tech Debt:**
    - [ ] Resolve conditional hook behavior in `TitanPage.tsx` greeting logic.
    - [ ] Fix tab panel `id` / `aria-controls` mismatch in `TitanPage.tsx`.

## 9. Vision Alignment & Architectural Integrity
- [ ] **Soma/Titan Data-Level Delegation (Architectural):** Refactor the Titan/Soma integration to use **Agent-to-Agent delegation** while maintaining UI unity.
    - [ ] **Handshake:** Implement a service-level handshake where Titan delegates clinical reasoning and lab parsing to the Soma Agent.
    - [ ] **Data Sovereignty:** Ensure all `biomarker` and `clearance` mutations are processed by the Soma Agent's validation logic before being committed to the `soma_profiles` collection.
    - [ ] **Contract:** Titan becomes a "consumer" of Soma's readiness data (Read-Only) to adjust training recommendations without owning the medical state.
- [ ] **Atlas Failure Notification Loop:** Implement the Spine-driven notification system where Atlas alerts Agnes (emotional impact) or Titan (physical relevance) when user commitments fail.
- [ ] **Utility Guardrails (NSV Integrity):** Audit the Scout and Forge action sets and services to ensure they strictly adhere to the "Read-Only" NSV contract, preventing soul-authority leakage.

## 10. Icebox / Future Expansion (Scope Creep Guard)
- [ ] **Medical Image Analysis:** Specialized review tool for MRI/X-Ray report summaries. (Moved from Titan to maintain focus)
- [ ] **Ledger Tax Strategy & Deduction Tracker:** Implement specialized logic for estimating tax liability, tracking deductible spending categories, and organizing records for filing preparation. (Moved from Ledger to maintain focus)