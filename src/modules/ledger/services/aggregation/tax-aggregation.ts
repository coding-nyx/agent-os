import type { LedgerIntakeProfile, TaxCategory, TaxYearSummary } from '../ledger-intake-service';

const DEDUCTIBLE_CATEGORIES: TaxCategory[] = ['deductible', 'partial'];

export interface TaxCategoryBreakdown {
  category: TaxCategory;
  total: number;
  transactionCount: number;
}

export function computeTaxBreakdown(profile: LedgerIntakeProfile, taxYear: number): TaxCategoryBreakdown[] {
  const transactions = (profile.transactions ?? []).filter(tx => {
    const txYear = new Date(tx.date).getFullYear();
    return txYear === taxYear && tx.type === 'expense';
  });

  const map: Partial<Record<TaxCategory, { total: number; count: number }>> = {};
  for (const tx of transactions) {
    const cat = tx.taxCategory ?? 'unknown';
    if (!map[cat]) map[cat] = { total: 0, count: 0 };
    map[cat]!.total += tx.amount;
    map[cat]!.count += 1;
  }

  return Object.entries(map).map(([cat, data]) => ({
    category: cat as TaxCategory,
    total: data!.total,
    transactionCount: data!.count,
  }));
}

export function buildTaxYearSummary(profile: LedgerIntakeProfile, taxYear: number): TaxYearSummary {
  const yearTxs = (profile.transactions ?? []).filter(tx => new Date(tx.date).getFullYear() === taxYear);

  const totalIncome = yearTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
  const totalExpenses = yearTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);

  const deductibleTxs = yearTxs.filter(tx =>
    tx.type === 'expense' && tx.taxCategory && DEDUCTIBLE_CATEGORIES.includes(tx.taxCategory)
  );
  const deductibleExpenses = deductibleTxs.reduce((s, tx) => s + tx.amount, 0);

  const yearDeductions = (profile.taxDeductions ?? [])
    .filter(d => d.taxYear === taxYear);
  const totalDeductions = yearDeductions.reduce((s, d) => s + d.amount, 0) + deductibleExpenses;

  const breakdown = computeTaxBreakdown(profile, taxYear);
  const categoryBreakdown: Record<string, number> = {};
  for (const item of breakdown) {
    categoryBreakdown[item.category] = item.total;
  }

  return {
    taxYear,
    generatedAt: new Date().toISOString(),
    totalIncome,
    totalExpenses,
    deductibleExpenses,
    totalDeductions,
    estimatedTaxableIncome: Math.max(0, totalIncome - totalDeductions),
    categoryBreakdown,
    deductibleTransactionIds: deductibleTxs.map(tx => tx.id),
  };
}
