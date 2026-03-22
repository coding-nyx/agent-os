# Ledger — Financial Strategist

> **ID**: `ledger` | **Theme**: Cyan | **Core**: Yes | **Soul Priority**: 4 | **Security**: locked

## Purpose
Ledger is the user's accountant — it manages all financial data: income, debt, savings, spending patterns. Distinguished by its cross-verification capability, correlating financial behavior with data from other agents to understand the user's state during spending and income events. Core philosophy: **Money is never just money** — it is downstream of stress (Agnes), energy (Titan/Soma), and cognitive capacity (Atlas).

## Agent Personality
- **Archetype**: Elite AI Financial Strategist
- **Tone**: Precise, analytical, non-judgmental about spending
- **Special**: Methodology — cashflow truth → goals → plans. Philosophy: financial health is part of overall wellness, not separate from it.
- **Response Style**: Plan-first with specific numbers only (exact amounts, dates, timelines — never vague guidance)

## NSV Ownership
- **Writes**: `resource.financialFriction` (0–10), `resource.resonanceROI` (0.0–1.0)
- **Reads**: `emotional.stressLoad`, `emotional.emotionalResilience`, `cognitive.activeLoad`, `biological.recoveryScore`

## Behavioral Economics Anchors
| Phenomenon | Description | Ledger's Use |
|---|---|---|
| **Loss Aversion** | Losses feel ~2× worse than equivalent gains | Frames savings as "losses avoided," not gains |
| **Present Bias** | Immediate rewards are systematically overweighted | Flags impulse-spend risk; promotes pre-commitment |
| **Mental Accounting** | Money is categorized in non-fungible "buckets" | Validates vs. challenges user's category logic |
| **Social Spending Pressure** | Peer behavior drives discretionary spend | Surfaces hidden social spend triggers |
| **Stress Spending Cascades** | Cortisol elevation → impulsive discretionary spend | Cross-reads Agnes stress signal before advice |

## Key Actions (26 total)

### Field Management
- `suggest_field` — emit suggestion for new extension field
- `create_field` — create schema-validated extension field
- `delete_field` — remove extension field from schema
- `set_field_value` — update a custom field value with LLM validation

### Financial Metrics
- `update_financial_friction` — write friction score (0–10) to profile + NSV
- `compute_resonance_roi` — write both ROI metrics to profile + NSV
- `financial_health_check` — emit health check event
- `detect_risk` — emit risk detection event

### Transactions
- `create_transaction` / `add_transaction` — create new transaction (auto-links to budget)
- `update_transaction` — update existing transaction
- `delete_transaction` — remove transaction and reverse budget spent
- `categorize_expense` — update transaction category
- `log_transaction_summary` — persist transaction context summary

### Budget
- `create_budget` — create new BudgetCategory
- `modify_budget` — update BudgetCategory

### Goals
- `create_goal` / `set_financial_goal` — create new FinancialGoal
- `update_goal_progress` — update goal currentAmount
- `complete_goal` — mark goal as completed

### Analysis & Planning
- `create_financial_plan` — create and activate a FinancialPlan
- `update_budget_snapshot` — replace full budget snapshot
- `analyze_financial_document` — commit extracted document data

### Simulation
- `run_debt_simulation` — run avalanche/snowball payoff simulation
- `project_savings_timeline` — project completion timeline for goals

## Spine Events (18)
- **Emits**: BUDGET_UPDATED, GOAL_PROGRESS, FINANCIAL_FRICTION_CHANGED, RESONANCE_ROI_UPDATED, FINANCIAL_PLAN_CREATED, DOCUMENT_ANALYZED, FIELD_CREATED, FIELD_DELETED, FIELD_VALUE_UPDATED, TRANSACTION_CREATED, TRANSACTION_UPDATED, TRANSACTION_DELETED, BUDGET_CREATED, BUDGET_MODIFIED, GOAL_CREATED, GOAL_COMPLETED, FINANCIAL_HEALTH_CHECK, RISK_DETECTED
- **Listens**: Emotional stress changes (from Agnes), planning events (from Atlas to align financial goals)

## Prompt Modes (4)
| Mode | Use Case | Actions |
|---|---|---|
| `general` | Default AI chat | 14 actions |
| `budget-review` | Deep-dive on one spend category | 7 actions |
| `goal-focus` | Progress review for one goal | 7 actions |
| `field-crud` | Schema management (no user data) | 4 actions |

## UI Tabs (5)
- **Dashboard**: Stats (income, expenses, net savings, ROI), AI advisor, behavioral insights, charts
- **Transactions**: Add/edit/delete, search/filter/sort, CSV import/export, recurring flags
- **Budget**: Categories with targets, template presets (50/30/20, 70/20/10, zero-based)
- **Goals**: Type, target/current amount, target date, contribution, priority, milestones
- **Analytics**: Spending trends, debt strategist (avalanche/snowball)

## Cross-Module Links
- With Agnes: understands emotional state during spending (stress spending, retail therapy, financial anxiety) — reads `stressLoad` for 23% elevated variable spend risk
- With Titan: correlates health-related spending (gym, supplements, medical) with physical outcomes — reads `recoveryScore` for health cost inflation risk
- With Atlas: aligns financial goals with life goals — reads `activeLoad` for convenience/decision-fatigue spending risk

## Data Shape
```typescript
interface LedgerIntakeProfile {
  onboardingComplete: boolean;
  currency: string;
  monthlyIncome: number;
  fixedExpenses: BudgetLineItem[];
  variableExpenses: BudgetLineItem[];
  debtItems: DebtItem[];
  savingsGoals: SavingsGoal[];
  planningHorizon: 'monthly' | 'quarterly' | 'yearly';
  plans: FinancialPlan[];
  activePlanId: string | null;
  transactions?: Transaction[];
  budgetCategories?: BudgetCategory[];
  financialGoals?: FinancialGoal[];
  extensionValues?: Record<string, unknown>;
}
```

## Implementation Notes
- ✅ Cross-verification engine implemented (stated vs. actual spend)
- ✅ Resonance ROI computation implemented (`resonance-roi-service.ts`)
- ✅ Financial Friction score (0–10) with tier classification (low/moderate/elevated/critical)
- ✅ Starter Plan auto-bootstrap on onboarding completion
- ✅ 10 built-in extension field templates across 4 categories
- ⚠️ Tax tools (deduction tracking, filing assistance) partially implemented (TaxTracker component exists)
