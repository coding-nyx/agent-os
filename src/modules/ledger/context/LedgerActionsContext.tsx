import React, { createContext, useContext } from 'react';
import type { Transaction, FinancialGoal, DebtItem } from '../services/ledger-intake-service';
import type { BudgetTemplate } from '../components/BudgetPlanner';

export interface LedgerActionsContextValue {
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  onDeleteTransaction: (id: string) => void;
  onImportCSV: (file: File) => void;
  onExportCSV: () => void;

  onUpdateCategory: (id: string, allocated: number) => void;
  onAddCategory: (name: string, allocated: number) => void;
  onDeleteCategory: (id: string) => void;
  onApplyTemplate: (template: BudgetTemplate) => void;

  onAddGoal: (goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (id: string, updates: Partial<FinancialGoal>) => void;
  onDeleteGoal: (id: string) => void;

  onAddDebt: (debt: Omit<DebtItem, 'id'>) => void;
  onUpdateDebt: (id: string, updates: Partial<DebtItem>) => void;
  onDeleteDebt: (id: string) => void;

  onValueChange: (fieldId: string, value: unknown) => void;
  onAddField: () => void;
  onDeleteField: (fieldId: string) => void;

  onAskAI: (question: string) => void;
}

const LedgerActionsContext = createContext<LedgerActionsContextValue | null>(null);

export function useLedgerActions() {
  const context = useContext(LedgerActionsContext);
  if (!context) {
    throw new Error('useLedgerActions must be used within a LedgerActionsProvider');
  }
  return context;
}

export function LedgerActionsProvider({ children, value }: { children: React.ReactNode; value: LedgerActionsContextValue }) {
  return <LedgerActionsContext.Provider value={value}>{children}</LedgerActionsContext.Provider>;
}
