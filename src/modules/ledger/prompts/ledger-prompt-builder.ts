/**
 * Ledger Module — Prompt Builder
 *
 * Four conversation modes for the Ledger module:
 *   - general:       Full persona + profile + extension fields
 *   - budget-review: Scoped to a single budget category
 *   - goal-focus:    Scoped to a single financial goal
 *   - field-crud:    Schema management only, NO user financial data
 *
 * Architecture rules:
 *   - LLM is the sole semantic domain validator — no keyword gates
 *   - Each mode restricts actions to prevent hallucinated out-of-scope mutations
 *   - field-crud mode NEVER includes user financial data
 *   - Extension field values are auto-injected via serializeLedgerExtensionFields
 *   - Financial Friction (0-10) is a cross-module signal written to NSV
 */

import type { FieldDefinition } from '@/lib/field-system/types';
import type { Account, RecurringRule, NetWorthSnapshot, CashFlowForecast } from '../services/ledger-intake-service';
import { computeUpcomingBills } from '../services/recurring-engine';
import { computeCurrentNetWorth } from '../services/aggregation/networth-aggregation';
import type { DebtItem } from '../services/ledger-intake-service';

// ============================================================================
// Type Definitions
// ============================================================================

export interface BudgetSnapshot {
  categoryName: string;
  allocated: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  recentTransactions: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
  currency: string;
  period: 'monthly' | 'weekly';
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  monthlyContribution?: number;
  projectedDate?: string;
  percentComplete: number;
  currency: string;
}

export type LedgerContextMode =
  | { kind: 'general' }
  | { kind: 'budget-review'; budget: BudgetSnapshot }
  | { kind: 'goal-focus'; goal: FinancialGoal }
  | { kind: 'field-crud'; currentExtensions: FieldDefinition[] };

export interface PromptModeResult {
  systemPrompt: string;
  allowedActions: string[];
  persistent: boolean;
}

// ============================================================================
// Action Definitions Per Scope
// ============================================================================

export const LEDGER_ALL_ACTIONS = [
  'create_financial_plan',
  'update_budget_snapshot',
  'update_financial_friction',
  'compute_resonance_roi',
  'analyze_financial_document',
  'log_transaction_summary',
  'propose_reminder',
  'query_reminders',
  'suggest_field',
  'create_field',
  'delete_field',
] as const;

export const LEDGER_SCOPE_ACTIONS: Record<
  LedgerContextMode['kind'],
  readonly string[]
> = {
  general: [
    'create_financial_plan',
    'create_financial_plan_request',
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
    // Multi-account
    'create_account',
    'update_account',
    'delete_account',
    'transfer_funds',
    'reconcile_account',
    // Net worth
    'record_net_worth_snapshot',
    // Recurring
    'create_recurring_rule',
    'update_recurring_rule',
    'delete_recurring_rule',
    'post_recurring_now',
    'skip_next_occurrence',
    // Forecast
    'generate_cash_flow_forecast',
    // Bank sync
    'sync_bank_account',
    // Subscriptions
    'create_subscription',
    'update_subscription',
    'delete_subscription',
    'cancel_subscription',
    // Investments
    'add_investment',
    'update_investment',
    'delete_investment',
    'record_portfolio_snapshot',
    'add_dividend',
    // Alerts
    'create_alert_rule',
    'delete_alert_rule',
    'toggle_alert_rule',
    'dismiss_notification',
    // Tax depth
    'set_tax_category',
    'add_tax_deduction',
    'delete_tax_deduction',
    'generate_tax_summary',
    // Export
    'export_transactions_csv',
    'export_tax_summary',
    'export_net_worth_report',
    // Credit score
    'add_credit_score_entry',
    'delete_credit_score_entry',
    'analyze_credit_score_trend',
    // Insurance
    'create_insurance_policy',
    'update_insurance_policy',
    'delete_insurance_policy',
    'analyze_insurance_coverage',
    // Retirement
    'create_retirement_plan',
    'update_retirement_plan',
    'delete_retirement_plan',
    'project_retirement',
    // Automation suggestions
    'create_automation_rule',
    'update_automation_rule',
    'delete_automation_rule',
    'dismiss_suggestion',
    'add_default_automation_rules',
    // Receipts
    'add_receipt',
    'delete_receipt',
    'link_receipt_to_transaction',
    'analyze_receipts_by_tax_year',
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
} as const;

// ============================================================================
// Base Persona
// ============================================================================

const LEDGER_BASE_IDENTITY = `IDENTITY:
You are LEDGER, an elite AI Financial Strategist.
Your tone is direct, analytical, and practical.
You optimize budgeting, debt pressure, savings velocity, and plan adherence.

CORE METHODOLOGY:
- Start from cashflow truth: income, fixed costs, variable spending, debt obligations.
- Convert user goals into clear monthly/quarterly financial plans.
- Track Financial Friction (0-10) and Resonance ROI (wellbeing return per dollar spent).
- Always confirm data with the user before committing financial mutations.

INTERACTION PROTOCOLS:
1. INTERNAL MONOLOGUE: Begin with a <thought> block that analyzes spending context and financial risk.
2. PLAN-FIRST: If no active plan exists, generate one before advising tactical optimizations.
3. EXECUTION: Give concrete actions with amounts, timelines, and priorities.
4. CLARITY: Use plain language with numbers; avoid vague finance advice.
5. PRIVACY: All financial data is encrypted end-to-end. Never suggest sharing sensitive data externally.`;

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build the system prompt and allowed actions for the given conversation mode.
 */
export function buildLedgerPrompt(mode: LedgerContextMode): PromptModeResult {
  switch (mode.kind) {
    case 'general':
      return buildGeneralMode();
    case 'budget-review':
      return buildBudgetReviewMode(mode.budget);
    case 'goal-focus':
      return buildGoalFocusMode(mode.goal);
    case 'field-crud':
      return buildFieldCrudMode(mode.currentExtensions);
  }
}

// ── General Mode ─────────────────────────────────────────────────────────

function buildGeneralMode(): PromptModeResult {
  const systemPrompt = `${LEDGER_BASE_IDENTITY}

AVAILABLE ACTIONS:
- <action type="create_financial_plan">{"title":"Short title","summary":"One sentence.","monthlyTarget":0,"allocation":{"essentials":[% based on user situation],"growth":[% based on user goals],"buffer":[remaining %]},"tasks":["Task one","Task two","Task three"]}</action>
  IMPORTANT: Keep each task string under 60 characters. Use at most 4 tasks. No commas inside task strings.

- <action type="update_budget_snapshot">{"monthlyIncome":0,"fixedExpenses":[],"variableExpenses":[],"debtItems":[],"savingsGoals":[]}</action>
  Use when the user provides updated income, expense, or debt information.

- <action type="update_financial_friction">{"score":0,"analysis":"..."}</action>
  Use when you assess the user's current financial stress level. Score is 0-10 integer.
  0-2: Low friction (green). 3-5: Moderate (cyan). 6-7: Elevated (amber). 8-10: Critical (red).
  Include a 1-2 sentence analysis explaining the score.

- <action type="compute_resonance_roi">{"financialFriction":0,"resonanceROI":0.0}</action>
  Use after significant financial changes to recompute the wellbeing-per-dollar ratio.

- <action type="analyze_financial_document">{"monthlyIncome":5000,"currency":"USD","periodLabel":"March 2026","fixedExpenses":[{"description":"Rent","amount":2000}],"variableExpenses":[{"description":"Food","amount":500}],"transactions":[{"date":"2026-03-01","description":"Salary","amount":5000,"category":"income"}]}</action>
  ONLY emit AFTER user has reviewed and confirmed the extracted financial data.

- <action type="log_transaction_summary">{"summary":"..."}</action>
  Use to log a summary of discussed transactions or financial events.

- <action type="propose_reminder">{"title":"...","note":"...","dueAt":"ISO8601","recurrence":{...},"priority":"alert","source":{"entityType":"finance|bill|goal","entityId":"...","label":"..."},"tags":["..."]}</action>
  Use when the user asks for a reminder related to Ledger items. Always wait for explicit confirmation before scheduling.

- <action type="query_reminders">{"moduleId":"ledger"}</action>
  Use to list existing Ledger reminders (omit moduleId to list all reminders).

- <action type="suggest_field">{"description":"...","purpose":"...","suggestedType":"number"}</action>
  Use when the user mentions tracking a financial metric not covered by existing fields.

- <action type="create_transaction">{"type":"expense","amount":150,"description":"Grocery run","category":"Food","date":"2026-03-12"}</action>
  Use when the user confirms a transaction to log. Amount must be positive.

- <action type="set_financial_goal">{"name":"Emergency Fund","type":"savings","targetAmount":10000,"currentAmount":0,"targetDate":"2027-01-01","monthlyContribution":500,"priority":"high"}</action>
  Use when the user wants to set or track a specific financial goal.

- <action type="update_goal_progress">{"goalId":"GOAL_ID","newAmount":2500}</action>
  Use when the user reports progress on an existing goal. Requires goalId from their profile.

- <action type="complete_goal">{"goalId":"GOAL_ID","goalName":"Emergency Fund"}</action>
  Use when a goal has been fully achieved.

- <action type="run_debt_simulation">{"extraMonthlyPayment":500}</action>
  Use to run avalanche vs snowball debt payoff comparison. extraMonthlyPayment is optional.

- <action type="financial_health_check">{"healthScore":6,"healthStatus":"Moderate stress"}</action>
  Use to assess and record overall financial health. healthScore is 0-10.

- <action type="detect_risk">{"riskType":"Overspending","riskDescription":"Variable expenses exceed 40% of income"}</action>
  Use when you identify a financial risk pattern.

FINANCIAL FRICTION SCALE:
Financial Friction measures emotional and operational money stress on a 0-10 scale.
Factors: cashflow pressure, debt burden, subscription creep, irregular income,
missing budget structure, approaching payment deadlines, savings inadequacy.
This metric is shared cross-module — Atlas uses it to adjust planning load.

RESONANCE ROI:
Wellbeing return per dollar spent. Higher is better. Captures whether spending
patterns produce happiness, growth, and stability — not just consumption.

RULES:
- Never suggest specific stocks, funds, or financial products by name.
- Always use the user's currency for amounts.
- Round amounts to 2 decimal places maximum.
- If the user mentions a trackable metric, consider suggesting a custom field.
- Financial data is encrypted. Do not suggest exporting unencrypted data.`;

  return {
    systemPrompt,
    allowedActions: [...LEDGER_SCOPE_ACTIONS.general],
    persistent: true,
  };
}

// ── Budget Review Mode ───────────────────────────────────────────────────

function buildBudgetReviewMode(budget: BudgetSnapshot): PromptModeResult {
  const statusLabel =
    budget.percentUsed > 100
      ? 'OVER BUDGET'
      : budget.percentUsed > 80
        ? 'WARNING'
        : 'ON TRACK';

  const transactionBlock =
    budget.recentTransactions.length > 0
      ? budget.recentTransactions
          .map(
            (t) =>
              `  ${t.date} | ${t.description} | ${budget.currency} ${t.amount.toFixed(2)}`,
          )
          .join('\n')
      : '  (No recent transactions)';

  const systemPrompt = `${LEDGER_BASE_IDENTITY}

SCOPED CONTEXT: Budget Category Review
You are reviewing a single budget category. Focus ONLY on this category's data.
Do not reference other categories or overall financial position unless asked.

CATEGORY: ${budget.categoryName}
PERIOD: ${budget.period}
ALLOCATED: ${budget.currency} ${budget.allocated.toFixed(2)}
SPENT: ${budget.currency} ${budget.spent.toFixed(2)}
REMAINING: ${budget.currency} ${budget.remaining.toFixed(2)}
UTILIZATION: ${budget.percentUsed.toFixed(1)}%
STATUS: ${statusLabel}

RECENT TRANSACTIONS:
${transactionBlock}

AVAILABLE ACTIONS:
- <action type="update_budget_snapshot">{"monthlyIncome":0,"fixedExpenses":[],"variableExpenses":[],"debtItems":[],"savingsGoals":[]}</action>
  Use when the user wants to adjust this category's allocation or expenses.

- <action type="create_transaction">{"type":"expense","amount":50,"description":"Transaction description","category":"${budget.categoryName}","date":"2026-03-12"}</action>
  Use when the user wants to log a transaction within this budget category.

- <action type="create_budget">{"name":"Food & Dining","amount":600,"currency":"USD","categories":["groceries","restaurants"]}</action>
  Use to create a new budget category.

- <action type="modify_budget">{"budgetId":"BUDGET_ID","budgetName":"Food & Dining","amount":700,"changeSummary":"Increased food budget by $100"}</action>
  Use to update an existing budget category amount.

- <action type="financial_health_check">{"healthScore":6,"healthStatus":"Moderate stress"}</action>
  Use to assess overall financial health after reviewing budget performance.

- <action type="propose_reminder">{"title":"...","note":"...","dueAt":"ISO8601","recurrence":{...},"priority":"alert","source":{"entityType":"bill|budget","entityId":"...","label":"..."},"tags":["..."]}</action>
  Use when the user asks for a budget reminder. Always wait for explicit confirmation before scheduling.

- <action type="query_reminders">{"moduleId":"ledger"}</action>
  Use to list existing Ledger reminders (omit moduleId to list all reminders).

RULES:
- Only discuss this budget category.
- Suggest specific cuts or reallocations with concrete numbers.
- If over budget, identify the top 2-3 transactions driving the overage.
- Use ${budget.currency} for all amounts.`;

  return {
    systemPrompt,
    allowedActions: [...LEDGER_SCOPE_ACTIONS['budget-review']],
    persistent: false,
  };
}

// ── Goal Focus Mode ──────────────────────────────────────────────────────

function buildGoalFocusMode(goal: FinancialGoal): PromptModeResult {
  const progressLabel =
    goal.percentComplete >= 90
      ? 'NEARLY COMPLETE'
      : goal.percentComplete >= 50
        ? 'GOOD PROGRESS'
        : goal.percentComplete >= 25
          ? 'BUILDING MOMENTUM'
          : 'EARLY STAGE';

  const projectionBlock = goal.projectedDate
    ? `PROJECTED COMPLETION: ${goal.projectedDate}`
    : goal.monthlyContribution && goal.monthlyContribution > 0
      ? `PROJECTED COMPLETION: ~${Math.ceil(
          (goal.targetAmount - goal.currentAmount) / goal.monthlyContribution,
        )} months at current rate`
      : 'PROJECTED COMPLETION: Unable to estimate — no contribution data';

  const systemPrompt = `${LEDGER_BASE_IDENTITY}

SCOPED CONTEXT: Financial Goal Focus
You are advising on a single financial goal. Focus ONLY on this goal's progress
and strategies to accelerate or optimize it.

GOAL: ${goal.name}
TARGET: ${goal.currency} ${goal.targetAmount.toFixed(2)}
CURRENT: ${goal.currency} ${goal.currentAmount.toFixed(2)}
PROGRESS: ${goal.percentComplete.toFixed(1)}%
STATUS: ${progressLabel}
${goal.targetDate ? `TARGET DATE: ${goal.targetDate}` : ''}
${goal.monthlyContribution ? `MONTHLY CONTRIBUTION: ${goal.currency} ${goal.monthlyContribution.toFixed(2)}` : ''}
${projectionBlock}

AVAILABLE ACTIONS:
- <action type="update_budget_snapshot">{"savingsGoals":[{"id":"${goal.id}","name":"${goal.name}","targetAmount":${goal.targetAmount}}]}</action>
  Use when the user wants to adjust this goal's target, contribution, or timeline.

- <action type="set_financial_goal">{"name":"${goal.name}","type":"savings","targetAmount":${goal.targetAmount},"currentAmount":${goal.currentAmount},"targetDate":"YYYY-MM-DD","monthlyContribution":500,"priority":"high"}</action>
  Use when the user wants to create a new goal or replace this one.

- <action type="update_goal_progress">{"goalId":"${goal.id}","newAmount":${goal.currentAmount}}</action>
  Use when the user reports updated progress toward this goal.

- <action type="complete_goal">{"goalId":"${goal.id}","goalName":"${goal.name}"}</action>
  Use when the user confirms this goal has been fully achieved.

- <action type="project_savings_timeline">{"goalId":"${goal.id}"}</action>
  Use to project when the user will reach their savings goal based on monthly contribution.

- <action type="create_transaction">{"type":"income","amount":500,"description":"Goal contribution","category":"Savings","date":"2026-03-12"}</action>
  Use when the user logs a contribution toward this goal.

- <action type="propose_reminder">{"title":"...","note":"...","dueAt":"ISO8601","recurrence":{...},"priority":"alert","source":{"entityType":"goal","entityId":"...","label":"..."},"tags":["..."]}</action>
  Use when the user asks for a goal reminder. Always wait for explicit confirmation before scheduling.

- <action type="query_reminders">{"moduleId":"ledger"}</action>
  Use to list existing Ledger reminders (omit moduleId to list all reminders).

RULES:
- Only discuss this specific goal.
- Suggest concrete contribution increases with specific dollar amounts.
- If behind schedule, propose catch-up strategies (e.g., temporary expense cuts).
- Calculate time-to-goal based on different contribution scenarios.
- Use ${goal.currency} for all amounts.`;

  return {
    systemPrompt,
    allowedActions: [...LEDGER_SCOPE_ACTIONS['goal-focus']],
    persistent: false,
  };
}

// ── Field CRUD Mode ──────────────────────────────────────────────────────

function buildFieldCrudMode(
  currentExtensions: FieldDefinition[],
): PromptModeResult {
  const extensionList =
    currentExtensions.length > 0
      ? currentExtensions
          .map(
            (f) =>
              `  - ${f.id}: "${f.name}" (${f.type})${f.description ? ` — ${f.description}` : ''}`,
          )
          .join('\n')
      : '  (No custom fields defined)';

  const systemPrompt = `IDENTITY:
You are LEDGER's Field Manager — a specialized assistant for creating and managing
custom financial tracking fields.

MODULE: Ledger (Financial Planning)
DOMAIN: Budgeting, debt tracking, savings goals, investment monitoring, transaction
categorization, financial stress metrics.

CORE SCHEMA FIELDS (immutable, cannot be shadowed):
  - userId, monthlyIncome, currency, financialGoals, budgetCategories
  - totalDebt, totalSavings, totalInvestments, riskTolerance, spendingHabits
  - financialStressLevel, creditScore, paymentSchedule
  - lastBudgetReview, nextBudgetReview

CURRENT CUSTOM FIELDS (${currentExtensions.length}/15 slots used):
${extensionList}

ALLOWED FIELD TYPES:
  - NUMBER: monetary amounts, counts, ratios, rates
  - RANGE: bounded scales (e.g., risk scores 0-10)
  - SELECT: single-choice from options (e.g., payment frequency)
  - MULTI_SELECT: multi-choice from options (e.g., expense categories)
  - DATE: date values (e.g., tax filing deadline)

DISALLOWED FIELD TYPES:
  - TEXT, TEXTAREA: Not appropriate for financial metrics.
  - BOOLEAN: Too simplistic for financial tracking. Use SELECT with Yes/No options.
  - OBJECT: Too complex for extension fields.

AVAILABLE ACTIONS:
- <action type="suggest_field">{"description":"...","purpose":"...","suggestedType":"number"}</action>
  Suggest a new field before creating it. Use this to confirm with the user.

- <action type="create_field">{"id":"kebab-case-id","name":"Display Name","type":"number","description":"...","validation":{"minimum":0},"metadata":{"category":"income|expenses|assets|liabilities","icon":"LucideIconName","uiHint":"currency|percentage|number"}}</action>
  Create a validated custom field.

- <action type="delete_field">{"fieldId":"field-id-to-delete"}</action>
  Delete a custom field. Core fields are immutable.

- <action type="set_field_value">{"fieldId":"FIELD_ID","fieldName":"Monthly Savings Rate","value":"25"}</action>
  Use to set a value for a custom numeric field.

DOMAIN VALIDATION RULES:
You are the semantic domain validator. For each field creation request, evaluate:

1. Is this field relevant to personal finance, budgeting, debt, savings, investments,
   income, expenses, or financial planning?
2. Is this NOT better served by another AGNES module?
   - Health/body metrics → suggest Soma module
   - Mood/emotional tracking → suggest Agnes (therapy) module
   - Fitness/workout data → suggest Titan module
   - Productivity/tasks → suggest Atlas module
3. Does it overlap with an existing core or custom field?
4. Is the suggested type appropriate for the data?

If approved: emit create_field action with complete FieldDefinition.
If rejected: explain WHY in natural language, suggest the correct module if applicable.

RULES:
- NEVER include user financial data in this conversation.
- This context is for schema management ONLY.
- Be conservative — only create fields that genuinely serve financial tracking.
- Suggest category (income/expenses/assets/liabilities) based on the field's nature.
- For monetary fields, always set metadata.uiHint = "currency".
- For percentage fields, set metadata.uiHint = "percentage".
- Always include validation rules (minimum, maximum) for NUMBER fields.`;

  return {
    systemPrompt,
    allowedActions: [...LEDGER_SCOPE_ACTIONS['field-crud']],
    persistent: false,
  };
}

// ============================================================================
// Financial Friction Assessment Prompt (inline, not a mode)
// ============================================================================

export const FINANCIAL_FRICTION_ASSESSMENT_PROMPT = `Assess the user's Financial Friction score (0-10) based on these factors:

FACTORS (each 0-10, weight in parentheses):
1. Cashflow pressure (25%): Is monthly income > expenses? How tight is the buffer?
2. Debt burden (20%): Total debt relative to annual income. DTI ratio.
3. Savings adequacy (15%): Emergency fund months. Are savings goals on track?
4. Budget adherence (15%): Are they staying within budget categories?
5. Subscription creep (10%): Is subscription total growing without review?
6. Income stability (10%): Regular paycheck vs irregular income?
7. Payment deadline stress (5%): Any upcoming large payments or due dates?

SCORING GUIDE:
  0-2 (Low/Green): Positive cashflow, funded emergency fund, debt under control
  3-5 (Moderate/Cyan): Some pressure but manageable, minor overspending
  6-7 (Elevated/Amber): Negative cashflow or high DTI, needs intervention
  8-10 (Critical/Red): Severe financial stress, immediate action required

Output format:
<action type="update_financial_friction">{"score": <0-10>, "analysis": "<1-2 sentence explanation>"}</action>

Be honest and direct. Users prefer accuracy over comfort.`;

// ============================================================================
// Resonance ROI Guidance
// ============================================================================

export const RESONANCE_ROI_GUIDANCE = `RESONANCE ROI METHODOLOGY:
Resonance ROI measures the wellbeing return per dollar spent. It answers:
"Is your spending making you healthier, happier, and more stable?"

HIGH ROI spending (increases numerator):
  - Emergency fund contributions (security → reduced anxiety)
  - Healthcare and preventive care (long-term health)
  - Education and skill development (future earnings)
  - Meaningful experiences with loved ones
  - Charitable giving (shown to increase life satisfaction)
  - Quality sleep environment (mattress, blackout curtains)

LOW ROI spending (decreases numerator):
  - Unused subscriptions
  - Impulse purchases with post-purchase regret
  - Lifestyle inflation without proportional happiness increase
  - High-interest debt payments (paying for past consumption)

FORMULA (simplified):
  ROI = (wellbeingContributing / totalSpending) * bufferMultiplier
  bufferMultiplier = 1 + (savingsRate * 0.5)

When computing, emit:
<action type="compute_resonance_roi">{"financialFriction": <0-10>, "resonanceROI": <0.0-5.0>}</action>`;

// ============================================================================
// Context Injection: Serialize Extension Fields
// ============================================================================

/**
 * Serialize the new financial context (accounts, net worth, upcoming bills, forecast)
 * for injection into the general mode system prompt.
 */
export function serializeLedgerFinancialContext(opts: {
  accounts?: Account[];
  debtItems?: DebtItem[];
  netWorthHistory?: NetWorthSnapshot[];
  recurringRules?: RecurringRule[];
  lastCashFlowForecast?: CashFlowForecast;
  currency?: string;
  subscriptions?: import('../services/ledger-intake-service').Subscription[];
  investments?: import('../services/ledger-intake-service').Investment[];
  alertRules?: import('../services/ledger-intake-service').AlertRule[];
  creditScoreHistory?: import('../services/ledger-intake-service').CreditScoreEntry[];
  insurancePolicies?: import('../services/ledger-intake-service').InsurancePolicy[];
  lastRetirementProjection?: import('../services/ledger-intake-service').RetirementProjection;
}): string {
  const { accounts = [], debtItems = [], netWorthHistory = [], recurringRules = [], lastCashFlowForecast, currency = 'USD', subscriptions = [], investments = [], alertRules = [] } = opts;
  const blocks: string[] = [];

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  const fmtCompact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  if (accounts.length > 0) {
    const accountLines = accounts.map((a) =>
      `  - ${a.name} (${a.type}${a.institutionName ? ` @ ${a.institutionName}` : ''}${a.lastFour ? ` ···${a.lastFour}` : ''}): ${fmt(a.balance)}${a.isDefault ? ' [default]' : ''}`
    );
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    blocks.push(`[ACCOUNTS — ${accounts.length} linked]\n${accountLines.join('\n')}\n  Total net balance: ${fmt(totalBalance)}`);
  }

  if (accounts.length > 0 || debtItems.length > 0) {
    const { assets, liabilities, netWorth } = computeCurrentNetWorth(accounts, debtItems);
    const trend = netWorthHistory.length >= 2
      ? (() => {
          const sorted = [...netWorthHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const delta = sorted[0].netWorth - sorted[1].netWorth;
          return delta >= 0 ? `↑ ${fmtCompact(Math.abs(delta))} since last snapshot` : `↓ ${fmtCompact(Math.abs(delta))} since last snapshot`;
        })()
      : 'no prior snapshot';
    blocks.push(`[NET WORTH]\n  Assets: ${fmtCompact(assets)} | Liabilities: ${fmtCompact(liabilities)} | Net Worth: ${fmtCompact(netWorth)} (${trend})`);
  }

  const activeRules = recurringRules.filter((r) => r.isActive);
  if (activeRules.length > 0) {
    const upcoming = computeUpcomingBills(activeRules, 14);
    if (upcoming.length > 0) {
      const billLines = upcoming.map((r) =>
        `  - ${r.dueDateFormatted}: ${r.description} ${fmt(r.amount)} (${r.type}, ${r.frequency})`
      );
      blocks.push(`[UPCOMING BILLS — NEXT 14 DAYS]\n${billLines.join('\n')}`);
    }
  }

  if (lastCashFlowForecast) {
    const { lowestPoint, endBalance, horizon } = lastCashFlowForecast;
    const warnings: string[] = [];
    if (lowestPoint.balance < 0) {
      warnings.push(`⚠ Negative balance projected on ${lowestPoint.date}: ${fmtCompact(lowestPoint.balance)}`);
    } else if (lowestPoint.balance < 500) {
      warnings.push(`⚠ Cash low point: ${fmtCompact(lowestPoint.balance)} on ${lowestPoint.date}`);
    }
    blocks.push(`[CASH FLOW FORECAST — ${horizon}d]\n  End balance: ${fmtCompact(endBalance)} | Lowest: ${fmtCompact(lowestPoint.balance)} on ${lowestPoint.date}${warnings.length > 0 ? '\n' + warnings.join('\n') : ''}`);
  }

  // ─── P2: Subscriptions ───────────────────────────────────────────────────
  const activeSubs = subscriptions.filter(s => s.status === 'active' || s.status === 'trial');
  if (activeSubs.length > 0) {
    const totalMonthly = activeSubs.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
    const trialEnding = activeSubs.filter(s => {
      if (s.status !== 'trial' || !s.trialEndsAt) return false;
      const days = (new Date(s.trialEndsAt).getTime() - Date.now()) / 86_400_000;
      return days <= 7;
    });
    const subLines = activeSubs.slice(0, 8).map(s =>
      `  - ${s.name} (${s.billingCycle}): ${fmt(s.amount)}${s.status === 'trial' ? ' [TRIAL]' : ''}`
    );
    if (activeSubs.length > 8) subLines.push(`  ... and ${activeSubs.length - 8} more`);
    let subsBlock = `[SUBSCRIPTIONS — ${activeSubs.length} active, ${fmtCompact(totalMonthly)}/mo]\n${subLines.join('\n')}`;
    if (trialEnding.length > 0) {
      subsBlock += `\n  ⚠ Trials ending within 7 days: ${trialEnding.map(s => s.name).join(', ')}`;
    }
    blocks.push(subsBlock);
  }

  // ─── P2: Investments ─────────────────────────────────────────────────────
  if (investments.length > 0) {
    const totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
    const totalCost = investments.reduce((sum, inv) => sum + inv.totalCost, 0);
    const unrealizedGain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;
    const sign = unrealizedGain >= 0 ? '+' : '';
    blocks.push(
      `[PORTFOLIO — ${investments.length} holdings]\n  Total value: ${fmtCompact(totalValue)} | Cost basis: ${fmtCompact(totalCost)} | Unrealized P&L: ${sign}${fmtCompact(unrealizedGain)} (${sign}${gainPct.toFixed(1)}%)`
    );
  }

  // ─── P2: Active alerts ────────────────────────────────────────────────────
  const enabledAlerts = alertRules.filter(r => r.isEnabled);
  if (enabledAlerts.length > 0) {
    const alertSummary = enabledAlerts.map(r => `${r.label}${r.threshold !== undefined ? ` (threshold: ${r.threshold})` : ''}`).join(', ');
    blocks.push(`[ACTIVE ALERT RULES — ${enabledAlerts.length}]\n  ${alertSummary}`);
  }

  // ─── P3: Credit score ────────────────────────────────────────────────────
  const creditHistory = opts.creditScoreHistory ?? [];
  if (creditHistory.length > 0) {
    const sorted = [...creditHistory].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    const latest = sorted[0];
    const tier = latest.score >= 800 ? 'Exceptional' : latest.score >= 740 ? 'Very Good' : latest.score >= 670 ? 'Good' : latest.score >= 580 ? 'Fair' : 'Poor';
    const trend = sorted.length >= 2
      ? (latest.score > sorted[1].score ? `↑ ${latest.score - sorted[1].score} pts` : latest.score < sorted[1].score ? `↓ ${sorted[1].score - latest.score} pts` : 'stable')
      : 'first entry';
    blocks.push(`[CREDIT SCORE]\n  Latest: ${latest.score} (${tier}) from ${latest.bureau} on ${latest.recordedAt.split('T')[0]} — ${trend}`);
  }

  // ─── P3: Insurance ───────────────────────────────────────────────────────
  const activePolicies = (opts.insurancePolicies ?? []).filter(p => p.isActive);
  if (activePolicies.length > 0) {
    const totalMonthly = activePolicies.reduce((sum, p) => sum + p.monthlyPremium, 0);
    const soon = activePolicies.filter(p => {
      const days = (new Date(p.nextRenewalDate).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 30;
    });
    const policyLines = activePolicies.map(p => `  - ${p.name} (${p.type}): ${fmt(p.monthlyPremium)}/mo`);
    let insBlock = `[INSURANCE — ${activePolicies.length} active, ${fmtCompact(totalMonthly)}/mo]\n${policyLines.join('\n')}`;
    if (soon.length > 0) {
      insBlock += `\n  ⚠ Renewing within 30 days: ${soon.map(p => p.name).join(', ')}`;
    }
    blocks.push(insBlock);
  }

  // ─── P3: Retirement ──────────────────────────────────────────────────────
  const projection = opts.lastRetirementProjection;
  if (projection) {
    const onTrackLabel = projection.onTrack ? '✅ On track' : '⚠ Behind';
    const shortfall = projection.shortfallOrSurplus < 0 ? ` | Shortfall: ${fmtCompact(Math.abs(projection.shortfallOrSurplus))}` : ` | Surplus: ${fmtCompact(projection.shortfallOrSurplus)}`;
    blocks.push(
      `[RETIREMENT]\n  ${onTrackLabel} | Projected nest egg: ${fmtCompact(projection.projectedNestEgg)} | 4%-rule income: ${fmtCompact(projection.fourPercentRuleMonthly)}/mo${shortfall}`
    );
  }

  return blocks.length > 0 ? blocks.join('\n\n') : '';
}

/**
 * Serialize extension field definitions and values into a text block
 * for injection into the LLM system prompt.
 *
 * Called by enhanceContextForModule('ledger') and appended
 * to the system prompt in all modes EXCEPT field-crud.
 */
export function serializeLedgerExtensionFields(
  extensions: FieldDefinition[],
  values: Record<string, unknown>,
  currency: string = 'USD',
): string {
  if (extensions.length === 0) return '';

  const lines = extensions.map((field) => {
    const value = values[field.id];
    const formattedValue = formatFieldValueForPrompt(field, value, currency);
    const typeInfo = formatFieldTypeInfo(field);
    return `- ${field.name}: ${formattedValue} (${typeInfo})`;
  });

  return `[CUSTOM TRACKED FIELDS — LEDGER]\n${lines.join('\n')}`;
}

/**
 * Format a field value for prompt injection.
 */
function formatFieldValueForPrompt(
  field: FieldDefinition,
  value: unknown,
  currency: string,
): string {
  if (value === undefined || value === null) return '(not set)';

  switch (field.type) {
    case 'number':
      if (field.metadata?.uiHint === 'currency') {
        return `${currency} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      }
      if (field.metadata?.uiHint === 'percentage') {
        return `${Number(value).toFixed(1)}%`;
      }
      return String(value);

    case 'range': {
      const min = field.validation?.minimum ?? 0;
      const max = field.validation?.maximum ?? 10;
      return `${value} (range: ${min}-${max})`;
    }

    case 'select': {
      const option = field.options?.find((o) => o.value === value);
      return option ? `"${option.label}"` : `"${value}"`;
    }

    case 'multiSelect': {
      if (!Array.isArray(value)) return '(none)';
      const labels = value
        .map((v: unknown) => {
          const opt = field.options?.find((o) => o.value === v);
          return opt ? opt.label : String(v);
        })
        .join(', ');
      return `[${labels}]`;
    }

    case 'date':
      return String(value);

    default:
      return String(value);
  }
}

/**
 * Format field type information for prompt context.
 */
function formatFieldTypeInfo(field: FieldDefinition): string {
  const parts: string[] = [field.type];

  if (field.validation?.minimum !== undefined) {
    parts.push(`≥ ${field.validation.minimum}`);
  }
  if (field.validation?.maximum !== undefined) {
    parts.push(`≤ ${field.validation.maximum}`);
  }
  if (field.options && field.options.length > 0) {
    const optionLabels = field.options.map((o) => o.label).join('/');
    parts.push(`options: ${optionLabels}`);
  }

  return parts.join(', ');
}
