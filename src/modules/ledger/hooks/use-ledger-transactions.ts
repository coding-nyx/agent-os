import { useCallback, useMemo } from 'react';
import type { LedgerIntakeProfile, Transaction, BudgetCategory } from '../services/ledger-intake-service';
import { matchCategoryToTransaction } from '../services/aggregation';

export interface LedgerTransactionActions {
  handleAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  handleUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  handleDeleteTransaction: (id: string) => void;
  handleImportCSV: (file: File) => void;
  handleExportCSV: () => void;
}

export function useLedgerTransactions(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerTransactionActions {
  const transactions = useMemo(() => profile?.transactions ?? [], [profile?.transactions]);
  const budgetCategories = useMemo(() => profile?.budgetCategories ?? [], [profile?.budgetCategories]);

  const handleAddTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    const matchedId = matchCategoryToTransaction(
      transaction.description,
      transaction.category,
      budgetCategories,
    );
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
      budgetCategoryId: transaction.budgetCategoryId ?? matchedId,
    };
    if (!profile) return;
    persistUpdate({ ...profile, transactions: [...transactions, newTransaction] });
  }, [profile, transactions, budgetCategories, persistUpdate]);

  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    if (!profile) return;
    persistUpdate({
      ...profile,
      transactions: transactions.map(t => t.id === id ? { ...t, ...updates } : t),
    });
  }, [profile, transactions, persistUpdate]);

  const handleDeleteTransaction = useCallback((id: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, transactions: transactions.filter(t => t.id !== id) });
  }, [profile, transactions, persistUpdate]);

  const handleImportCSV = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split('\n').filter(line => line.trim());
      const newTransactions: Transaction[] = [];
      lines.slice(1).forEach(line => {
        const [date, description, amount, type, category] = line.split(',').map(s => s.trim());
        if (date && description && amount) {
          newTransactions.push({
            id: crypto.randomUUID(),
            date,
            description,
            amount: parseFloat(amount),
            type: (type?.toLowerCase() as 'income' | 'expense') || 'expense',
            category: category || 'Other',
          });
        }
      });
      if (newTransactions.length > 0 && profile) {
        persistUpdate({ ...profile, transactions: [...transactions, ...newTransactions] });
      }
    };
    reader.readAsText(file);
  }, [profile, transactions, persistUpdate]);

  const handleExportCSV = useCallback(() => {
    const csvContent = [
      'Date,Description,Amount,Type,Category',
      ...transactions.map(t => `${t.date},${t.description},${t.amount},${t.type},${t.category}`),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transactions]);

  return {
    handleAddTransaction,
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleImportCSV,
    handleExportCSV,
  };
}
