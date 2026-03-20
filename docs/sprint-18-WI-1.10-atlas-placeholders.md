# WI-1.10 — Atlas: Placeholder Cleanup

## Type
Module Audit / Data Integrity

## Module
`src/modules/atlas/`

## Data Model Reference
- `AtlasProfile` — tasks, habits, goals, energy waves, recovery windows, routines, journal entries
- `GlobalSoul.crossFunctionalState.planning` — planningConfidence, completionRate, goalAlignment
- `GlobalSoul.crossFunctionalState.cognitive` — cognitiveLoad, focusLevel

## Key Audit Targets

### EnhancedAtlasDashboard
- Completion rate, focus score, energy level — must come from profile or NSV
- "Today's tasks" count — must reflect actual task list
- Energy wave display — must use real energy data or show empty state

### GoalTracker / GoalProgress / GoalVelocityChart
- Goals must come from profile
- Progress percentages must be calculated from real milestones
- Velocity chart must use real completion data

### HabitTracker / HabitHeatmap / HabitMomentumChart
- Habit data from profile
- Heatmap must reflect actual check-in data
- Momentum chart computed from real streaks

### EnergyWaveChart
- Energy data from profile or manual entries
- No hardcoded wave patterns

### TodaysPlanCard
- Must reflect actual today's tasks
- No "Sample Task" entries

### PriorityInbox
- Must show real priority items or empty state

### PostOnboardingWelcome
- Acceptable as transient welcome — verify it dismisses correctly

## Acceptance Criteria
- [ ] All dashboard metrics connected to real data
- [ ] All charts render real data or empty states
- [ ] No hardcoded demo tasks, habits, or goals
- [ ] `npm run build` passes
