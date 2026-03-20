# WI-1.14 — Ledger: Placeholder Cleanup

## Type
Module Audit / Data Integrity

## Module
`src/modules/ledger/`

## Data Model Reference
- `LedgerIntakeProfile` — financial plan, transactions, budget categories, goals, debt items
- `GlobalSoul.crossFunctionalState.resource` — financialStress, savingsRate, budgetAdherence

## Key Audit Targets

### LedgerDashboard
- Net worth, income, expenses — must compute from real transaction data
- Budget utilization — must compute from actual budget vs. spending
- Savings rate — must come from profile or NSV

### BudgetPlanner
- Budget categories — must come from profile
- Category colors assigned from `BUDGET_CATEGORY_COLORS` by index — this is correct pattern
- Actual spending per category — must compute from transactions via `computeBudgetActuals`

### TransactionManager
- Transactions must come from profile data
- No hardcoded "Grocery Store $50" entries

### GoalTracker
- Financial goals from profile
- Progress computed from real savings/contributions

### DebtStrategist
- Debt items from profile
- Payoff calculations from real data

### FinancialCharts / SpendingTrendsChart
- Must render real transaction/budget data
- No hardcoded chart data arrays

### BehavioralInsightsPanel
- Insights should be AI-generated or derived from real patterns
- Remove any hardcoded insight text

## Acceptance Criteria
- [ ] All financial metrics computed from real data
- [ ] No hardcoded transactions or budget entries
- [ ] Charts render real data or empty states
- [ ] Insights are data-driven or show empty state
- [ ] `npm run build` passes
