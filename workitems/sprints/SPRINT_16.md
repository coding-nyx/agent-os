# Sprint 16 — Titan Physical Sovereign + Ledger Shell Restructure

**Status:** COMPLETED ✅  
**Theme:** Titan core data model (exercise identity, calendar, PR board) + Ledger unified shell restructure  
**Scope:** Titan physical sovereignty completions; Ledger structural overhaul; Atlas Sprint B memory layer; Atlas Failure Loop

---

## Priority Rationale

- **S16-001 / S16-002 / S16-003** — Titan is missing its foundational data model. The Exercise Identity entity is a P0 blocker for PR tracking and intelligent coaching. Without it, Titan is a note-taking tool, not a performance system.
- **S16-004** — Unified Ledger Shell: Current `LedgerDashboard` + `LedgerWorkspace` split is confusing; restructuring into a clean 5-tab shell is prerequisite before adding any new Ledger features (cross-verification, debt modeling).
- **S16-005** — Atlas Failure Notification Loop is a short, high-value P1: Spine-driven cross-module escalation when commitments are missed.
- **S16-006** — Atlas Sprint B: Habit heatmap + goal velocity chart. Power-user memory layer to close Atlas Sprint B.

---

## Sprint Items

---

### S16-001 · Titan Exercise Identity Data Model (P0)

**Problem:** No canonical `Exercise` entity exists. Workout logs are freeform strings with no type safety, no e1RM tracking, and no cross-session continuity.

**Scope:**
- Add `Exercise` type to `src/modules/titan/types.ts`:
  ```typescript
  type Exercise = {
    id: string;
    name: string;
    muscleGroups: string[];
    category: 'compound' | 'isolation' | 'cardio' | 'mobility';
    equipment: string[];
  };
  type PersonalRecord = {
    exerciseId: string;
    weight: number;
    reps: number;
    e1RM: number;     // Epley: weight × (1 + reps/30)
    date: string;     // ISO
  };
  ```
- Seed an exercise library (20–30 canonical exercises) as a static array in `src/modules/titan/data/exercise-library.ts`
- Add `personalRecords: PersonalRecord[]` and `exercises: Exercise[]` to `TitanProfile` (with migration guard — default to `[]`)
- Update `titan-profile-service.ts` to persist/read the new fields
- Add `calculate_e1rm` utility function in `src/modules/titan/utils/e1rm.ts`
- Update `QuickLogDrawer.tsx` to use exercise lookup (autocomplete from library) instead of free text

**Acceptance:** TypeScript builds clean; `PersonalRecord[]` persists to Firestore; e1RM is calculated on save.

---

### S16-002 · Titan Training Calendar — 7-Day Week View (P0)

**Problem:** `TrainingCalendar.tsx` exists but shows a simplified view. A true 7-day week view with logged workout summaries per day is needed.

**Scope:**
- Rebuild `TrainingCalendar.tsx` to show Mon–Sun grid (current week, prev/next navigation)
- Each day cell shows: workout name, total sets logged, primary muscle groups (colored chips)
- Days with logged workouts get a green dot indicator
- "No workout" days show a subtle `+` tap to open `QuickLogDrawer`
- Use data from `profile.workoutLogs` (type `WorkoutLog[]` — add this to types if missing)
- Empty state: "Start logging to see your training week" with a CTA

**Acceptance:** Week calendar renders correctly, prev/next navigation works, today is highlighted.

---

### S16-003 · Titan PR Board (P1 — depends on S16-001)

**Problem:** No visibility into personal bests. Users can't see their top lifts or track progression.

**Scope:**
- New component `PRBoard.tsx` in `src/modules/titan/components/`
- Renders top 6 exercises by e1RM in a 2×3 or 3×2 grid of `PRCard` tiles
- Each `PRCard`: exercise name + e1RM value + last PR date + a mini sparkline (5 most recent e1RM values as a simple SVG path — no external chart lib)
- Mount in the Progress tab of `TitanPage.tsx`
- Empty state: "Log your first workout to start tracking PRs"

**Acceptance:** PR board renders from `profile.personalRecords`, sparkline shows trend, zero new npm deps.

---

### S16-004 · Unified Ledger Shell (P0)

**Problem:** `LedgerDashboard.tsx` and `LedgerWorkspace.tsx` are separate components creating navigation confusion. The current structure doesn't match the 5-tab mental model users expect.

**Scope:**
- Restructure `LedgerPage.tsx` to own a single 5-tab shell: **Overview | Budget | Goals | Transactions | Fields**
- `LedgerDashboard` content → Overview tab (net worth, cash flow summary, recent activity)
- Budget tab: existing budget categories UI
- Goals tab: savings goals + debt payoff
- Transactions tab: full transaction list with filters
- Fields tab: custom field management
- Remove the `LedgerWorkspace` → `LedgerDashboard` navigation pattern; merge into one unified view
- Preserve all existing functionality — this is a structural refactor, not a feature rewrite
- Fix the 4× duplicate "Recent Transactions" JSX block in `LedgerDashboard.tsx` (noted in design audit)
- Remove `Math.random()` from Cash Flow chart (use real data from `profile.transactions` or show empty state)

**Acceptance:** All 5 tabs render; no duplicate JSX; build clean; no functionality regression.

---

### S16-005 · Atlas Failure Notification Loop (P1)

**Problem:** When Atlas detects missed tasks/workouts/habits, no cross-module escalation fires. Agnes and Titan are unaware of planning failures.

**Scope:**
- Add `COMMITMENT_MISSED` and `HABIT_STREAK_BROKEN` to `SpineEventType` in `src/lib/types.ts`
- Add display names in `state-display-config.ts`
- Add cascade rules in `src/lib/spine/cascade-rules.ts`:
  - `COMMITMENT_MISSED` → `ROUTINE_DISRUPTED` (existing) + `SOMATIC_SUPPORT_REQUESTED` (if 2+ days streak broken)
  - `HABIT_STREAK_BROKEN` → emit to Agnes context (Spine event, not direct call)
- In `AtlasPage.tsx`: detect overdue tasks (dueDate < today, status !== 'done') on profile load; emit `COMMITMENT_MISSED` via Spine if any overdue tasks exist (debounced, once per session)
- In `AgnesPage.tsx`: `useSpineEvent('COMMITMENT_MISSED')` → send proactive check-in message (already have the pattern from `SOMATIC_SUPPORT_REQUESTED`)
- Register new cascade rules in `App.tsx` `SpineRuntimeBootstrap`

**Acceptance:** Overdue Atlas tasks trigger Spine event → Agnes receives proactive message; build clean.

---

### S16-006 · Atlas Sprint B — Habit Heatmap + Goal Velocity (P1)

**Problem:** No historical visualization. Users can't see habit consistency over time or goal progress trends.

**Scope:**
- **Habit Heatmap:** GitHub-style annual contribution grid for each tracked habit
  - Component: `HabitHeatmap.tsx` in `src/modules/atlas/components/`
  - 52-week grid of 7-day columns; cell color by completion (transparent → `sky-500`) with 4 intensity levels
  - Data source: `profile.habits[].completionLog` (add `completionLog: string[]` (ISO dates) to `Habit` type in `types.ts` if missing)
  - Show last 12 weeks max initially (full year behind a "Show full year" toggle)
  - Mount in Atlas Progress/Stats sub-view (or as a section in the existing week view)
- **Goal Velocity Chart:** rolling 30-day task completion rate
  - Component: `GoalVelocityChart.tsx`
  - Simple SVG area chart (no external deps): X = last 30 days, Y = % tasks completed that day
  - Color: emerald fill when ≥ 70%, amber when 40–69%, red below 40%
  - Data: derive from `profile.tasks[].completedAt` timestamps
  - Mount below PriorityInbox in the dashboard view

**Acceptance:** Heatmap renders correctly with real data; velocity chart SVG renders; zero new npm deps.

---

## Dependencies

```
S16-003 → depends on S16-001 (Exercise Identity must exist before PR Board)
S16-002 → depends on S16-001 (WorkoutLog type alignment)
```

---

## Results

| ID | Title | Status |
|----|-------|--------|
| S16-001 | Titan Exercise Identity Data Model | ✅ Done |
| S16-002 | Titan Training Calendar 7-Day Week View | ✅ Done |
| S16-003 | Titan PR Board (sparklines) | ✅ Done |
| S16-004 | Unified Ledger Shell (5-tab restructure) | ✅ Done |
| S16-005 | Atlas Failure Notification Loop | ✅ Done |
| S16-006 | Atlas Sprint B — Habit Heatmap + Goal Velocity | ✅ Done |

**Closed:** March 2026. Build: ✅ exit 0.
