import { useCallback, useMemo } from 'react';
import type { LedgerIntakeProfile, BudgetCategory, FinancialGoal } from '../services/ledger-intake-service';
import type { DebtItem } from '../services/ledger-intake-service';

/** Deterministic color palette for budget categories — no Math.random(). */
const BUDGET_CATEGORY_COLORS: readonly string[] = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#3b82f6', '#ec4899', '#f97316',
  '#84cc16', '#a78bfa',
] as const;

function pickBudgetColor(index: number): string {
  return BUDGET_CATEGORY_COLORS[index % BUDGET_CATEGORY_COLORS.length];
}

/** Shape expected by handleApplyBudgetTemplate */
interface BudgetTemplate {
  allocations: Record<string, number>;
}

export interface LedgerBudgetActions {
  handleUpdateBudgetCategory: (id: string, allocated: number) => void;
  handleAddBudgetCategory: (name: string, allocated: number) => void;
  handleDeleteBudgetCategory: (id: string) => void;
  handleApplyBudgetTemplate: (template: BudgetTemplate) => void;
}

export interface LedgerGoalActions {
  handleAddGoal: (goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => void;
  handleUpdateGoal: (id: string, updates: Partial<FinancialGoal>) => void;
  handleDeleteGoal: (id: string) => void;
}

export interface LedgerDebtActions {
  handleAddDebt: (debt: Omit<DebtItem, 'id'>) => void;
  handleUpdateDebt: (id: string, updates: Partial<DebtItem>) => void;
  handleDeleteDebt: (id: string) => void;
}

export function useLedgerBudget(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerBudgetActions {
  const budgetCategories = useMemo(() => profile?.budgetCategories ?? [], [profile?.budgetCategories]);

  const handleUpdateBudgetCategory = useCallback((id: string, allocated: number) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      budgetCategories: budgetCategories.map(cat => cat.id === id ? { ...cat, allocated } : cat),
    });
  }, [profile, budgetCategories, persistUpdate]);

  const handleAddBudgetCategory = useCallback((name: string, allocated: number) => {
    if (!profile) return;
    const newCategory: BudgetCategory = {
      id: crypto.randomUUID(),
      name,
      allocated,
      spent: 0,
      color: pickBudgetColor(budgetCategories.length),
    };
    persistUpdate({ ...profile, budgetCategories: [...budgetCategories, newCategory] });
  }, [profile, budgetCategories, persistUpdate]);

  const handleDeleteBudgetCategory = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, budgetCategories: budgetCategories.filter(cat => cat.id !== id) });
  }, [profile, budgetCategories, persistUpdate]);

  const handleApplyBudgetTemplate = useCallback((template: BudgetTemplate) => {
    if (!profile) return;
    const newCategories: BudgetCategory[] = Object.entries(template.allocations).map(([name, percentage], idx) => ({
      id: crypto.randomUUID(),
      name,
      allocated: (profile.monthlyIncome * percentage) / 100,
      spent: 0,
      color: pickBudgetColor(idx),
    }));
    persistUpdate({ ...profile, budgetCategories: newCategories });
  }, [profile, persistUpdate]);

  return {
    handleUpdateBudgetCategory,
    handleAddBudgetCategory,
    handleDeleteBudgetCategory,
    handleApplyBudgetTemplate,
  };
}

export function useLedgerGoals(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerGoalActions {
  const financialGoals = useMemo(() => profile?.financialGoals ?? [], [profile?.financialGoals]);

  const handleAddGoal = useCallback((goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => {
    if (!profile) return;
    const newGoal: FinancialGoal = {
      ...goal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    persistUpdate({ ...profile, financialGoals: [...financialGoals, newGoal] });
  }, [profile, financialGoals, persistUpdate]);

  const handleUpdateGoal = useCallback((id: string, updates: Partial<FinancialGoal>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      financialGoals: financialGoals.map(g => g.id === id ? { ...g, ...updates } : g),
    });
  }, [profile, financialGoals, persistUpdate]);

  const handleDeleteGoal = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, financialGoals: financialGoals.filter(g => g.id !== id) });
  }, [profile, financialGoals, persistUpdate]);

  return { handleAddGoal, handleUpdateGoal, handleDeleteGoal };
}

export function useLedgerDebts(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerDebtActions {
  const handleAddDebt = useCallback((debt: Omit<DebtItem, 'id'>) => {
    if (!profile) return;
    const newDebt: DebtItem = { ...debt, id: crypto.randomUUID() };
    persistUpdate({ ...profile, debtItems: [...(profile.debtItems ?? []), newDebt] });
  }, [profile, persistUpdate]);

  const handleUpdateDebt = useCallback((id: string, updates: Partial<DebtItem>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      debtItems: (profile.debtItems ?? []).map(d => d.id === id ? { ...d, ...updates } : d),
    });
  }, [profile, persistUpdate]);

  const handleDeleteDebt = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, debtItems: (profile.debtItems ?? []).filter(d => d.id !== id) });
  }, [profile, persistUpdate]);

  return { handleAddDebt, handleUpdateDebt, handleDeleteDebt };
}
