# Sprint 15 — Platform Hardening & Atlas Intelligent Loop

**Status:** COMPLETED ✅  
**Theme:** Fix platform-level concurrency + AI reliability gaps; deliver Atlas Intelligent Loop (Sprint A)  
**Scope:** Platform stability (NSV/memory writes, AI init gate), Atlas daily intelligence cadence, Atlas PredictiveService + recurrence engine

---

## Priority Rationale

- **S15-001 / S15-002** are P0/P1 carries from Sprint 14 — unexecuted platform safety items that could cause data loss under concurrent writes or silent AI failures.
- **S15-003 through S15-005** deliver Atlas Sprint A — the highest-value unbuilt feature cluster for daily users. Morning brief, evening check-in, and the recurrence engine turn Atlas from a static planning tool into a living daily intelligence system.
- **S15-006** is Agnes belief graph — complex but high emotional value; P2 stretch goal.

---

## Sprint Items

---

### S15-001 — Platform: Concurrency-Safe NSV + Memory Writes (P0) ← *Carried from S14-008*

**Problem:** `GlobalProjectionService.updateCrossFunctionalState` and `ModuleMemoryService.commitSession` both use read-modify-write `getDocument + setDocument` patterns. Rapid writes (e.g., multiple modules updating NSV simultaneously, or a user completing tasks quickly) can race and silently drop data.

**Acceptance Criteria:**
- [ ] `GlobalProjectionService.updateCrossFunctionalState` writes are made concurrency-safe using Firestore transactions or atomic field merges (`FieldValue.arrayUnion` / `set(..., { merge: true })` where appropriate)
- [ ] `ModuleMemoryService.commitSession` event-history appends are made concurrency-safe — no lost session events under concurrent commits
- [ ] Both services degrade gracefully (retry or queue) when a transaction fails rather than silently dropping the update
- [ ] No regression to vault-encrypted module memory behavior (encryption/decryption wrapping untouched)

**Scope:** `src/lib/services/global-projection-service.ts`, `src/lib/services/module-memory-service.ts`

---

### S15-002 — Platform: AI Init Gate Hardening (P1) ← *Carried from S14-009*

**Problem:** `AIProvider` can set `isInitialized = true` after its timeout even when no usable agent instance exists. This causes downstream `"Agent not initialized"` throws in normal UX flow — especially noticeable on slow connections or cold starts.

**Acceptance Criteria:**
- [ ] `AIRuntimeGate` only allows renders when `isInitialized` is true AND a live transport/agent is confirmed callable (not just "timeout expired")
- [ ] Timeout path produces an explicit fallback/degraded mode indicator — no silent throws
- [ ] Guest mode behavior and model selection semantics are fully preserved
- [ ] No module chat interface is blocked indefinitely if AI init fails — graceful offline/degraded state shown

**Scope:** `src/llm-engine/ai-context.tsx`, `src/core/components/AIRuntimeGate.tsx` (or equivalent), `src/App.tsx`

---

### S15-003 — Atlas: Morning/Evening Intelligence Cadence (P1)

**Problem:** `MorningCheckIn.tsx` exists but is shown only on manual user-initiated triggers. The daily brief should surface automatically on first open of any module each morning. An `EveningCheckIn.tsx` counterpart for 19:00–22:00 review does not exist.

**Acceptance Criteria:**
- [ ] Morning brief auto-triggers on first daily app open (any page/module) via `SESSION_STARTED` Spine event — replaces manual trigger
- [ ] `MorningCheckIn` dismissal is stored and prevents re-showing until next calendar day (`localStorage`, keyed by `YYYY-MM-DD`)
- [ ] `EveningCheckIn.tsx` component created: mirrors `MorningCheckIn` pattern, shows today's completion summary (tasks done / habits logged / workout completed), asks "How did the day go?" → feeds Agnes via handoff
- [ ] Evening check-in shows in time window 19:00–22:00 on Atlas dashboard (same gate logic as `MorningCheckIn`)
- [ ] Both components are dismissible without interaction penalty
- [ ] Spine event: `SESSION_STARTED` triggers `MORNING_BRIEF` cascade rule → fires if `isWeeklyReviewDue()` analog check passes

**Scope:** `src/modules/atlas/components/MorningCheckIn.tsx`, new `src/modules/atlas/components/EveningCheckIn.tsx`, `src/lib/spine/cascade-rules.ts`

---

### S15-004 — Atlas: PredictiveService Activation + Recurrence Engine (P1)

**Problem:**
1. `AtlasPredictiveService` state machine (Normal → Compressed → Overloaded → Recovery) is fully typed but never evaluated — it runs zero evaluations in the current runtime.
2. Tasks with `recurrenceRule: 'daily' | 'weekdays' | 'weekly' | 'monthly'` exist in the type system but there is no engine to auto-respawn completed recurring tasks.

**Acceptance Criteria:**
- [ ] `AtlasPredictiveService` evaluation triggered on Atlas profile load — state transitions fire correctly (Normal → Compressed when `activeTasks > threshold`, etc.)
- [ ] PredictiveService state written to NSV `cognitive.predictiveState` and surfaced in Atlas dashboard header (small status badge)
- [ ] Recurrence engine: on `ATLAS_TASK_COMPLETED` Spine event, if `task.recurrenceRule` is set, auto-create the next instance with appropriate `dueDate` offset
- [ ] Recurring tasks show a loop icon in the task list to distinguish from one-off tasks
- [ ] No infinite loops — completed recurring tasks that are past their end date (or have `recurrenceEndDate`) do not spawn new instances

**Scope:** `src/modules/atlas/services/atlas-predictive-service.ts`, `src/modules/atlas/services/atlas-profile-service.ts`, `src/modules/atlas/AtlasPage.tsx`, `src/lib/spine/cascade-rules.ts`

---

### S15-005 — Atlas: `generate_daily_schedule` Action + QuickCaptureBar (P1)

**Problem:**
1. `generate_daily_schedule` AI action is referenced in the Atlas system prompt but is not registered in ActionHub — calls silently no-op.
2. Adding a task requires opening a form with 5+ fields. A natural-language capture bar (`QuickCaptureBar`) would let users add tasks in seconds.

**Acceptance Criteria:**

**`generate_daily_schedule` action:**
- [ ] ActionHub handler registered for `generate_daily_schedule` — takes today's tasks + `energyBudget` + time blocks, returns an ordered `DailySchedule` written to the Atlas profile
- [ ] AI can invoke it conversationally ("plan my day") and the schedule appears inline in the Atlas dashboard

**`QuickCaptureBar`:**
- [ ] `QuickCaptureBar.tsx` component — persistent single-line input at the top of the Atlas Dashboard tab
- [ ] `useAtlasEntryParser()` hook — regex-first pattern extraction (dates: "friday", "tomorrow", "next week"; recurrence: "every weekday", "daily"; energy: "quick", "deep focus"; priority: "urgent"); LLM fallback for ambiguous
- [ ] `EntryConfirmChip.tsx` — inline chip below bar showing parsed fields (no modal); [+ Add] commits directly, [Edit] opens full form pre-filled
- [ ] Supports both tasks and habits — parser detects "run every weekday" as habit vs "call dentist Friday" as task

**Scope:** `src/modules/atlas/services/actions.ts`, `src/modules/atlas/components/` (new files), `src/lib/actions/action-hub.ts`

---

### S15-006 — Agnes: Belief Graph Visualization (P2 — Stretch Goal)

**Problem:** Agnes tracks beliefs and emotional patterns through conversation but has no visual that shows the user how their belief system is evolving over time. This is a core differentiator for a therapy companion.

**Acceptance Criteria:**
- [ ] `BeliefGraph.tsx` component: interactive 2D node-link graph (using a lightweight library like `d3-force` or `react-force-graph`) showing belief nodes and their emotional valence
- [ ] Beliefs sourced from Agnes profile (existing `beliefs[]` or `reflections[]` data)
- [ ] Nodes colored by sentiment (positive/neutral/negative), sized by recurrence frequency
- [ ] Clicking a node shows the originating quote/session date in a side panel
- [ ] Accessible as a collapsible panel in Agnes session view (not a separate tab)
- [ ] Gracefully shows empty state for users with < 3 logged beliefs

**Scope:** `src/modules/agnes/components/BeliefGraph.tsx`, `src/modules/agnes/AgnesPage.tsx`

---

## Definition of Done (Sprint-Level)

- [ ] S15-001 through S15-005 meet their acceptance criteria (S15-006 optional)
- [ ] `npm run build` exits 0
- [ ] No new TypeScript errors introduced
- [ ] Existing vault/E2EE behavior unaffected
- [ ] All module pages load without console errors

---

## Deferred to Sprint 16+

- Titan QuickCaptureBar (natural-language workout parsing — full spec in backlog §3)
- Ledger Cross-Verification Engine
- Ledger Document Intelligence (receipts/invoices)
- Ledger Debt & Savings Modeling
- Scout Module Review & Search Proxy (S14-007)
- Forge Life Ops Pivot
- Atlas Sprint B (historical aggregates, habit heatmap, velocity chart)
- Atlas Failure Notification Loop

---

## Results

| ID | Title | Status |
|----|-------|--------|
| S15-001 | Concurrency-safe NSV + Memory Writes | ✅ Done |
| S15-002 | AI Init Gate Hardening | ✅ Done |
| S15-003 | Atlas Morning/Evening Intelligence Cadence | ✅ Done |
| S15-004 | Atlas PredictiveService + Recurrence Engine | ✅ Done |
| S15-005 | Atlas QuickCaptureBar + generate_daily_schedule | ✅ Done |
| S15-006 | Agnes Belief Graph Visualization | ✅ Done |

**Closed:** March 2026. Successor: `SPRINT_16.md`.
