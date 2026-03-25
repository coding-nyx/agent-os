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
import { useLedgerActions } from '../context/LedgerActionsContext';
import { useCRUDModal } from './shared/useCRUDModal';

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
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
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
  disabled?: boolean;
  isAddModalOpen?: boolean;
  onAddModalOpenChange?: (open: boolean) => void;
  showAddButton?: boolean;
}

type SortField = 'date' | 'amount' | 'description' | 'category';
type SortOrder = 'asc' | 'desc';

// @schema-guard: allow-hardcoded Transaction CRUD uses a local form schema with runtime category options.
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
      options: [],
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
  disabled = false,
  isAddModalOpen: controlledIsAddModalOpen,
  onAddModalOpenChange,
  showAddButton = true
}: TransactionManagerProps) {
  const { onAddTransaction, onUpdateTransaction, onDeleteTransaction, onImportCSV, onExportCSV } = useLedgerActions();
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const {
    isOpen: isAddModalOpen,
    editingItem: editingTransaction,
    formData: formValues,
    setFormData: setFormValues,
    openCreate,
    openEdit,
    handleClose: handleCloseModal,
    handleSave: handleSubmit
  } = useCRUDModal<Transaction>({
    initialForm: {
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      recurring: false
    },
    validate: (form) => {
      const errors: Record<string, string> = {};
      if (!form.date) errors.date = 'Date is required';
      if (!form.description?.trim()) errors.description = 'Description is required';
      if (!form.amount || form.amount <= 0) errors.amount = 'Amount must be greater than 0';
      if (!form.type) errors.type = 'Type is required';
      if (!form.category) errors.category = 'Category is required';
      if (form.recurring && !form.recurringFrequency) {
        errors.recurringFrequency = 'Frequency is required for recurring transactions';
      }
      setFormErrors(errors);
      return Object.keys(errors).length === 0;
    },
    onCreate: (form) => onAddTransaction(form as Omit<Transaction, 'id'>),
    onUpdate: (id, form) => onUpdateTransaction(id, form as Partial<Transaction>)
  });

  // Sync controlled modal state
  useEffect(() => {
    if (controlledIsAddModalOpen && !isAddModalOpen) {
      openCreate();
    } else if (controlledIsAddModalOpen === false && isAddModalOpen) {
      handleCloseModal();
    }
  }, [controlledIsAddModalOpen, isAddModalOpen, openCreate, handleCloseModal]);

  // Report modal state changes upward
  useEffect(() => {
    if (onAddModalOpenChange) {
      onAddModalOpenChange(isAddModalOpen);
    }
  }, [isAddModalOpen, onAddModalOpenChange]);

  const transactionSchema = useMemo(() => {
    const schema = { ...TRANSACTION_SCHEMA };
    const categoryField = schema.coreFields.find(f => f.id === 'category');
    if (categoryField) {
      categoryField.options = categories.map(cat => ({ value: cat, label: cat }));
    }
    return schema;
  }, [categories]);

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!t.description.toLowerCase().includes(query) && !t.category.toLowerCase().includes(query)) return false;
      }
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date': comparison = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'amount': comparison = a.amount - b.amount; break;
        case 'description': comparison = a.description.localeCompare(b.description); break;
        case 'category': comparison = a.category.localeCompare(b.category); break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [transactions, searchQuery, filterType, filterCategory, sortField, sortOrder]);

  const stats = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpenses += t.amount;
    }
    return { totalIncome, totalExpenses, netCashFlow: totalIncome - totalExpenses };
  }, [transactions]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onImportCSV(file);
    };
    input.click();
  };

  return (
    <div className="space-y-6">
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
          <div className={cn("mt-2 text-2xl font-black", stats.netCashFlow >= 0 ? "text-[var(--module-color-400)]" : "text-amber-400")}>
            {formatCurrency(stats.netCashFlow, currency)}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <NeuralInput
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
              className="w-full"
            />
          </div>
          <NeuralSelectMenu
            value={filterType}
            onChange={(next) => setFilterType(next as any)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
            ]}
            triggerClassName="w-full sm:w-[150px]"
            ariaLabel="Filter type"
          />
          <NeuralSelectMenu
            value={filterCategory}
            onChange={(next) => setFilterCategory(String(next))}
            options={[
              { value: 'all', label: 'All Categories' },
              ...categories.map((cat) => ({ value: cat, label: cat })),
            ]}
            triggerClassName="w-full sm:w-[180px]"
            ariaLabel="Filter category"
          />
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
            <NeuralButton onClick={handleImportClick} variant="secondary" size="sm" disabled={disabled}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </NeuralButton>
            <NeuralButton onClick={onExportCSV} variant="secondary" size="sm" disabled={disabled}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </NeuralButton>
            {showAddButton && (
              <NeuralButton onClick={() => openCreate()} variant="primary" size="sm" disabled={disabled} className="bg-[var(--module-accent)] hover:bg-[var(--module-accent)]">
                <Plus className="w-4 h-4 mr-2" />
                Add Transaction
              </NeuralButton>
            )}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No transactions"
              description={searchQuery || filterType !== 'all' || filterCategory !== 'all' ? "No transactions match your filters" : "Add your first transaction to get started"}
              icon={Filter}
              size="md"
            />
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="block md:hidden space-y-3 p-4">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="flex flex-col gap-2 p-3 rounded-lg border border-white/5 bg-white/[0.01]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{transaction.description}</div>
                      <div className="text-xs text-white/60 mt-1">{new Date(transaction.date).toLocaleDateString()}</div>
                      {transaction.recurring && (
                        <div className="text-[10px] text-[var(--module-color-400)] mt-1">
                          ↻ {transaction.recurringFrequency}
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      "text-right whitespace-nowrap font-bold tabular-nums text-sm",
                      transaction.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount, currency)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[var(--module-accent-muted)] text-[var(--module-color-400)] border border-[var(--module-accent-border)]">
                      {transaction.category}
                    </span>
                    <div className="flex items-center gap-2">
                      <NeuralButton
                        variant="ghost"
                        onClick={() => openEdit(transaction)}
                        disabled={disabled}
                        className="p-1.5 h-auto min-h-[40px] text-white/60 hover:text-white"
                        aria-label="Edit transaction"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </NeuralButton>
                      <NeuralButton
                        variant="ghost"
                        onClick={() => onDeleteTransaction(transaction.id)}
                        disabled={disabled}
                        className="p-1.5 h-auto min-h-[40px] text-white/60 hover:text-red-400"
                        aria-label="Delete transaction"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </NeuralButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[calc(100dvh-16rem)]">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b border-white/10 sticky top-0 z-10 backdrop-blur-xl bg-black/60">
                    <th className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60" onClick={() => toggleSort('date')}>
                      <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60" onClick={() => toggleSort('description')}>
                      <div className="flex items-center gap-1">Description <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60" onClick={() => toggleSort('category')}>
                      <div className="flex items-center gap-1">Category <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.2em] text-white/40 font-black cursor-pointer hover:text-white/60" onClick={() => toggleSort('amount')}>
                      <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="px-4 py-3 text-right text-[9px] uppercase tracking-[0.2em] text-white/40 font-black">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      currency={currency}
                      disabled={disabled}
                      onEdit={openEdit}
                      onDelete={onDeleteTransaction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SurfaceCard>

      <NeuralModal
        isOpen={isAddModalOpen}
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
