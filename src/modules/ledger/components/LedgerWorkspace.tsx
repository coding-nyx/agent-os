import React, { useState, useMemo, useCallback } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { LayoutDashboard, Receipt, PieChart, Target, ListTodo, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LedgerIntakeProfile } from '../services/ledger-intake-service';
import { TransactionManager, Transaction } from './TransactionManager';
import { BudgetPlanner, BudgetCategory } from './BudgetPlanner';
import { GoalTracker, FinancialGoal } from './GoalTracker';
import { FieldsTab } from './FieldsTab';

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

type TabId = 'transactions' | 'budget' | 'goals' | 'fields';

const TABS = [
  { id: 'transactions' as const, label: 'Transactions', icon: Receipt },
  { id: 'budget' as const, label: 'Budget Planner', icon: PieChart },
  { id: 'goals' as const, label: 'Goals', icon: Target },
  { id: 'fields' as const, label: 'Fields', icon: Database },
];

// Extended profile type with our new data structures
interface ExtendedLedgerProfile extends LedgerIntakeProfile {
  transactions?: Transaction[];
  budgetCategories?: BudgetCategory[];
  financialGoals?: FinancialGoal[];
}

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

  // Cast profile to extended type
  const extendedProfile = profile as ExtendedLedgerProfile;

  // Initialize data with defaults
  const transactions = extendedProfile.transactions || [];
  const budgetCategories = extendedProfile.budgetCategories || [];
  const financialGoals = extendedProfile.financialGoals || [];

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

  // Transaction handlers
  const handleAddTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID()
    };
    
    onUpdateProfile({
      transactions: [...transactions, newTransaction]
    } as any);
  }, [transactions, onUpdateProfile]);

  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    const updatedTransactions = transactions.map(t => 
      t.id === id ? { ...t, ...updates } : t
    );
    
    onUpdateProfile({
      transactions: updatedTransactions
    } as any);
  }, [transactions, onUpdateProfile]);

  const handleDeleteTransaction = useCallback((id: string) => {
    const updatedTransactions = transactions.filter(t => t.id !== id);
    
    onUpdateProfile({
      transactions: updatedTransactions
    } as any);
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
        } as any);
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
    } as any);
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
    } as any);
  }, [budgetCategories, onUpdateProfile]);

  const handleDeleteBudgetCategory = useCallback((id: string) => {
    const updatedCategories = budgetCategories.filter(cat => cat.id !== id);
    
    onUpdateProfile({
      budgetCategories: updatedCategories
    } as any);
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
    } as any);
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
    } as any);
  }, [financialGoals, onUpdateProfile]);

  const handleUpdateGoal = useCallback((id: string, updates: Partial<FinancialGoal>) => {
    const updatedGoals = financialGoals.map(goal =>
      goal.id === id ? { ...goal, ...updates } : goal
    );
    
    onUpdateProfile({
      financialGoals: updatedGoals
    } as any);
  }, [financialGoals, onUpdateProfile]);

  const handleDeleteGoal = useCallback((id: string) => {
    const updatedGoals = financialGoals.filter(goal => goal.id !== id);
    
    onUpdateProfile({
      financialGoals: updatedGoals
    } as any);
  }, [financialGoals, onUpdateProfile]);

  // Sync spending from transactions to budget categories
  useMemo(() => {
    if (transactions.length > 0 && budgetCategories.length > 0) {
      const categorySpending: Record<string, number> = {};
      
      transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
          categorySpending[t.category] = (categorySpending[t.category] || 0) + t.amount;
        });
      
      const updatedCategories = budgetCategories.map(cat => ({
        ...cat,
        spent: categorySpending[cat.name] || 0
      }));
      
      // Only update if there's a change
      const hasChanges = updatedCategories.some((cat, i) => cat.spent !== budgetCategories[i].spent);
      if (hasChanges) {
        onUpdateProfile({
          budgetCategories: updatedCategories
        } as any);
      }
    }
  }, [transactions, budgetCategories, onUpdateProfile]);

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
            categories={budgetCategories}
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
