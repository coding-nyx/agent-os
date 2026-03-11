/**
 * ledger-aggregation-service.ts
 *
 * Pure utility module for aggregating transaction data that powers the Ledger
 * dashboard. No React, no Firestore — all functions are side-effect free and
 * operate solely on the parameters they receive.
 *
 * Complexity overview
 * -------------------
 * Most operations are O(n) over the transaction list, where n = transaction
 * count. Grouping uses a single-pass Map accumulation, so there is no hidden
 * quadratic work regardless of category or month cardinality.
 */

// ---------------------------------------------------------------------------
// Local minimal interfaces (source-of-truth will move to ledger-intake-service)
// ---------------------------------------------------------------------------

interface Transaction {
  id: string;
  /** ISO date string e.g. "2025-03-11" */
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  isRecurring?: boolean;
  goalId?: string;
  budgetCategoryId?: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Returns the current month as "YYYY-MM". */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the month string for N months before today.
 * @param n - Number of months to go back (0 = current month).
 */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Converts a "YYYY-MM" string to a human-readable label such as "Mar 2025".
 */
function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Returns the inclusive ISO date bounds for a "YYYY-MM" month string.
 * e.g. "2025-03" → { start: "2025-03-01", end: "2025-03-31" }
 */
function getMonthBounds(month: string): { start: string; end: string } {
  const [year, mo] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(year, mo, 0).getDate(); // day 0 of next month = last day of this month
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Returns transactions whose `date` field falls within [start, end] inclusive.
 * Both bounds are ISO date strings ("YYYY-MM-DD").
 */
function filterByPeriod(
  transactions: Transaction[],
  start: string,
  end: string,
): Transaction[] {
  return transactions.filter((t) => t.date >= start && t.date <= end);
}

/** Extracts the "YYYY-MM" prefix from an ISO date string. */
function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Rounds a number to 2 decimal places. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface MonthlyTotals {
  /** "YYYY-MM" for programmatic use */
  month: string;
  /** "Mar 2025" for chart display */
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

export interface BudgetPerformance {
  categoryId: string;
  categoryName: string;
  allocated: number;
  actual: number;
  /** actual − allocated (positive = overspent) */
  variance: number;
  /** variance / allocated * 100 */
  variancePercent: number;
  status: 'under' | 'on_track' | 'warning' | 'over';
}

export interface IncomeBreakdown {
  total: number;
  byCategory: { category: string; amount: number; count: number }[];
  /** Average monthly income over the last 3 calendar months */
  averageMonthly: number;
}

export interface DashboardMetrics {
  currentMonthIncome: number;
  currentMonthExpenses: number;
  currentMonthNet: number;
  /** Sum of all net amounts across all time */
  totalBalance: number;
  /** Passed in from profile; defaults to 0 */
  totalDebt: number;
  /** Rolling 3-month average of expenses */
  averageMonthlyExpenses: number;
  /** currentMonthNet / currentMonthIncome (0–1); null when income is zero */
  savingsRate: number | null;
  topSpendCategory: string | null;
  hasTransactions: boolean;
}

export type TrendDirection = 'up' | 'down' | 'stable';

export interface SpendingTrend {
  direction: TrendDirection;
  /** Absolute percentage change vs. previous month */
  percentChange: number;
  currentMonth: number;
  previousMonth: number;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Aggregates transactions into per-month income / expense totals.
 *
 * @param transactions - Full transaction list (any date range).
 * @param months       - Number of calendar months to return, ending with the
 *                       current month. Defaults to 6.
 * @returns Array of MonthlyTotals ordered oldest → newest.
 *
 * Time complexity: O(n + m) where n = transactions, m = months.
 */
export function computeMonthlyTotals(
  transactions: Transaction[],
  months: number = 6,
): MonthlyTotals[] {
  // Build the ordered list of target months (oldest first).
  const targetMonths: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    targetMonths.push(monthsAgo(i));
  }

  // Single-pass accumulation into a Map keyed by "YYYY-MM".
  const accumulator = new Map<string, MonthlyTotals>(
    targetMonths.map((m) => [
      m,
      { month: m, label: formatMonthLabel(m), income: 0, expenses: 0, net: 0, transactionCount: 0 },
    ]),
  );

  for (const tx of transactions) {
    const ym = toYearMonth(tx.date);
    const bucket = accumulator.get(ym);
    if (!bucket) continue; // Outside the requested window — skip.

    bucket.transactionCount += 1;
    if (tx.type === 'income') {
      bucket.income = round2(bucket.income + tx.amount);
    } else {
      bucket.expenses = round2(bucket.expenses + tx.amount);
    }
    bucket.net = round2(bucket.income - bucket.expenses);
  }

  return targetMonths.map((m) => accumulator.get(m)!);
}

/**
 * Groups expense transactions by category for the given period and computes
 * each category's share of total spend.
 *
 * @param transactions - Full transaction list.
 * @param period       - Optional ISO date range. Defaults to the current
 *                       calendar month when omitted.
 * @returns CategorySpend[] sorted descending by amount.
 *
 * Time complexity: O(n log n) due to final sort; accumulation is O(n).
 */
export function computeCategorySpend(
  transactions: Transaction[],
  period?: { start: string; end: string },
): CategorySpend[] {
  const bounds = period ?? getMonthBounds(currentMonth());
  const expenses = filterByPeriod(transactions, bounds.start, bounds.end).filter(
    (t) => t.type === 'expense',
  );

  const byCategory = new Map<string, { amount: number; count: number }>();
  let totalExpenses = 0;

  for (const tx of expenses) {
    const key = tx.category;
    const entry = byCategory.get(key) ?? { amount: 0, count: 0 };
    entry.amount = round2(entry.amount + tx.amount);
    entry.count += 1;
    byCategory.set(key, entry);
    totalExpenses = round2(totalExpenses + tx.amount);
  }

  const result: CategorySpend[] = [];
  for (const [category, { amount, count }] of byCategory) {
    result.push({
      category,
      amount,
      transactionCount: count,
      percentOfTotal: totalExpenses > 0 ? round2((amount / totalExpenses) * 100) : 0,
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

/**
 * Compares actual spend against each budget category's allocated amount for
 * the given period.
 *
 * @param transactions     - Full transaction list.
 * @param budgetCategories - Budget configuration (allocated amounts).
 * @param period           - Optional ISO date range. Defaults to the current
 *                           calendar month when omitted.
 * @returns BudgetPerformance[] in the same order as budgetCategories.
 *
 * Time complexity: O(n + b) where b = number of budget categories.
 */
export function computeBudgetActuals(
  transactions: Transaction[],
  budgetCategories: BudgetCategory[],
  period?: { start: string; end: string },
): BudgetPerformance[] {
  const bounds = period ?? getMonthBounds(currentMonth());
  const expenses = filterByPeriod(transactions, bounds.start, bounds.end).filter(
    (t) => t.type === 'expense',
  );

  // Accumulate actual spend keyed by lower-cased category name.
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
    const utilizationPct = bc.allocated > 0 ? (actual / bc.allocated) * 100 : Infinity;

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

/**
 * Breaks down income transactions by category and computes a 3-month rolling
 * average for the given period.
 *
 * @param transactions - Full transaction list.
 * @param period       - Optional ISO date range. Defaults to the current
 *                       calendar month when omitted.
 * @returns IncomeBreakdown with byCategory sorted descending by amount.
 *
 * Time complexity: O(n).
 */
export function computeIncomeBreakdown(
  transactions: Transaction[],
  period?: { start: string; end: string },
): IncomeBreakdown {
  const bounds = period ?? getMonthBounds(currentMonth());
  const periodIncome = filterByPeriod(transactions, bounds.start, bounds.end).filter(
    (t) => t.type === 'income',
  );

  const byCategory = new Map<string, { amount: number; count: number }>();
  let total = 0;

  for (const tx of periodIncome) {
    const entry = byCategory.get(tx.category) ?? { amount: 0, count: 0 };
    entry.amount = round2(entry.amount + tx.amount);
    entry.count += 1;
    byCategory.set(tx.category, entry);
    total = round2(total + tx.amount);
  }

  // 3-month rolling average: collect income from last 3 calendar months.
  const last3Start = getMonthBounds(monthsAgo(2)).start;
  const last3End = getMonthBounds(monthsAgo(0)).end;
  const last3Income = filterByPeriod(transactions, last3Start, last3End)
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => round2(sum + t.amount), 0);
  const averageMonthly = round2(last3Income / 3);

  const sortedByCategory = [...byCategory.entries()]
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount);

  return { total, byCategory: sortedByCategory, averageMonthly };
}

/**
 * Computes the top-level metrics consumed by the LedgerDashboard stat cards.
 *
 * @param transactions - Full transaction list (all-time).
 * @param totalDebt    - Outstanding debt figure sourced from the user profile.
 *                       Defaults to 0 when omitted.
 * @returns DashboardMetrics snapshot based on the current calendar month.
 *
 * Time complexity: O(n).
 */
export function computeDashboardMetrics(
  transactions: Transaction[],
  totalDebt: number = 0,
): DashboardMetrics {
  const cm = currentMonth();
  const { start, end } = getMonthBounds(cm);
  const currentTxs = filterByPeriod(transactions, start, end);

  let currentMonthIncome = 0;
  let currentMonthExpenses = 0;

  for (const tx of currentTxs) {
    if (tx.type === 'income') {
      currentMonthIncome = round2(currentMonthIncome + tx.amount);
    } else {
      currentMonthExpenses = round2(currentMonthExpenses + tx.amount);
    }
  }

  const currentMonthNet = round2(currentMonthIncome - currentMonthExpenses);

  // All-time balance: net across every transaction ever recorded.
  let totalBalance = 0;
  for (const tx of transactions) {
    totalBalance = round2(
      tx.type === 'income' ? totalBalance + tx.amount : totalBalance - tx.amount,
    );
  }

  // 3-month rolling average expenses.
  const last3Start = getMonthBounds(monthsAgo(2)).start;
  const last3End = getMonthBounds(monthsAgo(0)).end;
  const last3Expenses = filterByPeriod(transactions, last3Start, last3End)
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => round2(sum + t.amount), 0);
  const averageMonthlyExpenses = round2(last3Expenses / 3);

  const savingsRate =
    currentMonthIncome > 0 ? round2(currentMonthNet / currentMonthIncome) : null;

  // Top spending category this month.
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

/**
 * Compares the current month's expenses to the previous month and returns a
 * directional trend indicator.
 *
 * @param transactions - Full transaction list (at minimum covering the last 2
 *                       calendar months for a meaningful comparison).
 * @returns SpendingTrend with direction classified as:
 *          - `'stable'` when the absolute change is < 5 %
 *          - `'up'`     when expenses increased by ≥ 5 %
 *          - `'down'`   when expenses decreased by ≥ 5 %
 *
 * Time complexity: O(n).
 */
export function getSpendingTrend(transactions: Transaction[]): SpendingTrend {
  const cmBounds = getMonthBounds(monthsAgo(0));
  const pmBounds = getMonthBounds(monthsAgo(1));

  const sum = (txs: Transaction[]) =>
    txs.filter((t) => t.type === 'expense').reduce((s, t) => round2(s + t.amount), 0);

  const currentMonthAmt = sum(filterByPeriod(transactions, cmBounds.start, cmBounds.end));
  const previousMonthAmt = sum(filterByPeriod(transactions, pmBounds.start, pmBounds.end));

  let percentChange = 0;
  if (previousMonthAmt > 0) {
    percentChange = round2(((currentMonthAmt - previousMonthAmt) / previousMonthAmt) * 100);
  } else if (currentMonthAmt > 0) {
    percentChange = 100; // Previous was zero; any spending is a 100 % increase.
  }

  const absChange = Math.abs(percentChange);
  const direction: TrendDirection = absChange < 5 ? 'stable' : percentChange > 0 ? 'up' : 'down';

  return {
    direction,
    percentChange: absChange,
    currentMonth: currentMonthAmt,
    previousMonth: previousMonthAmt,
  };
}
