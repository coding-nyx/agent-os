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

import type { DebtItem, FinancialGoal, LedgerIntakeProfile } from './ledger-intake-service';

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
    } else if (tx.type === 'expense') {
      bucket.expenses = round2(bucket.expenses + tx.amount);
    }
    // transfer: skip — do not count in either income or expenses
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
    } else if (tx.type === 'expense') {
      currentMonthExpenses = round2(currentMonthExpenses + tx.amount);
    }
    // transfer: skip
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

// ---------------------------------------------------------------------------
// Category trend (stacked bar chart data)
// ---------------------------------------------------------------------------

/**
 * A single row in the stacked bar chart — one entry per calendar month.
 * `month` holds the human-readable label (e.g. "Jan 2025"); every other key
 * is a category name mapping to the total amount spent in that month.
 * The mixed `number | string` value type satisfies the Recharts `dataKey`
 * contract while keeping TypeScript strict-mode happy.
 */
export interface CategoryTrendMonth {
  month: string;
  [category: string]: number | string;
}

/**
 * Aggregates expense transactions into a stacked bar chart dataset showing
 * per-category spend across the last 6 calendar months.
 *
 * Algorithm
 * ---------
 * 1. Build an ordered 6-month window (oldest → newest).
 * 2. Single-pass accumulation: for each expense transaction that falls inside
 *    the window, add its amount to the relevant (month, category) bucket AND
 *    to the category's all-time total.
 * 3. Rank categories by all-time total spend; retain the top `topN`.
 *    Everything else is collapsed into an "Other" bucket.
 * 4. Build the final row array, zero-filling months with no data.
 *
 * @param transactions - Full transaction list (any date range).
 * @param topN         - Maximum number of named categories to surface.
 *                       Defaults to 5.
 * @returns `data`       — Array of `CategoryTrendMonth` ordered oldest → newest.
 *          `categories` — Ordered array of category names used as Recharts
 *                         `dataKey` values (topN leaders + optional "Other").
 *
 * Time complexity: O(n + k log k) where n = transactions and k = unique
 * categories. The sort is only over k, which is typically small.
 */
export function computeCategoryTrends(
  transactions: Transaction[],
  topN: number = 5,
): { data: CategoryTrendMonth[]; categories: string[] } {
  // Build the ordered 6-month window (oldest first).
  const targetMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    targetMonths.push(monthsAgo(i));
  }

  // Per-month category spend:  month → (category → amount).
  const monthCategoryMap = new Map<string, Map<string, number>>();
  for (const m of targetMonths) {
    monthCategoryMap.set(m, new Map<string, number>());
  }

  // All-time spend per category across the entire 6-month window (for ranking).
  const categoryTotalMap = new Map<string, number>();

  // Single pass — O(n).
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const ym = toYearMonth(tx.date);
    const monthMap = monthCategoryMap.get(ym);
    if (!monthMap) continue; // Outside the 6-month window — skip.

    const key = tx.category;
    monthMap.set(key, round2((monthMap.get(key) ?? 0) + tx.amount));
    categoryTotalMap.set(key, round2((categoryTotalMap.get(key) ?? 0) + tx.amount));
  }

  // Rank by total spend and select the top N — O(k log k).
  const sorted = [...categoryTotalMap.entries()].sort((a, b) => b[1] - a[1]);
  const topCategories = sorted.slice(0, topN).map(([cat]) => cat);
  const hasOther = sorted.length > topN;
  const topCategorySet = new Set(topCategories);
  const categories: string[] = hasOther ? [...topCategories, 'Other'] : [...topCategories];

  // Build the data array — O(m * k) where m = 6 and k = topN (both constants).
  const data: CategoryTrendMonth[] = targetMonths.map((ym) => {
    const row: CategoryTrendMonth = { month: formatMonthLabel(ym) };
    const monthMap = monthCategoryMap.get(ym)!;

    // Zero-fill all named categories so Recharts always receives a number.
    for (const cat of topCategories) {
      row[cat] = 0;
    }
    if (hasOther) {
      row['Other'] = 0;
    }

    // Accumulate actual values.
    for (const [cat, amount] of monthMap) {
      if (topCategorySet.has(cat)) {
        row[cat] = round2((row[cat] as number) + amount);
      } else if (hasOther) {
        row['Other'] = round2((row['Other'] as number) + amount);
      }
    }

    return row;
  });

  return { data, categories };
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

// ---------------------------------------------------------------------------
// Debt Payoff Schedule — Avalanche & Snowball strategies
// ---------------------------------------------------------------------------

/**
 * A single monthly snapshot produced by the debt payoff simulation.
 */
export interface DebtPayoffMonth {
  /** 1-based month index (month 1 = first payment month). */
  month: number;
  /** Remaining total balance across all debts after this month's payments. */
  totalBalance: number;
  /** Cumulative interest paid through and including this month. */
  totalInterestPaid: number;
  /** Per-debt balances for this snapshot. */
  debts: Array<{ id: string; name: string; balance: number }>;
}

/**
 * Complete result of running a payoff simulation under one strategy.
 */
export interface DebtPayoffResult {
  strategy: 'avalanche' | 'snowball';
  /** Monthly snapshots ordered month 1 → payoff (capped at 360). */
  months: DebtPayoffMonth[];
  /** Total interest paid over the entire payoff period. */
  totalInterestPaid: number;
  /** Number of months until all debts reach zero. */
  monthsToPayoff: number;
  /**
   * Interest saved compared to paying every debt at its minimum only.
   * A positive value means this strategy saves money vs minimums-only.
   */
  interestSavedVsMinimum: number;
}

// ---------------------------------------------------------------------------
// Private simulation helpers
// ---------------------------------------------------------------------------

/** Internal mutable representation of a debt during simulation. */
interface SimDebt {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
}

/**
 * Runs a single payoff simulation.
 *
 * Algorithm (per month, up to MAX_MONTHS):
 *  1. Accrue monthly interest on each active debt.
 *  2. Apply minimum payments; any over-payment (balance < min) recycles back.
 *  3. Apply the remaining budget (extra + recycled minimums) to the priority
 *     debt first, then cascade to the next until exhausted.
 *  4. Snapshot total balance and cumulative interest.
 *
 * The total monthly budget is fixed at: Σ(minPayments) + extraMonthlyPayment.
 * As debts are retired, their freed minimums automatically join the extra pool
 * because the budget stays constant while fewer minimums are needed.
 *
 * Time complexity: O(M × D) where M = months to payoff (≤ 360), D = debt count.
 * Space complexity: O(M × D) for the monthly snapshot array.
 */
function runPayoffSimulation(
  rawDebts: DebtItem[],
  strategy: 'avalanche' | 'snowball',
  extraMonthlyPayment: number,
): { months: DebtPayoffMonth[]; totalInterestPaid: number } {
  const MAX_MONTHS = 360;
  // Centavo-level floor to avoid infinite tiny-balance loops.
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

  // Fixed monthly budget: original sum of minimums + extra.
  const totalBudget = round2(
    active.reduce((s, d) => s + d.minPayment, 0) + extraMonthlyPayment,
  );

  const paidOff = new Set<string>();
  const months: DebtPayoffMonth[] = [];
  let totalInterestPaid = 0;

  for (let m = 1; m <= MAX_MONTHS; m++) {
    const currentActive = active.filter((d) => !paidOff.has(d.id));
    if (currentActive.length === 0) break;

    // 1. Accrue monthly interest on each active debt.
    for (const debt of currentActive) {
      const interest = round2(debt.balance * (debt.apr / 100 / 12));
      debt.balance = round2(debt.balance + interest);
      totalInterestPaid = round2(totalInterestPaid + interest);
    }

    // 2. Apply minimum payments.
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

    // 3. Apply remaining budget to priority debt(s) in strategy order.
    if (remainingBudget > ZERO_THRESHOLD) {
      const prioritized = active
        .filter((d) => !paidOff.has(d.id))
        .slice()
        .sort((a, b) =>
          strategy === 'avalanche'
            ? b.apr - a.apr          // highest APR first
            : a.balance - b.balance, // lowest balance first
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

    // 4. Record monthly snapshot.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a month-by-month debt payoff schedule for a given strategy and
 * optional extra monthly payment.
 *
 * @param debts               - Active debt items (zero-balance debts are ignored).
 * @param strategy            - `'avalanche'` (highest APR first) or
 *                              `'snowball'` (lowest balance first).
 * @param extraMonthlyPayment - Additional amount applied beyond minimums each
 *                              month. Defaults to 0.
 * @returns DebtPayoffResult with monthly snapshots, totals, and a comparison
 *          against paying minimums only.
 *
 * Time complexity: O(M × D) per call, O(1) auxiliary space beyond snapshots.
 */
export function computeDebtPayoffSchedule(
  debts: DebtItem[],
  strategy: 'avalanche' | 'snowball',
  extraMonthlyPayment: number = 0,
): DebtPayoffResult {
  const activeDebts = debts.filter((d) => d.balance > 0);

  const main = runPayoffSimulation(activeDebts, strategy, Math.max(extraMonthlyPayment, 0));
  // Baseline: minimums only (strategy doesn't matter when extra = 0).
  const minimumOnly = runPayoffSimulation(activeDebts, 'avalanche', 0);

  return {
    strategy,
    months: main.months,
    totalInterestPaid: main.totalInterestPaid,
    monthsToPayoff: main.months.length,
    interestSavedVsMinimum: round2(minimumOnly.totalInterestPaid - main.totalInterestPaid),
  };
}

// ---------------------------------------------------------------------------
// Keyword map for local auto-categorization (no LLM calls, no side effects)
// ---------------------------------------------------------------------------

/**
 * Maps canonical budget-category names to lowercase keyword fragments.
 * Matching is purely positional (`.includes()`), case-insensitive, and
 * evaluated in iteration order — the first matching key wins.
 */
const KEYWORD_MAP: Record<string, string[]> = {
  'Food & Dining': [
    'grocery', 'groceries', 'supermarket', 'restaurant', 'cafe', 'coffee',
    'doordash', 'ubereats', 'grubhub', 'chipotle', 'mcdonald', 'subway',
    'pizza', 'starbucks', 'whole foods', 'trader joe',
  ],
  'Transportation': [
    'uber', 'lyft', 'gas', 'fuel', 'parking', 'toll', 'transit', 'metro',
    'bus', 'train', 'airline', 'flight', 'car wash',
  ],
  'Entertainment': [
    'netflix', 'spotify', 'hulu', 'disney', 'amazon prime', 'movie',
    'cinema', 'concert', 'theater', 'gaming', 'steam',
  ],
  'Shopping': [
    'amazon', 'walmart', 'target', 'costco', 'ebay', 'etsy', 'clothing',
    'apparel', 'shoes', 'zara', 'h&m',
  ],
  'Health': [
    'pharmacy', 'cvs', 'walgreens', 'doctor', 'hospital', 'clinic',
    'dental', 'gym', 'fitness', 'yoga',
  ],
  'Utilities': [
    'electric', 'gas bill', 'water', 'internet', 'phone', 'at&t',
    'verizon', 'comcast', 'wifi',
  ],
  'Housing': [
    'rent', 'mortgage', 'hoa', 'property', 'maintenance', 'repairs',
    'airbnb', 'hotel',
  ],
  'Education': [
    'tuition', 'student loan', 'course', 'udemy', 'coursera', 'books',
    'school',
  ],
  'Insurance': ['insurance', 'geico', 'state farm', 'allstate', 'progressive'],
  'Subscriptions': ['subscription', 'membership', 'annual fee', 'monthly fee'],
};

/**
 * Matches a transaction to a budget category using two strategies:
 *
 * 1. **Exact name match** — case-insensitive comparison of the `category`
 *    param against every `BudgetCategory.name`.
 * 2. **Keyword map lookup** — scans the lowercase `description` for the first
 *    keyword fragment defined in `KEYWORD_MAP`. If the associated map key
 *    resolves to an existing `BudgetCategory` (name match), that category's
 *    `id` is returned.
 *
 * This is a pure function: no I/O, no mutation, deterministic output.
 *
 * @param description - Transaction description or merchant name used for
 *                      keyword scanning.
 * @param category    - Free-form category label submitted with the transaction.
 *                      Used for the exact-name match step.
 * @param categories  - The user's current budget category list.
 * @returns The matched `BudgetCategory.id`, or `undefined` when no match is
 *          found or `categories` is empty.
 *
 * Time complexity: O(c + k) where c = categories.length and
 * k = total keywords across all KEYWORD_MAP entries.
 */
export function matchCategoryToTransaction(
  description: string,
  category: string,
  categories: BudgetCategory[],
): string | undefined {
  if (categories.length === 0) return undefined;

  // Step 1: exact case-insensitive match on the supplied category label.
  const trimmedCategory = category.trim();
  if (trimmedCategory) {
    const lowerCategory = trimmedCategory.toLowerCase();
    const exact = categories.find((c) => c.name.toLowerCase() === lowerCategory);
    if (exact) return exact.id;
  }

  // Step 2: keyword map lookup against the lowercased description.
  const lowerDesc = description.toLowerCase();
  for (const [mapKey, keywords] of Object.entries(KEYWORD_MAP)) {
    const hasKeyword = keywords.some((kw) => lowerDesc.includes(kw));
    if (!hasKeyword) continue;

    // Only return an id when the matched map key has a corresponding category.
    const budgetCategory = categories.find(
      (c) => c.name.toLowerCase() === mapKey.toLowerCase(),
    );
    if (budgetCategory) return budgetCategory.id;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Alert evaluation
// ---------------------------------------------------------------------------

export type AlertSeverity = 'warning' | 'danger' | 'info';
export type AlertType =
  | 'budget_80pct'
  | 'budget_over'
  | 'goal_stale'
  | 'negative_cashflow'
  | 'goal_near_complete';

export interface LedgerAlert {
  /** Deterministic stable key suitable for React `key` prop: `${type}_${entityId}`. */
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Budget category id or financial goal id — absent for cashflow alerts. */
  entityId?: string;
}

/**
 * Minimal currency formatter for use inside the pure aggregation layer.
 * Avoids importing @/lib/utils so this module remains dependency-free
 * beyond its existing service siblings.
 *
 * @param amount   - Numeric value to format.
 * @param currency - ISO 4217 code, e.g. "USD".
 */
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

/**
 * Evaluates the current financial state and returns a list of actionable
 * alert objects for display in the dashboard.
 *
 * Design notes
 * ------------
 * - **Pure**: no I/O, no mutations, no side effects.
 * - **Deterministic IDs**: `id` is always `${type}_${entityId}` so React keys
 *   remain stable across re-renders without needing UUID generation.
 * - **Precedence rule**: `budget_over` takes precedence over `budget_80pct`
 *   for the same category — only one alert is emitted per category.
 *
 * @param profile          - Full ledger profile supplying goals and currency.
 * @param budgetWithActuals - Output of `computeBudgetActuals` for the current month.
 * @param metrics           - Current-month income / expense / net figures.
 * @returns Ordered alert list: budget alerts first, then cashflow, then goals.
 *
 * Time complexity: O(b + g) where b = budget categories, g = financial goals.
 */
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

  // --- Budget alerts (O(b)) ---
  for (const category of budgetWithActuals) {
    // Skip unallocated categories — no meaningful percentage to compute.
    if (category.allocated <= 0) continue;

    const spendPct = (category.actual / category.allocated) * 100;

    if (category.actual > category.allocated) {
      // budget_over: danger — takes precedence; do NOT also emit budget_80pct.
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
      // budget_80pct: warning — only when not already over.
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

  // --- Cashflow alert (O(1)) ---
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

  // --- Goal alerts (O(g)) ---
  const goals: FinancialGoal[] = profile.financialGoals ?? [];
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  for (const goal of goals) {
    if (goal.targetAmount <= 0) continue;

    const fundedRatio = goal.currentAmount / goal.targetAmount;
    const fundedPct = Math.round(fundedRatio * 100);

    if (fundedRatio >= 0.9 && goal.currentAmount < goal.targetAmount) {
      // goal_near_complete: info — 90 %+ funded but not yet complete.
      alerts.push({
        id: `goal_near_complete_${goal.id}`,
        type: 'goal_near_complete',
        severity: 'info',
        title: `${goal.name} — Almost There!`,
        message: `${goal.name} is 90%+ funded — finish line in sight!`,
        entityId: goal.id,
      });
    } else if (goal.targetDate) {
      // goal_stale: warning — deadline within 30 days AND < 90 % funded.
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

// ---------------------------------------------------------------------------
// Savings Goal Projections
// ---------------------------------------------------------------------------

/**
 * The result of projecting a single FinancialGoal forward in time.
 *
 * All date values are ISO-8601 strings (YYYY-MM-DD). `monthsToTarget` is
 * `null` when a projection cannot be computed (e.g. no monthly contribution).
 */
export interface SavingsProjection {
  /** The id of the goal this projection belongs to. */
  goalId: string;
  /**
   * How many full months until the goal is reached at the current
   * contribution rate.  `null` when `monthlyContribution <= 0`.
   */
  monthsToTarget: number | null;
  /**
   * ISO date string of the projected completion date, or `null` when a
   * projection cannot be computed.
   */
  projectedCompletionDate: string | null;
  /**
   * `true` when the projection hits on or before `targetDate` (or when there
   * is no `targetDate`).
   */
  onTrack: boolean;
  /**
   * The monthly contribution required to reach `targetAmount` exactly by
   * `targetDate`.  Equal to `monthlyContribution` when no `targetDate` is set.
   */
  monthlyRequired: number;
  /**
   * `monthlyContribution - monthlyRequired`.  Positive means the user is
   * contributing more than required (ahead of schedule); negative means they
   * are falling short.
   */
  surplusOrDeficit: number;
}

/**
 * Pure function — derives a {@link SavingsProjection} from a single
 * {@link FinancialGoal}.  No side effects; creates only local Date objects.
 *
 * Complexity: O(1) — all arithmetic is constant-time.
 *
 * Edge-cases handled:
 *  - `targetAmount <= 0` or `currentAmount >= targetAmount` → already complete.
 *  - `monthlyContribution <= 0` → cannot project (returns null dates).
 *  - `targetDate` in the past → `monthlyRequired` is clamped to `remaining`
 *    (i.e. the full amount is needed immediately).
 */
export function computeSavingsProjection(goal: FinancialGoal): SavingsProjection {
  const remaining = goal.targetAmount - goal.currentAmount;

  // ── Already complete (covers targetAmount = 0 edge case) ──────────────────
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

  // ── Helper: months between two Date objects (truncated, not rounded) ───────
  function monthsBetween(from: Date, to: Date): number {
    return (
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
    );
  }

  // ── Cannot project without a positive contribution ────────────────────────
  if (goal.monthlyContribution <= 0) {
    let monthlyRequired = 0;

    if (goal.targetDate) {
      const now = new Date();
      const target = new Date(goal.targetDate);
      const monthsUntilTarget = monthsBetween(now, target);
      // Guard against a past or same-month target date.
      monthlyRequired = monthsUntilTarget > 0 ? remaining / monthsUntilTarget : remaining;
    }
    // When there is no targetDate, monthlyRequired stays 0 (matching
    // monthlyContribution) so surplusOrDeficit is also 0.

    return {
      goalId: goal.id,
      monthsToTarget: null,
      projectedCompletionDate: null,
      onTrack: false,
      monthlyRequired,
      surplusOrDeficit: goal.monthlyContribution - monthlyRequired,
    };
  }

  // ── Normal projection path ─────────────────────────────────────────────────
  const monthsToTarget = Math.ceil(remaining / goal.monthlyContribution);

  // Build the projected completion date without mutating `now`.
  const now = new Date();
  const projected = new Date(
    now.getFullYear(),
    now.getMonth() + monthsToTarget,
    now.getDate(),
  );
  // Normalise to an ISO date string (YYYY-MM-DD) — no time zone dependency.
  const projectedCompletionDate = [
    projected.getFullYear(),
    String(projected.getMonth() + 1).padStart(2, '0'),
    String(projected.getDate()).padStart(2, '0'),
  ].join('-');

  // ── On-track check and required-monthly calculation ───────────────────────
  let onTrack = true;
  let monthlyRequired: number;

  if (goal.targetDate) {
    // `<=` comparison works correctly on ISO date strings (lexicographic).
    onTrack = projectedCompletionDate <= goal.targetDate;

    const target = new Date(goal.targetDate);
    const monthsUntilTargetDate = monthsBetween(now, target);
    // Clamp to avoid division by zero or negative months.
    monthlyRequired =
      monthsUntilTargetDate > 0 ? remaining / monthsUntilTargetDate : remaining;
  } else {
    // No deadline → always on track; required equals current contribution.
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
