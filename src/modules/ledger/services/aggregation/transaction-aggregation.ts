import {
  Transaction,
  BudgetCategory,
  currentMonth,
  monthsAgo,
  formatMonthLabel,
  getMonthBounds,
  filterByPeriod,
  toYearMonth,
  round2,
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

export function computeMonthlyTotals(
  transactions: Transaction[],
  months: number = 6,
): MonthlyTotals[] {
  const targetMonths: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    targetMonths.push(monthsAgo(i));
  }

  const accumulator = new Map<string, MonthlyTotals>(
    targetMonths.map((m) => [
      m,
      { month: m, label: formatMonthLabel(m), income: 0, expenses: 0, net: 0, transactionCount: 0 },
    ]),
  );

  for (const tx of transactions) {
    const ym = toYearMonth(tx.date);
    const bucket = accumulator.get(ym);
    if (!bucket) continue;

    bucket.transactionCount += 1;
    if (tx.type === 'income') {
      bucket.income = round2(bucket.income + tx.amount);
    } else if (tx.type === 'expense') {
      bucket.expenses = round2(bucket.expenses + tx.amount);
    }
    bucket.net = round2(bucket.income - bucket.expenses);
  }

  return targetMonths.map((m) => accumulator.get(m)!);
}

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

export function computeCategoryTrends(
  transactions: Transaction[],
  topN: number = 5,
): { data: CategoryTrendMonth[]; categories: string[] } {
  const targetMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    targetMonths.push(monthsAgo(i));
  }

  const monthCategoryMap = new Map<string, Map<string, number>>();
  for (const m of targetMonths) {
    monthCategoryMap.set(m, new Map<string, number>());
  }

  const categoryTotalMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const ym = toYearMonth(tx.date);
    const monthMap = monthCategoryMap.get(ym);
    if (!monthMap) continue;

    const key = tx.category;
    monthMap.set(key, round2((monthMap.get(key) ?? 0) + tx.amount));
    categoryTotalMap.set(key, round2((categoryTotalMap.get(key) ?? 0) + tx.amount));
  }

  const sorted = [...categoryTotalMap.entries()].sort((a, b) => b[1] - a[1]);
  const topCategories = sorted.slice(0, topN).map(([cat]) => cat);
  const hasOther = sorted.length > topN;
  const topCategorySet = new Set(topCategories);
  const categories: string[] = hasOther ? [...topCategories, 'Other'] : [...topCategories];

  const data: CategoryTrendMonth[] = targetMonths.map((ym) => {
    const row: CategoryTrendMonth = { month: formatMonthLabel(ym) };
    const monthMap = monthCategoryMap.get(ym)!;

    for (const cat of topCategories) {
      row[cat] = 0;
    }
    if (hasOther) {
      row['Other'] = 0;
    }

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
    percentChange = 100;
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

export function matchCategoryToTransaction(
  description: string,
  category: string,
  categories: BudgetCategory[],
): string | undefined {
  if (categories.length === 0) return undefined;

  const trimmedCategory = category.trim();
  if (trimmedCategory) {
    const lowerCategory = trimmedCategory.toLowerCase();
    const exact = categories.find((c) => c.name.toLowerCase() === lowerCategory);
    if (exact) return exact.id;
  }

  const lowerDesc = description.toLowerCase();
  for (const [mapKey, keywords] of Object.entries(KEYWORD_MAP)) {
    const hasKeyword = keywords.some((kw) => lowerDesc.includes(kw));
    if (!hasKeyword) continue;

    const budgetCategory = categories.find(
      (c) => c.name.toLowerCase() === mapKey.toLowerCase(),
    );
    if (budgetCategory) return budgetCategory.id;
  }

  return undefined;
}
