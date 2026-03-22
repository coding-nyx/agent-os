---
name: ledger
description: >
  Invoke this skill when working on the Ledger financial intelligence module of the Nexus AGNES SPA.
  It covers the full module: AI persona, data models, action tags, UI structure, services layer,
  diagnosis pipeline, NSV signal ownership, cross-module cascades, spine events, and development
  patterns — everything needed to build or debug Ledger features without reading the raw codebase.
---

# Ledger Module Skill

## Table of Contents
1. [Module Identity](#1-module-identity)
2. [What Ledger Is](#2-what-ledger-is)
3. [AI Persona & Behavioral Economics](#3-ai-persona--behavioral-economics)
4. [NSV Signals & Cross-Module Cascade](#4-nsv-signals--cross-module-cascade)
5. [Data Model](#5-data-model)
6. [Onboarding Flow](#6-onboarding-flow)
7. [Action Tags Reference](#7-action-tags-reference)
8. [Spine Events](#8-spine-events)
9. [Prompt Builder & Conversation Modes](#9-prompt-builder--conversation-modes)
10. [UI Structure](#10-ui-structure)
11. [Services Layer](#11-services-layer)
12. [Diagnosis Pipeline](#12-diagnosis-pipeline)
13. [Resonance ROI Service](#13-resonance-roi-service)
14. [Starter Plan Auto-Bootstrap](#14-starter-plan-auto-bootstrap)
15. [Extension Fields](#15-extension-fields)
16. [File Structure](#16-file-structure)
17. [Development Patterns](#17-development-patterns)
18. [Common Development Tasks](#18-common-development-tasks)
19. [Known Issues & Gotchas](#19-known-issues--gotchas)

---

## 1. Module Identity

| Property | Value |
|---|---|
| Module ID | `ledger` |
| Route | `/ledger` |
| Theme color | `cyan` |
| NSV Domain | `resource` |
| Firestore collection | `ledger_profiles` |
| Vault | **Mandatory lock** — E2EE required to access any financial data |
| Total source files | 49 (`.ts` and `.tsx`) |

> **Critical vault rule:** Always call `isModuleAccessible('ledger')` before rendering any financial data. Never bypass the vault gate.

---

## 2. What Ledger Is

Ledger is the **financial intelligence module** of Nexus. It acts as an AI financial strategist grounded in behavioral economics, cross-domain wellness awareness, and resource optimization.

The AI agent is named **"Ledger"** (user-customizable alias). Its core philosophy:

> **Money is never just money.** It is downstream of stress (Agnes), energy (Titan/Soma), and cognitive capacity (Atlas).

Ledger does not operate in isolation — it reads wellness signals from peer modules and writes financial friction signals back into the global NSV (Nexus Signal Vector), creating a bidirectional feedback loop between financial health and physical/cognitive health.

---

## 3. AI Persona & Behavioral Economics

**Source:** `src/modules/ledger/personas.ts` (115 lines) + embedded in `prompts/ledger-prompt-builder.ts`

### Core Behavioral Economics Anchors

Ledger's reasoning is grounded in these specific behavioral economics phenomena:

| Phenomenon | Description | Ledger's Use |
|---|---|---|
| **Loss Aversion** | Losses feel ~2× worse than equivalent gains | Frames savings as "losses avoided," not gains |
| **Present Bias** | Immediate rewards are systematically overweighted | Flags impulse-spend risk; promotes pre-commitment |
| **Mental Accounting** | Money is categorized in non-fungible "buckets" | Validates vs. challenges user's category logic |
| **Social Spending Pressure** | Peer behavior drives discretionary spend | Surfaces hidden social spend triggers |
| **Stress Spending Cascades** | Cortisol elevation → impulsive discretionary spend | Cross-reads Agnes stress signal before advice |

### Cross-Module NSV Awareness

Ledger actively reads NSV signals from other modules and adjusts its analysis:

| NSV Source | Signal | Ledger Response |
|---|---|---|
| **Agnes** | High cortisol / stress (`emotional.stressLoad`) | Flags 23% elevated variable spend risk; stress-spending advisory |
| **Atlas** | Cognitive fatigue (`cognitive.activeLoad`) | Flags convenience/decision-fatigue spending risk |
| **Titan** | Low resilience (`biological.recoveryScore`, `emotional.emotionalResilience`) | Flags health cost inflation risk; recovery-compressing spend |

### Response Methodology

- Uses internal `<thought>` blocks for structured reasoning before output
- **Plan-first**: always formulates a financial strategy before recommending actions
- **Specific numbers only**: exact amounts, dates, timelines — never vague guidance ("save more" is prohibited)
- No tax, legal, or investment advice (hard constraint)
- Financial Friction score (0–10): quantifies degree money stress compresses cognitive bandwidth
- Resonance ROI (0.0–1.0): spending alignment score with user's wellness trajectory

---

## 4. NSV Signals & Cross-Module Cascade

### Signals Ledger Owns (writes)

| NSV Key | Type | Range | Meaning |
|---|---|---|---|
| `resource.financialFriction` | `number` | 0–10 | Money stress compressing cognitive bandwidth. 0 = sustainable, 10 = crisis |
| `resource.resonanceROI` | `number` | 0.0–1.0 | Spending aligned with wellness trajectory. 0.0 = pure friction, 1.0 = fully aligned |

**Write path:**
```typescript
// Via updateGlobalSoul in action context
await updateGlobalSoul({
  resource: {
    financialFriction: score,
    resonanceROI: value,
  }
});
```

### Signals Ledger Reads

| NSV Key | Source Module | Purpose |
|---|---|---|
| `emotional.stressLoad` | Agnes | Detect stress-spending risk |
| `emotional.emotionalResilience` | Agnes | Assess emotional bandwidth |
| `cognitive.activeLoad` | Atlas | Detect decision-fatigue spending risk |
| `biological.recoveryScore` | Titan | Detect health-cost inflation risk |

### Cascade Triggers (Ledger → Other Modules)

| Condition | Target | Effect |
|---|---|---|
| `financialFriction > 8` | **Nexus** | Escalate to cross-domain intervention |
| `financialFriction > 7` | **Titan** | Note as recovery-compressing factor (cortisol + sleep disruption) |
| `financialFriction > 7` | **Atlas** | Enter emergency posture — elevate income-critical tasks |
| Agnes stress signal high | **Ledger** | Receives → flags stress-spending risk in response |

### Cascade Triggers (Inbound to Ledger)

| Source Module | Signal | Ledger Behavior |
|---|---|---|
| Agnes | Elevated stress score | Activates stress-spend risk advisory |
| Titan | Low resilience | Activates health-cost inflation warning |
| Atlas | Cognitive fatigue | Activates convenience-spend advisory |

---

## 5. Data Model

**Source:** `src/modules/ledger/services/ledger-intake-service.ts`

### Core Types

```typescript
export type TaxCategory =
  | 'essential'
  | 'deductible'
  | 'discretionary'
  | 'investment'
  | 'non-deductible'
  | 'partial'
  | 'unknown';

export interface BudgetLineItem {
  id: string;
  label: string;
  amount: number;
  taxCategory?: TaxCategory;
}

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr?: number;
  type?: string;
  originalBalance?: number;
  dueDay?: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate?: string;
}

export interface FinancialPlan {
  id: string;
  title: string;
  summary: string;
  monthlyTarget: number;
  allocation: {
    essentials: number;  // percentage (0–100)
    growth: number;      // percentage
    buffer: number;      // percentage
  };
  tasks: string[];
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  date: string;               // ISO 8601 (YYYY-MM-DD)
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  isRecurring?: boolean;
  goalId?: string;
  budgetCategoryId?: string;
  taxCategory?: TaxCategory;
  notes?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

export interface FinancialGoal {
  id: string;
  name: string;
  type: 'savings' | 'debt_payoff' | 'investment' | 'purchase' | 'other';
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  monthlyContribution: number;
  priority: 'low' | 'medium' | 'high';
  milestones?: Array<{ name: string; amount: number; reached: boolean }>;
  notes?: string;
  createdAt?: string;
}
```

### Root Profile Type

```typescript
export interface LedgerIntakeProfile {
  onboardingComplete: boolean;
  currency: string;               // e.g. "USD", "EUR", "INR"
  monthlyIncome: number;
  fixedExpenses: BudgetLineItem[];
  variableExpenses: BudgetLineItem[];
  debtItems: DebtItem[];
  savingsGoals: SavingsGoal[];
  planningHorizon: 'monthly' | 'quarterly' | 'yearly';
  summary: string;
  plans: FinancialPlan[];
  activePlanId: string | null;
  plannerBotState: 'idle' | 'creating' | 'active';
  lastPlanGeneratedAt?: string;
  documentAnalysisEnabled: boolean;
  lastDocumentAnalysis?: DocumentAnalysis;
  createdAt: string;
  updatedAt: string;

  // First-class transaction/budget/goal fields:
  transactions?: Transaction[];
  budgetCategories?: BudgetCategory[];
  financialGoals?: FinancialGoal[];
  extensionValues?: Record<string, unknown>;
}
```

---

## 6. Onboarding Flow

**Source:** `src/modules/ledger/onboarding/LedgerOnboarding.tsx`

### Steps (in order)

| Step # | Label | Key Fields |
|---|---|---|
| 1 | **Income & Currency** | `currency` (text), `monthlyIncome` (number) |
| 2 | **Expense Map** | Fixed expenses (comma-separated labels), Variable expenses (comma-separated labels) |
| 3 | **Debt & Goals** | Debt items (comma-separated labels), Savings goals (comma-separated labels) |
| 4 | **Planning Horizon** | `planningHorizon` toggle: `monthly` / `quarterly` / `yearly` |

> **Fast-track UX note:** The fast-track form collects comma-separated **labels only** — no amounts at intake. Expense items are created with `amount: 0` and must be filled in post-onboarding.

### Onboarding Action Tags

The onboarding flow fires these action tags during AI-assisted steps:

```
update_ledger_profile          // persist partial profile during intake
update_global_base_context     // push financial context to global NSV
sync_vitals                    // align with wellness module signals
focus_income                   // scope AI context to income step
focus_expenses                 // scope AI context to expense step
focus_debt_goals               // scope AI context to debt/goals step
focus_plan_horizon             // scope AI context to planning horizon step
complete_ledger_onboarding     // finalize onboarding, trigger starter plan bootstrap
```

### Post-Onboarding Bootstrap

When `complete_ledger_onboarding` fires and no active plan exists, the system auto-creates a Starter Plan (see §14).

---

## 7. Action Tags Reference

### All Implemented Action Tags (26 total)

Actions are registered across three files:
- `services/actions.ts` — 15 handlers (738 LOC)
- `actions/ledger-field-actions.ts` — 6 handlers
- `actions/transaction-actions.ts` — 9 handlers (some overlap with services/actions.ts)

#### Field Management Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `suggest_field` | `{ description, purpose, suggestedType? }` | Emit suggestion for new extension field |
| `create_field` | `{ id, name, type, description?, defaultValue?, validation?, metadata?, options? }` | Create schema-validated extension field |
| `delete_field` | `{ fieldId }` | Remove extension field from schema |
| `set_field_value` | `{ fieldId, value, fieldName? }` | Update a custom field value with LLM validation |

#### Financial Metrics Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `update_financial_friction` | `{ score: 0-10, analysis: string }` | Write friction score to profile + NSV |
| `compute_resonance_roi` | `{ financialFriction: 0-10, resonanceROI: 0.0-1.0 }` | Write both ROI metrics to profile + NSV |
| `financial_health_check` | `{ healthScore: 0-10, healthStatus: string }` | Emit health check event |
| `detect_risk` | `{ riskType: string, riskDescription: string }` | Emit risk detection event |

#### Transaction Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `create_transaction` / `add_transaction` | `{ type, amount, description?, category?, date?, merchant?, note?, budgetCategoryId? }` | Create new transaction (auto-links to budget category) |
| `update_transaction` | `{ id, amount?, description?, category?, date?, type?, notes? }` | Update existing transaction |
| `delete_transaction` | `{ transactionId }` | Remove transaction and reverse budget spent |
| `commit_transaction` | `{ type, amount, description?, category?, date? }` | Alternative create with commit semantics |
| `categorize_expense` | `{ transactionId, category }` | Update transaction category |
| `log_transaction_summary` | `{ summary: string }` | Persist transaction context summary |

#### Budget Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `create_budget` | `{ name, amount, color? }` | Create new BudgetCategory |
| `modify_budget` | `{ budgetId, amount?, name?, changeSummary? }` | Update BudgetCategory |
| `update_budget_snapshot` | `{ monthlyIncome?, currency?, fixedExpenses[]?, variableExpenses[]?, debtItems[]?, savingsGoals[]? }` | Replace full budget snapshot |

#### Goal Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `create_goal` / `set_financial_goal` | `{ name, type?, targetAmount, currentAmount?, targetDate?, monthlyContribution?, priority?, notes? }` | Create new FinancialGoal |
| `update_goal_progress` | `{ goalId, newAmount?, delta?, note? }` | Update goal currentAmount |
| `complete_goal` | `{ goalId, goalName?, achievement? }` | Mark goal as completed |

#### Analysis & Planning Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `create_financial_plan` | `{ title, summary, monthlyTarget, allocation: { essentials, growth, buffer }, tasks[] }` | Create and activate a FinancialPlan |
| `analyze_financial_document` | `{ monthlyIncome?, currency?, periodLabel?, fixedExpenses[]?, variableExpenses[]?, transactions[]? }` | Commit extracted document data |
| `parse_financial_document` | `{ transactions[]?, monthlyIncome? }` | Parse and add transactions from document |
| `parse_financial_statement` | *(delegated to parsing-actions)* | Vision AI statement parsing |

#### Simulation Actions

| Tag | Payload Shape | Description |
|---|---|---|
| `run_debt_simulation` | `{ extraMonthlyPayment?: number }` | Run avalanche/snowball payoff simulation, push formatted result |
| `project_savings_timeline` | `{ goalId?: string }` | Project completion timeline for goals |

#### Anomaly Detection

| Tag | Payload Shape | Description |
|---|---|---|
| `flag_anomaly` | `{ anomalyType: string, description: string }` | Emit risk event for detected anomaly |

### Action Registration Checklist

**To add a new action, update ALL THREE locations:**
1. **`services/actions.ts`** or **`actions/*.ts`** — register handler with ActionHub
2. **`personas.ts`** — add to `LEDGER_PERSONA` action tags section
3. **`prompts/ledger-prompt-builder.ts`** — add to `LEDGER_ALL_ACTIONS` and appropriate scope in `LEDGER_SCOPE_ACTIONS`

Missing any one silently breaks the action.
---

## 8. Spine Events

**Source:** `src/modules/ledger/actions/ledger-field-actions.ts` (lines 33-51)

Ledger emits 18 distinct Spine event types:

| Event Type | Trigger | Key Data |
|---|---|---|
| `BUDGET_UPDATED` | Budget snapshot saved | `netCashflow`, `currency` |
| `GOAL_PROGRESS` | Goal currentAmount updated | `goalName`, `percentComplete`, `currentAmount`, `targetAmount` |
| `FINANCIAL_FRICTION_CHANGED` | Friction score updated | `newScore`, `analysis`, `tier` |
| `RESONANCE_ROI_UPDATED` | ROI metrics computed | `newROI`, `newFriction` |
| `FINANCIAL_PLAN_CREATED` | New plan activated | `planId`, `planTitle`, `monthlyTarget` |
| `DOCUMENT_ANALYZED` | Statement/document parsed | `periodLabel`, `transactionCount` |
| `FIELD_CREATED` | Extension field added | `fieldId`, `fieldName`, `fieldType` |
| `FIELD_DELETED` | Extension field removed | `fieldId`, `fieldName` |
| `FIELD_VALUE_UPDATED` | Custom field value saved | `fieldId`, `fieldName`, `value` |
| `TRANSACTION_CREATED` | New transaction added | `transactionId`, `amount`, `type`, `category` |
| `TRANSACTION_UPDATED` | Transaction modified | `transactionId`, `amount`, `description` |
| `TRANSACTION_DELETED` | Transaction removed | `transactionId`, `description` |
| `BUDGET_CREATED` | New BudgetCategory created | `budgetId`, `budgetName`, `amount` |
| `BUDGET_MODIFIED` | BudgetCategory updated | `budgetId`, `budgetName`, `changeSummary` |
| `GOAL_CREATED` | New goal created | `goalId`, `goalName`, `targetAmount`, `goalPriority` |
| `GOAL_COMPLETED` | Goal target reached | `goalId`, `goalName`, `achievement` |
| `FINANCIAL_HEALTH_CHECK` | Health check performed | `healthScore`, `healthStatus` |
| `RISK_DETECTED` | Financial risk identified | `riskType`, `riskDescription` |

### Toast Templates

Each Spine event maps to a toast notification via `buildLedgerToast()`. Toast variants:
- **success**: green — BUDGET_UPDATED, GOAL_PROGRESS, PLAN_CREATED, etc.
- **info**: blue — RESONANCE_ROI_UPDATED, TRANSACTION_UPDATED
- **warning**: yellow — TRANSACTION_DELETED, RISK_DETECTED
- **error**: red — FINANCIAL_FRICTION_CHANGED (when tier = critical)

---

## 9. Prompt Builder & Conversation Modes

**Source:** `src/modules/ledger/prompts/ledger-prompt-builder.ts`

### Four Conversation Modes

| Mode | Context Included | Use Case | Actions Allowed |
|---|---|---|---|
| `general` | Full persona + full profile + extension fields | Default AI chat | 14 actions |
| `budget-review` | Persona + scoped to single budget category | Deep-dive on one spend category | 7 actions |
| `goal-focus` | Persona + scoped to single financial goal | Progress review for one goal | 7 actions |
| `field-crud` | Schema management ONLY — **no user data** | Create/edit/delete extension fields | 4 actions |

> **Security note for `field-crud` mode:** No user financial data should ever be included in the field-crud prompt. The AI in this mode should only see schema metadata.

### Actions Per Mode

```typescript
const LEDGER_SCOPE_ACTIONS = {
  general: [
    'create_financial_plan',
    'update_budget_snapshot',
    'update_financial_friction',
    'compute_resonance_roi',
    'analyze_financial_document',
    'log_transaction_summary',
    'propose_reminder',
    'query_reminders',
    'suggest_field',
    'create_transaction',
    'set_financial_goal',
    'run_debt_simulation',
    'financial_health_check',
    'detect_risk',
  ],
  'budget-review': [
    'update_budget_snapshot',
    'create_transaction',
    'create_budget',
    'modify_budget',
    'financial_health_check',
    'propose_reminder',
    'query_reminders',
  ],
  'goal-focus': [
    'update_budget_snapshot',
    'set_financial_goal',
    'update_goal_progress',
    'complete_goal',
    'project_savings_timeline',
    'create_transaction',
    'propose_reminder',
    'query_reminders',
  ],
  'field-crud': [
    'suggest_field',
    'create_field',
    'delete_field',
    'set_field_value',
  ],
};
```

### Action Filtering

`isActionAllowed(actionType, scopeKind)` — Returns true if the action is valid for the current conversation mode. Used at runtime to silently drop hallucinated out-of-scope actions.

### Prompt Composition

The builder references `LEDGER_ALL_ACTIONS` — the canonical list of all valid action tags Ledger's AI may emit. This list must be kept in sync with `services/actions.ts` and `personas.ts`.

---

## 10. UI Structure

### Main Entry Point (`LedgerPage.tsx`)

Wrapped in `UnifiedModulePage`. Routes to `LedgerContent.tsx` which manages 5 tabs.

### LedgerContent.tsx — 5 Main Tabs

```
[Dashboard]  [Transactions]  [Budget]  [Goals]  [Analytics]
```

### Tab Components (in `tabs/`)

| Tab | File | Primary Component |
|---|---|---|
| Dashboard | `DashboardTab.tsx` | `LedgerDashboard` |
| Transactions | `TransactionsTab.tsx` | `TransactionManager` |
| Budget | `BudgetTab.tsx` | `BudgetPlanner` |
| Goals | `GoalsTab.tsx` | `GoalTracker` |
| Tax | `TaxTab.tsx` | `TaxTracker` |

### Dashboard (`LedgerDashboard.tsx`)

**Stat Cards:**
| Card | Data Source |
|---|---|
| Monthly Income | `profile.monthlyIncome` |
| Total Expenses | Sum of `fixedExpenses` + `variableExpenses` amounts |
| Net Savings | `monthlyIncome - totalExpenses` |
| Resonance ROI | `resource.resonanceROI` from NSV |

**Panels:**
- `AIFinancialAdvisor.tsx` — inline AI chat scoped to financial advice
- `BehavioralInsightsPanel.tsx` — surfaces behavioral economics insights based on NSV signals
- `FinancialCharts.tsx` — CashFlowChart + DebtPayoffTracker
- `QuickLogPanel.tsx` — quick transaction entry

**Dashboard Warnings (auto-shown):**
| Condition | Warning Shown |
|---|---|
| `monthlyIncome < totalExpenses` | Negative cashflow alert |
| `financialFriction > 7` | High friction warning |
| `activePlanId === null` | No active plan prompt |

### TransactionManager.tsx

- Add / edit / delete transactions manually
- Search by description, filter by category and type, sort by date/amount
- CSV import and export
- Recurring transaction flag with frequency selection
- Tags and notes per transaction
- Links transactions to BudgetCategories

### BudgetPlanner.tsx

- Budget categories with amount targets
- Template presets:
  - **50/30/20** — Needs / Wants / Savings
  - **70/20/10** — Living / Savings / Giving
  - **Zero-based** — Every dollar assigned
- Visual progress bars showing spent vs allocated

### GoalTracker.tsx

Fields per goal: type, target amount, current amount, target date, monthly contribution, priority, milestones

Goal types: `savings`, `debt_payoff`, `investment`, `purchase`, `other`
Priority levels: `low`, `medium`, `high`

### Additional Components

| Component | Purpose |
|---|---|
| `AnalyticsTab.tsx` | Spending trends and financial analytics |
| `SpendingTrendsChart.tsx` | Visualize spending patterns over time |
| `DebtStrategist.tsx` | Avalanche/snowball debt payoff analysis |
| `TaxTracker.tsx` | Tax category tracking and estimates |
| `FieldsTab.tsx` | Extension fields management UI |
| `LedgerNotificationSettingsPanel.tsx` | Configure Ledger notifications |
| `shared/useCRUDModal.ts` | Reusable modal hook for CRUD operations |

### LedgerActionsContext

**Source:** `context/LedgerActionsContext.tsx`

Provides 11 action callbacks to child components:

```typescript
interface LedgerActionsContextValue {
  onAddTransaction, onUpdateTransaction, onDeleteTransaction,
  onImportCSV, onExportCSV,
  onUpdateCategory, onAddCategory, onDeleteCategory, onApplyTemplate,
  onAddGoal, onUpdateGoal, onDeleteGoal,
  onAddDebt, onUpdateDebt, onDeleteDebt,
  onValueChange, onAddField, onDeleteField,
  onAskAI
}
```

---

## 11. Services Layer

```
src/modules/ledger/services/
├── actions.ts                           — 738 LOC, registerLedgerActions(), 15+ handlers
├── ledger-intake-service.ts             — Firestore CRUD, normalizeLedgerProfile
├── ledger-cross-verification-engine.ts  — Cross-verify stated vs. actual spend
├── cross-verification-service.ts        — Verification service integration
├── ledger-field-validator.ts            — LLM-powered field validation
├── ledger-document-policy.ts            — Document handling policies
├── resonance-roi-service.ts             — computeFinancialFriction, computeResonanceROI
├── spine-event-service.ts               — getLedgerEvents, logLedgerEvent
└── aggregation/
    ├── transaction-aggregation.ts       — Transaction analysis utilities
    ├── budget-aggregation.ts            — Budget analysis utilities
    ├── dashboard-aggregation.ts         — Dashboard data aggregation
    ├── utils.ts                         — Shared aggregation utilities
    └── index.ts                         — Barrel export
```

### `actions.ts` (738 LOC)

Entry point: `registerLedgerActions()`. Called at module init. Registers all Ledger action tags with the global ActionHub. Includes:
- `createStarterPlan()` helper for auto-bootstrap
- 15+ action handlers
- Profile load/persist helpers

### `ledger-intake-service.ts`

Responsibilities:
- Firestore CRUD operations on `ledger_profiles/{uid}` (encrypted via vault)
- `normalizeLedgerProfile(raw)` — coerces raw Firestore document into typed `LedgerIntakeProfile`
- `createEmptyLedgerProfile()` — returns a zeroed profile for new users
- `loadLedgerProfile({ userId, encryptionKey })` — load with vault decryption
- `saveLedgerProfile(profile, { userId, encryptionKey })` — save with vault encryption

### `ledger-cross-verification-engine.ts`

Cross-verifies stated budget figures against actual transaction data. Surfaces discrepancies between what the user says they spend and what transactions show.

### `resonance-roi-service.ts`

```typescript
function computeFinancialFriction(profile: LedgerIntakeProfile): number
function computeResonanceROI(profile: LedgerIntakeProfile): { resonanceROI: number, financialFriction: number }
```

Inputs used:
- `fixedExpenses`, `variableExpenses`
- `debtItems`
- `savingsGoals`
- `monthlyIncome`
- `activePlan` (allocation percentages)

### `spine-event-service.ts`

```typescript
getLedgerEvents({ type: string, startDate: string }): Promise<SpineEvent[]>
logLedgerEvent(event: LedgerSpineEvent): Promise<void>
```

### `aggregation/` — Data Aggregation Utilities

| File | Purpose |
|---|---|
| `transaction-aggregation.ts` | `aggregateTransactionsByMonth()`, `matchCategoryToTransaction()`, `computeDebtPayoffSchedule()`, `computeSavingsProjection()` |
| `budget-aggregation.ts` | Budget category analysis and summaries |
| `dashboard-aggregation.ts` | Dashboard stat card computation |
| `utils.ts` | Shared utility functions |

---

## 12. Diagnosis Pipeline

**Source:** `src/modules/ledger/diagnosis/`

```
ledger-diagnosis-spec.ts       — spec registered via registerDiagnosisSpec(ledgerDiagnosisSpec)
ledger-diagnosis-extractor.ts  — extracts financial signals from LedgerIntakeProfile
ledger-diagnosis-prompt.ts     — builds the AI prompt for diagnosis run
ledger-diagnosis-merge.ts      — merges diagnosis AI output back into profile
```

### Pipeline Flow

```
LedgerIntakeProfile
    → ledger-diagnosis-extractor.ts   (extract signals: friction, ROI, debt ratio, etc.)
    → ledger-diagnosis-prompt.ts      (build structured prompt with those signals)
    → AI inference
    → ledger-diagnosis-merge.ts       (parse AI response, update profile fields)
```

The diagnosis spec registers with `registerDiagnosisSpec()` — it runs as part of the global Nexus diagnosis cycle, not on every user message.

---

## 13. Resonance ROI Service

**Source:** `src/modules/ledger/services/resonance-roi-service.ts`

### Algorithm Overview

```typescript
function computeFinancialFriction(profile: LedgerIntakeProfile): number  // 0-10
function computeResonanceROI(profile: LedgerIntakeProfile): {
  resonanceROI: number;    // 0.0–1.0
  financialFriction: number; // 0–10
}
```

**Inputs used:**
- `profile.fixedExpenses` — total committed spend
- `profile.variableExpenses` — discretionary spend
- `profile.debtItems` — total debt obligation pressure
- `profile.savingsGoals` — savings progress vs. targets
- `profile.monthlyIncome` — income baseline
- `profile.activePlanId` + `profile.plans` — active plan allocation percentages

**Output semantics:**
- `financialFriction`: 0 = financially sustainable, 10 = financial crisis. Driven by: debt-to-income ratio, expense overage, absence of savings buffer, unmet goals.
- `resonanceROI`: 0.0 = spending is pure friction (no alignment with wellness/goals), 1.0 = spending is fully aligned with declared wellness trajectory and savings goals.

**Write path after computation:**
```typescript
await updateGlobalSoul({
  resource: {
    financialFriction: result.financialFriction,
    resonanceROI: result.resonanceROI,
  }
});
```

This also triggers cascade checks (§4) — if thresholds are crossed, peer modules are notified.

### Friction Tier Classification

```typescript
function getFrictionTier(score: number): FrictionTier
// Returns: 'low' | 'moderate' | 'elevated' | 'critical'
```

| Score Range | Tier | Toast Variant |
|---|---|---|
| 0–3 | low | success (green) |
| 4–5 | moderate | info (blue) |
| 6–7 | elevated | warning (yellow) |
| 8–10 | critical | error (red) |

---

## 14. Starter Plan Auto-Bootstrap

Fires automatically when `complete_ledger_onboarding` action executes and `profile.activePlanId === null`.

```typescript
function createStarterPlan(profile: LedgerIntakeProfile): FinancialPlan {
  const totalFixed    = sum(profile.fixedExpenses.map(e => e.amount));
  const totalVariable = sum(profile.variableExpenses.map(e => e.amount));

  return {
    id: crypto.randomUUID(),
    title: 'Starter Financial Plan',
    summary: 'Baseline cashflow stabilization with weekly execution checkpoints.',
    monthlyTarget: Math.max(profile.monthlyIncome - (totalFixed + totalVariable), 0),
    allocation: {
      essentials: 60,  // %
      growth: 25,      // %
      buffer: 15,      // %
    },
    tasks: [
      'Track every variable expense for the next 7 days.',
      'Cap discretionary spending at 80% of current baseline.',
      'Apply first buffer deposit to emergency reserve this month.',
    ],
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
}
```

> **Note:** `monthlyTarget` will be `0` if `totalFixed + totalVariable >= monthlyIncome` — this is a legitimate crisis signal, not a bug.

---

## 15. Extension Fields

**Source:** `src/modules/ledger/field-templates.ts` (412 LOC)

10 built-in field suggestions across 4 categories:

| Category | Field ID | Label |
|---|---|---|
| **Income** | `side-hustle-income` | Side Hustle / Freelance Income |
| **Assets** | `crypto-portfolio` | Crypto Portfolio Value |
| **Assets** | `emergency-fund-months` | Emergency Fund (Months of Expenses) |
| **Assets** | `net-worth` | Net Worth |
| **Assets** | `investment-return-rate` | Investment Return Rate (%) |
| **Expenses** | `subscription-total` | Total Subscription Spend |
| **Expenses** | `rent-mortgage` | Rent / Mortgage |
| **Expenses** | `insurance-premium` | Insurance Premium |
| **Expenses** | `charitable-giving` | Charitable Giving |
| **Liabilities** | `tax-liability` | Estimated Tax Liability |

### Allowed Field Types for Ledger

```typescript
const LEDGER_ALLOWED_FIELD_TYPES = [
  FieldType.NUMBER,
  FieldType.RANGE,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.DATE,
];
```

AI can suggest and create extension fields using `suggest_field` → `create_field` flow. All fields are schema-validated via `SchemaRegistry` before persistence.

### Field Validation

`set_field_value` uses LLM-powered semantic validation via `ledger-field-validator.ts`:
- Validates value makes sense for the field name
- Falls back to keyword heuristics if LLM unavailable
- Can auto-correct values (e.g., "5k" → "5000")

---

## 16. File Structure

```
src/modules/ledger/                       — 49 source files total
├── LedgerPage.tsx                        — Main page wrapper
├── LedgerContent.tsx                     — Tab routing (5 tabs: Dashboard, Transactions, Budget, Goals, Analytics)
├── field-templates.ts                    — 412 LOC, LEDGER_SUGGESTED_EXTENSIONS, getFrictionTier
├── personas.ts                           — 115 LOC, LEDGER_PERSONA
│
├── actions/
│   ├── ledger-field-actions.ts           — 610 LOC, field CRUD + friction actions, Spine event types, toast templates
│   └── transaction-actions.ts            — 627 LOC, transaction/budget/goal action handlers
│
├── components/                           — 17 component files
│   ├── LedgerDashboard.tsx               — Dashboard with stat cards, charts, AI advisor
│   ├── AnalyticsTab.tsx                  — Spending analytics view
│   ├── TransactionManager.tsx            — Transaction CRUD, search/filter, CSV import/export
│   ├── BudgetPlanner.tsx                 — Budget categories, 50/30/20 & 70/20/10 templates
│   ├── GoalTracker.tsx                   — Savings goals with milestones
│   ├── DebtStrategist.tsx                — Avalanche/snowball debt analysis
│   ├── TaxTracker.tsx                    — Tax category tracking
│   ├── FinancialCharts.tsx               — CashFlowChart, DebtPayoffTracker
│   ├── AIFinancialAdvisor.tsx            — Inline AI advisor panel
│   ├── BehavioralInsightsPanel.tsx       — Behavioral economics insights
│   ├── QuickLogPanel.tsx                 — Quick transaction entry
│   ├── SpendingTrendsChart.tsx           — Spending trend visualization
│   ├── FieldsTab.tsx                     — Extension fields management
│   ├── LedgerNotificationSettingsPanel.tsx — Notification settings
│   ├── shared/useCRUDModal.ts            — Reusable CRUD modal hook
│   ├── index.ts                          — Component barrel exports
│   └── README.md                         — Component documentation
│
├── context/
│   └── LedgerActionsContext.tsx          — 11 action callbacks for child components
│
├── diagnosis/
│   ├── ledger-diagnosis-spec.ts          — Registers diagnosis spec
│   ├── ledger-diagnosis-extractor.ts     — Extracts financial signals
│   ├── ledger-diagnosis-prompt.ts        — Builds diagnosis AI prompt
│   └── ledger-diagnosis-merge.ts         — Merges AI output back
│
├── hooks/
│   └── use-ledger-cross-verify.ts        — Cross-verification hook
│
├── onboarding/
│   ├── LedgerOnboarding.tsx              — 4-step onboarding wizard
│   └── LedgerOnboarding.test.tsx         — Onboarding unit tests
│
├── prompts/
│   └── ledger-prompt-builder.ts          — 4 modes, LEDGER_ALL_ACTIONS, LEDGER_SCOPE_ACTIONS
│
├── services/
│   ├── actions.ts                        — 738 LOC, registerLedgerActions(), 15+ handlers
│   ├── ledger-intake-service.ts          — Firestore CRUD, profile normalization
│   ├── ledger-cross-verification-engine.ts — Stated vs actual spend verification
│   ├── cross-verification-service.ts     — Verification service integration
│   ├── ledger-field-validator.ts         — LLM-powered field validation
│   ├── ledger-document-policy.ts         — Document handling policies
│   ├── resonance-roi-service.ts          — computeFinancialFriction, computeResonanceROI
│   ├── spine-event-service.ts            — getLedgerEvents, logLedgerEvent
│   └── aggregation/
│       ├── transaction-aggregation.ts    — Transaction analysis, debt simulation
│       ├── budget-aggregation.ts         — Budget analysis
│       ├── dashboard-aggregation.ts      — Dashboard stat aggregation
│       ├── utils.ts                      — Shared utilities
│       └── index.ts                      — Barrel export
│
└── tabs/
    ├── DashboardTab.tsx                  — Dashboard tab wrapper
    ├── TransactionsTab.tsx               — Transactions tab wrapper
    ├── BudgetTab.tsx                     — Budget tab wrapper
    ├── GoalsTab.tsx                      — Goals tab wrapper
    └── TaxTab.tsx                        — Tax tab wrapper
```

---

## 17. Development Patterns

### Vault Gate Pattern

**Always** guard financial data renders behind vault check:

```typescript
import { isModuleAccessible } from '@/services/vault';

if (!isModuleAccessible('ledger')) {
  return <VaultLockedScreen module="ledger" />;
}
```

Never render raw financial figures outside this guard.

### Adding a New AI Action Tag

All three locations must be updated in lockstep — missing any one silently breaks the action:

1. **`services/actions.ts`** or **`actions/*.ts`** — register handler with `ActionHub.registerMultiple('ledger', {...})`
2. **`personas.ts`** — add the tag to `LEDGER_PERSONA`'s action tag section
3. **`prompts/ledger-prompt-builder.ts`** — add to `LEDGER_ALL_ACTIONS` and appropriate scope in `LEDGER_SCOPE_ACTIONS`

### Writing NSV Signals

```typescript
// Always use updateGlobalSoul in action context, never direct Firestore writes for NSV:
await updateGlobalSoul({
  resource: {
    financialFriction: score,
    resonanceROI: value,
  }
});
```

### Profile Normalization

When reading from Firestore, always pass through `normalizeLedgerProfile()` to ensure:
- Missing arrays are defaulted to `[]`
- Missing numeric fields are defaulted to `0`
- Missing strings are defaulted to `''`
- `plannerBotState` is clamped to valid enum values

### Dual-Mode Vision: Validation vs. Power User

Ledger has two philosophical operating modes depending on user context:

| Mode | User Context | AI Posture |
|---|---|---|
| **Validation** | New user, onboarding, low financial literacy | Gentle, educational; affirm existing behaviors before challenging |
| **Power User** | Complete profile, active plan, transaction history | Analytical, direct; challenge suboptimal patterns with data |

The AI should infer the mode from `profile.onboardingComplete`, `profile.activePlanId`, and the depth of transaction history. Do not hard-code mode selection — let it emerge from profile completeness signals.

### Spine Event Emission Pattern

```typescript
// In action handlers:
emitSpineEvent('TRANSACTION_CREATED', {
  domain: 'R',
  source: 'ledger',
  priority: 'alert',
  transactionId: tx.id,
  amount: absAmount,
  type: txType,
  category: tx.category,
  date: tx.date,
});

// For persistent logging:
await spineEventService.logLedgerEvent({
  type: 'TRANSACTION_CREATED',
  domain: 'R',
  source: `transaction:${tx.id}`,
  data: { ... },
  financialImpact: { amount, currency, netCashflow, frictionScore, frictionTier },
});
```

---

## 18. Common Development Tasks

### Task 1: Add a New Action Tag

Example: Adding `generate_tax_summary`:

1. **Register handler** in `services/actions.ts`:
   ```typescript
   generate_tax_summary: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
     const profile = await loadProfile(userId, encryptionKey);
     if (!profile) return;
     // Group transactions by taxCategory
     const summary = generateTaxCategorySummary(profile);
     pushAssistantMessage?.(formatTaxSummary(summary));
   },
   ```

2. **Add to personas.ts** — include in the action tags section

3. **Add to prompt builder** — `LEDGER_ALL_ACTIONS` and `LEDGER_SCOPE_ACTIONS.general`

### Task 2: Add a New Spine Event Type

1. **Add to type** in `ledger-field-actions.ts`:
   ```typescript
   export type LedgerSpineEventType = ... | 'TAX_SUMMARY_GENERATED';
   ```

2. **Add toast template** in `buildLedgerToast()`:
   ```typescript
   case 'TAX_SUMMARY_GENERATED':
     return { title: 'Tax Summary', description: '...', variant: 'success', icon: 'FileText', duration: 3000 };
   ```

3. **Add to LEDGER_TOAST_EVENTS array**

4. **Emit in action handler**:
   ```typescript
   emitSpineEvent('TAX_SUMMARY_GENERATED', { ... });
   ```

### Task 3: Add Budget Template

In `BudgetPlanner.tsx`, add to the templates array:

```typescript
const BUDGET_TEMPLATES: BudgetTemplate[] = [
  { name: '50/30/20', categories: [...] },
  { name: '70/20/10', categories: [...] },
  { name: 'Zero-Based', categories: [...] },
  // Add new template:
  { name: 'Minimalist', categories: [
    { name: 'Essentials', percent: 80 },
    { name: 'Savings', percent: 20 },
  ]},
];
```

### Task 4: Add Transaction Aggregation

In `aggregation/transaction-aggregation.ts`:

```typescript
export function aggregateByCategory(transactions: Transaction[]): CategorySummary[] {
  return transactions.reduce((acc, tx) => {
    // Group by category
  }, []);
}
```

---

## 19. Known Issues & Gotchas

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | Some actions registered in multiple files (e.g., `create_transaction`) | 🟡 Low | `services/actions.ts` + `actions/transaction-actions.ts` |
| 2 | `SavingsGoal` (onboarding) vs `FinancialGoal` (active use) have different shapes | 🟠 Medium | `ledger-intake-service.ts` vs `GoalTracker.tsx` |
| 3 | Fast-track onboarding creates expense items with `amount: 0` | 🟡 Low | `LedgerOnboarding.tsx` |
| 4 | `FinancialCharts.tsx` may use simplified data visualization | 🟡 Low | `FinancialCharts.tsx` |
| 5 | Debt simulation assumes all debts have APR | 🟡 Low | `aggregation/transaction-aggregation.ts` |

### Debugging Checklist

Before debugging any Ledger AI action failure, verify:
- [ ] Action tag is registered in one of: `services/actions.ts`, `actions/ledger-field-actions.ts`, `actions/transaction-actions.ts`
- [ ] Action tag is in `LEDGER_PERSONA` (personas.ts)
- [ ] Action tag is in `LEDGER_ALL_ACTIONS` and appropriate scope in `LEDGER_SCOPE_ACTIONS` (ledger-prompt-builder.ts)
- [ ] Vault gate passes (`isModuleAccessible('ledger')` returns `true`)
- [ ] Profile has been normalized (not raw Firestore document)
- [ ] Spine event type is in `LedgerSpineEventType` union

### Common Debugging Commands

```bash
# Find all action registrations
grep -r "ActionHub.register" src/modules/ledger/

# Find all Spine event emissions
grep -r "emitSpineEvent" src/modules/ledger/

# Find all profile loads
grep -r "loadLedgerProfile\|loadProfile" src/modules/ledger/

# Check action scope definitions
grep -n "LEDGER_SCOPE_ACTIONS" src/modules/ledger/prompts/
```

---

## Appendix: Quick Reference

### Key Constants

| Constant | Location | Purpose |
|---|---|---|
| `LEDGER_PERSONA` | `personas.ts` | Full AI system prompt and behavioral config |
| `LEDGER_SUGGESTED_EXTENSIONS` | `field-templates.ts` | 10 suggested extension fields |
| `LEDGER_ALL_ACTIONS` | `prompts/ledger-prompt-builder.ts` | All valid AI action tags |
| `LEDGER_SCOPE_ACTIONS` | `prompts/ledger-prompt-builder.ts` | Actions per conversation mode |
| `LedgerSpineEventType` | `actions/ledger-field-actions.ts` | 18 Spine event types |
| `LEDGER_TOAST_EVENTS` | `actions/ledger-field-actions.ts` | Events that trigger toasts |

### Key Functions

| Function | Location | Signature |
|---|---|---|
| `computeFinancialFriction` | `resonance-roi-service.ts` | `(profile) → number` |
| `computeResonanceROI` | `resonance-roi-service.ts` | `(profile) → { resonanceROI, financialFriction }` |
| `normalizeLedgerProfile` | `ledger-intake-service.ts` | `(raw) → LedgerIntakeProfile` |
| `createEmptyLedgerProfile` | `ledger-intake-service.ts` | `() → LedgerIntakeProfile` |
| `loadLedgerProfile` | `ledger-intake-service.ts` | `({ userId, encryptionKey }) → Promise<LedgerIntakeProfile>` |
| `saveLedgerProfile` | `ledger-intake-service.ts` | `(profile, { userId, encryptionKey }) → Promise<void>` |
| `registerLedgerActions` | `services/actions.ts` | `() → void` |
| `registerLedgerFieldActions` | `actions/ledger-field-actions.ts` | `() → void` |
| `registerLedgerTransactionActions` | `actions/transaction-actions.ts` | `() → void` |
| `getLedgerEvents` | `spine-event-service.ts` | `({ type, startDate }) → Promise<SpineEvent[]>` |
| `buildLedgerToast` | `actions/ledger-field-actions.ts` | `(eventType, data) → ToastTemplate \| null` |
| `isActionAllowed` | `actions/ledger-field-actions.ts` | `(actionType, scopeKind) → boolean` |
| `getFrictionTier` | `field-templates.ts` | `(score) → FrictionTier` |

### NSV Domain Summary

```
resource.financialFriction   0–10     Written by Ledger
resource.resonanceROI        0.0–1.0  Written by Ledger
```

Ledger reads from `emotional.*`, `cognitive.*`, `biological.*` domains — it does not write to them.
