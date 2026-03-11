# SPRINT 8 — Titan Completion: Calendar, Exercise Library, Logbook Mode & Cycle Intelligence

**Duration:** 1–2 weeks  
**Objective:** Complete all deferred Sprint 7 items and bring Titan to a fully usable, self-sufficient coaching tool. Primary outcomes: TrainingCalendar visible on first load, PRs persisting correctly, Logbook Mode unblocking power users, Exercise Library enabling intelligent tracking, and Cycles having auto-advance intelligence.  
**Status:** In Progress  
**Carries over from:** `workitems/sprints/SPRINT_7.md` (Deferred items)

---

## Execution Status

### Completed ✅
- **PR auto-persist** (`actions.ts`) — `log_workout_session` now computes e1RM (Epley) per set, compares against `profile.personalRecords`, updates record on new high. `PersonalRecord` imported, persisted atomically with session write.
- **Ledger dead file removed** — `adaptive-data-collector.ts` was unreferenced (0 imports); deleted. All 8 pre-existing build errors cleared.

### In Progress 🔄 (agent fleet running)
- **TrainingCalendar** ← agent-10: 7-day week view, Mon–Sun grid, routine assignment, Completed/Missed/Rest status, Log Today CTA, week nav
- **Direct Write Mode** ← agent-11: `directWriteMode` toggle in Training tab header, immediate commit path in `WorkoutSessionLogger`, background AI advisory banner on RPE/volume spike
- **Exercise Library + CycleEntry upgrade** ← agent-12: 50+ exercise JSON, fuzzy name matcher, `linkedRoutineIds`/`deloadWeekNumber`/`progressionScheme` on `CycleEntry`
- **Cycle auto-advance + NSV pipeline** ← agent-13: auto-advance stale cycle phases on Titan load, active cycle context injected into system prompt, `cnsFatigue` time-decay, `sleepQuality` auto-NSV after `log_sleep`

### Pending ⏳
- Build validation after all agents complete
- `CycleType` cleanup — remove `supplement`/`hormonal`/`nutrition` from the union type itself (currently only removed from UI; type still wide)
- `SleepEntry` deprecation comment in `TitanProfile` (migration path to Soma sprint)

---

## Sprint Items

### S8-001: TrainingCalendar 7-Day View
**Priority:** P0 (table-stakes UX — most obvious missing feature)  
**Carries over from:** S7-003

**Scope:**
- New component `TrainingCalendar.tsx` in `src/modules/titan/components/`
- 7-day Mon–Sun grid for current week
- Each day: routine name if `profile.routines` has a matching `weekday`; "Rest" otherwise
- Past days: derive status from `profile.workoutSessions` (date match → Completed; routine assigned but no session → Missed; no routine → Rest)
- Today: highlighted with primary CTA — "Log Workout" if not yet logged, "✓ Done" if logged
- Future days with routine: show planned exercise count
- Prev/next week arrows
- Mount in Training tab above TitanDashboard

**Acceptance Criteria:**
- [ ] Calendar renders for current week on Training tab load
- [ ] Routine names display per weekday from `profile.routines`
- [ ] Past sessions show correct Completed/Missed/Rest state
- [ ] Today highlighted; "Log Workout" CTA opens `WorkoutSessionLogger` for today's routine
- [ ] Week navigation works
- [ ] Mobile responsive

---

### S8-002: Direct Write Mode (Logbook Mode)
**Priority:** P1  
**Carries over from:** S7-005

**Scope:**
- `directWriteMode` toggle in Training tab header (gear/settings icon → inline toggle)
- When `directWriteMode = true`: `WorkoutSessionLogger` bypasses AI on submit — calls `saveTitanProfile` directly
- After direct write: background AI check runs (non-blocking); if session RPE ≥ 9 or volume > 120% of 28-day average, surfaces a dismissible advisory banner in Training tab
- Preference persists via `update_titan_profile` action

**Acceptance Criteria:**
- [ ] Toggle renders in Training tab header; persists to `TitanProfile.directWriteMode`
- [ ] In Logbook Mode: session commits immediately without chat
- [ ] Advisory banner appears when RPE ≥ 9 or volume spike detected
- [ ] Banner is dismissible; does not reappear for same session

---

### S8-003: Exercise Library JSON + Fuzzy Matching
**Priority:** P1  
**Carries over from:** S7-001 partial

**Scope:**
- `src/modules/titan/data/exercise-library.json` — 50+ canonical exercises
- Each entry: `id`, `name`, `aliases[]`, `category` (`compound`|`isolation`|`cardio`|`mobility`), `primaryMuscles[]`, `secondaryMuscles[]`, `equipment[]`, `movementPattern`
- `src/modules/titan/services/titan-exercise-service.ts` — `matchExerciseName(name: string)` using trigram similarity or Levenshtein distance
- Used by `ProgressTab` to group PRs by muscle group

**Acceptance Criteria:**
- [ ] Library JSON contains ≥50 exercises covering all major compound lifts + common isolation movements
- [ ] `matchExerciseName('Barbell Squat')` returns the canonical squat entry
- [ ] `matchExerciseName('bench')` fuzzy-matches `Barbell Bench Press`
- [ ] Unmatched names return `null` (not an error)

---

### S8-004: CycleEntry Type Upgrade + Auto-Advance
**Priority:** P1  
**Carries over from:** S7-006

**Scope:**
- Add optional fields to `CycleEntry`: `linkedRoutineIds?: string[]`, `deloadWeekNumber?: number`, `progressionScheme?: 'linear' | 'wave' | 'block' | 'undulating'`
- On `TitanPage` profile load: check all active cycles; if `currentPhaseStartDate` + `phase.durationDays` < today, auto-advance phase (call `advance_cycle_phase` action handler directly, not via AI)
- Inject active training cycle context into `buildTitanSessionPrompt`: current phase name, week number, deload indicator
- When `currentWeekNumber === deloadWeekNumber` in active cycle: add deload flag to prompt context

**Acceptance Criteria:**
- [ ] `CycleEntry` type updated with new optional fields; existing records unaffected
- [ ] Stale cycle phases auto-advance on Titan page load (no AI required)
- [ ] Active cycle name + phase injected into Titan AI system prompt
- [ ] Deload week triggers deload guidance in AI prompt

---

### S8-005: NSV Auto-Pipeline (cnsFatigue + sleepQuality)
**Priority:** P1

**Scope:**
- After `log_workout_session` succeeds: auto-compute `cnsFatigue` from session volume + RPE (no AI `sync_vitals` required). Formula: `cnsFatigue = min(10, (rpe ?? 6) * 0.5 + totalVolume / 10000)`; apply 48h time-decay on each load
- After `log_sleep` succeeds: auto-compute `sleepQuality` from `hoursSlept` and `quality` fields in payload; update `biological.sleepQuality` NSV

**Acceptance Criteria:**
- [ ] `cnsFatigue` NSV updates after each session log without needing AI `sync_vitals` action
- [ ] `sleepQuality` NSV updates after each sleep log
- [ ] `TitanReadiness` widget reflects updated values immediately

---

## Out of Scope for Sprint 8
- Full Program → Mesocycle → Week → Session → Set hierarchy (Sprint 9+)
- Wearable integrations (Apple Health, Garmin)
- Predictive readiness / ML models
- Soma module UI receiving Titan's removed tabs (separate Soma sprint)

---

## Definition of Done
- [ ] All acceptance criteria for in-scope items pass
- [ ] `npm run build` exits with zero errors
- [ ] Training tab shows `TrainingCalendar` on first load
- [ ] Session logging in Logbook Mode commits immediately without AI round-trip
- [ ] PRs display correctly in Progress tab after first session is logged
- [ ] `BACKLOG.md` Titan items updated to reflect sprint completion
