# LEDGER MODULE — PRODUCT STRATEGY REVIEW

> **Author:** PM Agent (Nexus Orchestrator)
> **Date:** 2025
> **Status:** Authoritative — supersedes ad-hoc Ledger feature discussions
> **Scope:** Full product strategy analysis covering feature audit, gap classification, dual-mode vision, AI agent requirements, tax/accounting spec, income complexity, debt management, notifications, reporting, user stories, and MoSCoW prioritization
> **References:** `LedgerPage.tsx`, `LedgerDashboard.tsx`, `LedgerWorkspace.tsx`, `TransactionManager.tsx`, `BudgetPlanner.tsx`, `GoalTracker.tsx`, `FieldsTab.tsx`, `ledger-cross-verification-engine.ts`, `resonance-roi-service.ts`, `personas.ts`, `NEXUS_PRODUCT_DEFINITION.md`, `BACKLOG.md`

---

## PRODUCT VISION STATEMENT

> **Ledger is the user's financial authority** — the one AI that understands money not as numbers in a spreadsheet, but as compressed life energy. It bridges behavioral psychology, cross-domain wellness signals, and hard financial mechanics (debt, tax, cash flow) into a unified picture that adapts to each user's relationship with money. The module UI is an optional control panel; the LEDGER AI agent is the advisor. Users who never open a form get a complete financial picture built for them. Users who obsess over every transaction get a fully autonomous AI that never makes them type a number manually.

**One-sentence product promise:**
*"LEDGER knows where your money is going — and why — even when you don't."*

---

## EXECUTIVE SUMMARY OF FINDINGS

| Area | Status | Severity |
|------|--------|----------|
| Core onboarding (dual path) | Functional, shallow data model | High |
| Dashboard charts | Mock data only — no real aggregation | Critical |
| Transaction manager | Functional CRUD, no AI categorization | High |
| Budget planner | Templates present, no real spend tracking | Critical |
| Goal tracker | Type mismatch (`currentAmount` missing from profile) | Critical |
| Financial Friction / Resonance ROI | Computed, not grounded in real transactions | High |
| Tax tracking | Entirely absent | Critical |
| Multi-income support | Single `monthlyIncome` field only | Critical |
| Investment portfolio | Custom field stub only | High |
| Recurring transaction automation | Flag exists, no scheduler | High |
| Smart alerts | Spine event types defined, no trigger logic | High |
| AI autonomous actions | Plan creation only; no autonomous data writes | Critical |
| Debt strategy simulation | No avalanche/snowball comparison | Medium |
| Financial calendar | Absent | Medium |
| Net worth timeline | Absent | Medium |
| Document Intelligence | Architecture present, extraction → profile update unverified | High |

---

## 1. FEATURE AUDIT: COMPLETENESS SCORECARD

### 1.1 Complete (Shippable As-Is)

| Feature | Component | Notes |
|---------|-----------|-------|
| Guided conversational onboarding | `LedgerOnboarding.tsx` (conversational path) | 4-step AI-guided intake is solid. Default path for passive users. |
| Fast-track onboarding form | `LedgerOnboarding.tsx` (form path) | Captures currency, income, expenses, debt, savings goals, planning horizon. |
| AI Chat (LEDGER persona) | `personas.ts` + `ledger-prompt-builder.ts` | Behavioral economics grounding, NSV cross-module awareness, 4 conversation modes. Well-designed. |
| Financial Friction score | `resonance-roi-service.ts` | Formula: `(1 - bufferRatio) × 6 + debtRatio × 4`. Directionally correct even with profile-only data. |
| Resonance ROI metric | `resonance-roi-service.ts` | Bridges spending alignment and wellness. Unique differentiator. Keep. |
| Budget template definitions | `BudgetPlanner.tsx` | 50/30/20, 70/20/10, Zero-Based templates correctly defined. |
| Extension field schema | `FieldsTab.tsx` | 15-field max, typed (NUMBER/RANGE/SELECT/DATE), category grouped. Architecturally sound. |
| Spine event bus integration | `spine-event-service.ts` | 17 event types. Toast notifications. Firebase cross-module sync. Works. |
| AES-256 profile encryption | `ledger-intake-service.ts` | Firebase + LocalStorage fallback. Encryption at rest confirmed. |
| Document Intelligence architecture | `diagnosis/` | Camera + file upload → vision AI → extraction pipeline. Architecture present. |

### 1.2 Partial (Works But Critically Incomplete)

| Feature | Component | What's Missing |
|---------|-----------|----------------|
| Dashboard stat cards | `LedgerDashboard.tsx` | Income/Expense/Savings pulled from profile, NOT from real transaction aggregation. Numbers are stale onboarding snapshots. |
| Cash flow chart | `LedgerDashboard.tsx` + `FinancialCharts.tsx` | **100% mock data** — 6-month projections with ±10% variance applied to profile income. Never reflects actual transactions. |
| Debt payoff tracker | `LedgerDashboard.tsx` + `FinancialCharts.tsx` | **100% mock data** — projects 12% reduction. No real debt payment entries. |
| Transaction manager | `TransactionManager.tsx` | CRUD works. Missing: AI auto-categorization, bank statement import formats, real aggregation feeding dashboard. |
| Budget planner | `BudgetPlanner.tsx` | Templates calculate target allocations from income. Missing: actual spend vs budget comparison using real transaction data. |
| Goal tracker | `GoalTracker.tsx` | Goal creation, milestones work. **Type mismatch:** `SavingsGoal` in profile missing `currentAmount`. Progress % is therefore broken or computed incorrectly. |
| Financial Friction score | `resonance-roi-service.ts` | Directionally correct but formula uses only `bufferRatio` and `debtRatio` from profile snapshot — ignores actual transaction behavior, spending velocity, or overspending frequency. |
| AI financial advisor panel | `AIFinancialAdvisor.tsx` | Shows 3 auto-generated insights. Insights are static rule-based text, not dynamically derived from real transaction data. |
| Plans | `LedgerPage.tsx` (plannerBotState) | Plan creation via AI works. Plans have allocation and tasks. Missing: plan progress tracking against real spend, plan-to-budget linkage. |
| Document Intelligence → Profile | `diagnosis/` | Extraction pipeline architecture exists. Unclear if extracted data (amounts, categories) actually writes back to the `LedgerIntakeProfile` atomically. Verification needed. |
| Recurring transactions | `TransactionManager.tsx` | `isRecurring` flag on transaction exists. Missing: automated scheduling, next-due-date tracking, auto-creation of future entries. |

### 1.3 Stub (UI Shell, No Meaningful Function)

| Feature | Component | Current State |
|---------|-----------|---------------|
| Net worth tracking | `FieldsTab.tsx` (custom field suggestion) | A suggested field. No timeline, no computed aggregation. |
| Tax liability | `FieldsTab.tsx` (custom field suggestion) | A number field suggestion. No categorization, no computation, no planning. |
| Investment portfolio | `FieldsTab.tsx` (custom field suggestion) | A number field. No positions, no performance, no allocation. |
| Smart alerts | `spine-event-service.ts` | Event types defined (RISK_DETECTED, GOAL_PROGRESS). No trigger conditions, no threshold monitoring, no scheduler. |
| Financial calendar | Not present | No component, no data model. |
| Spending trend charts | Not present | Charts exist only as mock projections. No historical spend-by-category. |
| Debt strategy comparison | `ledger-cross-verification-engine.ts` (snowball hint) | Engine has logic hints but no avalanche vs snowball simulation UI. |
| Multi-income sources | `LedgerIntakeProfile` | Single `monthlyIncome: number`. No income source array. |

---

## 2. CRITICAL GAPS — WHAT MAKES THE PRODUCT FEEL BROKEN TODAY

These are issues that would cause a real user to lose trust in the product within their first week.

### GAP-01 — Dashboard Shows Fictional Numbers (BLOCKER)
**Component:** `LedgerDashboard.tsx`, `FinancialCharts.tsx`
**Impact:** A user adds 20 transactions in `TransactionManager`. The dashboard stat cards and cash flow chart are completely unchanged. The user correctly concludes the app is broken.
**Required Fix:** Transaction aggregation pipeline — sum transactions by type/period → feed into dashboard metrics. This is the single most important technical fix in the entire module.

### GAP-02 — Goal Tracker Progress is Broken (BLOCKER)
**Component:** `GoalTracker.tsx`, `LedgerIntakeProfile`
**Impact:** `SavingsGoal` type in profile is missing `currentAmount`. Progress percentage either shows 0% or NaN for every goal. This is visible to every user who creates a goal.
**Required Fix:** Add `currentAmount: number` to `SavingsGoal` profile type. Add a mechanism to update it (manual entry + AI action + transaction auto-tagging to goal).

### GAP-03 — Budget Planner Has No Actual vs. Target Comparison (BLOCKER)
**Component:** `BudgetPlanner.tsx`
**Impact:** User sets a "Food: $400" budget. User spends $623 on food that month. The budget planner shows "Food: $400" forever. It is a static target sheet, not a budget.
**Required Fix:** Transaction-to-budget-category mapping. Real spend aggregation per category per period, displayed alongside budget targets.

### GAP-04 — AI Cannot Autonomously Write Financial Data (CRITICAL)
**Component:** `ledger-prompt-builder.ts`, AI action handlers
**Impact:** LEDGER AI can create plans and update friction scores but cannot autonomously add transactions, update goal progress, categorize spending, or update budget tracking. This makes the "power user mode" (voice/photo only) impossible.
**Required Fix:** Implement AI action handlers for: `add_transaction`, `update_goal_progress`, `categorize_transaction`, `add_income_source`, `set_budget_actual`.

### GAP-05 — No Real Spending Trends (HIGH)
**Component:** Dashboard, `FinancialCharts.tsx`
**Impact:** User cannot see if their restaurant spending went up 40% this month. The product claims to be a financial intelligence layer but has no time-series analysis of actual behavior.
**Required Fix:** Spending-by-category per month chart using real transaction data. Rolling 3-month and 6-month comparisons.

### GAP-06 — Single Income Field Breaks Reality for Majority of Users (HIGH)
**Component:** `LedgerIntakeProfile`, `LedgerOnboarding.tsx`
**Impact:** Freelancers, gig workers, people with rental income, side businesses — a large segment of the target market — cannot accurately represent their income. Financial Friction and Resonance ROI become meaningless.
**Required Fix:** Replace `monthlyIncome: number` with `incomeSources: IncomeSource[]`.

---

## 3. HIGH-VALUE MISSING FEATURES — RANKED BY IMPACT vs. COMPLEXITY

| Rank | Feature | User Impact | Build Complexity | Priority Score |
|------|---------|-------------|-----------------|----------------|
| 1 | Transaction → Dashboard aggregation pipeline | 🔴 Critical | Medium | P0 |
| 2 | AI autonomous transaction writing (`add_transaction` action) | 🔴 Critical | Medium | P0 |
| 3 | Goal tracker `currentAmount` type fix + update mechanism | 🔴 Critical | Low | P0 |
| 4 | Budget actual vs. target comparison (real spend) | 🔴 Critical | Medium | P0 |
| 5 | Multi-income source data model | 🟠 High | Low | P1 |
| 6 | AI transaction auto-categorization | 🟠 High | Medium | P1 |
| 7 | Smart alerts (overspending, goal deadline, bill due) | 🟠 High | Medium | P1 |
| 8 | Spending trend charts (real data, by category) | 🟠 High | Medium | P1 |
| 9 | Debt avalanche/snowball simulation | 🟡 Medium | Medium | P2 |
| 10 | Tax category tagging on transactions | 🟡 Medium | Low | P2 |
| 11 | Tax year summary + estimated liability | 🟡 Medium | High | P2 |
| 12 | Recurring transaction automation (scheduler) | 🟡 Medium | Medium | P2 |
| 13 | Net worth timeline chart | 🟡 Medium | Medium | P2 |
| 14 | Financial calendar | 🟡 Medium | Medium | P3 |
| 15 | Bank statement import (OFX/QFX/PDF) | 🟡 Medium | High | P3 |
| 16 | Investment portfolio tracking | 🟡 Medium | High | P3 |
| 17 | Retirement planning module | 🟢 Low | Very High | P4 |

---

## 4. DUAL-MODE FEATURE REQUIREMENTS

The defining product concept of Ledger is that **both extremes of user engagement must produce the same quality of financial picture**. This requires deliberate feature design for each mode.

### 4.1 Validation/Onboarding Mode (The Passive User)

**User profile:** Never opens a form. Answers AI questions when prompted. Wants a financial picture with zero manual data entry effort.

**Required capabilities:**

| Capability | Current State | Required State |
|-----------|---------------|----------------|
| AI builds entire profile through conversation | ✅ Exists (onboarding) | Extend: AI should be able to rebuild/update profile at any time, not just onboarding |
| AI asks clarifying questions about spending | ❌ Missing | LEDGER should proactively ask "Did you make any large purchases this week?" on return visit |
| User confirms AI's understanding | ❌ Missing | After AI builds a profile snapshot, show a "Review & Confirm" card — user taps ✓/✗ on each line |
| AI detects anomalies and surfaces them | ❌ Missing | "Your food spending this month seems $200 higher than last month — want me to investigate?" |
| Zero-form goal creation | ⚠️ Partial | "I want to save for a vacation" → AI creates goal, sets target, sets monthly contribution from surplus |
| AI-generated financial plan on first visit | ✅ Exists | Solidify: plan should be auto-proposed after onboarding completes, not require explicit trigger |
| Passive data ingest (photo receipt) | ⚠️ Architecture only | Document Intelligence must write confirmed transactions to TransactionManager automatically |

### 4.2 Power User Mode (The Active User)

**User profile:** Speaks to LEDGER in full sentences. Sends photos of every receipt. Uploads bank statements. Never manually types into a form. Expects AI to act on every instruction without confirmation dialogs.

**Required capabilities:**

| Capability | Current State | Required State |
|-----------|---------------|----------------|
| Voice/text → transaction creation | ❌ Missing | "I spent $47 at Whole Foods" → AI writes transaction, categorizes it, updates budget |
| Photo → transaction | ⚠️ Architecture only | Receipt photo → OCR → transaction record with merchant, amount, date, category |
| Bank statement upload → bulk transaction import | ❌ Missing | PDF/OFX/CSV statement → parse → deduplicate → categorize → write to TransactionManager |
| "Update my goal" via chat | ❌ Missing | "I added $500 to my emergency fund" → AI updates `currentAmount` on matching goal |
| "Show me my spending on food this month" | ❌ Missing | AI queries real transaction data, returns aggregated summary with trend context |
| "Should I pay off my credit card or invest?" | ⚠️ AI advises only | AI should run actual simulation using user's real APR and expected return data, not generic advice |
| "Set my food budget to $350 this month" | ❌ Missing | AI writes budget category update action |
| Autonomous recurring transaction setup | ❌ Missing | "My rent is $1,850 due the 1st" → AI creates recurring transaction entry with schedule |
| AI-triggered alerts without user prompting | ❌ Missing | LEDGER monitors data, surfaces "You've spent 87% of your dining budget by the 15th" |

---

## 5. AI AGENT FEATURE REQUIREMENTS

LEDGER's AI must not merely advise — it must **act**. This section defines the complete set of autonomous actions the LEDGER agent must support.

### 5.1 Required Autonomous Action Set

```typescript
// Current actions (existing)
<action type="create_financial_plan"> ✅
<action type="update_budget_snapshot"> ✅
<action type="update_financial_friction"> ✅
<action type="compute_resonance_roi"> ✅
<action type="analyze_financial_document"> ✅ (partial)

// Phase 1: CRITICAL — Must implement to unlock dual-mode
<action type="add_transaction">
  // Writes a transaction to TransactionManager with auto-categorization
  { amount, merchant, category, date, note, goalId?, budgetCategoryId? }

<action type="update_goal_progress">
  // Updates currentAmount on a specific SavingsGoal
  { goalId, newAmount, delta?, note }

<action type="set_budget_actual">
  // Records actual spend for a budget category in the current period
  { categoryId, actualAmount, period }

<action type="add_income_source">
  // Adds or updates an income source in the new IncomeSource[] model
  { name, type, amount, frequency, isVariable, taxCategory }

<action type="create_recurring_transaction">
  // Creates a recurring transaction schedule
  { template: TransactionTemplate, frequency, nextDueDate, autoCreate }

// Phase 2: HIGH VALUE
<action type="set_financial_goal">
  // Creates or updates a savings/debt/investment goal
  { type, name, targetAmount, currentAmount, deadline, monthlyContribution }

<action type="tag_transaction_tax">
  // Tags a transaction with a tax deductibility category
  { transactionId, taxCategory, deductibleAmount }

<action type="run_debt_simulation">
  // Runs avalanche vs snowball simulation and stores result
  { strategy: 'avalanche' | 'snowball' | 'compare', debtIds }

<action type="create_alert_rule">
  // Creates a monitoring rule that triggers a spine event when condition met
  { metric, threshold, operator, alertType, message }

<action type="bulk_categorize_transactions">
  // Applies AI categorization to all uncategorized transactions
  { transactionIds?, all?: boolean }

// Phase 3: ADVANCED
<action type="generate_tax_summary">
  // Computes tax year summary from tagged transactions
  { taxYear, currency }

<action type="update_net_worth_snapshot">
  // Records a net worth data point (assets - liabilities) at current date
  { assets, liabilities, note }

<action type="import_bank_statement">
  // Processes an uploaded statement file and writes transactions
  { fileRef, format, deduplicateAgainst?, requireConfirmation }
```

### 5.2 AI Proactivity Requirements

LEDGER should not wait to be asked. It must monitor data and surface insights autonomously:

| Trigger | AI Behavior |
|---------|-------------|
| Budget category > 80% spent by mid-month | Surface warning in chat + spine event |
| Goal deadline within 30 days, progress < 50% | Surface urgent alert, offer revised plan |
| 3+ transactions to same merchant in 7 days | "You've visited Starbucks 4x this week ($47). Want me to track this?" |
| Income drops > 20% month-over-month | Proactive cash flow analysis, suggest buffer release |
| Recurring transaction missed (> 3 days late) | "Your Netflix renewal hasn't appeared yet — want me to log it?" |
| Financial Friction score increases > 2 points | Cross-module alert to Agnes (stress feed), surface to user |
| New month starts | Auto-generate monthly reset: reset actuals, roll recurring, surface last month summary |

---

## 6. TAX & ACCOUNTING PRODUCT REQUIREMENTS

Tax is currently a single stub custom field. This is a major gap for any serious financial module targeting adults in most markets.

### 6.1 Core Tax Feature Set (MVP)

**6.1.1 Transaction Tax Tagging**

Every transaction must be taggable with a tax category. The system should support:

```
Tax Categories (US-baseline, extensible by currency/locale):
- Personal (not deductible)
- Business Expense (Schedule C / S/E)
- Home Office
- Vehicle / Mileage
- Health & Medical (HSA-eligible)
- Education (Lifetime Learning / 529)
- Charitable Donation
- Investment-Related
- Rental Property Expense
- Retirement Contribution (IRA / 401k)
```

**Data model change required:**
```typescript
// Add to Transaction type:
taxCategory?: TaxCategory
deductibleAmount?: number   // may differ from full transaction amount
taxYear?: number            // defaults to transaction year
```

**6.1.2 Tax Year Summary Report**

Generated by `generate_tax_summary` AI action or manual trigger. Output:

- Total income by source (wages, freelance, dividends, rental)
- Total deductible expenses by category
- Estimated taxable income (gross - deductions)
- Estimated federal tax liability (bracket-based, not professional advice)
- Quarterly estimated tax payment schedule (for self-employed)
- Exportable as PDF and CSV

**6.1.3 Deductible Tracking Dashboard**

New section within `LedgerWorkspace` (or new `TaxCenter` tab):
- Running YTD deductibles by category
- % of income deductible
- Missing documentation warnings (transactions tagged but no receipt attached)
- Q1/Q2/Q3/Q4 estimated payment tracker

**6.1.4 AI Tax Assistance**

LEDGER should be able to:
- Auto-suggest tax category when a transaction is added ("This looks like a business meal — want me to tag it as Business Expense?")
- Answer "How much have I spent on deductible business expenses this year?"
- Surface "You have $3,200 in untagged transactions that might be deductible — want me to review them?"
- NOT provide legal/professional tax advice — always disclaim this clearly

### 6.2 Out of Scope (Won't Build Now)

- Direct tax filing (e.g., TurboTax integration)
- State tax calculation
- International tax systems (handle via locale-based category configuration only)
- Payroll processing

---

## 7. INCOME COMPLEXITY REQUIREMENTS

### 7.1 Current Problem
`LedgerIntakeProfile.monthlyIncome: number` is a single number. This makes the entire module inaccurate for:
- Freelancers and contractors (variable monthly income)
- People with side businesses
- Rental income recipients
- Dividend/investment income earners
- People with seasonal income (teachers, retail workers, agricultural)

### 7.2 Required Data Model

```typescript
interface IncomeSource {
  id: string
  name: string                          // "Consulting Income", "Rental Property A"
  type: IncomeType                      // salary | freelance | rental | dividend | business | other
  amount: number                        // expected/average amount
  frequency: IncomeFrequency            // monthly | biweekly | weekly | quarterly | annual | irregular
  isVariable: boolean                   // if true, actual amount varies
  variancePercent?: number              // expected variance range (e.g., 40 = ±40%)
  taxCategory: TaxIncomeCategory        // w2 | self_employment | passive | capital_gains | other
  currency: string
  startDate?: string
  isActive: boolean
  notes?: string
}

// Profile change:
// BEFORE: monthlyIncome: number
// AFTER:  incomeSources: IncomeSource[]
// COMPUTED: get totalMonthlyIncome() → sum of normalized monthly equivalents
```

### 7.3 Irregular Income Handling

For users with irregular income (gig workers, freelancers):
- Track income as transactions with `type: 'income'` rather than as a profile field
- Dashboard should show "Income received this month" from actual transactions, not profile estimate
- Financial Friction formula must be updated to use `actual income received` when available, falling back to `expected income` from profile
- AI should proactively surface: "Your income this month ($3,200) is 18% below your average. Want me to adjust your spending plan?"

### 7.4 Seasonal Income Planning

For users who identify seasonal income patterns:
- Allow income sources to have active months: `activeMonths?: number[]` (1-12)
- Budget planner adapts: lower-income months get conservative budgets automatically
- LEDGER AI should warn in advance: "You're entering a low-income period (Jan–Mar based on your history). I recommend building buffer now."

---

## 8. DEBT MANAGEMENT PRODUCT REQUIREMENTS

### 8.1 Current State
`DebtItem[]` in `LedgerIntakeProfile` has name, balance, and minimum payment. The `FinancialCharts.tsx` shows a mock debt payoff line. The cross-verification engine has hints of snowball logic. This is insufficient.

### 8.2 Required Debt Data Model

```typescript
interface DebtItem {
  id: string
  name: string                           // "Chase Sapphire", "Student Loan"
  type: DebtType                         // credit_card | student_loan | mortgage | auto | medical | personal | other
  currentBalance: number
  originalBalance: number
  interestRate: number                   // APR as decimal (e.g., 0.2199 for 21.99%)
  minimumPayment: number
  monthlyPayment: number                 // actual payment (may be > minimum)
  dueDay: number                         // day of month (1-28)
  isVariableRate: boolean
  currency: string
  paymentHistory: DebtPayment[]          // actual payment log
  projectedPayoffDate?: string           // computed from simulation
  strategy?: 'avalanche' | 'snowball'    // override global strategy
}

interface DebtPayment {
  date: string
  amount: number
  principalPaid: number
  interestPaid: number
  balanceAfter: number
}
```

### 8.3 Avalanche vs. Snowball Simulation

**UI Component:** New `DebtStrategist` section within the Debt Tracker view.

**Simulation Engine Requirements:**
- Input: current `DebtItem[]` with APR, balance, minimum, monthly payment budget
- Compute: month-by-month payoff schedule for both avalanche and snowball
- Output:
  - Payoff date for each strategy
  - Total interest paid for each strategy
  - Interest saved (avalanche) vs. motivation wins (snowball)
  - Recommendation based on user's behavioral profile (Agnes stress score → if high, favor snowball for wins)
- Visualize: side-by-side payoff timeline chart, debt-free date marker

**AI Integration:**
- LEDGER should run simulation on demand: "Run a debt simulation for me"
- Should proactively surface: "If you added $200/month to your avalanche strategy, you'd be debt-free 14 months earlier and save $3,400 in interest"
- Should cross-reference: if Agnes stress score is elevated, recommend snowball strategy explicitly

### 8.4 Debt Payoff Tracking (Real vs. Mock)
The current debt payoff chart in `LedgerDashboard.tsx` uses mock data (12% reduction projection). Replace with:
- Real balances from `DebtItem.currentBalance` updated by payment transactions
- Actual payment history timeline
- Compare: "On track" vs. "Behind" vs. "Ahead" vs. strategy projection

---

## 9. NOTIFICATION & ALERT REQUIREMENTS

### 9.1 Current State
`spine-event-service.ts` defines 17 event types including `RISK_DETECTED` and `GOAL_PROGRESS`. These emit toast notifications. There are **no trigger conditions** — alerts only fire when explicitly called, not from monitoring logic.

### 9.2 Alert Categories & Trigger Conditions

#### 9.2.1 Spending Alerts

| Alert | Trigger Condition | Severity | Action |
|-------|------------------|----------|--------|
| Budget Category Warning | Actual spend > 80% of budget by day ≤ 20 of month | 🟡 Warning | Show remaining budget, suggest cuts |
| Budget Category Exceeded | Actual spend > 100% of budget | 🔴 Alert | Show overage amount, suggest reallocation |
| Unusual Spend | Single transaction > 2× average for that category | 🟡 Warning | "Is this correct? It's larger than usual." |
| Spending Velocity Spike | 7-day rolling spend > 150% of 30-day average | 🟡 Warning | Cross-reference Agnes stress score |
| Recurring Bill Not Seen | Recurring transaction expected date +3 days, no transaction | 🔵 Info | Remind user, offer to log it |

#### 9.2.2 Goal Alerts

| Alert | Trigger Condition | Severity | Action |
|-------|------------------|----------|--------|
| Goal At Risk | Progress % < expected % by deadline proximity | 🟡 Warning | Offer revised monthly contribution |
| Goal Deadline Approaching | Goal deadline within 30 days | 🟡 Warning | Surface completion status |
| Goal Achieved | `currentAmount >= targetAmount` | 🟢 Celebration | Spine event, confetti, suggest next goal |
| Goal Contribution Missed | Monthly contribution not logged and month >15 days old | 🔵 Info | Gentle reminder |

#### 9.2.3 Debt Alerts

| Alert | Trigger Condition | Severity | Action |
|-------|------------------|----------|--------|
| High APR Debt | Any debt with APR > 20% | 🟡 Warning | Surface in advisor panel |
| Minimum Payment Due | Debt `dueDay` within 5 days | 🔵 Reminder | Link to payment logging |
| Debt Payoff Milestone | Balance drops below 25%/50%/75% of original | 🟢 Milestone | Celebrate progress |

#### 9.2.4 Income & Cash Flow Alerts

| Alert | Trigger Condition | Severity | Action |
|-------|------------------|----------|--------|
| Income Below Average | Actual income < 80% of expected for month | 🟡 Warning | Suggest discretionary spending reduction |
| Negative Cash Flow Projected | Projected end-of-month balance < 0 | 🔴 Alert | Emergency budget review, activate buffer |
| Emergency Fund Below Target | Emergency fund balance < target threshold | 🟡 Warning | Suggest reallocation from discretionary |

#### 9.2.5 Cross-Module Wellness Alerts

| Alert | Trigger Condition | Severity | Action |
|-------|------------------|----------|--------|
| Stress-Spending Risk | Agnes stress load elevated + spending velocity spike | 🟡 Cross-module | "High stress detected. Your spending is also elevated. Worth a pause?" |
| Financial Friction Spike | Friction score increases ≥ 2 points | 🔴 NSV Impact | Cross-module NSV update, surface in Agnes |
| Decision Fatigue Risk | Atlas cognitive load high + major financial decision pending | 🟡 Cross-module | "Not the best time for major financial decisions." |

### 9.3 Alert Delivery Channels

- In-app toast (existing spine event system) ✅
- AI chat proactive message (LEDGER surfaces alert in conversation) — **needs implementation**
- Dashboard banner (persistent until acknowledged) — **needs implementation**
- Push notification (future — out of scope for now)

### 9.4 Alert Preferences
Users should be able to configure alert sensitivity:
- Aggressive (all alerts)
- Balanced (medium and high severity only)
- Minimal (critical only)
- Off (no alerts — not recommended, surfaced with friction context)

---

## 10. REPORTING REQUIREMENTS

### 10.1 Core Reports (Must Have)

| Report | Data Source | Format | Trigger |
|--------|------------|--------|---------|
| Monthly Summary | Transactions + Budget + Goals | In-app card + PDF | Auto on month end, on-demand |
| Annual Financial Review | Full year transactions + goals + debt | PDF | On-demand + January prompt |
| Tax Year Summary | Tax-tagged transactions | PDF + CSV | On-demand + Q4 prompt |
| Budget Performance | Actual vs. target by category | In-app chart + CSV | On-demand + monthly |
| Goal Progress Report | All goals with timeline | In-app visual | On-demand |
| Debt Payoff Projection | Current debt with strategy | In-app simulation | On-demand |
| Net Worth History | Periodic snapshots | Line chart | On-demand |

### 10.2 Export Formats

| Format | Use Case | Priority |
|--------|---------|---------|
| CSV (transactions) | Import into other tools | ✅ Exists |
| PDF (summary reports) | Human-readable, shareable | P1 |
| JSON (full profile export) | Data portability, backup | P1 |
| OFX/QFX (transaction import) | Bank statement parsing | P2 |
| Excel (.xlsx) | Advanced users, accountants | P2 |

### 10.3 Report Delivery via AI

LEDGER should be able to generate and narrate reports conversationally:
- "Give me a summary of this month" → AI narrates key metrics, flags anomalies, compares to last month
- "How did I do this year?" → AI generates annual review, highlights wins and areas for improvement
- "What can I deduct this year?" → AI generates tax summary with breakdown

---

## 11. USER STORIES

### US-01 — The Overwhelmed Beginner (Casual Mode, Onboarding)
> **As a** user who has never tracked their finances,
> **I want to** answer a few AI questions about my income and spending
> **So that** LEDGER builds a complete financial picture without me filling out forms.

**Acceptance Criteria:**
- **Given** I open Ledger for the first time, **When** I choose "Chat with LEDGER," **Then** LEDGER asks me 5-8 focused questions covering income, major expenses, debts, and one financial goal
- **Given** I answer all questions, **When** LEDGER processes my responses, **Then** a complete `LedgerIntakeProfile` is created with all fields populated from conversation
- **Given** profile is created, **When** dashboard loads, **Then** I see a "Review & Confirm" card showing what LEDGER understood — I can tap ✓/✗ on each line
- **Given** I confirm the profile, **When** I navigate to the dashboard, **Then** stat cards show the income, expense, and savings values derived from my answers
- **Given** I correct any item, **When** I tap ✗ and provide a correction in chat, **Then** the profile updates and dashboard reflects the change

---

### US-02 — The Power User (Autonomous AI Mode, Daily Logging)
> **As a** user who wants to never manually enter financial data,
> **I want to** speak to LEDGER or send photos
> **So that** every transaction, goal update, and budget change happens automatically.

**Acceptance Criteria:**
- **Given** I say "I spent $47 at Whole Foods today," **When** LEDGER processes the message, **Then** a transaction is created with amount $47, merchant "Whole Foods", date today, category auto-suggested as "Groceries"
- **Given** I take a photo of a restaurant receipt ($83.20, The Cheesecake Factory), **When** Document Intelligence processes it, **Then** a transaction is created with the correct merchant, amount, date extracted from the receipt
- **Given** I say "I added $300 to my emergency fund," **When** LEDGER processes it, **Then** the matching `SavingsGoal.currentAmount` is updated by +$300 and the dashboard reflects new progress
- **Given** I say "Set my food budget to $400 this month," **When** LEDGER processes it, **Then** the Food budget category target is updated to $400 for the current period
- **Given** all of the above have occurred, **When** I open the dashboard, **Then** all stat cards, charts, and goal progress reflect the actual AI-written data — I have never typed a number into a form

---

### US-03 — The Debt Fighter (Debt Management)
> **As a** user carrying $18,000 in credit card debt across 3 cards,
> **I want to** see which payoff strategy saves me the most money
> **So that** I can make an informed decision and stick to a plan.

**Acceptance Criteria:**
- **Given** I have 3 `DebtItem` entries with different APRs (21.99%, 18.49%, 14.99%), **When** I open the Debt Strategist view, **Then** I see both avalanche and snowball simulations side-by-side
- **Given** the simulation runs, **When** results display, **Then** I see: payoff date for each strategy, total interest paid, and the difference in months and dollars
- **Given** my Agnes stress score is elevated, **When** LEDGER displays the recommendation, **Then** it explicitly mentions: "Given your current stress levels, the snowball strategy's quicker wins may be more sustainable for you"
- **Given** I choose a strategy, **When** I tap "Activate Plan," **Then** a `FinancialPlan` is created with debt payoff tasks and monthly payment allocations
- **Given** I log a debt payment transaction, **When** it's tagged to the specific debt, **Then** the debt balance updates and the simulation recalculates projected payoff date

---

### US-04 — The Freelancer (Income Complexity + Tax)
> **As a** freelancer with variable monthly income from 3 clients plus some rental income,
> **I want to** track all my income sources and understand my tax exposure
> **So that** I'm not surprised at tax time and I can make quarterly estimated payments.

**Acceptance Criteria:**
- **Given** I open Ledger onboarding, **When** I tell LEDGER "I freelance for 3 clients and have a rental property," **Then** LEDGER creates 4 `IncomeSource` entries with appropriate types (freelance × 3, rental × 1) and marks them all as variable
- **Given** I add income transactions each month, **When** transactions are tagged to income sources, **Then** the dashboard shows "Actual income this month: $X" from real transactions, not the profile estimate
- **Given** I have business expense transactions tagged as "Business Expense," **When** I ask "What's my estimated tax liability this year?" **Then** LEDGER generates a tax summary: gross income, deductible expenses, estimated taxable income, estimated Q4 payment
- **Given** the tax summary is generated, **When** I open the Tax Center, **Then** I see a quarterly payment schedule with amounts and due dates (Apr 15, Jun 15, Sep 15, Jan 15)
- **Given** I add an expense and LEDGER recognizes it as potentially deductible, **When** the transaction is created, **Then** LEDGER asks "This looks like a business expense — want me to tag it as deductible?"

---

### US-05 — The Wellness-Finance Integration User (Cross-Module)
> **As a** user who has been experiencing high stress (tracked in Agnes),
> **I want to** understand how my emotional state is affecting my spending
> **So that** I can make conscious choices rather than reactive ones.

**Acceptance Criteria:**
- **Given** my Agnes stress load has been elevated (>7) for 5+ days, **When** LEDGER detects this via NSV cross-module sync, **Then** LEDGER proactively sends a message: "I've noticed you've been under significant stress this week. Your spending this week is 34% higher than your weekly average."
- **Given** the stress-spending correlation is surfaced, **When** I ask LEDGER to break it down, **Then** LEDGER shows a category breakdown of elevated spending (e.g., food delivery +$80, online shopping +$120) and the specific dates
- **Given** the breakdown is shown, **When** LEDGER provides its analysis, **Then** it offers 2 concrete options: (1) adjust this month's budget to absorb the overage, or (2) create a "stress buffer" allocation within the current plan
- **Given** my Financial Friction score increases due to the overspending, **When** the NSV is updated, **Then** the Resonance ROI metric reflects the impact and Agnes receives a cross-module event
- **Given** I accept LEDGER's suggestion to create a stress buffer, **When** the plan is updated, **Then** the budget planner shows the buffer allocation and LEDGER explains the behavioral economics rationale

---

## 12. MoSCoW PRIORITIZATION

### 🔴 MUST HAVE (MVP Completion — Blocks Everything Else)

These items are required for the product to be minimally functional and trustworthy:

| # | Item | Rationale |
|---|------|-----------|
| M1 | Transaction → Dashboard aggregation pipeline | Dashboard with mock data is not a financial product. |
| M2 | `SavingsGoal.currentAmount` type fix + UI update | Goal tracker is visibly broken without this. |
| M3 | Budget actual vs. target comparison (real spend data) | Budget planner with no actuals is a static calculator, not a budget. |
| M4 | AI `add_transaction` action (autonomous write) | Core to dual-mode product promise. Without it, power user mode is impossible. |
| M5 | AI `update_goal_progress` action | Power user can't update goals without manually opening forms. |
| M6 | Multi-income source data model (`IncomeSource[]`) | Single `monthlyIncome` field makes module inaccurate for large user segment. |
| M7 | Real spending trend chart (by category, real data) | Foundational analytics — without it, the "intelligence" claim is hollow. |
| M8 | Document Intelligence → TransactionManager write-back verification | Architecture exists but end-to-end flow must be confirmed and hardened. |

### 🟠 SHOULD HAVE (Phase 2 — High Value, Near-Term)

These items significantly improve the product and should ship within 1-2 sprints of Must Haves:

| # | Item | Rationale |
|---|------|-----------|
| S1 | AI transaction auto-categorization | Reduces friction dramatically for both user modes. |
| S2 | Smart alerts (budget warnings, goal deadlines, bill reminders) | Without alerts, the product is passive. Intelligence requires proactivity. |
| S3 | Debt avalanche/snowball simulation | High-impact for the significant population carrying debt. |
| S4 | Tax category tagging on transactions | Low-effort addition to transaction model with high tax-season value. |
| S5 | Recurring transaction automation (scheduler) | Subscriptions and bills are universal. Automating them saves significant effort. |
| S6 | AI `set_budget_actual` and `create_recurring_transaction` actions | Extends autonomous AI coverage to budget and recurring management. |
| S7 | "Review & Confirm" card after AI profile building | Critical UX for validation mode — user needs to verify AI's understanding. |
| S8 | Net worth timeline chart (periodic snapshots) | High psychological impact — seeing net worth grow is a core motivator. |

### 🟡 COULD HAVE (Phase 3 — Meaningful Differentiators, Plan When Possible)

| # | Item | Rationale |
|---|------|-----------|
| C1 | Tax year summary report + estimated liability | Valuable for freelancers and self-employed; high complexity for accurate calculation. |
| C2 | Tax Center tab (deductibles dashboard, quarterly payment tracker) | Natural extension of tax tagging once data exists. |
| C3 | Financial calendar (bill due dates, recurring schedule) | High utility but not blocking core financial intelligence. |
| C4 | Bank statement import (OFX/QFX/PDF) | Powerful but technically complex. CSV exists as a bridge. |
| C5 | Seasonal income planning (active months per income source) | High value for teachers, retail, agricultural workers. Requires income model migration first. |
| C6 | PDF report export (monthly summary, annual review) | Professional output requested by engaged users; lower urgency than data accuracy. |
| C7 | Stress-spending correlation analysis and surfacing | Premium cross-module differentiator. Depends on Agnes NSV integration quality. |
| C8 | Debt payoff real tracking (replace mock chart with real payment log) | Requires DebtItem payment history model extension. |
| C9 | AI proactive monthly summary (auto-generated at month end) | Delightful and high-retention, but a polish item once core data is accurate. |

### ⚫ WON'T HAVE (Now — Explicitly Descoped)

These items are strategically deferred. Not because they lack value, but because they require either infrastructure that doesn't exist yet or represent scope that would dilute focus:

| # | Item | Rationale for Deferral |
|---|------|----------------------|
| W1 | Investment portfolio tracking (positions, performance) | Requires brokerage API integration or complex manual entry. Out of scope for MVP. Custom field is sufficient placeholder. |
| W2 | Retirement planning module | Highly complex actuarial modeling. Entire product category. Defer indefinitely. |
| W3 | Direct tax filing integration (TurboTax, H&R Block) | Regulatory and integration complexity. Not a wellness product feature. |
| W4 | Push notifications | Requires native app shell or PWA notification permissions. Infrastructure dependency. |
| W5 | Multi-currency live exchange rates | Requires paid API. Complex UX. Defer until international users are a primary segment. |
| W6 | Bill negotiation / subscription cancellation AI | Out of scope for a wellness-finance module. Scope creep. |
| W7 | Credit score monitoring | Requires credit bureau API. Privacy implications. Not aligned with Nexus wellness positioning. |
| W8 | Shared / family finance (multiple users, one ledger) | Requires multi-user data model. Major architectural change. |
| W9 | Cryptocurrency portfolio tracking with live prices | Requires multiple exchange APIs, price feed infrastructure. Crypto field stays as manual number. |

---

## 13. STRUCTURAL & ARCHITECTURAL NOTES FOR ENGINEERING

These are not feature requests — they are data model corrections required before feature work can proceed:

### 13.1 Transaction Aggregation Service (New)
Create `ledger-aggregation-service.ts`:
```typescript
// Computes real-time metrics from TransactionManager data
computeMonthlyTotals(transactions: Transaction[], month: string): MonthlyTotals
computeCategorySpend(transactions: Transaction[], categoryId: string, period: DateRange): number
computeIncomeBySource(transactions: Transaction[], sourceId?: string): IncomeBreakdown
computeBudgetActuals(transactions: Transaction[], budgets: BudgetCategory[]): BudgetPerformance[]
```
This service is the **dependency** of Dashboard, BudgetPlanner actuals, Financial Friction, and Resonance ROI accuracy.

### 13.2 Profile Type Corrections
```typescript
// REQUIRED FIXES before any feature work:

// 1. Fix SavingsGoal (GoalTracker.tsx will not function without this)
interface SavingsGoal {
  currentAmount: number   // ADD THIS — currently missing from profile type
  // ... existing fields
}

// 2. Replace monthlyIncome with IncomeSource array
interface LedgerIntakeProfile {
  incomeSources: IncomeSource[]   // REPLACE monthlyIncome: number
  get totalMonthlyIncome(): number  // computed property for backward compatibility
}

// 3. Add tax and goal linkage to Transaction
interface Transaction {
  taxCategory?: TaxCategory
  deductibleAmount?: number
  goalId?: string           // links transaction to a specific savings goal
  budgetCategoryId?: string // links transaction to a budget category
  isRecurringInstance?: boolean
  recurringTemplateId?: string
}
```

### 13.3 Financial Friction Formula Update
Once real transaction data is available, update the formula in `resonance-roi-service.ts`:

```typescript
// CURRENT (profile-snapshot only):
friction = (1 - bufferRatio) × 6 + debtRatio × 4

// FUTURE (transaction-aware):
friction = (1 - bufferRatio) × 3
         + debtRatio × 3
         + overspendingFrequency × 2  // % of categories over budget this month
         + spendingVelocityAnomaly × 2 // 7-day vs 30-day spend ratio
```

---

## 14. SPRINT PLANNING INPUT

Per `workitems/INSTRUCTIONS.md` — structural fixes must precede feature work.

### Sprint 0: Structural Prerequisites (Week 1)
1. Fix `SavingsGoal.currentAmount` type mismatch (P0 bug)
2. Build `ledger-aggregation-service.ts` (blocks all other features)
3. Wire aggregation service to dashboard stat cards (replaces mock data)
4. Wire aggregation service to cash flow chart (replaces mock data)

### Sprint 1: Core Data Integrity (Week 2)
1. Migrate `monthlyIncome: number` → `incomeSources: IncomeSource[]`
2. Add `taxCategory`, `goalId`, `budgetCategoryId` fields to `Transaction` type
3. Wire BudgetPlanner to show actual vs. target spend using aggregation service
4. Implement `add_transaction` and `update_goal_progress` AI actions

### Sprint 2: Intelligence Layer (Week 3-4)
1. AI transaction auto-categorization (model call on transaction creation)
2. Smart alerts trigger logic (budget 80% warning, goal deadline, bill reminder)
3. Debt avalanche/snowball simulation component (`DebtStrategist`)
4. Spending trends chart (real data, by category, 6-month rolling)

### Sprint 3: Power User Mode (Week 5)
1. "Review & Confirm" card for post-onboarding AI profile review
2. AI proactive messaging (stress-spending correlation, monthly summary)
3. Recurring transaction scheduler (automated next-due-date + auto-create)
4. Document Intelligence write-back verification and hardening

---

## APPENDIX A: COMPONENT REFERENCE MAP

| Component | Path | Status | Depends On |
|-----------|------|--------|------------|
| `LedgerPage.tsx` | `modules/ledger/` | ✅ Complete | All Ledger |
| `LedgerDashboard.tsx` | `modules/ledger/` | ⚠️ Partial | Aggregation Service (missing) |
| `LedgerWorkspace.tsx` | `modules/ledger/` | ⚠️ Partial | TransactionManager, Budget, Goals |
| `LedgerOnboarding.tsx` | `modules/ledger/` | ✅ Functional | IncomeSource migration needed |
| `TransactionManager.tsx` | `modules/ledger/` | ⚠️ Partial | AI categorization action missing |
| `BudgetPlanner.tsx` | `modules/ledger/` | ⚠️ Partial | Aggregation Service (missing) |
| `GoalTracker.tsx` | `modules/ledger/` | 🔴 Broken | `currentAmount` type fix required |
| `FieldsTab.tsx` | `modules/ledger/` | ✅ Complete | — |
| `FinancialCharts.tsx` | `modules/ledger/` | 🔴 Mock | Aggregation Service (missing) |
| `AIFinancialAdvisor.tsx` | `modules/ledger/` | ⚠️ Static | Real transaction data |
| `ledger-aggregation-service.ts` | `modules/ledger/` | ❌ Missing | Must be created |
| `ledger-intake-service.ts` | `modules/ledger/` | ✅ Complete | — |
| `resonance-roi-service.ts` | `modules/ledger/` | ⚠️ Partial | Aggregation Service for accuracy |
| `ledger-cross-verification-engine.ts` | `modules/ledger/` | ⚠️ Partial | Full debt simulation needed |
| `ledger-prompt-builder.ts` | `modules/ledger/` | ⚠️ Partial | New AI actions needed |
| `personas.ts` (LEDGER) | `modules/ledger/` | ✅ Complete | — |

---

*Document prepared by PM Agent | Nexus Orchestrator | LEDGER Module Strategy Review*
*All component references validated against codebase exploration of 9,086 lines across 28 files*
