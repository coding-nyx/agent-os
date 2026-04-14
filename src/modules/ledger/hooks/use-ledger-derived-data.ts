/**
 * useLedgerDerivedData — Pure memo computations from the ledger profile
 *
 * Owns:
 *   - transactions (memoised array)
 *   - transactionTotals (income + expenses)
 *   - budgetCategories / financialGoals (memoised arrays)
 *   - automationSuggestions (from automation engine)
 *   - categories (expense category names with defaults)
 *   - budgetWithActuals (budget categories with actual spend joined)
 */

import { useMemo, useEffect, useSyncExternalStore } from 'react';
import type {
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  FinancialGoal,
} from '../services/ledger-intake-service';
import type { AutomationSuggestion } from '../services/ledger-intake-service';
import { computeBudgetActuals } from '../services/aggregation';
import { subscribeToSuggestions, getSuggestionsSnapshot, pokeSuggestions } from '@/cortex-bridge/automation-bridge';

export interface LedgerDerivedData {
  transactions: Transaction[];
  transactionTotals: { totalIncome: number; totalExpenses: number };
  budgetCategories: BudgetCategory[];
  financialGoals: FinancialGoal[];
  automationSuggestions: AutomationSuggestion[];
  categories: string[];
  budgetWithActuals: BudgetCategory[];
}

export function useLedgerDerivedData(
  profile: LedgerIntakeProfile | null,
): LedgerDerivedData {
  const transactions = useMemo(() => profile?.transactions ?? [], [profile?.transactions]);

  const transactionTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpenses += t.amount;
    }
    return { totalIncome, totalExpenses };
  }, [transactions]);

  const budgetCategories = useMemo(
    () => profile?.budgetCategories ?? [],
    [profile?.budgetCategories],
  );

  const financialGoals = useMemo(
    () => profile?.financialGoals ?? [],
    [profile?.financialGoals],
  );

  useEffect(() => {
    if (!profile) return;
    pokeSuggestions(JSON.stringify(profile));
  }, [profile]);

  const suggestionsJson = useSyncExternalStore(subscribeToSuggestions, getSuggestionsSnapshot);
  const automationSuggestions = useMemo(
    () => JSON.parse(suggestionsJson) as AutomationSuggestion[],
    [suggestionsJson],
  );

  const categories = useMemo((): string[] => {
    if (!profile)
      return ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Other'];
    const expenseCategories = [
      ...profile.fixedExpenses.map((e) => e.label),
      ...profile.variableExpenses.map((e) => e.label),
    ];
    const unique = Array.from(new Set(expenseCategories));
    const defaults = [
      'Groceries',
      'Utilities',
      'Transportation',
      'Entertainment',
      'Healthcare',
      'Other',
    ];
    defaults.forEach((cat) => {
      if (!unique.includes(cat)) unique.push(cat);
    });
    return unique;
  }, [profile]);

  const budgetWithActuals = useMemo((): BudgetCategory[] => {
    const performances = computeBudgetActuals(
      profile?.transactions ?? [],
      profile?.budgetCategories ?? [],
    );
    const actualById = new Map<string, number>(
      performances.map((p) => [p.categoryId, p.actual]),
    );
    return budgetCategories.map((cat) => ({
      ...cat,
      spent: actualById.get(cat.id) ?? 0,
    }));
  }, [profile?.transactions, profile?.budgetCategories, budgetCategories]);

  return {
    transactions,
    transactionTotals,
    budgetCategories,
    financialGoals,
    automationSuggestions,
    categories,
    budgetWithActuals,
  };
}
