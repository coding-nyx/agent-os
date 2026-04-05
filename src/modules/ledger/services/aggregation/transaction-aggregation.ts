// Bridge: all public functions delegate to TransactionAggregationJs (KMP).

import { TransactionAggregationJs } from '@cortex-logic';
import {
  Transaction,
  BudgetCategory,
  currentMonth,
  formatMonthLabel,
  getMonthBounds,
} from './utils';

export interface MonthlyTotals {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface CategorySpend {
  category: string;
  amount: number;
  transactionCount: number;
  percentOfTotal: number;
}

export interface IncomeBreakdown {
  total: number;
  byCategory: { category: string; amount: number; count: number }[];
  averageMonthly: number;
}

export type TrendDirection = 'up' | 'down' | 'stable';

export interface SpendingTrend {
  direction: TrendDirection;
  percentChange: number;
  currentMonth: number;
  previousMonth: number;
}

export interface CategoryTrendMonth {
  month: string;
  [category: string]: number | string;
}

const _txAgg = new TransactionAggregationJs();

export function computeMonthlyTotals(
  transactions: Transaction[],
  months: number = 6,
): MonthlyTotals[] {
  const raw = JSON.parse(
    _txAgg.computeMonthlyTotals(JSON.stringify(transactions), months, Date.now()),
  ) as Array<Omit<MonthlyTotals, 'label'> & { label?: string }>;

  // KMP does not have access to browser toLocaleString — patch labels in TS.
  return raw.map((row) => ({
    ...row,
    label: formatMonthLabel(row.month),
  })) as MonthlyTotals[];
}

export function computeCategorySpend(
  transactions: Transaction[],
  period?: { start: string; end: string },
): CategorySpend[] {
  const bounds = period ?? getMonthBounds(currentMonth());
  return JSON.parse(
    _txAgg.computeCategorySpend(
      JSON.stringify(transactions),
      bounds.start,
      bounds.end,
    ),
  ) as CategorySpend[];
}

export function getSpendingTrend(transactions: Transaction[]): SpendingTrend {
  return JSON.parse(
    _txAgg.getSpendingTrend(JSON.stringify(transactions), Date.now()),
  ) as SpendingTrend;
}

export function computeCategoryTrends(
  transactions: Transaction[],
  topN: number = 5,
): { data: CategoryTrendMonth[]; categories: string[] } {
  const raw = JSON.parse(
    _txAgg.computeCategoryTrends(JSON.stringify(transactions), topN, Date.now()),
  ) as { data: Array<{ month: string; [k: string]: number | string }>; categories: string[] };

  // Replace KMP-produced month keys with locale-formatted labels.
  const data: CategoryTrendMonth[] = raw.data.map((row) => ({
    ...row,
    month: formatMonthLabel(row.month as string),
  }));

  return { data, categories: raw.categories };
}

export function computeIncomeBreakdown(
  transactions: Transaction[],
  period?: { start: string; end: string },
): IncomeBreakdown {
  const bounds = period ?? getMonthBounds(currentMonth());
  return JSON.parse(
    _txAgg.computeIncomeBreakdown(
      JSON.stringify(transactions),
      Date.now(),
      bounds.start,
      bounds.end,
    ),
  ) as IncomeBreakdown;
}

export function matchCategoryToTransaction(
  description: string,
  category: string,
  categories: BudgetCategory[],
): string | undefined {
  return _txAgg.matchCategoryToTransaction(
    description,
    category,
    JSON.stringify(categories),
  ) ?? undefined;
}
