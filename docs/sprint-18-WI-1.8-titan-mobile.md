# WI-1.8 — Titan: Mobile UX

## Type
Module UX / Mobile Design

## Module
`src/modules/titan/`

## Design Principles
- **Action-oriented**: Titan is for logging workouts — mobile UX should make logging fast
- **One-handed operation**: Quick log bar accessible with thumb
- **Data density balanced**: Show key metrics without overwhelming on small screens

## Mobile Layout Specifications

### Dashboard
- Readiness score: large, centered, full-width card
- Metrics: 2-column compact grid
- Active routine: single card, tap to expand
- Recovery banner: full-width, above content

### Quick Log
- Quick log bar: sticky bottom, full-width, large input (48px height)
- Quick log drawer: bottom sheet, 50vh snap point, keyboard-aware
- Parsed result confirmation: inline above input, not a separate modal

### Workout Logger
- Full-screen on mobile (not a modal)
- Exercise list: vertical stack, large touch targets
- Set/rep inputs: inline, number pad keyboard
- "Add Set" button: large, obvious, bottom of exercise card
- Swipe between exercises (or tab navigation)

### Calendar
- Month view: compact grid, tap day to see workouts
- Horizontally swipeable between months
- Day detail: bottom sheet with workout summary

### Charts (Progress/Analytics)
- Single chart per viewport width
- Horizontally scrollable chart container with momentum
- Pinch-to-zoom disabled (confusing on mobile)
- Tap data point for detail tooltip

### PRBoard
- Card layout instead of table on mobile
- Each PR: exercise name (truncated), weight, date
- Tap to expand full details

## Specific Fixes
1. QuickLogDrawer: position relative to keyboard, not viewport bottom
2. WorkoutSessionLogger: full-screen sheet on mobile with `100dvh`
3. TrainingCalendar: swipeable month navigation on mobile
4. AnalyticsTab charts: single-column stack with horizontal scroll per chart
5. RecoveryPlanModal: bottom sheet on mobile, not centered modal

## Acceptance Criteria
- [ ] Quick log accessible one-handed from any Titan view
- [ ] Workout logger is full-screen on mobile
- [ ] Calendar is touch-navigable
- [ ] Charts don't overflow or clip
- [ ] All touch targets ≥ 44x44px
