# WI-1.16 — Ledger: Mobile UX

## Type
Module UX / Mobile Design

## Module
`src/modules/ledger/`

## Design Principles
- **Transaction-first**: Most common action is logging a transaction — make it instant
- **Glanceable summaries**: Financial overview visible at a glance
- **Trustworthy data display**: Numbers must be clearly formatted and accurate

## Mobile Layout Specifications

### Dashboard
- Key metrics: full-width summary cards (net income, budget remaining, savings rate)
- Budget progress bars: full-width, color-coded
- "Log Transaction" button: prominent, bottom-anchored FAB or sticky bar

### Transaction Entry
- Quick log: sticky bottom bar, tap to expand to full form
- Full form: bottom sheet with category picker, amount input (number pad), description
- Receipt scan: full-screen camera view, capture button large and centered

### Transaction List
- Full-width cards, grouped by date
- Each card: category icon, description (truncated), amount (right-aligned)
- Swipe for edit/delete
- Filter bar: horizontally scrollable category chips

### Budget View
- Category list: full-width cards with progress bar
- Tap category → bottom sheet with transactions in that category
- Donut chart: compact, centered above category list

### Charts
- Single chart visible at a time
- Horizontally scrollable time axis
- Tap data point for detail

### Debt Strategist
- Card per debt item, vertically stacked
- Tap to expand payment details
- No table layout on mobile

### Tax Tracker
- Form inputs: full-width, large
- Summary: card layout, not table

## Specific Fixes
1. `QuickLogPanel`: full-width sticky bottom, number pad keyboard for amounts
2. `TransactionManager`: card layout on mobile, no table
3. `BudgetPlanner`: full-width progress cards, bottom sheet for details
4. `DebtStrategist`: card layout, not table
5. `ImageCaptureModal`: full-screen camera on mobile
6. `FinancialCharts`: single-column, scroll-per-chart

## Acceptance Criteria
- [ ] Transaction logging ≤ 3 taps
- [ ] Financial data clearly formatted on small screens
- [ ] All tables converted to card layouts on mobile
- [ ] Receipt scan is full-screen
- [ ] All touch targets ≥ 44x44px
