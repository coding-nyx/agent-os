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
import type { Account, RecurringRule, NetWorthSnapshot, CashFlowForecast, DebtItem, BudgetCategory, FinancialGoal as FinancialGoalFull, FinancialPlan, Transaction } from '../services/ledger-intake-service';
import { computeUpcomingBills } from '../services/recurring-engine';
import { computeCurrentNetWorth } from '../services/aggregation/networth-aggregation';

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

// ============================================================================
// Action Definitions Per Scope
// ============================================================================

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
  // Cashflow snapshot
  monthlyIncome?: number;
  fixedExpenses?: import('../services/ledger-intake-service').BudgetLineItem[];
  variableExpenses?: import('../services/ledger-intake-service').BudgetLineItem[];
  // Computed from actual transactions — reflects what the UI shows
  actualTotalIncome?: number;
  actualTotalExpenses?: number;
  budgetCategories?: BudgetCategory[];
  financialGoals?: FinancialGoalFull[];
  plans?: FinancialPlan[];
  activePlanId?: string | null;
  transactions?: Transaction[];
}): string {
  const { accounts = [], debtItems = [], netWorthHistory = [], recurringRules = [], lastCashFlowForecast, currency = 'USD', subscriptions = [], investments = [], alertRules = [], monthlyIncome, fixedExpenses = [], variableExpenses = [], actualTotalIncome, actualTotalExpenses, budgetCategories = [], financialGoals = [], plans = [], activePlanId = null, transactions = [] } = opts;
  const blocks: string[] = [];

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  const fmtCompact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  // Cashflow snapshot — always injected first so the model knows the baseline numbers
  // before any other context. Monthly income here is the SAVED salary/income setting,
  // NOT a transaction. To change it the model must emit update_budget_snapshot, not create_transaction.
  if (typeof monthlyIncome === 'number' || typeof actualTotalIncome === 'number') {
    const totalFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0);
    const totalVariable = variableExpenses.reduce((s, e) => s + e.amount, 0);
    const budgetExpenses = totalFixed + totalVariable;
    const cashflowLines = [`[CASHFLOW SNAPSHOT]`];

    if (typeof monthlyIncome === 'number') {
      const surplus = monthlyIncome - budgetExpenses;
      const fixedLines = fixedExpenses.slice(0, 8).map(e => `    - ${e.label}: ${fmt(e.amount)}`);
      const variableLines = variableExpenses.slice(0, 8).map(e => `    - ${e.label}: ${fmt(e.amount)}`);
      cashflowLines.push(
        `  Regular monthly salary: ${fmt(monthlyIncome)}`,
        `  Planned fixed expenses: ${fmt(totalFixed)}${fixedLines.length > 0 ? '\n' + fixedLines.join('\n') : ''}`,
        `  Planned variable expenses: ${fmt(totalVariable)}${variableLines.length > 0 ? '\n' + variableLines.join('\n') : ''}`,
        `  Planned monthly surplus: ${fmt(surplus)}`,
      );
    }

    // Additional income recorded as transactions this month (bonuses, freelance, dividends, etc.)
    // Only shown when non-zero — these are on top of the regular salary above, same as expense transactions
    if (typeof actualTotalIncome === 'number' && actualTotalIncome > 0) {
      const extra = actualTotalIncome - (monthlyIncome ?? 0);
      cashflowLines.push(
        `  Recorded income this month: ${fmt(actualTotalIncome)}${extra > 0 ? ` (+${fmt(extra)} beyond salary — bonus/freelance/other)` : ''}`,
        `  Recorded expenses this month: ${fmt(actualTotalExpenses ?? 0)}`,
        `  Actual net this month: ${fmt(actualTotalIncome - (actualTotalExpenses ?? 0))}`,
      );
    }

    cashflowLines.push(
      `  NOTE: "Regular monthly salary" is the recurring baseline for budget planning — update via update_budget_snapshot.`,
      `  Bonuses, freelance, and other one-off payments are income transactions, same as expenses are expense transactions.`,
    );
    blocks.push(cashflowLines.join('\n'));
  }

  if (accounts.length > 0) {
    const accountLines = accounts.map((a) =>
      `  - [id:${a.id}] ${a.name} (${a.type}${a.institutionName ? ` @ ${a.institutionName}` : ''}${a.lastFour ? ` ···${a.lastFour}` : ''}): ${fmt(a.balance)}${a.isDefault ? ' [default]' : ''}`
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

  // ─── Block A: Active Financial Plan ─────────────────────────────────────
  const planToShow = (activePlanId ? plans.find(p => p.id === activePlanId) : null)
    ?? plans.find(p => p.status === 'active')
    ?? null;
  if (planToShow) {
    const taskLines = planToShow.tasks.map((t, i) => `    ${i + 1}. ${t}`).join('\n');
    blocks.push(
      `[ACTIVE FINANCIAL PLAN — "${planToShow.title}"]\n` +
      `  Summary: ${planToShow.summary}\n` +
      `  Monthly target surplus: ${fmt(planToShow.monthlyTarget)}\n` +
      `  Allocation — Essentials: ${planToShow.allocation.essentials}% | Growth: ${planToShow.allocation.growth}% | Buffer: ${planToShow.allocation.buffer}%\n` +
      `  Tasks:\n${taskLines || '    (No tasks defined)'}`
    );
  }

  // ─── Block B: Budget Categories ──────────────────────────────────────────
  if (budgetCategories.length > 0) {
    const catLines = budgetCategories.map(cat => {
      const remaining = cat.allocated - cat.spent;
      const pctUsed = cat.allocated > 0 ? (cat.spent / cat.allocated) * 100 : 0;
      const status = pctUsed > 100 ? 'OVER BUDGET' : pctUsed > 80 ? 'WARNING' : 'ON TRACK';
      return `  - ${cat.name}: allocated ${fmt(cat.allocated)} | spent ${fmt(cat.spent)} | remaining ${fmt(remaining)} | ${pctUsed.toFixed(0)}% used [${status}]`;
    });
    blocks.push(`[BUDGET CATEGORIES — ${budgetCategories.length} tracked]\n${catLines.join('\n')}`);
  }

  // ─── Block C: Financial Goals ─────────────────────────────────────────────
  if (financialGoals.length > 0) {
    const now = new Date();
    const goalLines = financialGoals.map(g => {
      const pctComplete = Math.min(100, g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0);
      const remaining = g.targetAmount - g.currentAmount;
      const monthsNeeded = g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null;
      let monthsRemaining: number | null = null;
      if (g.targetDate) {
        const target = new Date(g.targetDate);
        monthsRemaining = Math.max(0, Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
      }
      let trackStatus: string;
      if (g.monthlyContribution <= 0) {
        trackStatus = 'NO CONTRIBUTION';
      } else if (monthsNeeded !== null && monthsRemaining !== null) {
        const gap = monthsNeeded - monthsRemaining;
        trackStatus = gap > 0 ? `BEHIND (${gap} mo gap)` : 'ON TRACK';
      } else if (monthsNeeded !== null) {
        trackStatus = `~${monthsNeeded} mo to completion`;
      } else {
        trackStatus = 'NO CONTRIBUTION';
      }
      const targetDateStr = g.targetDate ? ` | target: ${g.targetDate}` : '';
      return `  - [id:${g.id}] ${g.name} (${g.type}, ${g.priority}): ${fmt(g.currentAmount)}/${fmt(g.targetAmount)} (${pctComplete.toFixed(0)}%) | contrib: ${fmt(g.monthlyContribution)}/mo${targetDateStr} | ${trackStatus}`;
    });
    blocks.push(`[FINANCIAL GOALS — ${financialGoals.length} active]\n${goalLines.join('\n')}`);
  }

  // ─── Block D: Debt Snapshot ───────────────────────────────────────────────
  if (debtItems.length > 0) {
    const sorted = [...debtItems].sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0));
    const debtLines = sorted.map(d => {
      const payment = d.minimumPayment ?? d.minPayment;
      return `  - ${d.name} (${d.type ?? 'debt'}): balance ${fmt(d.balance)} | APR ${d.apr.toFixed(1)}% | min payment ${fmt(payment)}${d.isVariableRate ? ' [variable]' : ''}`;
    });
    const totalBalance = debtItems.reduce((s, d) => s + d.balance, 0);
    const totalMinPayments = debtItems.reduce((s, d) => s + (d.minimumPayment ?? d.minPayment), 0);
    const dtiLine = typeof monthlyIncome === 'number' && monthlyIncome > 0
      ? ` | DTI: ${((totalMinPayments / monthlyIncome) * 100).toFixed(1)}%`
      : '';
    blocks.push(
      `[DEBT SNAPSHOT — ${debtItems.length} items, sorted by APR]\n${debtLines.join('\n')}\n  Total balance: ${fmt(totalBalance)} | Total min payments: ${fmt(totalMinPayments)}/mo${dtiLine}`
    );
  }

  // ─── Block E: Financial Health Alerts ────────────────────────────────────
  {
    const alerts: string[] = [];
    const totalFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0);
    const totalVariable = variableExpenses.reduce((s, e) => s + e.amount, 0);
    const income = typeof monthlyIncome === 'number' ? monthlyIncome : 0;

    // 1. Negative cashflow
    if (income > 0 && income - totalFixed - totalVariable < 0) {
      alerts.push(`⚠ Negative cashflow: income ${fmt(income)} is less than planned expenses ${fmt(totalFixed + totalVariable)} (deficit: ${fmt(income - totalFixed - totalVariable)})`);
    }

    // 2. Budget breach per category
    for (const cat of budgetCategories) {
      const pctUsed = cat.allocated > 0 ? (cat.spent / cat.allocated) * 100 : 0;
      if (pctUsed > 100) {
        alerts.push(`⚠ Budget breach — ${cat.name}: ${pctUsed.toFixed(0)}% utilized, overage ${fmt(cat.spent - cat.allocated)}`);
      } else if (pctUsed > 90) {
        alerts.push(`⚠ Budget warning — ${cat.name}: ${pctUsed.toFixed(0)}% utilized, only ${fmt(cat.allocated - cat.spent)} remaining`);
      }
    }

    // 3. Emergency fund coverage
    const liquidAccounts = accounts.filter(a => a.type === 'checking' || a.type === 'savings' || a.type === 'cash');
    const liquidAssets = liquidAccounts.reduce((s, a) => s + a.balance, 0);
    const ccDebt = accounts.filter(a => a.type === 'credit_card').reduce((s, a) => s + Math.abs(a.balance), 0);
    const netLiquid = liquidAssets - ccDebt;
    const monthlyExpenses = totalFixed + totalVariable;
    if (monthlyExpenses > 0) {
      const efMonths = netLiquid / monthlyExpenses;
      if (efMonths < 1) {
        alerts.push(`⚠ CRITICAL: Emergency fund < 1 month (${efMonths.toFixed(1)} mo). Liquid assets: ${fmt(netLiquid)}`);
      } else if (efMonths < 3) {
        alerts.push(`⚠ Emergency fund low: ${efMonths.toFixed(1)} months of coverage (target: 3+ mo)`);
      }
    }

    // 4. Goal at risk
    if (financialGoals.length > 0) {
      const now = new Date();
      for (const g of financialGoals) {
        if (!g.targetDate || g.monthlyContribution <= 0) continue;
        const remaining = g.targetAmount - g.currentAmount;
        const monthsNeeded = Math.ceil(remaining / g.monthlyContribution);
        const target = new Date(g.targetDate);
        const monthsRemaining = Math.max(0, Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
        if (monthsNeeded > monthsRemaining) {
          alerts.push(`⚠ Goal at risk — "${g.name}": needs ${monthsNeeded} mo but only ${monthsRemaining} mo remain (gap: ${monthsNeeded - monthsRemaining} mo, shortfall: ${fmt((monthsNeeded - monthsRemaining) * g.monthlyContribution)})`);
        }
      }
    }

    // 5. High-APR debt
    if (debtItems.length > 0) {
      const highApr = debtItems.filter(d => (d.apr ?? 0) > 20);
      if (highApr.length > 0) {
        const worst = [...highApr].sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];
        alerts.push(`⚠ High-APR debt — worst offender: "${worst.name}" at ${worst.apr?.toFixed(1)}% APR. ${highApr.length} debt(s) above 20% APR. Recommend avalanche strategy.`);
      }
    }

    // 6. Subscription creep
    const activeSubs2 = subscriptions.filter(s => s.status === 'active' || s.status === 'trial');
    const totalSubMonthly = activeSubs2.reduce((s, sub) => s + sub.monthlyEquivalent, 0);
    if (income > 0 && totalSubMonthly / income > 0.15) {
      alerts.push(`ℹ Subscription creep: subscriptions total ${fmt(totalSubMonthly)}/mo = ${((totalSubMonthly / income) * 100).toFixed(1)}% of income (threshold: 15%)`);
    }

    // 7. Strategy conflict: high-APR debt AND savings goals coexist
    const hasHighAprDebt = debtItems.some(d => (d.apr ?? 0) > 20);
    const hasSavingsGoals = financialGoals.some(g => g.type === 'savings' || g.type === 'investment');
    if (hasHighAprDebt && hasSavingsGoals) {
      alerts.push(`ℹ Strategy conflict: high-APR debt (>20%) and active savings/investment goals coexist. Mathematically, paying off high-APR debt first yields better returns than most savings rates.`);
    }

    if (alerts.length > 0) {
      blocks.push(`[FINANCIAL HEALTH ALERTS]\n${alerts.map(a => `  ${a}`).join('\n')}`);
    }
  }

  // ─── Block F: Spending Patterns — This Month ─────────────────────────────
  if (transactions.length > 0) {
    const nowMonth = new Date().toISOString().slice(0, 7);
    const monthExpenses = transactions.filter(t => t.type === 'expense' && t.date?.startsWith(nowMonth));
    if (monthExpenses.length > 0) {
      const totalMonthSpend = monthExpenses.reduce((s, t) => s + t.amount, 0);
      const byCategory: Record<string, number> = {};
      for (const t of monthExpenses) {
        const cat = t.category || 'Uncategorized';
        byCategory[cat] = (byCategory[cat] ?? 0) + t.amount;
      }
      const top5 = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, amount]) => `  - ${cat}: ${fmt(amount)} (${totalMonthSpend > 0 ? ((amount / totalMonthSpend) * 100).toFixed(0) : 0}% of total)`);
      blocks.push(`[SPENDING PATTERNS — THIS MONTH]\n  Total expenses: ${fmt(totalMonthSpend)} across ${monthExpenses.length} transactions\n${top5.join('\n')}`);
    }
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
