# WI-1.13 — Ledger: Layout & Overflow

## Type
Module Audit / UI Fix

## Module
`src/modules/ledger/`

## Summary
Ledger displays dense financial data (transactions, budgets, charts, debt tables). Every component must handle large datasets gracefully without overflow or clipping.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `LedgerPage.tsx` | Tab system, modal stacking, document upload states |
| `LedgerDashboard.tsx` | Multi-card financial summary — metric overflow |
| `LedgerWorkspace.tsx` | Main workspace — layout composition |
| `TransactionManager.tsx` | Transaction table/list — horizontal scroll, long descriptions |
| `BudgetPlanner.tsx` | Budget categories — progress bars, category names |
| `GoalTracker.tsx` | Financial goals — long goal names, progress display |
| `DebtStrategist.tsx` | Debt table — long creditor names, number formatting |
| `TaxTracker.tsx` | Tax data — form inputs, calculations display |
| `FinancialCharts.tsx` | Charts — container sizing, responsive |
| `SpendingTrendsChart.tsx` | Chart — container overflow |
| `AnalyticsTab.tsx` | Data grid/charts — overflow |
| `BehavioralInsightsPanel.tsx` | Long text analysis — content scroll |
| `QuickLogPanel.tsx` | Quick transaction entry — keyboard handling |
| `FieldsTab.tsx` | Custom fields — list overflow |
| `AIFinancialAdvisor.tsx` | AI panel — chat overflow |
| `LedgerNotificationSettingsPanel.tsx` | Settings — modal scroll |

## Critical Fixes
1. `TransactionManager`: virtualized list or pagination for large transaction sets; horizontal scroll for wide tables on mobile
2. `BudgetPlanner`: category names truncated, progress bars contained
3. `DebtStrategist`: table scrollable horizontally on mobile
4. `FinancialCharts` / `SpendingTrendsChart`: charts in `min-h-0 overflow-hidden` containers
5. `BehavioralInsightsPanel`: long text with `overflow-y-auto`
6. `QuickLogPanel`: keyboard-aware positioning
7. `ImageCaptureModal` (receipt scan): camera viewfinder aspect-ratio constrained
8. Number formatting: ensure large numbers don't overflow containers (use abbreviated format for mobile)

## Acceptance Criteria
- [ ] Transaction list handles 100+ items without layout break
- [ ] All tables scroll horizontally on mobile
- [ ] All charts stay within container bounds
- [ ] Long text content scrolls or truncates
- [ ] Number values format responsively
- [ ] `npm run build` passes
