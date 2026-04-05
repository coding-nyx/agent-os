// Bridge: delegates pure math/date utilities to KMP LedgerAggregationUtilsJs.
// formatMonthLabel stays in TS — it uses the browser's toLocaleString API
// which is not available in Kotlin/JS targets.

import { LedgerAggregationUtilsJs } from '@cortex-logic';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  isRecurring?: boolean;
  goalId?: string;
  budgetCategoryId?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

const _utils = new LedgerAggregationUtilsJs();

export function round2(value: number): number {
  return _utils.round2(value);
}

/** Returns the current month as "YYYY-MM". */
export function currentMonth(): string {
  return _utils.epochMsToYearMonth(Date.now());
}

export function monthsAgo(n: number): string {
  return _utils.monthsAgo(n, Date.now());
}

/** Kept in TS: uses browser toLocaleString, not available in KMP. */
export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function getMonthBounds(month: string): { start: string; end: string } {
  return JSON.parse(_utils.getMonthBounds(month)) as { start: string; end: string };
}

export function filterByPeriod(
  transactions: Transaction[],
  start: string,
  end: string,
): Transaction[] {
  return JSON.parse(
    _utils.filterByPeriod(JSON.stringify(transactions), start, end),
  ) as Transaction[];
}

export function toYearMonth(isoDate: string): string {
  return _utils.toYearMonth(isoDate);
}
