import React, { useState, useMemo, useCallback } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { LayoutDashboard, Receipt, PieChart, Target, ListTodo, Database, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LedgerIntakeProfile, Transaction, BudgetCategory, FinancialGoal } from '../services/ledger-intake-service';
import { computeBudgetActuals, matchCategoryToTransaction } from '../services/ledger-aggregation-service';
import { TransactionManager } from './TransactionManager';
import { BudgetPlanner } from './BudgetPlanner';
import { GoalTracker } from './GoalTracker';
import { FieldsTab } from './FieldsTab';
import { DebtStrategist } from './DebtStrategist';

interface LedgerWorkspaceProps {
  profile: LedgerIntakeProfile;
  onUpdateProfile: (updates: Partial<LedgerIntakeProfile>) => void;
  extensionValues?: Record<string, unknown>;
  onExtensionValueChange?: (fieldId: string, value: unknown) => void;
  onAddField?: () => void;
  onDeleteField?: (fieldId: string) => void;
  disabled?: boolean;
  /** Optional external control for the transaction modal */
  isAddTransactionModalOpen?: boolean;
  onAddTransactionModalOpenChange?: (open: boolean) => void;
}

type TabId = 'transactions' | 'budget' | 'goals' | 'debt' | 'fields';

const TABS = [
  { id: 'transactions' as const, label: 'Transactions', icon: Receipt },
  { id: 'budget' as const, label: 'Budget Planner', icon: PieChart },
  { id: 'goals' as const, label: 'Goals', icon: Target },
  { id: 'debt' as const, label: 'Debt', icon: CreditCard },
  { id: 'fields' as const, label: 'Fields', icon: Database },
];

export function LedgerWorkspace({ 
  profile, 
  onUpdateProfile, 
  extensionValues, 
  onExtensionValueChange, 
  onAddField, 
  onDeleteField, 
  disabled = false,
  isAddTransactionModalOpen,
  onAddTransactionModalOpenChange
}: LedgerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>('transactions');

  // Initialize data with defaults
  const transactions = profile.transactions || [];
  const budgetCategories = profile.budgetCategories || [];
  const financialGoals = profile.financialGoals || [];

  // Extract unique categories from profile expenses
  const categories = useMemo(() => {
    const expenseCategories = [
      ...profile.fixedExpenses.map(e => e.label),
      ...profile.variableExpenses.map(e => e.label)
    ];
    const uniqueCategories = Array.from(new Set(expenseCategories));
    
    // Add default categories
    const defaults = ['Groceries', 'Utilities', 'Transportation', 'Entertainment', 'Healthcare', 'Other'];
    defaults.forEach(cat => {
      if (!uniqueCategories.includes(cat)) {
        uniqueCategories.push(cat);
      }
    });
    
    return uniqueCategories;
  }, [profile]);

  // Derive per-category actual spend from real transactions for the current
  // calendar month. Returns a BudgetCategory[] with `spent` replaced by the
  // aggregated transaction total — never written back to profile state.
  // O(n + b): single-pass transaction accumulation then b-length map.
  const budgetWithActuals = useMemo((): BudgetCategory[] => {
    const performances = computeBudgetActuals(
      profile?.transactions ?? [],
      profile?.budgetCategories ?? [],
    );
    // Index by categoryId for O(1) lookup when mapping back to BudgetCategory.
    const actualById = new Map<string, number>(
      performances.map((p) => [p.categoryId, p.actual]),
    );
    return budgetCategories.map((cat) => ({
      ...cat,
      spent: actualById.get(cat.id) ?? 0,
    }));
  }, [profile?.transactions, profile?.budgetCategories, budgetCategories]);

  // Transaction handlers
  const handleAddTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    // Auto-categorize: resolve budgetCategoryId from keyword rules when not
    // already provided by the caller.
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
    
    onUpdateProfile({
      transactions: [...transactions, newTransaction]
    });
  }, [transactions, budgetCategories, onUpdateProfile]);

  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    const updatedTransactions = transactions.map(t => 
      t.id === id ? { ...t, ...updates } : t
    );
    
    onUpdateProfile({
      transactions: updatedTransactions
    });
  }, [transactions, onUpdateProfile]);

  const handleDeleteTransaction = useCallback((id: string) => {
    const updatedTransactions = transactions.filter(t => t.id !== id);
    
    onUpdateProfile({
      transactions: updatedTransactions
    });
  }, [transactions, onUpdateProfile]);

  const handleImportCSV = useCallback((file: File) => {
    // Parse CSV and add transactions
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split('\n').filter(line => line.trim());
      
      // Simple CSV parsing (assumes: date, description, amount, type, category)
      const newTransactions: Transaction[] = [];
      
      lines.slice(1).forEach(line => { // Skip header
        const [date, description, amount, type, category] = line.split(',').map(s => s.trim());
        
        if (date && description && amount) {
          newTransactions.push({
            id: crypto.randomUUID(),
            date,
            description,
            amount: parseFloat(amount),
            type: (type?.toLowerCase() as 'income' | 'expense') || 'expense',
            category: category || 'Other'
          });
        }
      });
      
      if (newTransactions.length > 0) {
        onUpdateProfile({
          transactions: [...transactions, ...newTransactions]
        });
      }
    };
    reader.readAsText(file);
  }, [transactions, onUpdateProfile]);

  const handleExportCSV = useCallback(() => {
    const csvContent = [
      'Date,Description,Amount,Type,Category',
      ...transactions.map(t => 
        `${t.date},${t.description},${t.amount},${t.type},${t.category}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transactions]);

  // Budget handlers
  const handleUpdateBudgetCategory = useCallback((id: string, allocated: number) => {
    const updatedCategories = budgetCategories.map(cat =>
      cat.id === id ? { ...cat, allocated } : cat
    );
    
    onUpdateProfile({
      budgetCategories: updatedCategories
    });
  }, [budgetCategories, onUpdateProfile]);

  const handleAddBudgetCategory = useCallback((name: string, allocated: number) => {
    const newCategory: BudgetCategory = {
      id: crypto.randomUUID(),
      name,
      allocated,
      spent: 0,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
    };
    
    onUpdateProfile({
      budgetCategories: [...budgetCategories, newCategory]
    });
  }, [budgetCategories, onUpdateProfile]);

  const handleDeleteBudgetCategory = useCallback((id: string) => {
    const updatedCategories = budgetCategories.filter(cat => cat.id !== id);
    
    onUpdateProfile({
      budgetCategories: updatedCategories
    });
  }, [budgetCategories, onUpdateProfile]);

  const handleApplyBudgetTemplate = useCallback((template: any) => {
    const newCategories: BudgetCategory[] = Object.entries(template.allocations).map(([name, percentage]) => ({
      id: crypto.randomUUID(),
      name,
      allocated: (profile.monthlyIncome * (percentage as number)) / 100,
      spent: 0,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`
    }));
    
    onUpdateProfile({
      budgetCategories: newCategories
    });
  }, [profile.monthlyIncome, onUpdateProfile]);

  // Goal handlers
  const handleAddGoal = useCallback((goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => {
    const newGoal: FinancialGoal = {
      ...goal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    
    onUpdateProfile({
      financialGoals: [...financialGoals, newGoal]
    });
  }, [financialGoals, onUpdateProfile]);

  const handleUpdateGoal = useCallback((id: string, updates: Partial<FinancialGoal>) => {
    const updatedGoals = financialGoals.map(goal =>
      goal.id === id ? { ...goal, ...updates } : goal
    );
    
    onUpdateProfile({
      financialGoals: updatedGoals
    });
  }, [financialGoals, onUpdateProfile]);

  const handleDeleteGoal = useCallback((id: string) => {
    const updatedGoals = financialGoals.filter(goal => goal.id !== id);
    
    onUpdateProfile({
      financialGoals: updatedGoals
    });
  }, [financialGoals, onUpdateProfile]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wider transition-colors",
                activeTab === tab.id
                  ? "bg-cyan-600 text-white"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        {activeTab === 'transactions' && (
          <TransactionManager
            transactions={transactions}
            categories={categories}
            currency={profile.currency}
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onImportCSV={handleImportCSV}
            onExportCSV={handleExportCSV}
            disabled={disabled}
            isAddModalOpen={isAddTransactionModalOpen}
            onAddModalOpenChange={onAddTransactionModalOpenChange}
            showAddButton={onAddTransactionModalOpenChange === undefined}
          />
        )}

        {activeTab === 'budget' && (
          <BudgetPlanner
            categories={budgetWithActuals}
            monthlyIncome={profile.monthlyIncome}
            currency={profile.currency}
            onUpdateCategory={handleUpdateBudgetCategory}
            onAddCategory={handleAddBudgetCategory}
            onDeleteCategory={handleDeleteBudgetCategory}
            onApplyTemplate={handleApplyBudgetTemplate}
            disabled={disabled}
          />
        )}

        {activeTab === 'goals' && (
          <GoalTracker
            goals={financialGoals}
            currency={profile.currency}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onDeleteGoal={handleDeleteGoal}
            disabled={disabled}
          />
        )}

        {activeTab === 'debt' && (
          <DebtStrategist
            debtItems={profile.debtItems ?? []}
            currency={profile.currency}
          />
        )}

        {activeTab === 'fields' && (
          <FieldsTab
            currency={profile.currency}
            extensionValues={extensionValues || {}}
            onValueChange={onExtensionValueChange}
            onAddField={onAddField}
            onDeleteField={onDeleteField}
          />
        )}
      </div>
    </div>
  );
}
