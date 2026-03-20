import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Plus, Search, Filter, Download, Upload, Edit2, Trash2, ArrowUpDown } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralModal } from '@/core/components/NeuralModal';
import { DynamicFormBuilder } from '@/core/components/forms/DynamicFormBuilder';
import { FieldSchema, FieldType } from '@/lib/field-system/types';
import { cn } from '@/lib/utils';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  recurring?: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  tags?: string[];
  notes?: string;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Extracted individual transaction rows into a memoized component.
 * This prevents O(N) evaluation cascades when the parent component re-renders
 * due to frequent state updates (like typing in the search input).
 */
const TransactionRow = React.memo(function TransactionRow({
  transaction,
  currency,
  disabled,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  currency: string;
  disabled?: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr
      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
    >
      <td className="px-4 py-3 text-xs text-white/70">
        {new Date(transaction.date).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-white font-medium">{transaction.description}</div>
        {transaction.recurring && (
          <div className="text-[10px] text-[var(--module-color-400)] mt-1">
            ↻ {transaction.recurringFrequency}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[var(--module-accent-muted)] text-[var(--module-color-400)] border border-[var(--module-accent-border)]">
          {transaction.category}
        </span>
      </td>
      <td className={cn(
        "px-4 py-3 text-right text-sm font-bold tabular-nums",
        transaction.type === 'income' ? 'text-emerald-400' : 'text-red-400'
      )}>
        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount, currency)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <NeuralButton
            variant="ghost"
            onClick={() => onEdit(transaction)}
            disabled={disabled}
            className="p-1.5 h-auto min-h-[44px] text-white/60 hover:text-white"
            aria-label="Edit transaction"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </NeuralButton>
          <NeuralButton
            variant="ghost"
            onClick={() => onDelete(transaction.id)}
            disabled={disabled}
            className="p-1.5 h-auto min-h-[44px] text-white/60 hover:text-red-400"
            aria-label="Delete transaction"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </NeuralButton>
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom equality check: Ignore inline callback references (onEdit, onDelete)
  // to prevent re-renders, as they solely invoke stable setters and do not risk stale closures.
  return (
    prevProps.transaction === nextProps.transaction &&
    prevProps.currency === nextProps.currency &&
    prevProps.disabled === nextProps.disabled
  );
});

interface TransactionManagerProps {
  transactions: Transaction[];
  categories: string[];
  currency?: string;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  onDeleteTransaction: (id: string) => void;
  onImportCSV?: (file: File) => void;
  onExportCSV?: () => void;
  disabled?: boolean;
  /** Optional external control for the add modal */
  isAddModalOpen?: boolean;
  onAddModalOpenChange?: (open: boolean) => void;
  /** Whether to show the internal add button. Defaults to true. */
  showAddButton?: boolean;
}

type SortField = 'date' | 'amount' | 'description' | 'category';
type SortOrder = 'asc' | 'desc';

// @schema-guard: allow-hardcoded (UI-only transaction form pending SchemaRegistry wiring)
const TRANSACTION_SCHEMA: FieldSchema = {
  version: '1.0.0',
  coreFields: [
    {
      id: 'date',
      name: 'Date',
      type: FieldType.DATE,
      required: true,
      metadata: { category: 'Basic', order: 0 }
    },
    {
      id: 'description',
      name: 'Description',
      type: FieldType.TEXT,
      required: true,
      metadata: { category: 'Basic', order: 1 }
    },
    {
      id: 'amount',
      name: 'Amount',
      type: FieldType.NUMBER,
      required: true,
      validation: { min: 0.01 },
      metadata: { category: 'Basic', order: 2 }
    },
    {
      id: 'type',
      name: 'Type',
      type: FieldType.SELECT,
      required: true,
      options: [
        { value: 'income', label: 'Income' },
        { value: 'expense', label: 'Expense' }
      ],
      metadata: { category: 'Basic', order: 3 }
    },
    {
      id: 'category',
      name: 'Category',
      type: FieldType.SELECT,
      required: true,
      options: [], // Populated dynamically
      metadata: { category: 'Basic', order: 4 }
    },
    {
      id: 'recurring',
      name: 'Recurring Transaction',
      type: FieldType.BOOLEAN,
      required: false,
      metadata: { category: 'Advanced', order: 0 }
    },
    {
      id: 'recurringFrequency',
      name: 'Frequency',
      type: FieldType.SELECT,
      required: false,
      options: [
        { value: 'weekly', label: 'Weekly' },
        { value: 'biweekly', label: 'Bi-weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' }
      ],
      metadata: { category: 'Advanced', order: 1 }
    },
    {
      id: 'notes',
      name: 'Notes',
      type: FieldType.TEXTAREA,
      required: false,
      metadata: { category: 'Advanced', order: 2 }
    }
  ],
  extensionFields: []
};

export function TransactionManager({
  transactions,
  categories,
  currency = 'USD',
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onImportCSV,
  onExportCSV,
  disabled = false,
  isAddModalOpen: controlledIsAddModalOpen,
  onAddModalOpenChange,
  showAddButton = true
}: TransactionManagerProps) {
  const [internalIsAddModalOpen, setInternalIsAddModalOpen] = useState(false);
  const isAddModalOpen = controlledIsAddModalOpen !== undefined ? controlledIsAddModalOpen : internalIsAddModalOpen;
  const setIsAddModalOpen = (val: boolean) => {
    if (onAddModalOpenChange) onAddModalOpenChange(val);
    else setInternalIsAddModalOpen(val);
  };

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens via external control
  useEffect(() => {
    if (isAddModalOpen && !editingTransaction && Object.keys(formValues).length === 0) {
      setFormValues({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        recurring: false
      });
    }
  }, [isAddModalOpen, editingTransaction]);

  // Update schema with dynamic categories
  const transactionSchema = useMemo(() => {
    const schema = { ...TRANSACTION_SCHEMA };
    const categoryField = schema.coreFields.find(f => f.id === 'category');
    if (categoryField) {
      categoryField.options = categories.map(cat => ({ value: cat, label: cat }));
    }
    return schema;
  }, [categories]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!t.description.toLowerCase().includes(query) && 
            !t.category.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Type filter
      if (filterType !== 'all' && t.type !== filterType) {
        return false;
      }

      // Category filter
      if (filterCategory !== 'all' && t.category !== filterCategory) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'description':
          comparison = a.description.localeCompare(b.description);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [transactions, searchQuery, filterType, filterCategory, sortField, sortOrder]);

  // Statistics
  const stats = useMemo(() => {
    // ⚡ Bolt: Single-pass O(n) calculation to prevent multiple filter+reduce passes
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const t of transactions) {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else if (t.type === 'expense') {
        totalExpenses += t.amount;
      }
    }

    const netCashFlow = totalIncome - totalExpenses;

    return { totalIncome, totalExpenses, netCashFlow };
  }, [transactions]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleOpenAddModal = () => {
    setFormValues({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      recurring: false
    });
    setFormErrors({});
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormValues({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      recurring: transaction.recurring || false,
      recurringFrequency: transaction.recurringFrequency,
      notes: transaction.notes
    });
    setFormErrors({});
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
    setFormValues({});
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formValues.date) errors.date = 'Date is required';
    if (!formValues.description?.trim()) errors.description = 'Description is required';
    if (!formValues.amount || formValues.amount <= 0) errors.amount = 'Amount must be greater than 0';
    if (!formValues.type) errors.type = 'Type is required';
    if (!formValues.category) errors.category = 'Category is required';
    if (formValues.recurring && !formValues.recurringFrequency) {
      errors.recurringFrequency = 'Frequency is required for recurring transactions';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const transactionData: Omit<Transaction, 'id'> = {
      date: formValues.date,
      description: formValues.description,
      amount: parseFloat(formValues.amount),
      type: formValues.type,
      category: formValues.category,
      recurring: formValues.recurring || false,
      recurringFrequency: formValues.recurring ? formValues.recurringFrequency : undefined,
      notes: formValues.notes
    };

    if (editingTransaction) {
      onUpdateTransaction(editingTransaction.id, transactionData);
    } else {
      onAddTransaction(transactionData);
    }

    handleCloseModal();
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onImportCSV) {
        onImportCSV(file);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Total Income</div>
          <div className="mt-2 text-2xl font-black text-emerald-400">{formatCurrency(stats.totalIncome, currency)}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Total Expenses</div>
          <div className="mt-2 text-2xl font-black text-red-400">{formatCurrency(stats.totalExpenses, currency)}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Net Cash Flow</div>
          <div className={cn(
            "mt-2 text-2xl font-black",
            stats.netCashFlow >= 0 ? "text-[var(--module-color-400)]" : "text-amber-400"
          )}>
            {formatCurrency(stats.netCashFlow, currency)}
          </div>
        </SurfaceCard>
      </div>

      {/* Controls */}
      <SurfaceCard className="p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <NeuralInput
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
              className="w-full"
            />
          </div>

          {/* Type Filter */}
          <NeuralSelectMenu
            value={filterType}
            onChange={(next) => setFilterType(next as any)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
            ]}
            triggerClassName="w-[150px]"
            ariaLabel="Filter type"
          />

          {/* Category Filter */}
          <NeuralSelectMenu
            value={filterCategory}
            onChange={(next) => setFilterCategory(String(next))}
            options={[
              { value: 'all', label: 'All Categories' },
              ...categories.map((cat) => ({ value: cat, label: cat })),
            ]}
            triggerClassName="w-[180px]"
            ariaLabel="Filter category"
          />

          {/* Actions */}
          <div className="flex gap-2 ml-auto">
            {onImportCSV && (
              <NeuralButton
                onClick={handleImportClick}
                variant="secondary"
                size="sm"
                disabled={disabled}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </NeuralButton>
            )}
            {onExportCSV && (
              <NeuralButton
                onClick={onExportCSV}
                variant="secondary"
                size="sm"
                disabled={disabled}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </NeuralButton>
            )}
            {showAddButton && (
              <NeuralButton
                onClick={handleOpenAddModal}
                variant="primary"
                size="sm"
                disabled={disabled}
                className="bg-[var(--module-accent)] hover:bg-[var(--module-accent)]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Transaction
              </NeuralButton>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Transaction List */}
      <SurfaceCard className="overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No transactions"
              description={searchQuery || filterType !== 'all' || filterCategory !== 'all' 
                ? "No transactions match your filters" 
                : "Add your first transaction to get started"}
              icon={Filter}
              size="md"
            />
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)]">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-white/10 sticky top-0 z-10 backdrop-blur-xl bg-black/60">
                  <th 
                    className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60"
                    onClick={() => toggleSort('date')}
                  >
                    <div className="flex items-center gap-1">
                      Date
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60"
                    onClick={() => toggleSort('description')}
                  >
                    <div className="flex items-center gap-1">
                      Description
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60"
                    onClick={() => toggleSort('category')}
                  >
                    <div className="flex items-center gap-1">
                      Category
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60"
                    onClick={() => toggleSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Amount
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.2em] text-white/40 font-black">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={currency}
                    disabled={disabled}
                    onEdit={handleOpenEditModal}
                    onDelete={onDeleteTransaction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {/* Add/Edit Modal */}
      <NeuralModal
        isOpen={isAddModalOpen || editingTransaction !== null}
        onClose={handleCloseModal}
        title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        themeColor="module"
        maxWidth="2xl"
      >
        <DynamicFormBuilder
          schema={transactionSchema}
          values={formValues}
          onChange={(fieldId, value) => {
            setFormValues(prev => ({ ...prev, [fieldId]: value }));
            // Clear error when field is edited
            if (formErrors[fieldId]) {
              setFormErrors(prev => {
                const next = { ...prev };
                delete next[fieldId];
                return next;
              });
            }
          }}
          errors={formErrors}
          disabled={disabled}
          showSubmit={true}
          submitLabel={editingTransaction ? 'Update' : 'Add'}
          onSubmit={handleSubmit}
        />
      </NeuralModal>
    </div>
  );
}
