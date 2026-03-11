# Sprint 14 — Chat Quality & Module Polish

**Status:** COMPLETED ✅ (Closed March 11, 2026)  
**Theme:** Fix visible user-facing bugs, harden chat streaming, and continue module quality pass  
**Scope:** Chat engine, Titan UX, Ledger shell, Agnes review

---

## Sprint Results

| Item | Status | Summary |
|------|--------|---------|
| S14-001 Chat streaming | ✅ Done | `stripPartialLeadingTag()` + `retainSpacings` — partial tags buffered, markdown streams incrementally |
| S14-002 Soma reload bug | ✅ Done | `type="button"` on `SomaSnapshotWidget` + `ClearanceBanner` |
| S14-003 Titan fast logging | ✅ Done | `QuickLogDrawer.tsx` side drawer + prominent "Quick Log" CTA above calendar |
| S14-004 Titan onboarding | ✅ Done | 4 steps → 3 (Routine Sync merged into History & Goals) |
| S14-005 Ledger Tax merge | ✅ Done | Tax tab removed; TaxTracker nested as collapsible in Budget tab |
| S14-006 Agnes somatic AI | ✅ Done | `BURNOUT_WARNING → SOMATIC_SUPPORT_REQUESTED` cascade; Agnes sends proactive grounding message |
| S14-007 Scout proxy | ↩ Deferred | Low priority — moved to backlog |
| S14-008 Concurrency-safe NSV | ↩ Carried | Moved to Sprint 15 as S15-001 |
| S14-009 AI init gate | ↩ Carried | Moved to Sprint 15 as S15-002 |

### S14-001 — Chat Streaming: Intelligent Stream Rendering (P0)

**Problem:**
1. Partial XML/HTML tags (e.g. bare `<`) render as raw text during the first tokens of a stream
2. Markdown formatting only applies after the stream completes — causes a jarring "snap" from plain text to rich output
3. `<think>` / `<thinking>` blocks are not surfaced during streaming

**Acceptance Criteria:**
- [ ] Partial tags are buffered and never displayed mid-token (hold `<...` until tag closes or confirmed not a tag)
- [ ] Markdown renders incrementally as tokens arrive (bold, lists, code blocks visible during stream)
- [ ] `<think>` blocks render as a collapsible "Thinking…" indicator live during streaming
- [ ] Empty/whitespace-only assistant messages (think-block-only responses) are suppressed from the chat log
- [ ] No regression on normal non-streaming messages

**Scope:** `src/llm-engine/` streaming pipeline + chat renderer component (`NexusChat.tsx` or equivalent). Audit how `streamingText` flows from engine → hook → UI.

---

### S14-002 — Titan: "View Soma" Hard Reload Bug (P0)

**Problem:** `SomaSnapshotWidget` and `ClearanceBanner` both call `navigate('/soma')` / `navigate('/soma?tab=clearance')` but the button triggers a full page reload instead of SPA client-side navigation.

**Likely cause:** Button is wrapped in or near an `<a href>` or `<form>`, or `navigate` is called outside the Router context.

**Acceptance Criteria:**
- [ ] Clicking "View Soma" in `SomaSnapshotWidget` navigates client-side (no reload)
- [ ] Clicking the clearance link in `ClearanceBanner` navigates client-side (no reload)
- [ ] `useNavigate` is confirmed inside Router tree in both components
- [ ] `onClick` calls `e.preventDefault()` where applicable
- [ ] No `<a href>` wrapper causing native navigation

**Scope:** `src/modules/titan/components/SomaSnapshotWidget.tsx`, `src/modules/titan/components/ClearanceBanner.tsx`

---

### S14-003 — Titan: Fast Logging UX (P1)

**Problem:** Current workout logging requires too many taps/fields. Titan should feel as fast as a paper log.

**Acceptance Criteria:**
- [ ] Training calendar supports quick-entry: tap a day → minimal inline form (exercise + sets + weight + reps, no extra fields)
- [ ] "Log Session" flow is ≤ 3 taps from the Training tab
- [ ] Quick-log entries persist via direct-write mode without requiring AI confirmation
- [ ] Previous session values pre-fill as defaults (reduce re-entry friction)

**Scope:** `src/modules/titan/components/TrainingCalendar.tsx`, `src/modules/titan/components/WorkoutSessionLogger.tsx`

---

### S14-004 — Titan: Onboarding Simplification (P1)

**Problem:** Titan onboarding has too many steps including a medical phase that belongs in Soma. New users don't reach the core value fast enough.

**Acceptance Criteria:**
- [ ] Onboarding reduced to 3 AI chat questions: training goal, experience level, weekly availability
- [ ] AI generates an instant starter plan from answers
- [ ] Medical/biomarker phase removed from Titan onboarding (handled by Soma independently)
- [ ] Existing onboarded users unaffected

**Scope:** `src/modules/titan/onboarding/TitanOnboarding.tsx`

---

### S14-005 — Ledger: Unified Shell Refactor (P1)

**Problem:** `LedgerDashboard` and `LedgerWorkspace` are separate components causing navigation confusion and duplicate logic. Structural debt blocks future Ledger feature work.

**Acceptance Criteria:**
- [ ] Single 5-tab shell using `NeuralTabGroup` with `theme="emerald"`: Overview | Budget | Goals | Transactions | Fields
- [ ] All existing dashboard widgets preserved in Overview tab
- [ ] Transactions tab replaces the current workspace transaction list
- [ ] Fields tab exposes custom field management (currently buried)
- [ ] No data loss — existing Ledger profiles load correctly
- [ ] Build passes, no TypeScript errors

**Scope:** `src/modules/ledger/LedgerPage.tsx`, `src/modules/ledger/components/LedgerDashboard.tsx`, `src/modules/ledger/components/LedgerWorkspace.tsx`

---

### S14-006 — Agnes: Module Review & Refinement (P1)

**Problem:** Agnes is the primary module (AI therapy companion) but has not received a structured product/UX review. Missing core features relative to its persona.

**Acceptance Criteria:**
- [ ] Full audit of current Agnes feature set vs. stated persona (emotional support, somatic grounding, belief tracking)
- [ ] Identify and fix top 3 UX friction points (form usability, chat flow, onboarding gap)
- [ ] Implement **Somatic Therapy** hook: AI suggests breathing/grounding exercises when Spine detects stress (`cnsFatigue > 0.7` or `BURNOUT_WARNING` event)
- [ ] Agnes module tab design aligned with Titan/Soma `NeuralTabGroup` pattern
- [ ] No regression on existing Agnes profile/chat functionality

**Scope:** `src/modules/agnes/` (all components), `src/lib/spine/cascade-rules.ts` (somatic trigger)

---

### S14-007 — Scout: Search Proxy Service *(MOVED BACK TO BACKLOG — deferred)*



**Problem:** Tavily API key is currently used directly in the browser bundle — a security risk for production users.

**Acceptance Criteria:**
- [ ] Tavily search calls routed through a Firebase Cloud Function or Cloudflare Worker proxy
- [ ] API key removed from browser-accessible code / `.env.local` VITE_ prefix
- [ ] Scout search functionality unchanged from user perspective
- [ ] Proxy includes rate-limiting (max 20 req/min per uid)
- [ ] Graceful fallback if proxy is unavailable (show "Search temporarily unavailable")

**Scope:** `functions/` (new Cloud Function), `src/modules/scout/services/` (update search service to call proxy)

---

### S14-008 — Platform: Concurrency-Safe NSV + Memory Writes (P0)

**Problem:** Multiple rapid writes can race because global soul and module memory commits use read-modify-write `getDocument` + `setDocument` patterns.

**Acceptance Criteria:**
- [ ] `GlobalProjectionService.updateCrossFunctionalState` writes are made concurrency-safe (transaction/atomic merge approach)
- [ ] `ModuleMemoryService.commitSession` event-history appends are made concurrency-safe (no lost session events under concurrent commits)
- [ ] Add regression tests for concurrent write scenarios
- [ ] No regression to vault-encrypted module memory behavior

**Scope:** `src/lib/services/global-projection-service.ts`, `src/lib/services/module-memory-service.ts`

---

### S14-009 — Platform: AI Init Gate Hardening (P1)

**Problem:** `AIProvider` can mark `isInitialized=true` after timeout even when no agent instance exists, causing downstream runtime errors.

**Acceptance Criteria:**
- [ ] `AIRuntimeGate` only opens when AI transport is actually callable
- [ ] Timeout path degrades gracefully with explicit fallback mode (no "Agent not initialized" throws in normal UX flow)
- [ ] Add tests for delayed/failed AI initialization path
- [ ] Preserve guest-mode behavior and model selection semantics

**Scope:** `src/llm-engine/ai-context.tsx`, `src/App.tsx`, relevant tests

---

## Definition of Done (Sprint-Level)

- [ ] All 7 items meet their acceptance criteria
- [ ] `npm run build` exits 0
- [ ] No new TypeScript errors introduced
- [ ] Existing vault session persistence unaffected
- [ ] All module pages load without console errors

---

## Deferred to Sprint 15+

- Atlas Sprint A (Intelligent Loop — PredictiveService, check-ins, recurrence engine)
- Atlas Sprint B (Power User & Memory — velocity tracking, historical data)
- Ledger Cross-Verification Engine
- Ledger Debt & Savings Modeling
- Belief Graph Visualization (Agnes)
- Forge: Life Ops Pivot
- Data Portability v2
- Atlas Failure Notification Loop
