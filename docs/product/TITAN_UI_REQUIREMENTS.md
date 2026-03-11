# Titan Module — UI Requirements Specification
> Generated from multi-agent fleet review (Design · Architect · PM · Personal Trainer)  
> Date: 2026-03-10

---

## 0. GUIDING PRINCIPLE

**Titan is an agent. The module is its tool.**

The UI must serve two users simultaneously:

| User Type | Journey |
|---|---|
| **Passive (AI-first)** | Opens Titan, talks. Never touches a form. Titan handles everything through chat. |
| **Power User (direct)** | Opens Titan, uses forms and loggers directly. AI validates and commits. |

Every screen decision must answer: *does this work for both users without either one being penalized?*

---

## 1. CRITICAL BUG — FIX IMMEDIATELY

### BUG-01: Dynamic Tailwind Class Purge (Production)

**File:** `src/modules/titan/components/RestPeriodCalculator.tsx`

**Problem:** The CNS Impact badge uses runtime string interpolation:
```tsx
// BREAKS in production — Tailwind purges these class names
`bg-${cnsColor}-500/10 border border-${cnsColor}-500/20 text-${cnsColor}-300`
```

**Fix:** Add static safe-list entries to `tailwind.config` AND replace with explicit conditionals:

```tsx
// Replace interpolation with explicit map:
const cnsImpactStyles = {
  low:      'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300',
  moderate: 'bg-amber-500/10  border border-amber-500/20  text-amber-300',
  high:     'bg-rose-500/10   border border-rose-500/20   text-rose-300',
};
// Usage:
<div className={cn('...', cnsImpactStyles[recommendation.cnsImpact])}>
```

---

## 2. INFORMATION ARCHITECTURE — TAB RESTRUCTURE

### Current (broken):
```
Training | Biomarkers | Recovery | Sleep | Cycles | Diagnosis
   ↑           ↑            ↑         ↑        ✓        ↑
  Titan     (Soma)       (Soma)    (Soma?)  (Titan)  (Soma)
```

### Required (clean):
```
Training | Progress | Cycles
```

| Old Tab | New Home |
|---|---|
| Training | → Titan: **Training** tab (restructured — see §3) |
| Biomarkers | → Soma module (Titan shows a read-only **Soma Snapshot** widget + deep-link) |
| Recovery/Clearance | → Titan: **Training** tab as a **Clearance Banner** (collapsed by default, expands on warning/denial) |
| Sleep | → Soma module (Titan reads `biological.sleepQuality` from NSV only) |
| Cycles | → Titan: **Cycles** tab (training + recovery types only; supplement/hormonal → Soma) |
| Diagnosis | → Soma module |

### New Training tab internal structure:
```
Training tab
├── [Today Card]          — "What do I do today?" — readiness + today's routine + CTA
├── [Clearance Banner]    — collapsed unless warning/denial; expands with reason + Soma deep-link
├── [Program Panel]       — weekly plan view (routines) — Plan sub-view
└── [Session Logger]      — log today's workout — Log sub-view
```

### New Progress tab (new — replaces RoutineProgress):
```
Progress tab
├── [PR Board]            — personal records table with e1RM sparklines
├── [Volume Trends]       — weekly volume chart by muscle group
├── [Session History]     — scrollable list, last 30 sessions with expand
└── [Body Composition]    — weight log chart over time (if data exists)
```

### New Cycles tab (pared down):
```
Cycles tab
├── Active cycles list
└── Create new cycle (training / recovery types only)
```

---

## 3. TRAINING TAB — INTERNAL REDESIGN

### 3.1 Today Card (NEW — replaces TitanDashboard as the entry point)

The first thing a user sees when opening Titan. Answers: **"What do I do today?"**

```
┌──────────────────────────────────────────────────────┐
│  TUESDAY                            READINESS: 8/10  │
│  ┌────────────────────────────────────────────────┐  │
│  │  🟢 GREEN — Train as planned                   │  │
│  │  Sleep: 7.5h · CNS: 3/10 · Recovery: 8.2      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  TODAY'S SESSION: Push Day A                         │
│  5 exercises · ~60 min                               │
│                                                      │
│  [▶ Start Session]    [View Plan]    [Skip — Rest]   │
└──────────────────────────────────────────────────────┘
```

**Spec:**
- Readiness color: `emerald` = GREEN (≥7), `amber` = AMBER (4–6), `rose` = RED (≤3)
- "Start Session" → opens `WorkoutSessionLogger` modal for today's routine
- "View Plan" → scrolls to `TitanRoutinePanel`
- "Skip — Rest" → sends chat message asking Titan to log a rest day
- If no routine for today: shows "No session scheduled" + "Ask Titan to plan today" CTA
- If readiness is RED: CTA changes to "Active Recovery" with mobility/zone-2 suggestions inline

### 3.2 Clearance Banner (replaces Recovery tab)

Collapsed by default. Expands when `clearanceStatus !== 'granted'`.

```
// Collapsed (granted):
[🟢 Cleared for training]  [Soma ↗]

// Expanded (denied):
[🔴 Training restricted]
Reason: Cardiac biomarker flagged out of range (Troponin: 0.04 µg/L)
Recommendation: No high-intensity training. Zone-2 cardio only.
[View in Soma ↗]  [Acknowledge]
```

**Spec:**
- Uses `clearanceStatus` from `medicalProfile.clearances` (latest)
- No full Soma component embed — summary only
- "Soma ↗" navigates to `/soma` (via NexusRoutingService)
- Dismissed state persists per session (not per page load)

### 3.3 TitanRoutinePanel — Changes Required

**Current issues:**
- `RestPeriodCalculator` renders as a standalone card below every routine detail — no one uses it here
- `RoutineBuilder` opens a `NeuralModal` which itself opens another `NeuralModal` for templates (nested modals)
- Routine detail modal has no "Start Session" CTA
- Alert() used for name validation

**Required changes:**

| # | Change | Detail |
|---|---|---|
| RP-01 | Remove `RestPeriodCalculator` as standalone card | Demote to inline tooltip on exercise items (hover/tap to see recommended rest) |
| RP-02 | Fix nested modal (templates inside RoutineBuilder) | Move template library to a slide-in side panel or inline expandable section within the builder modal |
| RP-03 | Add "Start Session" to routine card | Each routine card in the list gets a "▶ Start" button that opens `WorkoutSessionLogger` for that routine |
| RP-04 | Replace `alert()` with inline error | `setNameError('Name is required')` displayed under the input, `className="text-rose-400 text-xs mt-1"` |
| RP-05 | Duration estimate fix | Replace `exercises × 5 min` with: `(compound_count × 20min) + (isolation_count × 10min) + (rest_periods)` — or just remove the estimate entirely |
| RP-06 | Today's routine highlight | The routine matching `getTodayWeekday()` gets an orange accent border and "TODAY" badge |

### 3.4 WorkoutSessionLogger — Changes Required

The most critical component to fix. Current state is functionally incomplete for actual gym use.

**Required changes:**

| # | Change | Priority | Detail |
|---|---|---|---|
| SL-01 | **Previous session data** | P0 | Show last logged session for this routine inline: each exercise shows `Last: 80kg × 8` in muted text above the input. Source: filter `workoutSessions` by `routineId`, sort by date, take latest. |
| SL-02 | **Live rest timer** | P0 | After marking a set complete, show a countdown timer: `Rest: 2:30 remaining`. Timer displayed in a sticky bar at the bottom of the modal. Default duration = `exercise.restSeconds` (new field) or derived from exercise type (compound=180s, isolation=60s). Tap to dismiss. |
| SL-03 | **Direct save path** | P0 | Add a "Save without AI review" option (visible in Direct Write Mode — see §6). In default mode, keep AI-gated path but add a loading state so the user knows their data is being processed. |
| SL-04 | **PR detection** | P1 | After session submit, compare each completed set against `personalRecords[exerciseName].maxWeight`. If new max weight achieved: show `🏆 New PR! 90kg Bench Press` toast and update PR map. |
| SL-05 | **e1RM calculation** | P1 | After session submit, compute `e1RM = weight × (1 + reps/30)` (Epley formula) per exercise. Show in session summary. |
| SL-06 | **Set-level RPE** | P1 | Add optional `RIR` input per set (tiny `+/-` stepper labeled "RIR" next to the set row). Not required — can be left blank. |
| SL-07 | **Mobile height fix** | P1 | Replace `max-h-[50vh]` constraint on exercise list with `flex-1 overflow-y-auto` inside a proper flex column. The current constraint cuts off the 5th+ exercise on mobile. |
| SL-08 | **Session stale warning** | P1 | Currently shows `isStale = elapsedMinutes > 240` but takes no action. Add: if stale, show a warning banner inside the modal: "Session started 4+ hours ago. Log anyway or discard?" |
| SL-09 | **Pending sync indicator** | P1 | Before sending to AI: persist `pendingSession` to `localStorage`. Show a "Syncing..." indicator in the modal. Clear on confirmed `log_workout_session` action tag parse. This prevents silent data loss. |
| SL-10 | **Weight unit toggle** | P2 | Add `kg / lbs` toggle in session logger header. Persists to `TitanProfile.activity.preferredWeightUnit`. |
| SL-11 | **Completed sets counter** | Quick win | The `${completedSetsCount}/${totalSetsCount}` counter at the bottom is already there — move it to the modal header so it's always visible. |

### 3.5 RoutineBuilder — Changes Required

| # | Change | Priority | Detail |
|---|---|---|---|
| RB-01 | Fix nested modal (templates) | P0 | Move `ExerciseTemplate` library out of inner `NeuralModal`. Use an inline expandable section with a `ChevronDown` toggle: "Add from library ▼" expands a scrollable grid below the exercise list. |
| RB-02 | Replace `alert()` | P0 | Replace with inline `formError` state displayed under the name input. |
| RB-03 | Add `targetRPE` per exercise | P1 | Add an optional RPE target input per exercise row (small number input, `1–10`). Shows as `@ RPE X` next to sets×reps. |
| RB-04 | Add `restSeconds` per exercise | P1 | Add a rest period selector per exercise row. Defaults from `RestPeriodCalculator` logic (compound=180s, isolation=60s). Replaces the standalone `RestPeriodCalculator` card. |
| RB-05 | Add `muscleGroups` tags | P2 | Per exercise, allow optional multi-select muscle group tags (Chest / Back / Shoulders / Quads / Hamstrings / Glutes / Arms / Core / Calves). Used for frequency analytics. |
| RB-06 | Weekday → "Split Label" | P2 | Rename "Weekday" to "Session Label". Allow free-text labels like "Push A", "Pull B", "Lower" alongside the day selector. Enables A/B splits without weekday lock-in. |
| RB-07 | AI Review explicit confirmation | UX | When user hits "Submit for Approval" — replace immediate modal close with: show a "Sent to Titan for review" toast + keep modal open briefly showing "Reviewing..." before auto-closing. |

---

## 4. PROGRESS TAB — NEW COMPONENT

### 4.1 PR Board (`PersonalRecordsPanel`)

```
┌─────────────────────────────────────────────────────┐
│  PERSONAL RECORDS                                    │
│  ─────────────────────────────────────────────────  │
│  Barbell Bench Press    105kg   e1RM: 115kg  ↑ PR   │
│  Back Squat             130kg   e1RM: 142kg  ↑ PR   │
│  Deadlift               160kg   e1RM: 175kg  —       │
│  Overhead Press          75kg   e1RM:  82kg  ↑ PR   │
│  ─────────────────────────────────────────────────  │
│  [+ Log PR manually]                                 │
└─────────────────────────────────────────────────────┘
```

**Spec:**
- Source: computed from `workoutSessions` on load — find max weight per exercise across all sets
- e1RM: `weight × (1 + reps/30)` (Epley formula)
- `↑ PR` badge if set in last 30 days
- Sparkline (7-session trend per exercise) — small 40px wide inline chart
- "Log PR manually" → chat message: "I want to log a PR for [exercise]"
- Sort: by most recent PR date (freshest first)

### 4.2 Volume Trends Chart

- Bar chart: weekly total volume (kg) for last 8 weeks
- Filter by muscle group (chip selector: All / Push / Pull / Legs / Core)
- Source: aggregate `workoutSessions.exercises.sets` by week
- If no sessions: empty state with "Complete your first session to see trends"

### 4.3 Session History List

- Scrollable list of last 30 `workoutSessions`
- Each row: date, routine name, total volume, RPE badge, status icon (✓ completed / ⊘ partial / ✗ abandoned)
- Expand row → shows exercise list with sets/reps/weight
- No pagination needed up to 30 (older sessions are analytics, not operational)

### 4.4 Body Composition Card

- Line chart: `TitanProfile.activity.baselineWeight` over time + goal weight line
- Currently only one weight value exists (no time-series). This card renders only when weight log array exists.
- Until weight log: show "Body Composition tracking is set up in Soma" + deep-link

---

## 5. CYCLES TAB — PARED DOWN

### Remove from Cycles tab:
- `supplement` cycle type → Soma
- `hormonal` cycle type → Soma
- `nutrition` cycle type → Soma

### Keep in Cycles tab:
- `workout` (mesocycle)
- `recovery` (planned recovery block)
- `custom`

### CycleManager changes:

| # | Change | Detail |
|---|---|---|
| CM-01 | Remove 3 cycle types | Remove supplement / hormonal / nutrition from `CYCLE_TYPE_META` and from the AI prompt in cycle creation flows |
| CM-02 | Add direct cycle creation form | Simple cycles (name + type + start date + notes) should have a direct form option. Only multi-phase complex cycles need AI gating. Toggle: "Simple" (form) vs "AI-guided" (chat). |
| CM-03 | Mesocycle phase display | For `workout` type cycles: show phase names with training modifier badges (Increase / Maintain / Reduce / Rest) |
| CM-04 | Phase advance UX | "Advance to next phase" button should show what the next phase is before confirming, not just ask AI blindly |

---

## 6. DIRECT WRITE MODE

New user setting in the Titan module (accessible from the module header or a settings gear icon).

### Toggle Location
- Titan module header (top-right of `SingleAgentLayout` content area)
- OR within a `TitanSettings` sheet/modal accessible from the agent header

### Behavior

| Mode | Default | Behavior |
|---|---|---|
| **AI Mode** | ✅ Default | All writes go through Titan AI for review. AI validates, then commits via action tag. Current behavior. |
| **Direct Mode** | Off | Writes bypass AI and commit directly. AI analysis available on-demand via the chat panel. |

### Per-Operation Matrix

| Operation | AI Mode | Direct Mode |
|---|---|---|
| Build/edit routine | AI-gated (always) | AI-gated (always) |
| Create hormonal/complex cycle | AI-gated (always) | AI-gated (always) |
| Log workout session | AI-gated | Direct save → success toast |
| Log sleep entry | AI-gated | Direct save → success toast |
| Update custom fields | AI-gated | Direct save → success toast |
| Create simple cycle | AI-gated | Direct form save |
| Advance cycle phase | AI-gated | Direct advance (with confirmation dialog) |

### UI Implementation

```tsx
// TitanContent state
const [directMode, setDirectMode] = useState(false);

// Header toggle
<div className="flex items-center gap-2">
  <span className="text-[10px] text-white/40 uppercase tracking-wider">Direct Mode</span>
  <Switch
    checked={directMode}
    onCheckedChange={setDirectMode}
    className="data-[state=checked]:bg-orange-500"
  />
</div>

// In WorkoutSessionLogger, SleepTracker, etc:
// Pass directMode prop. When true: call write service directly instead of onSubmitSession(prompt).
```

### Direct Mode visual indicator
- When enabled: orange dot indicator next to "Titan" agent name in the header
- Tooltip on hover: "Direct Mode active — edits save instantly without AI review"

---

## 7. ONBOARDING — SIMPLIFICATION

### Current problems:
- Medical gate (5 steps: conditions, meds, allergies, consent) appears inside Titan onboarding — deprecated, belongs to Soma
- Fast-track form has freeform comma-separated supplements — error-prone
- Medical consent appears AFTER sensitive data is entered — backwards

### Required changes:

| # | Change |
|---|---|
| OB-01 | **Remove entire medical gate** from `TitanOnboarding` — delete `MEDICAL_STEPS` and `medicalPhase` state. Medical onboarding belongs to Soma. |
| OB-02 | **Simplify fast-track form** — reduce to 3 fields: (1) Primary goal (muscle / strength / fat loss / endurance / general fitness) as chip selector, (2) Experience level (beginner / intermediate / advanced) as chip selector, (3) Days per week available (1-7 stepper). That's enough for an initial plan. |
| OB-03 | **Chip entry for supplements** — replace freeform comma-separated text with a chip input (type name → Enter to add → shows as removable pill). |
| OB-04 | **Equipment question** — add to fast-track: "What equipment do you have?" (chip multi-select: Barbell / Dumbbells / Cables / Kettlebells / Bodyweight / Machines). This is currently completely absent. |
| OB-05 | **Injuries as chip entry** — same pattern as supplements: type injury → Enter → removable pill. Not a textarea. |
| OB-06 | **Progressive disclosure** — onboarding can complete with just goal + experience + days. Everything else (nutrition, injuries, body stats) collected incrementally through normal conversation with Titan. Add: "Fill in later" to all non-essential sections. |
| OB-07 | **AI chat onboarding as default** — Fast-track is the secondary path. The primary path is: click "Get Started" → AI chat begins. Fast-track is a "Prefer forms?" option in the bottom corner. |

---

## 8. SOMA SNAPSHOT WIDGET (replaces Biomarkers + Recovery tabs)

When Biomarkers and Recovery tabs are removed from Titan, replace them with a compact read-only summary widget shown in the Training tab sidebar or as a collapsible card.

```
┌─────────────────────────────────────────────────────┐
│  SOMA HEALTH SNAPSHOT                    [Open Soma ↗]│
│  ─────────────────────────────────────────────────  │
│  🟢 Training cleared              Last lab: 14d ago  │
│  HRV: 62ms  ·  RHR: 58bpm  ·  Conditions: 0         │
│  Active biomarkers: 3  ·  Flagged: 0                 │
└─────────────────────────────────────────────────────┘
```

**Spec:**
- Read-only — no edits from Titan
- Source: `somaProfile` (already subscribed in `TitanContent`)
- "Open Soma ↗" → `navigate('/soma')`
- Collapsed by default; expands on warning (clearance denied, flagged biomarker)
- Only rendered if user has a SomaProfile with at least one data point

---

## 9. ACCESSIBILITY FIXES

| # | Issue | Fix |
|---|---|---|
| A-01 | `+/-` set buttons in `WorkoutSessionLogger` have no `aria-label` | Add `aria-label="Add set"` / `aria-label="Remove set"` |
| A-02 | Session logger inputs use placeholder-only labeling | Add `<label htmlFor>` elements visually hidden or inline |
| A-03 | Color-only status indicators (RPE color, clearance status) | Add text labels alongside color. e.g. "RPE 8 (High)" not just an orange dot |
| A-04 | `text-[8px]` / `text-[9px]` labels in multiple components | Floor at `text-[10px]` minimum across the module |
| A-05 | `SleepTracker` uses `themeColor="cyan"` inside an orange module | Change to `themeColor="orange"` for consistency |

---

## 10. EMPTY & LOADING STATES

| Component | Empty State | Loading State |
|---|---|---|
| Training tab (no routines) | Existing EmptyState component — ✅ good | Add skeleton cards: 3 grey rounded cards at ~80px height |
| Progress tab (no sessions) | "Complete your first session to unlock Progress" + illustration | Skeleton: 3 MetricCard + 1 BarChart placeholder |
| PR Board (no sessions) | "Your PRs will appear here after your first logged session" | Skeleton: 4 rows at ~40px height |
| Session logger (AI processing) | — | Disable submit button + show spinner + "Titan is reviewing..." label |
| Session logger (direct mode save) | — | Brief spinner → immediate success toast "Session saved" |
| Today Card (no routine today) | "Rest day scheduled" or "No session today — ask Titan to plan one" | — |

---

## 11. COMPONENT INVENTORY — FINAL STATE

### Keep (no major changes):
- `TitanReadiness` (TitanDashboard) — keep as NSV metric display, demote from hero position
- `RoutineProgress` → merge into new **Progress tab**
- `CycleManager` → keep with cuts (§5)
- `NeuralTabGroup` — keep, with new tab config

### Keep with significant changes:
- `WorkoutSessionLogger` — 9 required changes (§3.4)
- `RoutineBuilder` — 7 required changes (§3.3.5)
- `TitanRoutinePanel` — 6 required changes (§3.3)
- `SleepTracker` → **move to Soma** (Titan reads sleep via NSV only)
- `CustomFieldManager` — split: Nutrition stays in Titan, Exercises/Biomarkers categories removed

### Remove from Titan:
- `TitanDiagnosisPanel` → Soma
- `SleepTracker` → Soma
- All Soma embeds (`BiomarkerDashboard`, `ClearancePanel`, `ClearanceStatus`) → replaced by `SomaSnapshotWidget`

### New components required:
- `TodayCard` — readiness + today's session CTA (§3.1)
- `ClearanceBanner` — collapsed clearance status (§3.2)
- `SomaSnapshotWidget` — read-only Soma summary (§8)
- `PersonalRecordsPanel` — PR board with e1RM (§4.1)
- `SessionHistoryList` — last 30 sessions (§4.3)
- `DirectModeToggle` — AI vs direct write mode switch (§6)
- `LiveRestTimer` — sticky countdown bar in session logger (§3.4 SL-02)
- `PreviousSessionSidebar` — inline last-session data during logging (§3.4 SL-01)

---

## 12. SPRINT PRIORITY (UI Work Only)

### 🔴 Immediate (bugs / pre-ship)
1. Fix dynamic Tailwind interpolation in `RestPeriodCalculator` (BUG-01)
2. Replace `alert()` in `RoutineBuilder` with inline error (RB-02)
3. Fix `WorkoutSessionLogger` 50vh mobile constraint (SL-07)

### 🟠 Sprint 7 — Core Restructure
4. Tab restructure: 6 → 3 tabs (Training | Progress | Cycles)
5. Remove Soma component embeds → `SomaSnapshotWidget` + `ClearanceBanner`
6. `TodayCard` component (§3.1)
7. Previous session data in `WorkoutSessionLogger` (SL-01)
8. Live rest timer in `WorkoutSessionLogger` (SL-02)
9. Pending sync indicator + localStorage staging (SL-09)
10. Fix nested modal in `RoutineBuilder` (RB-01)
11. Remove medical gate from `TitanOnboarding` (OB-01)
12. Onboarding fast-track simplification (OB-02 → OB-07)

### 🟡 Sprint 8 — Performance Intelligence
13. PR Board (`PersonalRecordsPanel`) (§4.1)
14. PR detection in session logger (SL-04)
15. e1RM calculation (SL-05, §4.1)
16. Volume Trends chart (§4.2)
17. Session History list (§4.3)
18. Direct Write Mode toggle (§6)
19. Set-level RIR input (SL-06)
20. `targetRPE` + `restSeconds` on exercise in builder (RB-03, RB-04)

### 🟢 Sprint 9 — Polish
21. Training calendar view
22. Cycle phase calendar overlay
23. Body composition chart (§4.4)
24. Muscle group frequency heatmap
25. Weight unit toggle (SL-10)
26. Muscle group tags on exercises (RB-05)
27. All accessibility fixes (§9)
