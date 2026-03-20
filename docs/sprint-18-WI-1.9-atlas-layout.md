# WI-1.9 — Atlas: Layout & Overflow

## Type
Module Audit / UI Fix

## Module
`src/modules/atlas/`

## Summary
Atlas has the most complex view system with multiple switching views (today, week, month, timeline, focus), a large dashboard, and many sub-components. It also has its own CSS variable system (`--atlas-space-*`). Audit all views for overflow and layout consistency.

## Components to Audit (30+ files)

| Component | Key Concerns |
|-----------|-------------|
| `AtlasPage.tsx` | View switching, tab system, quick-add state |
| `EnhancedAtlasDashboard.tsx` | Multi-section dashboard — card overflow, metric cards |
| `ViewSwitcher.tsx` | View mode selector — mobile sizing |
| `FocusView.tsx` | Single-task focus — content overflow |
| `WeekGrid.tsx` | 7-column grid — horizontal overflow on mobile |
| `MonthPlanner.tsx` | Calendar month — horizontal overflow on mobile |
| `TaskTimeline.tsx` | Vertical timeline — long lists |
| `DayTaskPanel.tsx` | Day detail — task list overflow |
| `TaskCard.tsx` | Individual task — long title/description truncation |
| `TaskManager.tsx` | Task list — scroll, search, filter UI |
| `HabitTracker.tsx` | Habit grid — overflow on mobile |
| `HabitHeatmap.tsx` | Grid visualization — container sizing |
| `HabitBuilder.tsx` | Form — scroll in constrained space |
| `HabitMomentumChart.tsx` | Chart — container overflow |
| `GoalTracker.tsx` | Goal list/cards — long goal names |
| `GoalProgress.tsx` | Progress visualization — container sizing |
| `GoalVelocityChart.tsx` | Chart — container overflow |
| `EnergyWaveChart.tsx` | Chart — container overflow |
| `ManualEnergyLog.tsx` | Input form — keyboard handling |
| `MorningCheckIn.tsx` | Modal/sheet — content scroll |
| `EveningCheckIn.tsx` | Modal/sheet — content scroll |
| `WeeklyReviewModal.tsx` | Long review modal — must scroll |
| `PriorityInbox.tsx` | Priority list — scroll, long items |
| `QuickCaptureBar.tsx` | Sticky input — z-index, keyboard |
| `QuickAddForm.tsx` | Quick add form — keyboard handling |
| `TodaysPlanCard.tsx` | Card — content overflow |
| `RoutineEditor.tsx` | Complex form — scroll |
| `AtlasAIPanel.tsx` | AI chat panel — scroll, overlay |
| `AtlasAnalytics.tsx` | Analytics charts — container overflow |
| `FieldsTab.tsx` | Custom fields — list overflow |
| `EntryConfirmChip.tsx` | Floating chip — z-index |
| `PostOnboardingWelcome.tsx` | Welcome card — overflow |
| `journal/*` | Journal views — long text handling |

## Critical Fixes
1. `WeekGrid`: 7-column layout must be horizontally scrollable on mobile (< 768px)
2. `MonthPlanner`: calendar grid must scroll or resize on mobile
3. `HabitHeatmap`: grid must scroll or compact on mobile
4. `WeeklyReviewModal`: content must scroll within modal bounds
5. `MorningCheckIn` / `EveningCheckIn`: form content must scroll
6. `TaskCard`: title truncation with `truncate`, description with `line-clamp-2`
7. `QuickCaptureBar`: z-index must be below modals but above scroll content
8. Atlas CSS variables (`--atlas-space-*`): verify they don't conflict with global tokens

## Acceptance Criteria
- [ ] All view modes render without overflow at every breakpoint
- [ ] Calendar/grid views scroll horizontally on mobile
- [ ] All modals scroll content
- [ ] Task text handles overflow gracefully
- [ ] Atlas CSS variables integrate with global token system
- [ ] `npm run build` passes
