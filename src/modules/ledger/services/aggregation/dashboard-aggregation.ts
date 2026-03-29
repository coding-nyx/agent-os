import {
  Transaction,
  currentMonth,
  monthsAgo,
  getMonthBounds,
  filterByPeriod,
  round2,
} from './utils';
import { computeCategorySpend } from './transaction-aggregation';
import { BudgetPerformance } from './budget-aggregation';
import type { DebtItem, FinancialGoal, LedgerIntakeProfile } from '../ledger-intake-service';

export interface DashboardMetrics {
  currentMonthIncome: number;
  currentMonthExpenses: number;
  currentMonthNet: number;
  totalBalance: number;
  totalDebt: number;
  averageMonthlyExpenses: number;
  savingsRate: number | null;
  topSpendCategory: string | null;
  hasTransactions: boolean;
}

export function computeDashboardMetrics(
  transactions: Transaction[],
  totalDebt: number = 0,
  accounts: import('../ledger-intake-service').Account[] = [],
): DashboardMetrics {
  const cm = currentMonth();
  const { start, end } = getMonthBounds(cm);
  const currentTxs = filterByPeriod(transactions, start, end);

  let currentMonthIncome = 0;
  let currentMonthExpenses = 0;

  for (const tx of currentTxs) {
    if (tx.type === 'income') {
      currentMonthIncome = round2(currentMonthIncome + tx.amount);
    } else if (tx.type === 'expense') {
      currentMonthExpenses = round2(currentMonthExpenses + tx.amount);
    }
  }

  const currentMonthNet = round2(currentMonthIncome - currentMonthExpenses);

  // Use Account.balance sum when accounts are present; fall back to transaction sum for profiles without accounts yet.
  let totalBalance = 0;
  if (accounts.length > 0) {
    totalBalance = round2(accounts.reduce((sum, a) => sum + a.balance, 0));
  } else {
    for (const tx of transactions) {
      totalBalance = round2(
        tx.type === 'income' ? totalBalance + tx.amount : totalBalance - tx.amount,
      );
    }
  }

  const last3Start = getMonthBounds(monthsAgo(2)).start;
  const last3End = getMonthBounds(monthsAgo(0)).end;
  const last3Expenses = filterByPeriod(transactions, last3Start, last3End)
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => round2(sum + t.amount), 0);
  const averageMonthlyExpenses = round2(last3Expenses / 3);

  const savingsRate =
    currentMonthIncome > 0 ? round2(currentMonthNet / currentMonthIncome) : null;

  const categorySpend = computeCategorySpend(transactions, { start, end });
  const topSpendCategory = categorySpend.length > 0 ? categorySpend[0].category : null;

  return {
    currentMonthIncome,
    currentMonthExpenses,
    currentMonthNet,
    totalBalance,
    totalDebt,
    averageMonthlyExpenses,
    savingsRate,
    topSpendCategory,
    hasTransactions: transactions.length > 0,
  };
}

export type RunwayStatus = 'needs_data' | 'stable' | 'healthy' | 'watch' | 'critical' | 'depleted';

export interface RunwayProjection {
  source: 'profile' | 'transactions' | 'profile+transactions';
  modeledLiquidity: number;
  ledgerBalance: number;
  reserveSavings: number;
  monthlyIncome: number;
  monthlyExpenseBaseline: number;
  monthlyBurn: number;
  monthlyBuffer: number;
  monthsRemaining: number | null;
  daysRemaining: number | null;
  status: RunwayStatus;
}

export function computeRunwayProjection(
  profile: LedgerIntakeProfile | null | undefined,
): RunwayProjection | null {
  if (!profile) return null;

  const transactions = profile.transactions ?? [];
  const totalDebt = (profile.debtItems ?? []).reduce((sum, debt) => round2(sum + debt.balance), 0);
  const metrics = computeDashboardMetrics(transactions, totalDebt, profile.accounts ?? []);

  const plannedExpenseBaseline = round2(
    (profile.fixedExpenses ?? []).reduce((sum, item) => sum + item.amount, 0) +
      (profile.variableExpenses ?? []).reduce((sum, item) => sum + item.amount, 0) +
      (profile.debtItems ?? []).reduce((sum, item) => sum + item.minPayment, 0),
  );

  const reserveSavings = round2(
    (profile.savingsGoals ?? []).reduce((sum, goal) => sum + goal.currentAmount, 0),
  );
  const ledgerBalance = round2(Math.max(metrics.totalBalance, 0));
  const modeledLiquidity = round2(ledgerBalance + reserveSavings);

  const monthlyIncome = round2(
    profile.monthlyIncome > 0 ? profile.monthlyIncome : metrics.currentMonthIncome,
  );
  const monthlyExpenseBaseline = round2(
    plannedExpenseBaseline > 0
      ? plannedExpenseBaseline
      : Math.max(metrics.averageMonthlyExpenses, metrics.currentMonthExpenses),
  );
  const monthlyBuffer = round2(monthlyIncome - monthlyExpenseBaseline);
  const monthlyBurn = round2(Math.max(monthlyExpenseBaseline - monthlyIncome, 0));
  const monthsRemaining =
    monthlyBurn > 0 ? round2(modeledLiquidity / monthlyBurn) : null;
  const daysRemaining =
    monthsRemaining !== null ? Math.max(0, Math.round(monthsRemaining * 30.4)) : null;

  let source: RunwayProjection['source'] = 'transactions';
  if (profile.monthlyIncome > 0 || plannedExpenseBaseline > 0) {
    source = transactions.length > 0 ? 'profile+transactions' : 'profile';
  }

  let status: RunwayStatus = 'needs_data';
  if (monthlyIncome <= 0 && monthlyExpenseBaseline <= 0 && modeledLiquidity <= 0) {
    status = 'needs_data';
  } else if (monthlyBurn <= 0) {
    status = 'stable';
  } else if (modeledLiquidity <= 0) {
    status = 'depleted';
  } else if ((monthsRemaining ?? 0) < 3) {
    status = 'critical';
  } else if ((monthsRemaining ?? 0) < 6) {
    status = 'watch';
  } else {
    status = 'healthy';
  }

  return {
    source,
    modeledLiquidity,
    ledgerBalance,
    reserveSavings,
    monthlyIncome,
    monthlyExpenseBaseline,
    monthlyBurn,
    monthlyBuffer,
    monthsRemaining,
    daysRemaining,
    status,
  };
}

export interface DebtPayoffMonth {
  month: number;
  totalBalance: number;
  totalInterestPaid: number;
  debts: Array<{ id: string; name: string; balance: number }>;
}

export interface DebtPayoffResult {
  strategy: 'avalanche' | 'snowball';
  months: DebtPayoffMonth[];
  totalInterestPaid: number;
  monthsToPayoff: number;
  interestSavedVsMinimum: number;
}

interface SimDebt {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
}

function runPayoffSimulation(
  rawDebts: DebtItem[],
  strategy: 'avalanche' | 'snowball',
  extraMonthlyPayment: number,
): { months: DebtPayoffMonth[]; totalInterestPaid: number } {
  const MAX_MONTHS = 360;
  const ZERO_THRESHOLD = 0.005;

  const active = rawDebts
    .filter((d) => d.balance > ZERO_THRESHOLD && d.minPayment >= 0 && d.apr >= 0)
    .map<SimDebt>((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      minPayment: Math.max(d.minPayment, 0),
      apr: d.apr,
    }));

  if (active.length === 0) return { months: [], totalInterestPaid: 0 };

  const totalBudget = round2(
    active.reduce((s, d) => s + d.minPayment, 0) + extraMonthlyPayment,
  );

  const paidOff = new Set<string>();
  const months: DebtPayoffMonth[] = [];
  let totalInterestPaid = 0;

  for (let m = 1; m <= MAX_MONTHS; m++) {
    const currentActive = active.filter((d) => !paidOff.has(d.id));
    if (currentActive.length === 0) break;

    for (const debt of currentActive) {
      const interest = round2(debt.balance * (debt.apr / 100 / 12));
      debt.balance = round2(debt.balance + interest);
      totalInterestPaid = round2(totalInterestPaid + interest);
    }

    let remainingBudget = totalBudget;
    for (const debt of currentActive) {
      const payment = Math.min(debt.minPayment, debt.balance);
      debt.balance = round2(Math.max(0, debt.balance - payment));
      remainingBudget = round2(remainingBudget - payment);
      if (debt.balance <= ZERO_THRESHOLD) {
        debt.balance = 0;
        paidOff.add(debt.id);
      }
    }

    if (remainingBudget > ZERO_THRESHOLD) {
      const prioritized = active
        .filter((d) => !paidOff.has(d.id))
        .slice()
        .sort((a, b) =>
          strategy === 'avalanche'
            ? b.apr - a.apr
            : a.balance - b.balance,
        );

      for (const debt of prioritized) {
        if (remainingBudget <= ZERO_THRESHOLD) break;
        const payment = Math.min(remainingBudget, debt.balance);
        debt.balance = round2(Math.max(0, debt.balance - payment));
        remainingBudget = round2(remainingBudget - payment);
        if (debt.balance <= ZERO_THRESHOLD) {
          debt.balance = 0;
          paidOff.add(debt.id);
        }
      }
    }

    const totalBalance = round2(active.reduce((s, d) => s + d.balance, 0));
    months.push({
      month: m,
      totalBalance,
      totalInterestPaid: round2(totalInterestPaid),
      debts: active.map((d) => ({ id: d.id, name: d.name, balance: d.balance })),
    });

    if (totalBalance <= ZERO_THRESHOLD) break;
  }

  return { months, totalInterestPaid: round2(totalInterestPaid) };
}

export function computeDebtPayoffSchedule(
  debts: DebtItem[],
  strategy: 'avalanche' | 'snowball',
  extraMonthlyPayment: number = 0,
): DebtPayoffResult {
  const activeDebts = debts.filter((d) => d.balance > 0);

  const main = runPayoffSimulation(activeDebts, strategy, Math.max(extraMonthlyPayment, 0));
  const minimumOnly = runPayoffSimulation(activeDebts, 'avalanche', 0);

  return {
    strategy,
    months: main.months,
    totalInterestPaid: main.totalInterestPaid,
    monthsToPayoff: main.months.length,
    interestSavedVsMinimum: round2(minimumOnly.totalInterestPaid - main.totalInterestPaid),
  };
}

export type AlertSeverity = 'warning' | 'danger' | 'info';
export type AlertType =
  | 'budget_80pct'
  | 'budget_over'
  | 'goal_stale'
  | 'negative_cashflow'
  | 'goal_near_complete';

export interface LedgerAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityId?: string;
}

function formatAlertAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function evaluateAlerts(
  profile: LedgerIntakeProfile | null | undefined,
  budgetWithActuals: BudgetPerformance[],
  metrics: {
    currentMonthIncome: number;
    currentMonthExpenses: number;
    currentMonthNet: number;
  },
): LedgerAlert[] {
  if (!profile) return [];

  const alerts: LedgerAlert[] = [];
  const currency = profile.currency ?? 'USD';

  for (const category of budgetWithActuals) {
    if (category.allocated <= 0) continue;

    const spendPct = (category.actual / category.allocated) * 100;

    if (category.actual > category.allocated) {
      const overage = round2(category.actual - category.allocated);
      alerts.push({
        id: `budget_over_${category.categoryId}`,
        type: 'budget_over',
        severity: 'danger',
        title: `${category.categoryName} Over Budget`,
        message: `${category.categoryName} is over budget by ${formatAlertAmount(overage, currency)}`,
        entityId: category.categoryId,
      });
    } else if (spendPct >= 80) {
      const displayPct = Math.round(spendPct);
      alerts.push({
        id: `budget_80pct_${category.categoryId}`,
        type: 'budget_80pct',
        severity: 'warning',
        title: `${category.categoryName} Approaching Limit`,
        message: `${category.categoryName} is at ${displayPct}% of budget`,
        entityId: category.categoryId,
      });
    }
  }

  if (metrics.currentMonthNet < 0) {
    const deficit = formatAlertAmount(Math.abs(metrics.currentMonthNet), currency);
    alerts.push({
      id: 'negative_cashflow_current',
      type: 'negative_cashflow',
      severity: 'danger',
      title: 'Negative Cashflow',
      message: `Spending exceeds income this month by ${deficit}`,
    });
  }

  const goals: FinancialGoal[] = profile.financialGoals ?? [];
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  for (const goal of goals) {
    if (goal.targetAmount <= 0) continue;

    const fundedRatio = goal.currentAmount / goal.targetAmount;
    const fundedPct = Math.round(fundedRatio * 100);

    if (fundedRatio >= 0.9 && goal.currentAmount < goal.targetAmount) {
      alerts.push({
        id: `goal_near_complete_${goal.id}`,
        type: 'goal_near_complete',
        severity: 'info',
        title: `${goal.name} — Almost There!`,
        message: `${goal.name} is 90%+ funded — finish line in sight!`,
        entityId: goal.id,
      });
    } else if (goal.targetDate) {
      const daysLeft = Math.floor(
        (new Date(goal.targetDate).getTime() - now) / MS_PER_DAY,
      );
      if (daysLeft >= 0 && daysLeft <= 30 && fundedRatio < 0.9) {
        alerts.push({
          id: `goal_stale_${goal.id}`,
          type: 'goal_stale',
          severity: 'warning',
          title: `${goal.name} — Falling Behind`,
          message: `${goal.name}: ${fundedPct}% funded with ${daysLeft} days left`,
          entityId: goal.id,
        });
      }
    }
  }

  return alerts;
}

export interface SavingsProjection {
  goalId: string;
  monthsToTarget: number | null;
  projectedCompletionDate: string | null;
  onTrack: boolean;
  monthlyRequired: number;
  surplusOrDeficit: number;
}

export function computeSavingsProjection(goal: FinancialGoal): SavingsProjection {
  const remaining = goal.targetAmount - goal.currentAmount;

  if (remaining <= 0) {
    return {
      goalId: goal.id,
      monthsToTarget: 0,
      projectedCompletionDate: null,
      onTrack: true,
      monthlyRequired: 0,
      surplusOrDeficit: 0,
    };
  }

  function monthsBetween(from: Date, to: Date): number {
    return (
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
    );
  }

  if (goal.monthlyContribution <= 0) {
    let monthlyRequired = 0;

    if (goal.targetDate) {
      const now = new Date();
      const target = new Date(goal.targetDate);
      const monthsUntilTarget = monthsBetween(now, target);
      monthlyRequired = monthsUntilTarget > 0 ? remaining / monthsUntilTarget : remaining;
    }

    return {
      goalId: goal.id,
      monthsToTarget: null,
      projectedCompletionDate: null,
      onTrack: false,
      monthlyRequired,
      surplusOrDeficit: goal.monthlyContribution - monthlyRequired,
    };
  }

  const monthsToTarget = Math.ceil(remaining / goal.monthlyContribution);

  const now = new Date();
  const projected = new Date(
    now.getFullYear(),
    now.getMonth() + monthsToTarget,
    now.getDate(),
  );
  const projectedCompletionDate = [
    projected.getFullYear(),
    String(projected.getMonth() + 1).padStart(2, '0'),
    String(projected.getDate()).padStart(2, '0'),
  ].join('-');

  let onTrack = true;
  let monthlyRequired: number;

  if (goal.targetDate) {
    onTrack = projectedCompletionDate <= goal.targetDate;

    const target = new Date(goal.targetDate);
    const monthsUntilTargetDate = monthsBetween(now, target);
    monthlyRequired =
      monthsUntilTargetDate > 0 ? remaining / monthsUntilTargetDate : remaining;
  } else {
    monthlyRequired = goal.monthlyContribution;
  }

  return {
    goalId: goal.id,
    monthsToTarget,
    projectedCompletionDate,
    onTrack,
    monthlyRequired,
    surplusOrDeficit: goal.monthlyContribution - monthlyRequired,
  };
}
