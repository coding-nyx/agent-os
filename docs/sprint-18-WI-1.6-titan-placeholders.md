# WI-1.6 — Titan: Placeholder Cleanup

## Type
Module Audit / Data Integrity

## Module
`src/modules/titan/`

## Summary
Audit Titan for unlinked placeholders, mock training data, and disconnected cross-module widgets.

## Data Model Reference
- `TitanProfile` — routines, workout sessions, PRs, sleep, cardio, cycles, custom fields, recovery plans
- `GlobalSoul.crossFunctionalState.biological` — cnsFatigue, sleepQuality, overallRecovery
- `SomaProfile` — biomarker data (cross-module)

## Key Audit Targets

### SomaSnapshotWidget
- **Critical**: This renders Soma module data inside Titan
- Verify it actually loads `SomaProfile` via `subscribeSomaProfile`
- If Soma is locked/no data: must show meaningful empty state, not mock data
- If connection exists: verify data freshness and error handling

### TitanDashboard (TitanReadiness)
- Readiness score — verify connected to real CNS/sleep/recovery data
- Volume metrics — must compute from actual workout sessions
- If no data: show "Log your first workout" empty state

### ProgressTab / AnalyticsTab
- Charts must render real data or show empty state
- Remove any hardcoded demo datasets

### PRBoard
- PRs must come from profile data
- No hardcoded "Bench Press: 225 lbs" entries

### CycleManager
- Cycle entries must be from profile
- Empty state when no cycles exist

### SleepTracker / BodyWeightTracker / CardioLogger
- All entries from profile data
- Empty states when no entries

## Resolution Rules
Same as WI-1.2 (Agnes placeholder rules)

## Acceptance Criteria
- [ ] SomaSnapshotWidget renders real Soma data or proper empty/locked state
- [ ] All metrics trace to TitanProfile or NSV data
- [ ] No hardcoded mock training data
- [ ] Proper empty states for all data-driven views
- [ ] `npm run build` passes
