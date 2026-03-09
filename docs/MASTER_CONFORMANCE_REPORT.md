# NEXUS/AGNES — Master Conformance Report
**Date:** 2026-03-09  
**Analysts:** Product Manager · Architect · Design · LLM/AI Design  
**Scope:** Product definition, vision, skills directory vs. current application  
**Overall Score:** 7.8 / 10

---

## EXECUTIVE SUMMARY

The architecture is sound and the foundations are solid. Spine, NSV, Global Soul, Action Hub, Vault/E2EE, and the LLM engine all conform strongly to the product vision. Remaining gaps are concentrated in **expression depth** (incomplete services, unmounted components) and **three critical integrity issues** (Soma 404, Forge wrong identity, data-layer bypasses).

---

## 🔴 CRITICAL — P0 (Product-Breaking)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| C-1 | **Soma route 404** — `SomaPage.tsx` does not exist; all ~10 Soma components are orphaned; `/soma` link from Titan leads to a blank page | Soma | Medium |
| C-2 | **Titan has no `personas.ts`** — Core module, physical soul authority. `PersonaFactory` cannot personalise the agent at all. Titan's AI is purely generic-prompted. | Titan | Medium |
| C-3 | **Forge is a coding tool, not a Life Admin executor** — Direct product non-conformance. Current: script execution / cloud logs. Required: email drafting, call execution, life admin. | Forge | High |
| C-4 | **Scout Tavily API key in browser bundle** — Security violation for any non-dev deployment | Scout | Medium |
| C-5 | **SpineEventBus imports Firebase directly** — Spine cannot be tested against InMemoryDataProvider; breaks entire platform in non-Firebase environments | Platform | Low |
| C-6 | **`NeuralDraftPanel` (Ghost UI) not mounted** — Component is complete but not mounted in `App.tsx`; the AI-proposed action approval flow is completely inactive | Platform | Trivial |

---

## 🟠 HIGH — P1 (Significant User Value Gaps)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| H-1 | Soma `personas.ts` missing — no agent identity | Soma | Medium |
| H-2 | Soma service layer README says "to be implemented" — `CollapsibleAIPanel` unconnected | Soma | High |
| H-3 | Atlas planning components built but **not mounted**: `QuickAddForm`, `TodaysPlanCard`, `FocusView`, `ViewSwitcher` | Atlas | Low |
| H-4 | Ledger Behavioral Analysis service **not implemented** (design doc exists, service absent) | Ledger | Medium |
| H-5 | Ledger persona is 25 lines — minimal, no behavioral economics, no emotion-spending correlation | Ledger | Low |
| H-6 | Titan has no `useModuleAI` coaching chat — only a field-CRUD `ScopedChatPanel` | Titan | Medium |
| H-7 | Medical Clearance Workflow (PAR-Q questionnaire) absent | Titan/Soma | Medium |
| H-8 | Soma–Titan delegation guardrails documented (Option C) but **not coded** | Soma/Titan | Medium |
| H-9 | Episodic memory E2EE is **opt-in, not enforced** — plaintext session history in Firestore | Platform | Medium |
| H-10 | Action handlers registered lazily at page-load — delegations to unvisited modules silently fall through | Platform | Low |
| H-11 | Orchestrator uses `indigo` theme — **identity collision with Agnes** (should be `cyan`) | Orchestrator | Trivial |
| H-12 | `analysis-actions.ts` still has raw Firestore reads bypassing NexusDataLayer | Platform | Low |
| H-13 | `ProfilePage.tsx` uses direct `onSnapshot` bypassing NexusDataLayer | Profile | Low |
| H-14 | `data-transfer-service.ts` fully bypasses NexusDataLayer (`writeBatch` / `getDocs`) | Platform | High |

---

## 🟡 MEDIUM — P2 (Incomplete Feature Expression)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| M-1 | Weekly Review Flow (guided multi-step modal) absent | Atlas | Medium |
| M-2 | Belief Graph Visualization — data model exists, UI is a flat list not a 2D interactive graph | Agnes | High |
| M-3 | Somatic Therapy bridge (breathing exercises on Spine stress events) absent | Agnes | Medium |
| M-4 | Energy Wave task overlay not wired (scheduled tasks + recovery windows on chart) | Atlas | Low |
| M-5 | Orchestrator conflict-resolution UI not built (`NexusSynthesisService` exists but no display) | Orchestrator | Medium |
| M-6 | Embedding-based RAG not injected into module context (`retrieveRelevantMemories()` exists but unwired) | Platform | Low |
| M-7 | Per-module vault key derivation not implemented (`getModuleKey()` returns master key) | Platform | Low |
| M-8 | `Documents` module: no services, no ActionHub registration, no onboarding, 9-line persona stub | Documents | High |
| M-9 | `Profile` page: read-only, no edit capability, no agent persona customisation UI | Profile | Medium |
| M-10 | Ledger: Unified 5-tab shell not built (still split `LedgerDashboard`/`LedgerWorkspace`) | Ledger | Medium |
| M-11 | `global-soul-context.tsx` imports from `@/llm-engine/types` — engine boundary violation | Platform | Low |
| M-12 | Duplicate `InMemoryDataProvider` implementations will diverge | Platform | Low |
| M-13 | `AgentPersonalityProvision` defined in `CoreUserProfile` but not wired into PersonaFactory | Platform | Low |

---

## 🟢 LOW — P3 (Polish & Hardening)

| # | Issue | Module | Effort |
|---|-------|--------|--------|
| L-1 | TitanPage tab buttons: missing `role="tab"`, `aria-controls`, `role="tabpanel"` (WCAG 4.1.2) | Titan | Low |
| L-2 | `TelemetryTicker` missing `aria-hidden="true"` — reads cryptic strings to screen readers (WCAG 1.3.1) | Platform | Trivial |
| L-3 | BarChart Y-axis duplicate ticks when `maxValue ≤ 3` | Titan | Low |
| L-4 | `NeuralButton` primary variant always indigo regardless of module theme | Platform | Low |
| L-5 | `GlassCard` glow hardcoded to indigo | Platform | Low |
| L-6 | `formatRelativeTime` duplicated in `ClearancePanel.tsx` and `ClearanceStatus.tsx` | Soma | Trivial |
| L-7 | Ad-hoc empty states in Titan instead of `<EmptyState>` | Titan | Trivial |
| L-8 | Ledger keyword-based field validation still active (should be LLM-semantic) | Ledger | Medium |
| L-9 | `NeuralTabGroup` wraps in `<nav>` — wrong landmark for tablist | Platform | Trivial |
| L-10 | `agentAlias` in TitanPage uses `(globalSoul as any)?.personality` fragile cast | Titan | Trivial |
| L-11 | Anti-pattern guardrails don't scan `src/lib/spine/` — CRIT-001 goes undetected | Platform | Low |
| L-12 | Missing cascade rules: `FINANCIAL_STRESS → Agnes`, `CRISIS_MODE → broadcast` | Platform | Low |
| L-13 | Tax Strategy, Debt/Savings Modeling, Scout Evidence Verification — all absent | Ledger/Scout | High |
| L-14 | AGENTS.md provider stack order is stale (DataLayerProvider not documented) | Docs | Trivial |

---

## ✅ SPRINT 1 DELIVERY STATUS

| Item | Title | Status |
|------|-------|--------|
| S1-001 | NexusDataLayer interface + InMemory adapter | ✅ DONE |
| S1-002 | Data layer wiring for shared contexts | ✅ DONE |
| S1-003 | Vault gating rules + episodic encryption hook | ⚠️ PARTIAL (enforcement opt-in) |
| S1-004 | Global Soul read API with NSV filters | ✅ DONE |
| S1-005 | Spine event schema + pub/sub stubs | ✅ DONE |
| S1-006 | Module profile store alignment | ⚠️ PARTIAL (data-transfer-service bypasses layer) |
| S1-007 | Migration map v1 | ✅ DONE |
| S1-008 | Anti-pattern guardrails scan | ⚠️ PARTIAL (scan done; lint enforcement not added; spine/ not scanned) |
| S1-009 | Atlas predictive service design spike | ✅ DONE+ (service implemented, exceeded scope) |
| S1-010 | Ledger behavioral analysis design spike | ✅ DONE (design only, as required) |
| S1-011 | Orchestrator conflict-resolution UI spec | ✅ DONE+ (NexusSynthesisService implemented) |
| S1-012 | Soma identity decision note | ✅ DONE (Option C: Formalized Delegation) |

**9/12 DONE · 3/12 PARTIAL**

---

## AI/LLM COMPONENT SCORES

| Component | Score |
|-----------|-------|
| LLM Engine (CognitiveAgent + Orchestrator) | 9.2/10 |
| NSV Ownership & Permissions | 9.5/10 |
| Soul Authority Guard | 9.5/10 |
| Scoped Conversations | 9.2/10 |
| Action Hub | 9.0/10 |
| Agnes Persona | 9.5/10 |
| Spine Event Bus + Cascades | 9.0/10 |
| Vault / E2EE | 8.5/10 |
| Memory Architecture | 7.5/10 |
| Atlas Persona | 6.5/10 |
| Dynamic Field System | 6.5/10 |
| Ledger Persona | 3.0/10 |
| Documents Module | 2.0/10 |

---

## QUICK WINS (< 1 hour, high impact)

1. Mount `<NeuralDraftPanel />` in `App.tsx` — Ghost UI goes live (**trivial**)
2. Change Orchestrator `themeColor="indigo"` → `"cyan"` — fixes identity collision (**2 string changes**)
3. Move all `registerXxxActions()` to `main.tsx` — fixes silent delegation failures (**30 min**)
4. Add `aria-hidden="true"` to `TelemetryTicker` (**trivial**)
5. Inject `NexusDataLayer` into `SpineEventBus.configure()` (**1–2 hours**)
6. Update AGENTS.md provider stack documentation (**trivial**)
