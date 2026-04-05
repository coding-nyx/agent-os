// Bridge: delegates to KMP DashboardAggregationJs.

import { DashboardAggregationJs } from '@cortex-logic';
import { Transaction } from './utils';
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

export interface SavingsProjection {
  goalId: string;
  monthsToTarget: number | null;
  projectedCompletionDate: string | null;
  onTrack: boolean;
  monthlyRequired: number;
  surplusOrDeficit: number;
}

const _dashboardAgg = new DashboardAggregationJs();

export function computeDashboardMetrics(
  transactions: Transaction[],
  totalDebt: number = 0,
  accounts: import('../ledger-intake-service').Account[] = [],
): DashboardMetrics {
  return JSON.parse(
    _dashboardAgg.computeDashboardMetrics(
      JSON.stringify(transactions),
      totalDebt,
      JSON.stringify(accounts),
      Date.now(),
    ),
  ) as DashboardMetrics;
}

export function computeRunwayProjection(
  profile: LedgerIntakeProfile | null | undefined,
): RunwayProjection | null {
  if (!profile) return null;
  return JSON.parse(
    _dashboardAgg.computeRunwayProjection(JSON.stringify(profile), Date.now()),
  ) as RunwayProjection;
}

export function computeDebtPayoffSchedule(
  debts: DebtItem[],
  strategy: 'avalanche' | 'snowball',
  extraMonthlyPayment: number = 0,
): DebtPayoffResult {
  return JSON.parse(
    _dashboardAgg.computeDebtPayoffSchedule(
      JSON.stringify(debts),
      strategy,
      Math.max(extraMonthlyPayment, 0),
    ),
  ) as DebtPayoffResult;
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
  return JSON.parse(
    _dashboardAgg.evaluateAlerts(
      JSON.stringify(profile),
      JSON.stringify(budgetWithActuals),
      JSON.stringify(metrics),
      Date.now(),
    ),
  ) as LedgerAlert[];
}

export function computeSavingsProjection(goal: FinancialGoal): SavingsProjection {
  return JSON.parse(
    _dashboardAgg.computeSavingsProjection(JSON.stringify(goal), Date.now()),
  ) as SavingsProjection;
}
