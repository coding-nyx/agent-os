---
name: ledger
description: >
  Invoke this skill when working on the Ledger financial intelligence module of the Nexus AGNES SPA.
  It covers the full module: AI persona, data models, action tags, UI structure, services layer,
  diagnosis pipeline, NSV signal ownership, cross-module cascades, known type gaps, and development
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
8. [UI Structure](#8-ui-structure)
9. [Services Layer](#9-services-layer)
10. [Diagnosis Pipeline](#10-diagnosis-pipeline)
11. [Prompt Builder](#11-prompt-builder)
12. [Resonance ROI Service](#12-resonance-roi-service)
13. [Starter Plan Auto-Bootstrap](#13-starter-plan-auto-bootstrap)
14. [Extension Fields](#14-extension-fields)
15. [File Structure](#15-file-structure)
16. [Development Patterns](#16-development-patterns)
17. [Common Development Tasks](#17-common-development-tasks)
18. [Known Issues & Gotchas](#18-known-issues--gotchas)

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

> **Critical vault rule:** Always call `isModuleAccessible('ledger')` before rendering any financial data. Never bypass the vault gate.

---

## 2. What Ledger Is

Ledger is the **financial intelligence module** of Nexus. It acts as an AI financial strategist grounded in behavioral economics, cross-domain wellness awareness, and resource optimization.

The AI agent is named **"Ledger"** (user-customizable alias). Its core philosophy:

> **Money is never just money.** It is downstream of stress (Agnes), energy (Titan/Soma), and cognitive capacity (Atlas).

Ledger does not operate in isolation — it reads wellness signals from peer modules and writes financial friction signals back into the global NSV (Nexus Signal Vector), creating a bidirectional feedback loop between financial health and physical/cognitive health.

---

## 3. AI Persona & Behavioral Economics

**Source:** `src/modules/ledger/personas.ts` → `LEDGER_PERSONA`

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
| **Agnes** | High cortisol / stress | Flags 23% elevated variable spend risk; stress-spending advisory |
| **Atlas** | Cognitive fatigue | Flags convenience/decision-fatigue spending risk |
| **Titan** | Low resilience score | Flags health cost inflation risk; recovery-compressing spend |

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
GlobalProjectionService.updateCrossFunctionalState(uid, {
  resource: {
    financialFriction: score,
    resonanceROI: value,
  }
});
```

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

### Supporting Types

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
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate?: string;
  // ⚠️ NOTE: does NOT have `currentAmount` — see Known Issues §18
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

  // ⚠️ MISSING — accessed via `as any` in LedgerWorkspace.tsx:
  // transactions?: Transaction[]
  // budgetCategories?: BudgetCategory[]
  // financialGoals?: FinancialGoal[]
}
```

### Transaction Type (not in main profile — defined in component)

**Source:** `src/modules/ledger/components/TransactionManager.tsx`

```typescript
export interface Transaction {
  id: string;
  date: string;               // ISO 8601
  description: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  recurring?: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  tags?: string[];
  notes?: string;
}
```

### FinancialGoal Type (component-local, GoalTracker.tsx)

```typescript
// Defined in GoalTracker.tsx — NOT in ledger-intake-service.ts
interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;  // ⚠️ SavingsGoal in service does NOT have this field
  targetDate?: string;
  // ... other goal-tracker fields
}
```

> **Type mismatch warning:** `FinancialGoal.currentAmount` exists in `GoalTracker.tsx` but `SavingsGoal` in `ledger-intake-service.ts` does not have `currentAmount`. These two types are divergent and will conflict when you try to unify them.

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

> **Fast-track UX note:** The fast-track form collects comma-separated **labels only** — no amounts at intake. Expense items are created with `amount: 0` and must be filled in post-onboarding. This is a known gap (see §18, issue #6).

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

When `complete_ledger_onboarding` fires and no active plan exists, the system auto-creates a Starter Plan (see §13).

---

## 7. Action Tags Reference

### Working Action Tags (confirmed in codebase)

| Tag | Payload Shape | Description |
|---|---|---|
| `create_financial_plan` | `{ title, summary, monthlyTarget, allocation: { essentials, growth, buffer }, tasks[] }` | Create a new `FinancialPlan` and set as active |
| `update_budget_snapshot` | `{ monthlyIncome, fixedExpenses[], variableExpenses[], debtItems[], savingsGoals[] }` | Replace the full budget snapshot on the profile |
| `update_financial_friction` | `{ score: number, analysis: string }` | Write friction score (0–10) to profile + NSV |
| `compute_resonance_roi` | `{ financialFriction: number, resonanceROI: number }` | Write both ROI metrics to profile + NSV |
| `analyze_financial_document` | `{ monthlyIncome, currency, periodLabel, fixedExpenses[], variableExpenses[], transactions[] }` | Commit extracted document data after user confirmation |
| `log_transaction_summary` | *(from `ledger-prompt-builder.ts`)* | Summarize transaction context for AI memory |
| `suggest_field` | `{ fieldId, label, type, description }` | Propose a new extension field to user |
| `create_field` | `{ fieldId, label, type, defaultValue, ... }` | Create schema-validated extension field |
| `delete_field` | `{ fieldId }` | Remove extension field |

**To add a new action:**
1. Register handler in `services/actions.ts` → `registerLedgerActions()`
2. Add the tag to `LEDGER_PERSONA` in `personas.ts` (action tags section)
3. Add the tag to `LEDGER_ALL_ACTIONS` in `prompts/ledger-prompt-builder.ts`

All three locations must be updated — missing any one silently breaks the action.

### ⚠️ Missing AI Action Tags (not yet implemented)

These are UI operations the AI cannot currently perform autonomously:

| Missing Tag | What It Would Do |
|---|---|
| `add_transaction` | AI autonomously logs a new transaction |
| `update_transaction` | AI edits an existing transaction |
| `delete_transaction` | AI removes a transaction |
| `add_goal` | AI creates a new savings goal |
| `update_goal` | AI updates goal progress or metadata |
| `add_debt_item` | AI adds a debt entry |
| `update_debt_item` | AI updates debt balance/APR |
| `update_budget_category` | AI adjusts budget category amounts |
| `categorize_transaction` | AI classifies uncategorized transactions |
| `generate_tax_summary` | AI produces a tax-category breakdown |
| `suggest_debt_strategy` | AI runs avalanche/snowball simulation |

---

## 8. UI Structure

### Main Page (`LedgerPage.tsx`)

Wrapped in `UnifiedModulePage`. Two top-level tabs:

```
[Dashboard]  [Workspace]
```

### Dashboard Tab (`LedgerDashboard.tsx`)

**Secondary view tabs:** Overview | Cash Flow | Debt Tracker

#### Stat Cards

| Card | Data Source |
|---|---|
| Monthly Income | `profile.monthlyIncome` |
| Total Expenses | Sum of `fixedExpenses` + `variableExpenses` amounts |
| Net Savings | `monthlyIncome - totalExpenses` |
| Resonance ROI | `resource.resonanceROI` from NSV |

#### Dashboard Panels

- **ProgressRow**: Top 5 expenses as percentage bars of income
- **CashFlowChart**: ⚠️ **Currently uses `Math.random()` mock data** — NOT derived from real transactions
- **DebtPayoffTracker**: ⚠️ **Also mock data**
- **AI Financial Advisor panel**: inline AI chat scoped to financial advice
- **BehavioralInsightsPanel**: surfaces behavioral economics insights based on NSV signals

#### Dashboard Warnings (auto-shown)

| Condition | Warning Shown |
|---|---|
| `monthlyIncome < totalExpenses` | Negative cashflow alert |
| `financialFriction > 7` | High friction warning |
| `activePlanId === null` | No active plan prompt |

### Workspace Tab (`LedgerWorkspace.tsx`)

Four sub-tabs:

#### 1. Transactions (`TransactionManager.tsx`)

- Add / edit / delete transactions manually
- Search by description, filter by category and type, sort by date/amount
- CSV import and export
- Recurring transaction flag with frequency selection
- Tags and notes per transaction

#### 2. Budget Planner (`BudgetPlanner.tsx`)

- Budget categories with amount targets
- Template presets:
  - **50/30/20** — Needs / Wants / Savings
  - **70/20/10** — Living / Savings / Giving
  - **Zero-based** — Every dollar assigned

#### 3. Goals (`GoalTracker.tsx`)

Fields per goal: type, target amount, current amount, contribution schedule, priority, milestones

> **Type mismatch:** `currentAmount` exists here but not in `SavingsGoal` in the service — they will diverge on persistence.

#### 4. Fields (`FieldsTab.tsx`)

Manage extension fields. Renders suggested fields from `LEDGER_SUGGESTED_EXTENSIONS` in `field-templates.ts`.

### Top-Bar Document Actions

| Action | Flow |
|---|---|
| 📷 **Camera Capture** | Vision AI via `openai/gpt-4o` → extract financial data → confirmation modal → `analyze_financial_document` |
| 📁 **File Upload** | Document intelligence pipeline → structured extraction → confirmation modal → commit |
| 📂 **Embedded Doc Analysis** | Opens AI chat mode scoped to uploaded document |

> **Camera capture prerequisite:** Requires `openrouter_api_key` in `localStorage`. Fails gracefully but **silently** if key is absent — no visible error to user.

---

## 9. Services Layer

```
src/modules/ledger/services/
├── ledger-intake-service.ts
├── ledger-cross-verification-engine.ts
├── resonance-roi-service.ts
├── spine-event-service.ts
└── actions.ts
```

### `ledger-intake-service.ts`

Responsibilities:
- Firestore CRUD operations on `ledger_profiles/{uid}` (encrypted via vault)
- `normalizeLedgerProfile(raw)` — coerces raw Firestore document into typed `LedgerIntakeProfile`
- `createEmptyLedgerProfile()` — returns a zeroed profile for new users

### `ledger-cross-verification-engine.ts`

Cross-verifies stated budget figures against actual transaction data. Surfaces discrepancies between what the user says they spend and what transactions show.

### `resonance-roi-service.ts`

```typescript
// computeResonanceROI(profile: LedgerIntakeProfile): { resonanceROI: number, financialFriction: number }
```

Inputs it uses:
- `fixedExpenses`, `variableExpenses`
- `debtItems`
- `savingsGoals`
- `monthlyIncome`
- `activePlan` (allocation percentages)

See §12 for full algorithm details.

### `spine-event-service.ts`

```typescript
getLedgerEvents({ type: string, startDate: string }): Promise<SpineEvent[]>
```

Spine event types emitted by Ledger:

| Event Type | Trigger |
|---|---|
| `TRANSACTION_CREATED` | New transaction added |
| `BUDGET_UPDATED` | Budget snapshot updated |
| `GOAL_ACHIEVED` | Savings goal reached |
| `FINANCIAL_FRICTION_UPDATED` | Friction score changes |
| `PLAN_ACTIVATED` | A financial plan set as active |

### `actions.ts`

Entry point: `registerLedgerActions()`. Called at module init. Registers all Ledger action tags with the global ActionHub. Must be the single source of truth for action registration.

---

## 10. Diagnosis Pipeline

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

## 11. Prompt Builder

**Source:** `src/modules/ledger/prompts/ledger-prompt-builder.ts`

### Four Conversation Modes

| Mode | Context Included | Use Case |
|---|---|---|
| `general` | Full persona + full profile + extension fields | Default AI chat in Ledger |
| `budget-review` | Persona + scoped to single budget category | Deep-dive on one spend category |
| `goal-focus` | Persona + scoped to single financial goal | Progress review for one goal |
| `field-crud` | Schema management ONLY — **no user financial data** | Create/edit/delete extension fields |

> **Security note for `field-crud` mode:** No user financial data should ever be included in the field-crud prompt. The AI in this mode should only see schema metadata.

### Prompt Composition

The builder references `LEDGER_ALL_ACTIONS` — the canonical list of all valid action tags Ledger's AI may emit. This list must be kept in sync with `services/actions.ts` and `personas.ts`.

`log_transaction_summary` is emitted from this layer to summarize transaction context for AI memory without sending raw transaction arrays.

---

## 12. Resonance ROI Service

**Source:** `src/modules/ledger/services/resonance-roi-service.ts`

### Algorithm Overview

```typescript
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
GlobalProjectionService.updateCrossFunctionalState(uid, {
  resource: {
    financialFriction: result.financialFriction,
    resonanceROI: result.resonanceROI,
  }
});
```

This also triggers cascade checks (§4) — if thresholds are crossed, peer modules are notified.

---

## 13. Starter Plan Auto-Bootstrap

Fires automatically when `complete_ledger_onboarding` action executes and `profile.activePlanId === null`.

```typescript
function createStarterPlan(profile: LedgerIntakeProfile): FinancialPlan {
  const totalFixed    = sum(profile.fixedExpenses.map(e => e.amount));
  const totalVariable = sum(profile.variableExpenses.map(e => e.amount));

  return {
    id: generateId(),
    title: 'Starter Financial Plan',
    summary: 'AI-generated baseline plan from onboarding data.',
    monthlyTarget: Math.max(profile.monthlyIncome - (totalFixed + totalVariable), 0),
    allocation: {
      essentials: 60,  // %
      growth: 25,      // %
      buffer: 15,      // %
    },
    tasks: [
      'Track every variable expense for 30 days to establish baseline.',
      'Cap discretionary spend at 80% of current variable total.',
      'Apply buffer deposit on first paycheck of each month.',
    ],
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
}
```

> **Note:** `monthlyTarget` will be `0` if `totalFixed + totalVariable >= monthlyIncome` — this is a legitimate crisis signal, not a bug.

---

## 14. Extension Fields

**Source:** `src/modules/ledger/field-templates.ts` → `LEDGER_SUGGESTED_EXTENSIONS`

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

AI can suggest and create extension fields using `suggest_field` → `create_field` flow. All fields are schema-validated before persistence.

---

## 15. File Structure

```
src/modules/ledger/
├── LedgerPage.tsx                        — Main page; UnifiedModulePage wrapper, tab routing
├── field-templates.ts                    — LEDGER_SUGGESTED_EXTENSIONS, field builder utilities
├── personas.ts                           — LEDGER_PERSONA (system prompt, action tags, behavioral anchors)
│
├── actions/
│   ├── ledger-field-actions.ts           — Field system action handlers + spine event registrations
│   └── transaction-actions.ts            — Transaction-related action registrations
│
├── components/
│   ├── LedgerDashboard.tsx               — Dashboard tab: stat cards, charts, advisor panel
│   ├── LedgerWorkspace.tsx               — Workspace tab: sub-tab router (⚠️ contains `as any` casts)
│   ├── TransactionManager.tsx            — Transaction CRUD, search/filter, CSV import/export
│   ├── BudgetPlanner.tsx                 — Budget categories, allocation templates
│   ├── GoalTracker.tsx                   — Savings goals with currentAmount (type-divergent from service)
│   ├── FinancialCharts.tsx               — CashFlowChart + DebtPayoffTracker (⚠️ MOCK DATA — Math.random)
│   ├── AIFinancialAdvisor.tsx            — Inline AI advisor panel
│   ├── BehavioralInsightsPanel.tsx       — Behavioral economics signal surface
│   ├── FieldsTab.tsx                     — Extension fields management UI
│   └── index.ts                          — Component barrel exports
│
├── diagnosis/
│   ├── ledger-diagnosis-spec.ts          — Registers diagnosis spec with global diagnosis system
│   ├── ledger-diagnosis-extractor.ts     — Extracts financial signals from profile
│   ├── ledger-diagnosis-prompt.ts        — Builds AI prompt for diagnosis run
│   └── ledger-diagnosis-merge.ts         — Merges AI diagnosis output back into profile
│
├── onboarding/
│   ├── LedgerOnboarding.tsx              — 4-step onboarding wizard
│   └── LedgerOnboarding.test.tsx         — Onboarding unit tests
│
├── prompts/
│   └── ledger-prompt-builder.ts          — Builds AI prompts (4 modes); owns LEDGER_ALL_ACTIONS
│
└── services/
    ├── ledger-intake-service.ts          — Firestore CRUD, normalizeLedgerProfile, createEmptyLedgerProfile
    ├── ledger-cross-verification-engine.ts — Cross-verify stated vs. actual spend
    ├── resonance-roi-service.ts          — computeResonanceROI → NSV write
    ├── spine-event-service.ts            — getLedgerEvents (typed Spine event queries)
    └── actions.ts                        — registerLedgerActions — ActionHub registration entry point
```

---

## 16. Development Patterns

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

1. **`services/actions.ts`** — register the handler with ActionHub
2. **`personas.ts`** — add the tag to `LEDGER_PERSONA`'s action tag section
3. **`prompts/ledger-prompt-builder.ts`** — add the tag to `LEDGER_ALL_ACTIONS`

### Writing NSV Signals

```typescript
// Always use GlobalProjectionService, never direct Firestore writes for NSV:
import { GlobalProjectionService } from '@/services/global-projection-service';

await GlobalProjectionService.updateCrossFunctionalState(uid, {
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

---

## 17. Common Development Tasks

### Task 1: Fix Type Gaps (Priority: High)

Add `transactions`, `budgetCategories`, and `financialGoals` as first-class typed fields in `LedgerIntakeProfile`.

**File:** `src/modules/ledger/services/ledger-intake-service.ts`

```typescript
// Add to LedgerIntakeProfile:
transactions?: Transaction[];
budgetCategories?: BudgetCategory[];
financialGoals?: FinancialGoal[];  // align currentAmount with SavingsGoal
```

Also update `normalizeLedgerProfile()` to default these arrays to `[]`.

> **Gotcha:** `FinancialGoal.currentAmount` in `GoalTracker.tsx` does not exist in `SavingsGoal`. Decide whether to add `currentAmount` to `SavingsGoal` or keep them as separate types with a mapping layer.

### Task 2: Fix Charts (Priority: High)

**File:** `src/modules/ledger/components/FinancialCharts.tsx`

Replace all `Math.random()` calls with aggregation over `profile.transactions[]`.

```typescript
// Instead of:
const data = months.map(m => ({ month: m, income: Math.random() * 5000, expenses: Math.random() * 4000 }));

// Derive from real data:
const data = aggregateTransactionsByMonth(profile.transactions ?? [], months);
```

Write a pure `aggregateTransactionsByMonth(transactions, months)` utility — keep it in a separate file for testability.

### Task 3: Add AI Transaction Action

1. Create action handler in `services/actions.ts`:
   ```typescript
   ActionHub.register('add_transaction', async (payload: Partial<Transaction>, ctx) => {
     const tx: Transaction = { id: generateId(), ...payload, createdAt: now() };
     await updateLedgerProfile(ctx.uid, { transactions: arrayUnion(tx) });
   });
   ```
2. Add `add_transaction` to `LEDGER_PERSONA` action tags
3. Add `add_transaction` to `LEDGER_ALL_ACTIONS`

### Task 4: Add Tax Summary Feature

1. Create `src/modules/ledger/services/ledger-tax-service.ts`
2. Implement `generateTaxSummary(profile)` — group by `taxCategory` field on `BudgetLineItem`
3. Register `generate_tax_summary` action in all three locations (§16 pattern)

### Task 5: Add Debt Strategy AI Action

1. Implement `suggest_debt_strategy` action
2. Support both avalanche (highest APR first) and snowball (lowest balance first) simulation
3. Payload: `{ strategy: 'avalanche' | 'snowball', extraMonthlyPayment: number }`
4. Response: payoff timeline per debt item, total interest saved

---

## 18. Known Issues & Gotchas

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | `transactions` stored on profile via `as any` | 🔴 High | `LedgerWorkspace.tsx` |
| 2 | `budgetCategories` stored via `as any` — may not persist correctly with `update_budget_snapshot` | 🔴 High | `LedgerWorkspace.tsx` |
| 3 | `financialGoals` stored via `as any` | 🔴 High | `LedgerWorkspace.tsx` |
| 4 | `FinancialGoal.currentAmount` (GoalTracker) vs. `SavingsGoal` (service) — type divergence | 🔴 High | `GoalTracker.tsx` / `ledger-intake-service.ts` |
| 5 | `CashFlowChart` and `DebtPayoffTracker` use `Math.random()` — different data every render | 🟠 Medium | `FinancialCharts.tsx` |
| 6 | Fast-track onboarding creates expense items with `amount: 0` — needs amount input in form | 🟠 Medium | `LedgerOnboarding.tsx` |
| 7 | Camera capture silently fails if `openrouter_api_key` absent in localStorage | 🟡 Low | `LedgerWorkspace.tsx` (top-bar) |
| 8 | `update_budget_snapshot` action exists but targets a field (`budgetCategories`) that is `as any` typed | 🟠 Medium | `services/actions.ts` |
| 9 | No AI action to autonomously add/update/delete transactions — user must do this manually | 🟠 Medium | Missing action tags |
| 10 | `generate_tax_summary` and `suggest_debt_strategy` not implemented — AI cannot perform these | 🟡 Low | Missing service + action tags |

### Debugging Checklist

Before debugging any Ledger AI action failure, verify:
- [ ] Action tag is in `services/actions.ts` (registered with ActionHub)
- [ ] Action tag is in `LEDGER_PERSONA` (personas.ts)
- [ ] Action tag is in `LEDGER_ALL_ACTIONS` (ledger-prompt-builder.ts)
- [ ] Vault gate passes (`isModuleAccessible('ledger')` returns `true`)
- [ ] Profile has been normalized (not raw Firestore document)
- [ ] If touching transactions/goals/categories — check for `as any` cast issues

---

## Appendix: Quick Reference

### Key Constants

| Constant | Location | Purpose |
|---|---|---|
| `LEDGER_PERSONA` | `personas.ts` | Full AI system prompt and behavioral config |
| `LEDGER_SUGGESTED_EXTENSIONS` | `field-templates.ts` | 10 suggested extension fields |
| `LEDGER_ALL_ACTIONS` | `prompts/ledger-prompt-builder.ts` | Canonical list of all valid AI action tags |

### Key Functions

| Function | Location | Signature |
|---|---|---|
| `computeResonanceROI` | `resonance-roi-service.ts` | `(profile) → { resonanceROI, financialFriction }` |
| `normalizeLedgerProfile` | `ledger-intake-service.ts` | `(raw) → LedgerIntakeProfile` |
| `createEmptyLedgerProfile` | `ledger-intake-service.ts` | `() → LedgerIntakeProfile` |
| `registerLedgerActions` | `services/actions.ts` | `() → void` (called at module init) |
| `getLedgerEvents` | `spine-event-service.ts` | `({ type, startDate }) → Promise<SpineEvent[]>` |
| `registerDiagnosisSpec` | *(global)* | Called with `ledgerDiagnosisSpec` at startup |

### NSV Domain Summary

```
resource.financialFriction   0–10     Written by Ledger
resource.resonanceROI        0.0–1.0  Written by Ledger
```

Ledger reads from `agnes.*`, `titan.*`, `atlas.*` domains — it does not write to them.
