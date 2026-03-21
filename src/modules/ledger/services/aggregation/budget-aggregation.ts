import {
  Transaction,
  BudgetCategory,
  currentMonth,
  getMonthBounds,
  filterByPeriod,
  round2,
} from './utils';

export interface BudgetPerformance {
  categoryId: string;
  categoryName: string;
  allocated: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'under' | 'on_track' | 'warning' | 'over';
}

export function computeBudgetActuals(
  transactions: Transaction[],
  budgetCategories: BudgetCategory[],
  period?: { start: string; end: string },
): BudgetPerformance[] {
  const bounds = period ?? getMonthBounds(currentMonth());
  const expenses = filterByPeriod(transactions, bounds.start, bounds.end).filter(
    (t) => t.type === 'expense',
  );

  const actualByCategory = new Map<string, number>();
  for (const tx of expenses) {
    const key = tx.category.toLowerCase();
    actualByCategory.set(key, round2((actualByCategory.get(key) ?? 0) + tx.amount));
  }

  return budgetCategories.map((bc) => {
    const actual = actualByCategory.get(bc.name.toLowerCase()) ?? 0;
    const variance = round2(actual - bc.allocated);
    const variancePercent =
      bc.allocated > 0 ? round2((variance / bc.allocated) * 100) : actual > 0 ? 100 : 0;
    const utilizationPct = bc.allocated > 0 ? (actual / bc.allocated) * 100 : actual > 0 ? 100 : 0;

    let status: BudgetPerformance['status'];
    if (utilizationPct < 80) {
      status = 'under';
    } else if (utilizationPct <= 100) {
      status = 'on_track';
    } else if (utilizationPct <= 120) {
      status = 'warning';
    } else {
      status = 'over';
    }

    return {
      categoryId: bc.id,
      categoryName: bc.name,
      allocated: bc.allocated,
      actual,
      variance,
      variancePercent,
      status,
    };
  });
}
