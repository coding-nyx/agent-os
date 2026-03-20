# WI-1.12 — Atlas: Mobile UX

## Type
Module UX / Mobile Design

## Module
`src/modules/atlas/`

## Design Principles
- **Clarity over density**: Show one view at a time, no multi-pane on mobile
- **Swipeable navigation**: Swipe between day/week/month views
- **Quick capture first**: Task entry should be ≤ 2 taps away

## Mobile Layout Specifications

### Today View (Default)
- Full-width today's tasks list
- Each task card: full-width, clear status, swipe for actions (complete, edit, delete)
- Quick capture bar: sticky bottom, large input
- Dashboard summary: compact row above task list (completion %, energy level)

### Week View
- Horizontal scrollable day columns
- Current day highlighted and centered
- Tap day header to expand day's tasks in bottom sheet

### Month View
- Compact calendar grid (7 columns)
- Dots indicate task density per day
- Tap day → bottom sheet with day details
- Swipe between months

### Habits
- Vertical list of habits with large check buttons
- Heatmap: horizontally scrollable, current period centered
- Habit builder: bottom sheet form

### Goals
- Card stack, one goal per card
- Progress bar prominent
- Tap to expand milestones

### Focus View
- Full-screen single task display
- Large typography, minimal UI
- Timer (if applicable) centered
- Swipe to complete or skip

### Energy & Check-ins
- Morning check-in: bottom sheet with large sliders/buttons
- Evening check-in: same pattern
- Energy log: inline quick entry

## Specific Fixes
1. `ViewSwitcher`: horizontal scroll tabs on mobile, not wrapping
2. `WeekGrid`: horizontal scroll with snap-to-day
3. `MonthPlanner`: standard compact calendar grid
4. `QuickCaptureBar`: sticky bottom, safe-area aware, keyboard responsive
5. `MorningCheckIn`/`EveningCheckIn`: bottom sheet, not centered modal
6. `WeeklyReviewModal`: full-screen on mobile
7. `HabitHeatmap`: horizontal scroll with today centered

## Acceptance Criteria
- [ ] Single-view-at-a-time on mobile (no multi-pane)
- [ ] Quick capture accessible within 2 taps
- [ ] Calendar/grid views horizontally scrollable with snap
- [ ] Check-in flows use bottom sheets
- [ ] All touch targets ≥ 44x44px
