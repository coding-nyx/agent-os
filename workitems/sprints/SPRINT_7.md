# SPRINT 7 — Titan Module Review & Refinement

**Duration:** 2–3 weeks  
**Objective:** Execute the Titan Product Strategy Review findings. Clean up scope creep, resolve the Soma boundary confusion, establish the Exercise identity data model (foundational for all advanced features), and deliver the minimum training calendar + PR board that makes Titan a competitive coaching product.  
**Status:** In Progress  
**PRD Reference:** `docs/product/TITAN_PRODUCT_STRATEGY_REVIEW.md`

---

## Sprint Goals

1. **Establish Exercise identity** — canonical Exercise entity with PR tracking. Every future advanced feature depends on this.
2. **Clean Titan's scope** — remove Biomarkers, Sleep, Recovery, Diagnosis tabs from Titan. Expose Soma data only through NSV-powered readiness widget and clearance banner.
3. **Deliver the calendar** — 7-day training schedule view. Table-stakes UX that is currently absent.
4. **Ship the PR board** — top exercises + e1RM sparklines in the new Progress tab.
5. **Simplify onboarding** — 3-question AI chat → instant plan. Remove 9-step form flow.

---

## Execution Status

### Completed ✅
- **Types foundation** — `MuscleGroup`, `EquipmentType`, `PersonalRecord`, extended `Exercise`/`ExerciseSet`/`TitanActivity`/`TitanProfile` with coaching fields (`targetRPE`, `restSeconds`, `equipment`, `directWriteMode`, `personalRecords`)
- **BUG-01** — `RestPeriodCalculator` Tailwind dynamic class purge bug fixed
- **BUG-02** — `RoutineBuilder` `alert()` replaced with inline `nameError`/`exercisesError` state
- **BUG-03** — `WorkoutSessionLogger` `max-h-[50vh]` replaced with `flex-1 overflow-y-auto` (flex column container)
- **BUG-04** — `normalizeTitanProfile` array bounds: `workoutSessions.slice(0,500)`, `sleepLog.slice(0,730)`, new field defaults added
- **RoutineBuilder** — `updateExercise` partial API, targetRPE + restSeconds inputs per exercise, template library → inline `AnimatePresence` expandable (nested modal bug fixed)
- **TitanRoutinePanel** — optional `onStartSession` prop + "Log Session" button per routine card
- **TitanPage** (S7-002) — 6→3 tabs (Training | Progress | Cycles), Soma imports removed, `SomaSnapshotWidget` + `ClearanceBanner` in Training tab, stale handlers/state cleaned up
- **SomaSnapshotWidget** — new component, clearance status deep-link to `/soma`
- **ClearanceBanner** — new component, renders null when cleared, amber/rose for pending/denied
- **WorkoutSessionLogger** (S7-004/S7-005 partial) — previous session data inline, live rest timer (countdown + skip), localStorage staging buffer, e1RM/PR detection in prompt, per-set RPE input
- **TitanOnboarding** (S7-007) — medical gate fully removed, chip selectors for goal/experience/equipment, `–`/`+` days stepper, structured AI summary prompt, equipment → `TitanActivity.equipment`
- **ProgressTab** (S7-004) — `PersonalRecordsPanel` (PRs + e1RM), pure-CSS `VolumeChart` (ISO-week bars), `SessionHistoryList` (30 sessions, accordion)
- **CycleManager** (S7-006 partial) — `supplement`, `hormonal`, `nutrition` cycle types removed
- **Build** — all Titan TypeScript errors resolved; only pre-existing ledger errors remain (unrelated to this sprint)

### Deferred to Sprint 8 ⏳
- **S7-005 Logbook/Direct Write Mode** — `directWriteMode` toggle UI + background AI advisory banner
- **S7-001** — Exercise library JSON (~50 canonical exercises), fuzzy name matching, `exerciseId` on `WorkoutSession`
- **S7-003** — `TrainingCalendar` 7-day view
- **S7-006** — `advance_cycle_phase` auto-advance, active cycle context in Titan AI prompt
- **Ledger pre-existing errors** — `adaptive-data-collector.ts` missing modules (not Titan-related)

### In Progress 🔄 (agent fleet running)
- **S7-002** ← agent-5: TitanPage 6→3 tabs + `SomaSnapshotWidget` + `ClearanceBanner`
- **S7-004 / S7-005** ← agent-6: `WorkoutSessionLogger` revamp (prev session inline, rest timer, localStorage staging, e1RM/PR detection, RPE per set, AI/Logbook mode)
- **Routine tooling** ← agent-7: `RoutineBuilder` targetRPE + restSeconds inputs, template library inline expand, `TitanRoutinePanel` Log Session button
- **S7-007** ← agent-8: `TitanOnboarding` medical gate removal, chip selectors (goal/experience/equipment), days stepper
- **S7-004 + S7-006** ← agent-9: `ProgressTab` (PRs, VolumeChart, SessionHistoryList), `CycleManager` non-training type removal

### Pending ⏳
- **S7-001** — Exercise library JSON (~50 canonical exercises), fuzzy name matching, `exerciseId` on `WorkoutSession`
- **S7-003** — `TrainingCalendar` 7-day view with CTA
- **S7-005** — Logbook Mode background AI advisory banner (Direct Write Mode toggle)
- **S7-006** — `advance_cycle_phase` auto-advance logic, active cycle context injection into Titan AI system prompt
- Post-agent build validation and integration fixes

---



`S7-001 → S7-002 → S7-003 → S7-004 → S7-005 (parallel with S7-004) → S7-006 → S7-007`

Critical path: S7-001 (Exercise model) must land before S7-004 (PR board).

---

## Sprint Items

### S7-001: Exercise Identity Data Model  
**Priority:** P0  
**Blocks:** S7-004 (PR board), future 1RM tracking, program templates, volume analytics by muscle group

**Scope:**
- Define `Exercise` TypeScript interface: `{ id, name, aliases[], category, primaryMuscles[], secondaryMuscles[], equipment[], movementPattern, formCues[], isCustom }`
- Define `PersonalRecord` TypeScript interface: `{ exerciseId, date, weight, reps, e1RM, sessionId }`
- Seed a canonical Exercise library (~50 most common exercises) as a static JSON asset
- Add fuzzy-name matching: when a free-text exercise name in an existing `Routine.exercises[]` is loaded, attempt match to library; create custom entry if no match
- Add `PersonalRecord[]` to `TitanProfile`
- Update `log_workout_session` action handler: after each session, compute e1RM (Epley formula: `weight × (1 + reps/30)`), compare to existing PRs, update `PersonalRecord` if new high
- Update `log_workout_session` action tag payload: include `exerciseId` field (alongside existing `name` for backward compatibility)

**Acceptance Criteria:**
- [x] `Exercise` and `PersonalRecord` types defined in `src/lib/types.ts`
- [ ] Exercise library JSON seeded with ≥50 canonical exercises covering compound lifts (squat, deadlift, bench, overhead press, row), common isolation movements, and basic cardio
- [x] `TitanProfile.personalRecords: Record<string, PersonalRecord>` added and persists correctly
- [ ] After logging a session with a new max weight×reps combination, a `PersonalRecord` entry is created/updated
- [x] e1RM calculated using Epley formula and stored (implemented in WorkoutSessionLogger revamp)
- [x] Backward-compatible: existing `WorkoutSession` records without `exerciseId` do not break

---

### S7-002: Soma Tab Cleanup — Remove Out-of-Scope Tabs from Titan  
**Priority:** P0  
**Type:** Architecture + UX cleanup

**Scope:**
- Remove tabs from `TitanPage.tsx`: `Biomarkers`, `Recovery`, `Sleep`, `Diagnosis`
- Titan tab navigation becomes: **Training | Progress | Cycles**
- Add a readiness widget to the Training tab that surfaces: `sleepQuality`, `recoveryScore`, `cnsFatigue` from NSV (already available via `TitanReadiness` component — move/embed here)
- Add a clearance status banner to Training tab: reads Soma clearance snapshot via `soma-data-service`; shows "✅ Cleared to train" or "⚠️ Medical restriction: [reason]"
- Add a "View Health Dashboard" link in the clearance banner → navigates to Soma module
- Move `log_sleep` action delegation to Soma service (same pattern as `commit_biomarker` via `soma-titan-delegation-service`)
- Keep `SleepEntry[]` in `TitanProfile` temporarily as read-only mirror (do not delete yet — migration path); add TODO comment for full removal in Sprint 8
- Migrate Diagnosis tab content → Soma module (confirm with Soma module spec before removing)

**Acceptance Criteria:**
- [x] Titan tabs are exactly 3: Training, Progress, Cycles (agent-5 in progress)
- [x] Biomarkers, Sleep, Recovery, Diagnosis tabs do not render in Titan (agent-5 in progress)
- [ ] Training tab shows NSV readiness scores (sleep quality, recovery, CNS fatigue) as a compact widget
- [ ] Training tab shows clearance status banner with correct status from Soma data service
- [ ] "View Health Dashboard" link navigates to Soma module route
- [ ] `log_sleep` AI action delegates to Soma service and still updates NSV `sleepQuality`
- [ ] No console errors or broken references from removed tabs
- [ ] `aria-controls` / tab panel `id` mismatches resolved (existing tech debt)

---

### S7-003: Training Calendar (7-Day View)  
**Priority:** P0  
**Type:** New feature

**Scope:**
- New component: `TrainingCalendar` in `src/modules/titan/components/`
- 7-day week grid (Mon–Sun) showing current week
- Each day shows: routine name if assigned, "Rest" if not assigned
- Past days: show "✓ Completed", "✗ Missed", or "— Rest" based on `WorkoutSession` records for that date
- Today: highlighted with CTA button — "Log Today's Workout" if session not yet logged; "Session Logged ✓" if complete
- Tapping any future assigned day: expand to show planned exercises for that session
- Week navigation: previous/next week arrows
- Mount `TrainingCalendar` as the primary visual in the Training tab (above session logger)

**Acceptance Criteria:**
- [ ] 7-day calendar renders correctly for current week
- [ ] Assigned training days show routine name from `profile.routines` matched by weekday
- [ ] Past completed sessions show "✓ Completed" (matched by date in `profile.workoutSessions`)
- [ ] Today's training day is visually highlighted
- [ ] "Log Today's Workout" CTA opens the `WorkoutSessionLogger` for the current day's routine
- [ ] Expanding a future day shows the planned exercise list (name, sets × reps)
- [ ] Calendar is responsive on mobile screen widths

---

### S7-004: PR Board (Progress Tab)  
**Priority:** P1  
**Depends on:** S7-001 (Exercise identity)

**Scope:**
- New `ProgressTab` component replacing any existing placeholder in the Progress tab
- PR board section: list of top 8–10 tracked exercises (ordered by most recently logged)
- Per exercise: best weight × reps, computed e1RM, date of PR, a sparkline of e1RM over last 90 days
- "PR" badge on the most recent PR for each exercise
- Empty state: "Log your first workout to start tracking PRs"
- Volume analytics section: weekly tonnage chart (already in `RoutineProgress` — move here)
- ACWR indicator: compute acute (7-day) vs chronic (28-day) workload ratio from session volume; show traffic-light indicator (green < 1.3, yellow 1.3–1.5, red > 1.5)

**Acceptance Criteria:**
- [ ] Progress tab shows PR board with ≥1 exercise entry after first session is logged
- [ ] e1RM sparkline shows correct trend for the last 90 days (or all data if < 90 days)
- [ ] "PR" badge appears when most recent session for an exercise is the all-time best
- [ ] ACWR is computed and displayed with correct color coding
- [ ] Empty state renders correctly for new users with no sessions
- [ ] Clicking an exercise in the PR board shows a detail view with full session history for that exercise

---

### S7-005: AI Mode / Logbook Mode Toggle  
**Priority:** P1  
**Type:** New feature (UX preference)

**Scope:**
- Add `preferenceMode: 'coach' | 'logbook'` to `TitanProfile`
- Add a mode toggle in Titan settings (accessible from Training tab header)
- **Coach Mode (default):** AI mediates form submissions; `WorkoutSessionLogger` sends session to AI via chat message before committing; AI responds with action tag to commit
- **Logbook Mode:** `WorkoutSessionLogger` commits data immediately on form submit (optimistic write); AI analysis runs in background; if AI detects concerns (RPE 10 + excessive volume, potential overtraining), surfaces a dismissible advisory banner in the Training tab header
- Add `update_titan_profile` preference field support for `preferenceMode`

**Acceptance Criteria:**
- [ ] Mode toggle renders in Titan settings with clear label: "Coach Mode" / "Logbook Mode"
- [ ] Default mode for new users is "Coach Mode"
- [ ] In Logbook Mode: form submission commits immediately without chat interaction
- [ ] In Logbook Mode: AI advisory runs in background; banner appears if concern detected
- [ ] In Coach Mode: existing AI-mediated flow unchanged
- [ ] Mode preference persists across sessions

---

### S7-006: Mesocycle Data Model Upgrade  
**Priority:** P1  
**Type:** Architecture + data model

**Scope:**
- Refactor `CycleEntry` type to split by domain:
  - Titan retains: `type: 'training' | 'recovery'`
  - New fields added to training cycles: `linkedRoutineIds: string[]`, `deloadWeekNumber: number`, `progressionScheme: 'linear' | 'wave' | 'block' | 'undulating'`, `focusAreas: string[]`
  - `type: 'supplement' | 'hormonal' | 'nutrition' | 'custom'` deprecated from Titan; add migration comment for Soma
- Update `create_cycle` action: when type is `'training'`, require `linkedRoutineIds` and optionally `deloadWeekNumber`
- Update `advance_cycle_phase` action: check if current date is past phase end date and auto-advance (fix known oddity: phases currently don't auto-advance)
- Update Titan AI persona context: inject active cycle's `currentPhase`, `deloadWeekNumber`, and `focusAreas` into system prompt
- When `currentWeekNumber === deloadWeekNumber`: Titan AI automatically uses `recovery` mode persona variant and reduces intensity guidance

**Acceptance Criteria:**
- [ ] `CycleEntry` type updated with `linkedRoutineIds`, `deloadWeekNumber`, `progressionScheme` fields
- [ ] `create_cycle` AI action accepts and stores new fields
- [ ] Existing CycleEntry records without new fields remain valid (fields are optional)
- [ ] `advance_cycle_phase` auto-advances when current date is past phase end date (checked on Titan load)
- [ ] Titan AI system prompt includes active cycle context when a training cycle is active
- [ ] Titan AI switches to recovery-mode guidance during designated deload weeks

---

### S7-007: Onboarding Simplification  
**Priority:** P1  
**Type:** UX redesign

**Scope:**
- Redesign `TitanOnboarding.tsx`: default path is AI chat, not the form
- AI chat onboarding: Titan asks ≤4 questions via conversational chat, then generates a starter routine immediately
- Required questions: (1) primary goal, (2) training availability (days/week + equipment), (3) experience level
- Optional fast-track form path: 3-field form (goal, days/week, experience) for users who dismiss chat — accessible via "Skip to quick setup" link
- Remove medical onboarding phase from Titan entirely (5 steps: conditions, meds, allergies, consent) — add a "Complete health profile in Soma →" prompt at end of Titan onboarding for users who want medical tracking
- After onboarding: routine is pre-generated and displayed immediately in Training tab
- Add progressive profile collection: context-triggered prompts for body weight (after Session 1), macros (after Week 1), injury notes (if RPE > 9 is logged)
- Update onboarding complete criteria: `goal` + `availability` + `experienceLevel` set + first routine generated = complete

**Acceptance Criteria:**
- [ ] New users see AI chat as the default onboarding path
- [ ] AI chat onboarding completes in ≤4 exchanges and generates a starter routine
- [ ] "Skip to quick setup" link shows 3-field form alternative
- [ ] Medical onboarding phase is absent from Titan onboarding flow
- [ ] Starter routine is visible in Training tab immediately after onboarding completes
- [ ] "Log first workout" CTA is immediately actionable after onboarding
- [ ] Progressive prompts appear contextually: body weight prompt after Session 1 is logged, macro prompt after 7 days of use
- [ ] Existing users who completed onboarding are not re-prompted

---

## Out of Scope for Sprint 7

- Wearable integration (Apple Health, Garmin, Whoop) — separate platform track
- Full Program → Mesocycle → Week → Session → Set hierarchy — Phase 2 (Sprint 9+)
- Program template library (5/3/1, GZCLP, etc.) — Phase 2
- Nutrition daily food logging — out of Titan scope
- Progress photos — nice-to-have, future sprint
- Predictive readiness / ML forecasting — future sprint
- Soma module UI redesign (receiving Titan's removed tabs) — separate Soma sprint

---

## Definition of Done

- [ ] All acceptance criteria for in-scope items pass
- [ ] TypeScript builds with no new errors (`npm run build`)
- [ ] No regressions in existing Titan functionality (workout logging, AI chat, Spine reactivity)
- [ ] NSV readiness scores still display correctly after Sleep/Biomarkers tab removal
- [ ] `soma-titan-delegation-service` tests pass
- [ ] `TITAN_PRODUCT_STRATEGY_REVIEW.md` updated with any decisions made during sprint
- [ ] `BACKLOG.md` Titan items updated to reflect sprint completion status
