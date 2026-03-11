# Ledger Module — UX/UI Design Critique
### Design Agent Report · Nexus AI SPA
**Audited:** `LedgerPage.tsx`, `LedgerOnboarding.tsx`, `LedgerDashboard.tsx`, `LedgerWorkspace.tsx`, `TransactionManager.tsx`, `BudgetPlanner.tsx`, `GoalTracker.tsx`, `FinancialCharts.tsx`, `FieldsTab.tsx`, `AIFinancialAdvisor.tsx`, `BehavioralInsightsPanel.tsx`, `ledger-intake-service.ts`, `field-templates.ts`, `ledger-field-actions.ts`

---

## Table of Contents
1. [What Works Well](#1-what-works-well)
2. [Critical UX Failures](#2-critical-ux-failures)
3. [Missing UI Components](#3-missing-ui-components)
4. [Form & Field UX Critique](#4-form--field-ux-critique)
5. [Data Visualization Gaps](#5-data-visualization-gaps)
6. [Power User Mode Design](#6-power-user-mode-design)
7. [Mobile Considerations](#7-mobile-considerations)
8. [Accessibility & Clarity](#8-accessibility--clarity)
9. [Tax & Accounting UX](#9-tax--accounting-ux)
10. [Priority Recommendations](#10-priority-recommendations)

---

## 1. What Works Well

### ✅ Dual-Path Onboarding Architecture
`LedgerOnboarding.tsx` correctly implements a side-by-side fast-track form + conversational AI intake via `GuidedIntakeFrame`. The step progress bar (`LEDGER_STEPS`) is a solid orientation device. The pattern of the AI emitting `focus_income`, `focus_expenses`, etc. action tags to synchronize UI step state with conversational context is architecturally sound — users can see where in the process the AI is, reducing anxiety in a financial context.

### ✅ Vision Document Analysis Flow
The `ImageCaptureModal` → vision API → `NeuralModal` review → `handleDocReviewCommit` pipeline in `LedgerPage.tsx` is well-thought-out. The review gate before committing extracted data to the profile is exactly correct for a financial module. Users must confirm AI-extracted data before it lands in their profile — this respects data integrity and user trust.

### ✅ Action Tag Architecture for AI-Driven Updates
The `update_ledger_profile`, `update_global_base_context`, `sync_vitals`, and `complete_ledger_onboarding` action tags in the onboarding prompt are well-structured. The AI has a clear contract for what it can and cannot write. The `registerLedgerTransactionActions` pattern is the right approach for power-user mode where the AI autonomously creates records.

### ✅ VaultLockedShell Protection
The early return in `LedgerDashboard` for `isLocked` displays `VaultLockedShell` — consistent with the vault security model across modules, preventing sensitive financial data from leaking if the vault is inactive.

### ✅ FieldsTab Category Architecture
`field-templates.ts` with typed `LEDGER_FIELD_CATEGORIES` (income, assets, expenses, liabilities, custom) and `isCurrencyField` / `isPercentageField` helpers is a clean separation. The 10 suggested extension fields are well-chosen for a financial module. The field validation boundaries (e.g., `maximum: 100_000_000` for crypto, `multipleOf: 0.01`) show thoughtful design.

### ✅ Spine Event Taxonomy
`LedgerSpineEventType` in `ledger-field-actions.ts` has a rich event taxonomy: `TRANSACTION_CREATED`, `BUDGET_UPDATED`, `GOAL_PROGRESS`, `RISK_DETECTED`, `FINANCIAL_FRICTION_CHANGED`. Combined with `buildLedgerToast`, this provides a solid foundation for reactive cross-module communication.

### ✅ Goal Tracker "Months to Completion" Math
`getMonthsToCompletion` and `getCompletionDate` in `GoalTracker.tsx` give users actionable time-to-target feedback. Priority sorting (high → medium → low) and the milestone `achieved` tracking on `GoalMilestone` are well-modeled, even if the celebration trigger is unimplemented.

### ✅ StatCard with Derived Metric Flag
`LedgerDashboard.tsx` correctly passes `isDerived={NSV_DERIVED_METRICS.includes('resource.resonanceROI') || isMetricStale(..., 7)}` to the Resonance ROI `StatCard`. Flagging stale/derived metrics in the UI is excellent for financial data where users need to know data freshness.

---

## 2. Critical UX Failures

### 🔴 CRITICAL: "Recent Transactions" Block Copy-Pasted 4× in `LedgerDashboard.tsx`
**Lines 206–248, 251–293, 297–341, 343–386** — The exact same `SurfaceCard` JSX block for "Recent Transactions" is duplicated four consecutive times in the file. The dashboard will currently render **four identical "Recent Transactions" panels** stacked in the overview tab — a completely broken UI that will confuse users into thinking they have quadruple transactions or that the page is glitching. This is the most critical defect in the module.

**Fix:** Collapse to a single instance and verify conditional branching is correct.

---

### 🔴 CRITICAL: Charts Display Fabricated Data with `Math.random()`
**`LedgerDashboard.tsx`, lines 84–87:**
```typescript
income: monthlyIncome !== null ? monthlyIncome * (0.95 + Math.random() * 0.1) : 0,
expenses: totalExpenses * (0.9 + Math.random() * 0.2)
```
The Cash Flow chart renders fictional numbers that randomly mutate between renders. For a financial intelligence module, **showing users invented financial history is a trust-destroying defect**. A user who opens their dashboard, sees a cash flow chart with numbers that don't match their actual records, and then refreshes to see different numbers will immediately lose confidence in the entire module.

**Fix:** Chart data must be derived exclusively from `profile.transactions`. Show an empty-state chart with a "Log transactions to see your real cashflow history" message when no real data exists. Never use `Math.random()` in financial visualization.

---

### 🔴 CRITICAL: Hardcoded Mock Events in Cash Flow and Debt Views
**`LedgerDashboard.tsx`, lines 517–538, 570–590:**
```html
<p>Budget Created</p>  <p>+ $500</p>  <p>2 days ago</p>
<p>Goal Progress</p>   <p>+ 15%</p>  <p>5 days ago</p>
<p>Debt Payment</p>    <p>- $250</p>  <p>3 days ago</p>
<p>APR changed to 15.5%</p>
```
These are **hardcoded strings that impersonate real user data**. A user with no debt will see a "Debt Payment -$250" event from "3 days ago" that they never made. This is UI fiction presented as financial fact — a regulatory and trust liability.

**Fix:** Remove all hardcoded mock events immediately. Replace with `EmptyState` components linked to the transaction log.

---

### 🔴 CRITICAL: `useMemo` Contains Side Effect in `LedgerWorkspace.tsx`
**Lines 240–263:**
```typescript
useMemo(() => {
  // ...calculates categorySpending...
  if (hasChanges) {
    onUpdateProfile({ budgetCategories: updatedCategories } as any); // SIDE EFFECT IN MEMO
  }
}, [transactions, budgetCategories, onUpdateProfile]);
```
`useMemo` is a pure computation hook — calling `onUpdateProfile` inside it creates a **state mutation during render**, which React's StrictMode will execute twice. This can trigger infinite re-render loops when transaction data changes, causing the app to lock up. This is a fundamental React violation.

**Fix:** Move this logic to a `useEffect` with a proper dependency array and a `prevBudgetCategories` ref guard.

---

### 🔴 CRITICAL: `as any` Type Casts for Core Data Structures
**`LedgerWorkspace.tsx`, lines 88–89, 98–99, 168–169, 203–205:**
```typescript
onUpdateProfile({ transactions: [...transactions, newTransaction] } as any);
onUpdateProfile({ budgetCategories: updatedCategories } as any);
onUpdateProfile({ financialGoals: [...financialGoals, newGoal] } as any);
```
`transactions`, `budgetCategories`, and `financialGoals` are the **primary operational data** of the Ledger module, yet they are stored by bypassing the type system entirely. `LedgerIntakeProfile` has no typed fields for these objects. This means:
- TypeScript cannot catch data corruption
- `normalizeLedgerProfile` in `ledger-intake-service.ts` will silently drop all transactions on reload (it only normalizes the known typed fields)
- AI actions that attempt to read transactions via typed accessors will get undefined

**Fix:** Add `transactions?: Transaction[]`, `budgetCategories?: BudgetCategory[]`, `financialGoals?: FinancialGoal[]` as typed first-class fields in `LedgerIntakeProfile`. Update `normalizeLedgerProfile` to normalize these arrays.

---

### 🔴 HIGH: Fast-Track Form Creates Zero-Amount Financial Records
**`LedgerOnboarding.tsx`, lines 137–148:**
```typescript
const fixedExpenses = fastFixedExpenses.trim()
  ? fastFixedExpenses.split(',').map((s, i) => ({
      id: `ft-fix-${i}`, label: s.trim(), amount: 0 // ← ALL AMOUNTS ARE ZERO
    })).filter(e => e.label)
  : [];
```
If a user types `rent, insurance, utilities` in the fixed expenses field and clicks Execute, they get a profile with 3 fixed expenses all set to `amount: 0`. The dashboard then shows **$0 total expenses**, a **100% net savings rate**, and the AI advisor will generate advice based on completely wrong financial data. The form collects expense *labels* but silently discards all amount information.

**Fix:** See Section 4 for full redesign of the fast-track form.

---

### 🟡 HIGH: Random Color Generation for Budget Categories
**`LedgerWorkspace.tsx`, line 179 and 202:**
```typescript
color: `#${Math.floor(Math.random()*16777215).toString(16)}`
```
This can generate colors like `#0a0b0c` (nearly black, invisible on dark background), `#ffffff` (white on white), or colors that fail WCAG 4.5:1 contrast requirements. The hex string can also be shorter than 6 characters (e.g., `#1a3`), potentially breaking CSS color rendering.

**Fix:** Use a fixed accessible color palette (already partially defined in `CATEGORY_COLORS` array in `BudgetPlanner.tsx`). Assign colors by rotating through that array by index: `CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]`.

---

### 🟡 HIGH: AIFinancialAdvisor "Quick Wins" are Hardcoded Fiction
**`AIFinancialAdvisor.tsx`, lines 271–290:**
```typescript
<OptimizationTip title="Review subscriptions" savings={50} ... />
<OptimizationTip title="Meal planning" savings={120} ... />
<OptimizationTip title="Energy efficiency" savings={35} ... />
```
These $50, $120, $35 savings figures are hardcoded regardless of the user's income, subscription total field, or actual expense categories. A user with $10,000/month income will see the same "save $50" suggestion as someone with $1,200/month. Worse, `savings` is rendered as `+{currency} {savings}` — concatenating currency code and raw number without `formatCurrency` formatting.

**Fix:** Derive "Quick Wins" from the user's actual `extensionValues` (e.g., `subscription_total` field), variable expenses above threshold, and `FieldsTab` values. Remove hardcoded dollar amounts.

---

### 🟡 MEDIUM: Duplicate SectionHeader Rendering
Both `LedgerPage.tsx` (line 279–285) and `LedgerDashboard.tsx` (line 121–126) render a `SectionHeader` with `title="Financial Command Center"` and `label="Resource Control"`. On the dashboard tab, the user sees this header **twice** — once from the page layout and once from the dashboard component. This doubles the visual noise and wastes screen real estate.

**Fix:** Remove the `SectionHeader` from `LedgerDashboard.tsx`. The page-level header belongs only in `LedgerPage.tsx` / `LedgerContent`.

---

### 🟡 MEDIUM: Missing `LedgerEvent` Type Import
**`LedgerDashboard.tsx`, line 102:**
```typescript
const [recentEvents, setRecentEvents] = useState<LedgerEvent[]>([]);
```
`LedgerEvent` is used as a TypeScript generic but is not imported anywhere visible in the file. This either causes a compile error or there is a global type pollution allowing this to accidentally compile. The `LedgerSpineEventType` in `ledger-field-actions.ts` is a `string` union, not an event shape — a proper `LedgerEvent` interface is missing entirely.

---

### 🟡 MEDIUM: FAB Coordination with Workspace Tab
The `+` FAB in `LedgerContent` is only rendered when `activeMainTab === 'workspace'` (line 219), but the FAB appears in the `SingleAgentLayout`'s `primaryAction` slot — which is likely positioned as a floating element overlapping the AI chat sidebar. Users on mobile will find the FAB competing with the chat input affordance. When `activeMainTab === 'dashboard'`, there is no way to quick-add a transaction — a user on the dashboard has to navigate to workspace and then find the Add button, which is an unnecessary journey.

---

## 3. Missing UI Components

### 🔴 Spending Category Donut Chart
Despite `PieChart` being imported as an icon in multiple places and `PieChartIcon` appearing in imports, there is no actual donut/pie chart for category spending breakdown. The `BudgetPlanner` only shows `ProgressRow` bars. A donut chart showing % allocation vs. % spent by category is the **single most important financial visualization** for a budget module — it allows instant visual identification of overspending categories.

**Needed:** `SpendingDonutChart` component using the `BudgetCategory[]` array, showing allocated (outer ring) vs. spent (inner ring), with category color coding.

---

### 🔴 Spending Timeline Heatmap
There is no calendar or timeline view for spending patterns. Users cannot see "I always overspend on Fridays" or "my rent cleared on the 1st." A GitHub-style weekly heatmap or month-calendar view colored by daily spend intensity is essential for behavioral financial coaching.

**Needed:** `SpendingHeatmap` component in the Workspace tab or a new "Insights" tab.

---

### 🔴 Net Worth Snapshot Panel
The `FieldsTab` has a `net-worth` extension field, but there is no derived, auto-calculated Net Worth panel that sums (assets) - (liabilities). Users must manually enter net worth as a single number. The module has all the pieces: `monthlyIncome`, `debtItems[].balance`, `savingsGoals[].targetAmount`, extension fields for assets — but no view that synthesizes them into a balance-sheet-style snapshot.

**Needed:** `NetWorthSnapshot` component on the Dashboard overview, showing Assets / Liabilities / Net Worth in a simple 3-column layout.

---

### 🔴 AI Activity Feed / Audit Log
In Power User mode, the AI will autonomously create transactions, update budgets, and modify goals. There is currently no UI showing what the AI has done on the user's behalf. A user who returns to the app after the AI has processed a bank statement has no way to see "AI added 12 transactions from your Chase statement at 3:14 PM." This creates a trust deficit — the user cannot verify AI actions without re-reading the entire chat history.

**Needed:** `AIActivityFeed` component (accessible from the Dashboard) that surfaces recent AI-initiated profile mutations, each with a timestamp, action description, and a "undo/review" affordance.

---

### 🔴 Tax Category Summary Panel
`TaxCategory` type is defined (`'essential' | 'deductible' | 'discretionary' | 'investment' | 'non-deductible' | 'partial' | 'unknown'`) and `BudgetLineItem` has a `taxCategory` field, but there is **zero UI** for tax category visualization or filtering. Given that users can assign tax categories to expenses, they should be able to see a "Potentially Deductible Expenses This Year: $4,200" summary panel, especially during Q4 or tax season. See Section 9 for full design.

---

### 🟡 Recurring Transaction Manager
The `Transaction` interface has `recurring?: boolean` and `recurringFrequency` fields. They are captured in the form but there is no view that shows "upcoming recurring transactions this month," no automation that posts them, and no warning when a recurring transaction is due but hasn't appeared. The data model supports this feature; the UI does not.

**Needed:** `RecurringTransactionsPanel` — a list view of all `recurring: true` transactions with next-due-date, amount, and a "skip this month" affordance.

---

### 🟡 Budget vs. Actual Comparison Table
The `BudgetPlanner` shows `ProgressRow` bars for each category but there is no side-by-side monthly comparison table (Budget | Actual | Variance | %). This is the standard format for financial review meetings and personal finance apps. Users planning quarterly reviews need this tabular view.

---

### 🟡 Goal Timeline Visualization
`GoalTracker` calculates `monthsToComplete` but displays it only as text ("8 months left"). A visual timeline showing current date, expected completion date, and target date as a Gantt-like strip would dramatically improve goal engagement. The milestones array exists in the data model — milestone markers should appear on this timeline.

---

### 🟡 Debt Payoff Comparison Strategy View
The `DebtPayoffTracker` shows a single aggregate balance trend (using fake data). Users with multiple debts need a comparison view showing **Avalanche** (highest APR first) vs. **Snowball** (lowest balance first) payoff strategies — both projected timelines on the same chart — to make an informed decision. The `DebtItem.apr` field already exists for this calculation.

---

### 🟡 Onboarding Completion Progress Indicator
When a user completes fast-track onboarding with partial data (no expense amounts, no debt balances), there is no "profile completeness" indicator to guide them to fill in the gaps. The dashboard should show a "Your profile is 40% complete — add expense amounts to improve AI accuracy" banner with specific fields identified.

---

## 4. Form & Field UX Critique

### Fast-Track Form in `LedgerOnboarding.tsx` — Rating: 3/10

**What's wrong:**

1. **Currency is a free-text input.** A user can type "dollars," "us dollar," "USD $," or leave it as "USD." The form only calls `.toUpperCase()`, which will accept any string. Should be a searchable `<select>` with ISO 4217 currency codes and common names (USD — US Dollar, EUR — Euro, GBP — British Pound, etc.), with a search filter.

2. **Expense fields accept comma-separated labels but discard all amounts.** The placeholder "Fixed expenses (e.g., rent, insurance)" implies the user should list names. The parsed items all get `amount: 0`. This is the single biggest onboarding data quality failure. The downstream dashboard, AI advisor, and budget planner will all be calibrated against $0 expenses.

   **Redesign:** Replace the single comma-separated input with a dynamic tag+amount row builder:
   ```
   [Rent] [$1,200]  [×]
   [Insurance] [$150]  [×]
   [+ Add Fixed Expense]
   ```
   If you must keep the fast-track as a single input for speed, change the placeholder to:
   `"rent:1200, insurance:150, utilities:80"` — a `label:amount` pattern that can be parsed.

3. **Debt field captures only names, not balances.** `fastDebt.split(',').map((s, i) => ({ balance: 0, minPayment: 0 }))` — same problem. A debt with balance $0 has zero impact on financial friction calculations.

4. **No inline validation feedback.** The only validation is `!fastCurrency.trim() || !fastIncome.trim()` for the button disable. If income is entered as "5k" or "five thousand," `parseFloat("5k")` returns `NaN`, the form shows no error, and the button stays disabled with no explanation. The error only shows if `Number.isFinite(income)` fails — but `parseFloat("5k")` returns `NaN` before that check.

5. **No currency symbol preview.** The income field says "Monthly Income" but shows no currency symbol. After typing income, user has no visual confirmation they've selected the right currency.

6. **"Execute" button label is too technical.** On a financial form for a general user, "Execute" reads as a command in a database tool. Use "Get Started" or "Begin Planning."

7. **`Planning Horizon` label is 9px text in `white/40` (ultra-light).** `text-[9px] text-white/40 uppercase` is approximately 7px rendered on mobile — below the WCAG minimum readable size and almost certainly below 3:1 contrast ratio on a dark background.

---

### Transaction Form in `TransactionManager.tsx` — Rating: 6/10

**What works:**
- Uses `DynamicFormBuilder` with `FieldSchema` — correct pattern
- Date defaults to today, type defaults to expense — sensible
- Recurring frequency conditional on `recurring: true` — good

**What's wrong:**

1. **No amount sign convention clarity.** Should users enter expenses as positive or negative numbers? The form schema has `validation: { min: 0.01 }` (positive only), and `type: income/expense` controls the sign. This is correct, but there's no helper text explaining it. New users often expect to enter "-$50" for expenses and will be confused when the validation rejects it.

2. **Category is a pre-populated `<select>` from profile expenses + 6 defaults.** If the user has no profile expenses yet (fast-track onboarding with empty fields), they only get `['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Other']`. A transaction for "Netflix" has no logical mapping. There should be a "New category..." option that creates a budget category simultaneously.

3. **No merchant/payee field.** The `description` field serves both as payee name and notes. This makes it impossible to aggregate "all transactions from Amazon" unless the user consistently types the exact same string. A separate `merchant` field (with autocomplete from transaction history) would enable meaningful aggregation.

4. **No attachment/receipt field.** Given the module already has vision document analysis via camera, a transaction should support an attached receipt image.

5. **Tags field is defined in the interface but not in the form schema.** `Transaction.tags?: string[]` exists but is not in `TRANSACTION_SCHEMA.coreFields`. Tags would enable powerful filtering and tax categorization.

6. **CSV import has no column mapping UI.** The import assumes exact column order: `date, description, amount, type, category`. Any bank export will have different column names and orders. There is no error feedback when import fails silently (if `date`, `description`, or `amount` are missing from a line, the transaction is simply skipped with no user notification).

---

### Budget Planner Form in `BudgetPlanner.tsx` — Rating: 5/10

**What works:**
- Template picker (50/30/20, 70/20/10, Zero-Based) is a good UX pattern for onboarding users to budgeting concepts
- Overspending warning detection is correct logic
- Edit modal reuses the same form as add modal — consistent

**What's wrong:**

1. **Template application is destructive with no warning.** `handleApplyBudgetTemplate` replaces ALL existing budget categories with template-generated ones. A user who has spent time customizing their budget will lose all that work by accidentally clicking a template. There is no "Are you sure? This will replace your X current categories" confirmation.

2. **No rollover logic.** The form has no field for "rollover unspent budget to next month" — a common budgeting request. All allocations reset to 0 spent at undefined intervals (there is no month/period tracking in `BudgetCategory`).

3. **New category form lacks percentage-of-income calculator.** When adding a new category, the user enters a raw dollar amount. A helper that shows "This is X% of your monthly income" as they type would be far more useful than a bare number field.

4. **`editingCategory` only updates `allocated` amount, not `name`.** In `handleSubmitCategory` → `onUpdateCategory(editingCategory.id, amount)`, the category name is not updated even though `newCategoryName` is collected in the form. This is a silent data loss bug — renaming a category via the edit modal doesn't work.

5. **`BudgetCategory.color` is not editable.** Once a random color is generated, there's no way for the user to change it. Users who care about visual organization have no control over color assignment.

---

### Goal Tracker Form in `GoalTracker.tsx` — Rating: 6.5/10

**What works:**
- Goal type enum with emoji icons is user-friendly
- Priority + target date + monthly contribution is comprehensive
- Active/Achieved filter tabs are clear
- `getMonthsToCompletion` inline math is immediately actionable

**What's wrong:**

1. **`handleSubmit` has no validation error display.** The guard `if (!formData.name || !formData.targetAmount || formData.targetAmount <= 0) { return; }` silently does nothing if the form is invalid. The user clicks "Save" and nothing happens — no error message, no field highlight, no toast. This is a complete UX dead end, especially frustrating in a modal.

2. **`currentAmount` defaults to 0 but could be pre-populated from linked transactions.** If a user has a goal named "Emergency Fund" and has transactions categorized as "Savings," the system could pre-populate `currentAmount` by summing relevant transactions. Currently, `currentAmount` must be manually entered every time.

3. **Milestone management is invisible.** `FinancialGoal.milestones?: GoalMilestone[]` exists in the type but milestones cannot be created, viewed, or edited via the UI form. The milestone celebration trigger is a comment: `// Trigger celebration!` with no implementation. This is a fully-built data model with zero UI surface.

4. **No goal-to-budget-category linking.** A "Vacation Fund" goal should be linkable to a "Vacation" budget category, so monthly contributions are automatically tracked. Currently these are completely separate systems.

5. **Goal type emoji is decorative and screen-reader invisible.** `<span className="text-lg">{goalType?.icon}</span>` — the emoji is in a `<span>` with no `aria-label` or `role`. Screen readers will either announce it as a raw Unicode sequence or skip it. Since the emoji conveys goal type (e.g., 💳 for debt payoff), it carries semantic meaning that needs `aria-label`.

---

## 5. Data Visualization Gaps

### Current Visualization Status
| Chart | Component | Data Source | Status |
|-------|-----------|-------------|--------|
| Cash Flow Line Chart | `CashFlowChart` | `Math.random()` | 🔴 FAKE DATA |
| Debt Payoff Trend | `DebtPayoffTracker` | Simulated 12% decline | 🔴 FAKE DATA |
| Spending Breakdown | `ProgressRow` bars | `profile.fixedExpenses + variableExpenses` | 🟡 PROFILE ONLY |
| Budget vs. Actual | `ProgressRow` bars | `BudgetCategory.spent` (sum of transactions) | 🟢 REAL DATA |
| Goal Progress | `ProgressRow` bars | `FinancialGoal.currentAmount` | 🟢 REAL DATA |
| Health Score | Custom `HealthScoreBar` | Calculated from ratios | 🟡 STALE CALCULATIONS |

### Missing Visualizations (Priority Order)

**P0 — Spending Category Donut:**
A donut chart showing how the month's budget is allocated by category. Two rings: outer = allocated %, inner = spent %. This is the visual anchor for the entire Budget Planner tab and should appear at the top of `BudgetPlanner.tsx`.

**P0 — Real Cash Flow from Transactions:**
The `CashFlowChart` must be fed real data. Group `transactions[]` by month, sum income and expense transactions per month, pass to the chart. Show the last 6 or 12 months based on `planningHorizon`. An empty state with a 6-month "skeleton" and a "start logging transactions" CTA is correct for new users.

**P1 — Spending Heatmap / Calendar View:**
A calendar grid (12 months × weeks or daily squares) colored by daily spend intensity (green → amber → red). This is the most emotionally resonant visualization for behavioral change — users viscerally see "I spent a lot last weekend."

**P1 — Debt Avalanche vs. Snowball Comparison:**
Two projected lines on a single chart — one showing the Avalanche method (total interest minimized, longer if balances vary), one showing Snowball (psychological wins, slightly more interest). Both calculated from `debtItems[].balance`, `.minPayment`, `.apr`, and the monthly surplus (`monthlyBuffer`). This single chart can trigger high-value AI advisor conversations.

**P1 — Net Worth Over Time:**
A running total of (total assets) - (total liabilities) plotted monthly. Requires storing historical snapshots (a new `netWorthHistory: { date: string; value: number }[]` field on `LedgerIntakeProfile`).

**P2 — Income vs. Expense Waterfall Chart:**
A waterfall chart showing: Monthly Income → Fixed Expenses out → Variable Expenses out → Savings In → Net Buffer. This is the single most intuitive representation of where money goes and is superior to the current bar/line chart for financial storytelling.

**P2 — Goal Progress Timeline (Gantt):**
For each active goal: a horizontal bar from `createdAt` to projected `completionDate`, with `targetDate` marked as a deadline. Milestone markers on the bar. Color codes goals that are behind their target date in amber/red.

**P2 — Tax Deductible Expense Treemap:**
Grouped by `TaxCategory`, sized by amount. Lets users immediately see which expense categories represent deductible potential. See Section 9.

---

## 6. Power User Mode Design

### The Problem
Currently, the Ledger module has **no visual distinction** between:
- A user manually editing data via forms
- The AI autonomously creating/updating transactions, goals, and budgets from conversation or document uploads

When the AI processes a bank statement and adds 47 transactions, the user sees the chat message and then… the transaction list updates silently. There's no "Here's what I just did" surface. This is fine for an expert user who trusts the AI implicitly, but it's a trust and discoverability problem for new users.

### Design Vision for AI-Driven Mode

**1. AI Activity Ribbon (Top of Workspace)**
When `plannerBotState === 'active'`, show a non-dismissable ribbon at the top of `LedgerWorkspace`:
```
┌──────────────────────────────────────────────────────────┐
│  🤖  LEDGER is in autopilot · 3 transactions added today  │
│  [View Changes]  [Pause AI Updates]                       │
└──────────────────────────────────────────────────────────┘
```
This ribbon is cyan-themed (`bg-cyan-500/10 border-cyan-500/30`) and signals to the user that the AI is actively managing their data.

**2. AI-Attribution Badges on Records**
Any transaction, budget category, or goal created or modified by the AI should carry a small `AI` badge:
```
┌─────────────────────────────────────────────────┐
│  Grocery Store      $82.50   Groceries   🤖 AI  │
│  Apr 14, 2025                                   │
└─────────────────────────────────────────────────┘
```
Implemented by adding `source?: 'user' | 'ai' | 'import'` to `Transaction`, `BudgetCategory`, and `FinancialGoal` interfaces. AI-sourced records display a `[AI]` chip with a violet background, user-sourced records show nothing (default).

**3. Pending Review Queue**
When the AI extracts transactions from a document upload, instead of immediately committing all records, surface a **Review Queue** panel:
```
┌─────────────────────────────────────────────────────────┐
│  📋  12 transactions extracted from Chase statement      │
│                                                          │
│  ✓  Apr 01  Rent             $1,400   Housing            │
│  ✓  Apr 03  Whole Foods      $87.32   Groceries          │
│  ✓  Apr 05  Netflix          $15.99   Subscriptions      │
│  ?  Apr 07  VZWRLSS *UNK     $64.00   [uncategorized ▾]  │
│  ✓  Apr 09  Exxon Mobil      $45.00   Transportation     │
│                                                          │
│  [Commit All]  [Review Each]  [Discard]                  │
└─────────────────────────────────────────────────────────┘
```
- Green checkmarks = AI is confident in category assignment
- Yellow `?` = AI is uncertain; user must categorize before commit
- Category is editable inline before commit
- "Commit All" does what `handleDocReviewCommit` currently does (but with real structured data)
- "Review Each" steps through uncertain transactions one at a time

**4. AI Suggestion Chip in Transaction List**
When the AI detects a transaction is similar to a past pattern (e.g., "you spend ~$80 at Whole Foods every Tuesday"), show a chip in the list: `💡 AI noticed a pattern — create a recurring template?` This bridges the gap between transaction logging and recurring automation.

**5. Smart Empty States**
When the module is in `plannerBotState === 'active'` and a section is empty, the empty state should differ:
- Manual mode: "No transactions yet. Click + to add one."
- AI mode: "Waiting for your next bank statement or chat message. Drop a PDF here or tell me about a purchase."

---

## 7. Mobile Considerations

### Current Mobile Status
`LedgerPage.tsx` uses `px-4 md:px-8`, `pt-4 md:pt-8` — responsive padding exists. The FAB button `w-12 h-12` is touch-friendly. The toolbar buttons use `p-1.5 md:p-2` — reasonably sized. However, deeper components are not mobile-optimized.

### Critical Mobile Issues

**1. Workspace Tab Bar Overflows on Small Screens**
`LedgerWorkspace.tsx` renders 4 tabs (`Transactions`, `Budget Planner`, `Goals`, `Fields`) as inline buttons. On a 375px iPhone SE, these tabs will overflow horizontally or compress to unreadable sizes. No `overflow-x-auto` is present.

**Fix:** Convert to a scrollable tab row: `overflow-x-auto flex gap-1 no-scrollbar`, or use a compact icon-only mode below `sm:` breakpoint.

**2. Transaction Table is Unreadable on Mobile**
The transaction list in `TransactionManager.tsx` renders date, description, amount, type, and category in a horizontal layout. At 375px, this is guaranteed to either overflow or squish text below readability. There's no mobile-specific card layout.

**Fix:** At `< sm` breakpoint, render each transaction as a card:
```
┌────────────────────────────────────┐
│ Grocery Store         Apr 14       │
│ Groceries          - $82.50 ●      │
└────────────────────────────────────┘
```

**3. No Bottom Sheet for Quick-Add Transaction**
The FAB opens a full `NeuralModal`. On mobile, the modal animation and full-screen keyboard interaction is clunky. A **bottom sheet** that slides up from the bottom is the native mobile pattern for quick-add forms.

**Quick-Add Bottom Sheet Design:**
```
┌─────────────────────────────────────┐ ← drag handle
│          Add Transaction            │
├─────────────────────────────────────┤
│  [Income] [Expense]                 │
│  $  ________________________        │ ← large number input
│  Description: ________________      │
│  Category: [Groceries ▾]           │
│  Date: [Today ▾]                   │
├─────────────────────────────────────┤
│         [Add Transaction]           │
└─────────────────────────────────────┘
```
This is a 3-field form (amount, description, category) — the minimum viable transaction. Advanced fields (recurring, tags, notes) go in an "Advanced" expandable section.

**4. GoalTracker Stats Row is a 4-Column Grid on Mobile**
`GoalTracker.tsx` line 189: `grid grid-cols-4 gap-4` — 4 equal columns on a 375px screen gives each stat card ~85px width, which cannot fit a 2-digit number + label. Each card's `text-2xl font-black` numbers will overflow.

**Fix:** `grid grid-cols-2 gap-3 sm:grid-cols-4`.

**5. Fast-Track Form's 2-Column Grid**
`grid grid-cols-1 sm:grid-cols-2` — this is correct! One of the few mobile-responsive implementations in the module. Keep this.

---

## 8. Accessibility & Clarity

### ARIA & Semantic HTML Failures

**1. Custom Tab Implementations Lack Full ARIA Role Management**
Both `LedgerWorkspace.tsx` and `LedgerDashboard.tsx` implement tabs as plain `<button>` elements with no `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, or `tabpanel` associations. Screen reader users cannot navigate the tabs using the standard Tab/Arrow key keyboard pattern. WCAG 2.1 AA requires `role="tablist"` on the container and `role="tab"` on each tab button.

**Fix:**
```html
<div role="tablist" aria-label="Financial workspace sections">
  <button role="tab" aria-selected={activeTab === 'transactions'} 
          aria-controls="panel-transactions" id="tab-transactions">
    Transactions
  </button>
</div>
<div role="tabpanel" id="panel-transactions" aria-labelledby="tab-transactions">
  ...
</div>
```

**2. Goal Type Emoji Has No Text Alternative**
`<span className="text-lg">{goalType?.icon}</span>` where `icon` is an emoji (💰, 💳, 📈, 🏠, 🎯). Emojis convey semantic meaning here (goal type). Screen readers will read raw emoji descriptions ("money bag", "credit card") which may be confusing but better than silence. Add `aria-label` on the span matching the goal type label.

**3. Progress Bars Lack `aria-valuenow` / `aria-valuemin` / `aria-valuemax`**
`ProgressRow` component appears to be a shared component, but the inline progress bars in `BudgetPlanner.tsx` and `GoalTracker.tsx` need ARIA attributes on the progress element for screen readers to announce meaningful values (e.g., "Groceries: 72% of budget used").

**4. AIFinancialAdvisor Toggle Button Missing `aria-expanded`**
The expand/collapse button for the advisor panel (line 144–170) has no `aria-expanded` attribute. Screen readers cannot announce the panel's current state.

**5. Icon-Only Toolbar Buttons in `LedgerPage.tsx`**
The Camera, FileUp, and FolderOpen buttons (lines 296–298) have no `aria-label`. They have tooltips via `title` attributes, but `title` is not reliably announced by screen readers and provides no keyboard context.
```tsx
// Current (inaccessible)
<button onClick={() => setIsCaptureModalOpen(true)} className="...">
  <Camera size={14} />
</button>

// Fixed
<button onClick={() => setIsCaptureModalOpen(true)} aria-label="Capture financial document with camera" className="...">
  <Camera size={14} aria-hidden="true" />
</button>
```

**6. Delete Buttons Have No Confirmation Warning for Screen Readers**
In `TransactionManager.tsx` and `GoalTracker.tsx`, delete buttons have no `aria-label` describing what will be deleted. An `aria-label` of just "Delete" on every delete button is ambiguous — it should be "Delete transaction: Grocery Store $82.50" or "Delete goal: Emergency Fund."

**7. Color as the Only Error Indicator**
In `BudgetPlanner.tsx`, overspending is indicated solely by the red/amber color of the `ProgressRow`. There is no text label or icon indicating overspend status. WCAG 1.4.1 requires that information conveyed by color also be conveyed by other means.

### Label, Help Text & Error State Assessment

| Component | Has Labels | Has Help Text | Has Error States | Score |
|-----------|-----------|---------------|------------------|-------|
| Fast-Track Form | Placeholder only | None | Partial (text below button) | 3/10 |
| Transaction Form | Yes (via DynamicFormBuilder) | None | Yes (`formErrors`) | 6/10 |
| Budget Category Form | Placeholder only | None | Silent fail | 4/10 |
| Goal Form | Placeholder only | None | Silent fail | 3/10 |
| FieldsTab | Good (from field-templates) | `helpText` field used | Unknown | 7/10 |

**Fast-Track Error Display (line 417–419):**
```html
{fastTrackError && <p className="text-[10px] text-rose-300">{fastTrackError}</p>}
```
`text-[10px]` is below minimum readable size. Error text must be at least `text-sm` (14px). The generic messages "Fast-track validation failed. Continue with guided onboarding" give no actionable information about what was invalid.

### Cognitive Load Issues

**"Resonance ROI" StatCard on Dashboard:**
The label "Resonance ROI" is shown to all users as a primary KPI with no explanation. This is Nexus-internal terminology. A tooltip or info icon with "Resonance ROI measures the alignment between your financial effort and life goals — higher is better" is required.

**"Planner state: ACTIVE" text:**
`LedgerDashboard.tsx` line 485 displays `plannerBotState` value uppercased: "Planner state: IDLE", "Planner state: ACTIVE". This is developer state notation, not user language. Replace with: "Your AI planner is active and optimizing" / "AI planner is waiting for more data."

**"FINANCE_BASELINE" status badge:**
In `LedgerOnboarding.tsx`, `statusLabel="FINANCE_BASELINE"` appears on the `GuidedIntakeFrame`. This is a system identifier, not a user-meaningful label. Replace with "Setting Up Your Profile" or "Step 1 of 4 · Income & Currency."

---

## 9. Tax & Accounting UX

### Current State
`TaxCategory` is defined in `ledger-intake-service.ts` and `BudgetLineItem` has a `taxCategory` field. That is where tax support ends. There is no tax UI whatsoever.

### What a Tax Review UI Needs

**1. Tax Category Assignment in Transaction Form**
The `TransactionManager` transaction form should have an optional `taxCategory` select field (from `TaxCategory` enum). During entry, users flag transactions as `deductible`, `non-deductible`, `partial`, etc. The AI should auto-suggest tax categories based on merchant and description (e.g., "Amazon Web Services → business deductible," "Starbucks → partial deductible if business meeting").

**2. Tax Summary Panel on Dashboard (Seasonal)**
A collapsible `TaxSummaryPanel` component — always present but collapsed by default, with prominence that increases in Q4 and January–April:

```
┌───────────────────────────────────────────────────────────┐
│  📋  Tax Year 2025 Summary          [View Details]  [▾]   │
├───────────────────────────────────────────────────────────┤
│  Potentially Deductible Expenses      $4,840              │
│  Non-Deductible Expenses             $18,200              │
│  Partial / Under Review               $1,200              │
│  Unclassified Expenses                $3,100 ⚠️           │
│                                                           │
│  [Ask AI to classify remaining expenses]                  │
└───────────────────────────────────────────────────────────┘
```

**3. Deductible Expense Treemap**
A treemap where each block represents an expense category, sized by total annual amount, colored by tax category:
- 🟢 Green = Fully deductible
- 🟡 Amber = Partially deductible / under review
- 🔴 Red = Non-deductible
- ⬜ Gray = Unclassified

This gives users an instant visual sense of their tax optimization opportunity.

**4. AI Tax Assistant Prompts**
In the AI chat sidebar, when the user is in `Q4` or during Jan–April, the greeting message should include a tax-aware prompt: "It's tax season. I can help classify your expenses for deductions. Want me to review your unclassified transactions?" This requires a seasonal greeting injection in `LedgerContent`'s initial message effect.

**5. Export for Accountant**
A "Tax Export" button that generates a CSV filtered to `taxCategory === 'deductible' || 'partial'` for the selected tax year. This is a one-function addition to the existing CSV export in `LedgerWorkspace.tsx`. The current export is an all-transactions dump; a tax-filtered export is the accountant-friendly version.

**6. Tax Category Help Text**
The 7-value `TaxCategory` enum (`essential | deductible | discretionary | investment | non-deductible | partial | unknown`) needs user-facing descriptions. "Deductible" means different things in different jurisdictions. The UI should display:
- A tooltip/popover on each category label
- A small disclaimer: "Tax categorization is for organizational purposes only. Consult a tax professional."
- A link to the country-specific tax guidance if the currency indicates a non-US context

---

## 10. Priority Recommendations

### Top 10 Design Changes in Priority Order

---

**Priority 1 — Fix the 4× Duplicate "Recent Transactions" Block (1-hour fix)**
`LedgerDashboard.tsx` has the same SurfaceCard JSX pasted 4 consecutive times. This is the most visually broken defect in the module. Fix before any other work.

---

**Priority 2 — Remove `Math.random()` and Hardcoded Mock Events from Dashboard (2-hour fix)**
Replace `cashFlowData` with real transaction aggregation. Remove the hardcoded "Budget Created +$500" and "Debt Payment -$250" fake events. Replace with `EmptyState` components. A financially sensitive user who sees invented numbers in their dashboard will never trust the module again.

---

**Priority 3 — Add `transactions`, `budgetCategories`, `financialGoals` as Typed Fields in `LedgerIntakeProfile` (1 day)**
Move these from `as any` casts to first-class typed fields. Update `normalizeLedgerProfile` to handle them. This is the data integrity foundation that makes everything else reliable. Until this is done, transactions can be silently lost on profile reload.

---

**Priority 4 — Fix the `useMemo` Side Effect in `LedgerWorkspace.tsx` (1-hour fix)**
Move the budget category sync logic from `useMemo` to `useEffect`. Add a `useRef` to store previous transaction data to avoid infinite update loops. This is a React correctness issue that can cause production crashes with StrictMode.

---

**Priority 5 — Redesign Fast-Track Expense/Debt Fields to Capture Amounts (3 days)**
Replace comma-separated label inputs with dynamic tag+amount row builders, or parse `label:amount` format. This is the highest impact UX improvement for onboarding data quality. Without expense amounts, all downstream AI advice, budget calculations, and dashboard stats are meaningless.

---

**Priority 6 — Add Real Spending Category Donut Chart to BudgetPlanner (2 days)**
Implement a `SpendingDonutChart` component using `BudgetCategory[]` data. Place it at the top of the BudgetPlanner tab. This is the missing visualization anchor for the entire Budget Planner section and will dramatically increase the value perception of the module.

---

**Priority 7 — Implement AI Activity Feed / Audit Log (3 days)**
Build an `AIActivityFeed` component that surfaces recent AI-initiated profile mutations with timestamps, action descriptions, and undo affordances. This is the trust surface required for Power User mode to work. Without it, AI-driven data entry is opaque and anxiety-inducing.

---

**Priority 8 — Add Full ARIA Role Management to Tab Components (1 day)**
Add `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `aria-label` to both `LedgerWorkspace.tsx` and `LedgerDashboard.tsx` tab implementations. Add `aria-label` to all icon-only buttons. Fix error text font size from `text-[10px]` to `text-sm`. This is a WCAG AA compliance requirement.

---

**Priority 9 — Build Tax Summary Panel + Transaction Tax Category Field (3 days)**
Add `taxCategory` to the transaction form. Build a collapsible `TaxSummaryPanel` for the dashboard showing deductible/non-deductible totals. Add "Tax Export" CSV option. Define a `TaxYear` in `LedgerIntakeProfile` to scope the summary.

---

**Priority 10 — Implement Mobile Bottom Sheet for Quick-Add Transaction (2 days)**
Replace the `NeuralModal` for transaction quick-add with a `BottomSheet` component on mobile viewports. The bottom sheet should be a 3-field form (amount, description, category). This dramatically improves the mobile logging experience which is the primary use case for on-the-go expense tracking.

---

### Effort/Impact Matrix

| Change | Effort | Impact | Priority |
|--------|--------|--------|----------|
| Fix 4× duplicate Recent Transactions block | XS (1hr) | Critical | P1 |
| Remove Math.random() / mock events | S (2hr) | Critical | P1 |
| Type `transactions`/`budgetCategories`/`financialGoals` | M (1d) | Critical | P1 |
| Fix `useMemo` side effect | XS (1hr) | High | P1 |
| Redesign fast-track form with amounts | L (3d) | High | P2 |
| Spending donut chart | M (2d) | High | P2 |
| AI Activity Feed | L (3d) | High | P2 |
| ARIA / accessibility pass | M (1d) | Medium | P2 |
| Tax Summary Panel | L (3d) | Medium | P3 |
| Mobile bottom sheet quick-add | M (2d) | Medium | P3 |
| Real Cash Flow chart from transactions | M (2d) | High | P2 |
| Debt Avalanche/Snowball chart | M (2d) | Medium | P3 |
| Recurring transactions UI | L (3d) | Medium | P3 |
| Budget template destructive action warning | XS (30min) | Medium | P2 |
| Goal form validation error display | XS (30min) | High | P2 |
| Currency ISO dropdown picker | S (4hr) | Medium | P2 |

---

## Appendix: Specific Code Defects Summary

| File | Line(s) | Defect | Severity |
|------|---------|--------|----------|
| `LedgerDashboard.tsx` | 206–386 | Recent Transactions block copy-pasted 4× | 🔴 Critical |
| `LedgerDashboard.tsx` | 84–87 | `Math.random()` in chart data | 🔴 Critical |
| `LedgerDashboard.tsx` | 517–538, 570–590 | Hardcoded fake events | 🔴 Critical |
| `LedgerWorkspace.tsx` | 240–263 | Side effect inside `useMemo` | 🔴 Critical |
| `LedgerWorkspace.tsx` | 88–89, 98–99, 168, 203 | `as any` casts for core data | 🔴 Critical |
| `LedgerOnboarding.tsx` | 137–148 | Expense amounts default to 0 | 🔴 High |
| `LedgerWorkspace.tsx` | 179, 202 | Random hex color generation | 🟡 High |
| `AIFinancialAdvisor.tsx` | 271–290 | Hardcoded "Quick Wins" savings | 🟡 High |
| `AIFinancialAdvisor.tsx` | 339–410 | Health score calculation duplicated | 🟡 Medium |
| `LedgerDashboard.tsx` | 102 | `LedgerEvent` type not imported | 🟡 Medium |
| `LedgerDashboard.tsx` | 121–126 | Duplicate `SectionHeader` | 🟡 Medium |
| `BudgetPlanner.tsx` | 143–148 | Edit modal doesn't update category name | 🟡 Medium |
| `GoalTracker.tsx` | 125–128 | Silent fail on invalid form submit | 🟡 Medium |
| `GoalTracker.tsx` | 161–165 | `// Trigger celebration!` unimplemented | 🟢 Low |
| `LedgerPage.tsx` | 296–298 | Icon buttons missing `aria-label` | 🟡 Medium |
| `LedgerWorkspace.tsx` | 266–286 | Tab buttons missing ARIA roles | 🟡 Medium |

---

*Report generated by the Design Agent. All line numbers reference the file state at the time of audit. This document should be reviewed against any subsequent commits to ensure defects have not shifted.*
