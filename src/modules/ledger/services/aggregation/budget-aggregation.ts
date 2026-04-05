// Bridge: delegates to KMP BudgetAggregationJs.

import { BudgetAggregationJs } from '@cortex-logic';
import { Transaction, BudgetCategory, currentMonth, getMonthBounds } from './utils';

export interface BudgetPerformance {
  categoryId: string;
  categoryName: string;
  allocated: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'under' | 'on_track' | 'warning' | 'over';
}

const _budgetAgg = new BudgetAggregationJs();

export function computeBudgetActuals(
  transactions: Transaction[],
  budgetCategories: BudgetCategory[],
  period?: { start: string; end: string },
): BudgetPerformance[] {
  const bounds = period ?? getMonthBounds(currentMonth());
  return JSON.parse(
    _budgetAgg.computeBudgetActuals(
      JSON.stringify(transactions),
      JSON.stringify(budgetCategories),
      bounds.start,
      bounds.end,
    ),
  ) as BudgetPerformance[];
}
