/**
 * TaxCenter.tsx
 *
 * Tax Center — Nexus Ledger finance module (S2-L-TAX-CENTER)
 *
 * Sections:
 *  1. Header          — title, tax-year selector, generate + export actions
 *  2. Summary Hero    — income / deductions / taxable-income stat cards
 *  3. Three-col grid  — category breakdown | manual deductions | deductible txns
 *  4. Add Deduction Modal
 *  5. Category Assignment Modal
 *
 * Complexity:
 *  - buildTaxYearSummary  → O(n) in transaction count (delegated to service)
 *  - computeTaxBreakdown  → O(n) in transaction count (delegated to service)
 *  - getRecentDeductibleTransactions → O(n log n) due to sort, capped at 10
 *
 * All heavy derivations are memoised; the component itself is side-effect-free.
 */

import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Trash2,
  FileText,
  Download,
  Tag,
  TrendingDown,
  Calculator,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import {
  NeuralSelectMenu,
  type NeuralSelectMenuOption,
} from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import type {
  TaxDeduction,
  TaxYearSummary,
  TaxCategory,
  Transaction,
  LedgerIntakeProfile,
} from '../services/ledger-intake-service';
import {
  computeTaxBreakdown,
  buildTaxYearSummary,
  type TaxCategoryBreakdown,
} from '../services/aggregation/tax-aggregation';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

/** Hex colours for every TaxCategory value, used for badges and row tints. */
const TAX_CATEGORY_COLOR: Record<TaxCategory, string> = {
  deductible: '#3b82f6',
  essential: '#6b7280',
  discretionary: '#f59e0b',
  investment: '#6366f1',
  'non-deductible': '#ef4444',
  partial: '#f97316',
  unknown: '#9ca3af',
};

const TAX_CATEGORY_LABEL: Record<TaxCategory, string> = {
  deductible: 'Deductible',
  essential: 'Essential',
  discretionary: 'Discretionary',
  investment: 'Investment',
  'non-deductible': 'Non-Deductible',
  partial: 'Partial',
  unknown: 'Unknown',
};

/**
 * Tailwind row tint classes for the category breakdown table.
 * Using static strings avoids Tailwind's JIT purging dynamic class names.
 */
const TAX_CATEGORY_ROW: Record<TaxCategory, string> = {
  deductible: 'bg-blue-500/10 border-blue-500/20',
  essential: 'bg-neutral-500/10 border-neutral-500/20',
  discretionary: 'bg-yellow-500/10 border-yellow-500/20',
  investment: 'bg-indigo-500/10 border-indigo-500/20',
  'non-deductible': 'bg-red-500/10 border-red-500/20',
  partial: 'bg-amber-500/10 border-amber-500/20',
  unknown: 'bg-white/[0.045] border-white/10',
};

const ALL_TAX_CATEGORIES: TaxCategory[] = [
  'deductible',
  'essential',
  'discretionary',
  'investment',
  'non-deductible',
  'partial',
  'unknown',
];

const CATEGORY_OPTIONS: NeuralSelectMenuOption<TaxCategory>[] =
  ALL_TAX_CATEGORIES.map((c) => ({ value: c, label: TAX_CATEGORY_LABEL[c] }));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaxCenterProps {
  profile: LedgerIntakeProfile;
  currency: string;
  onSetTaxCategory: (transactionIds: string[], category: TaxCategory) => void;
  onAddDeduction: (data: Partial<TaxDeduction>) => void;
  onDeleteDeduction: (deductionId: string) => void;
  onGenerateSummary: (taxYear: number) => void;
  onExportTaxSummary: (taxYear: number) => void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DeductionFormState {
  label: string;
  amount: string;
  category: TaxCategory;
  taxYear: number;
  notes: string;
}

const BLANK_DEDUCTION_FORM: DeductionFormState = {
  label: '',
  amount: '',
  category: 'deductible',
  taxYear: CURRENT_YEAR,
  notes: '',
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount using Intl, respecting the caller-supplied ISO
 * currency code.  Whole-dollar precision keeps the UI tidy.
 *
 * O(1) — Intl.NumberFormat.format is constant-time for a single number.
 */
function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Return the last `limit` expense transactions for `taxYear` whose taxCategory
 * is 'deductible' or 'partial', sorted newest-first.
 *
 * O(n log n) — one filter + sort pass; result is capped at `limit`.
 */
function getRecentDeductibleTransactions(
  transactions: Transaction[],
  taxYear: number,
  limit = 10,
): Transaction[] {
  return transactions
    .filter(
      (tx) =>
        new Date(tx.date).getFullYear() === taxYear &&
        (tx.taxCategory === 'deductible' || tx.taxCategory === 'partial'),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// TaxCategoryBadge
// ---------------------------------------------------------------------------

function TaxCategoryBadge({ category }: { category: TaxCategory }) {
  const color = TAX_CATEGORY_COLOR[category];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide border shrink-0"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}18`,
      }}
    >
      <Tag size={9} strokeWidth={2.5} />
      {TAX_CATEGORY_LABEL[category]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CollapsiblePanel — wraps a section header + chevron toggle
// ---------------------------------------------------------------------------

interface CollapsiblePanelProps {
  icon: React.ReactNode;
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsiblePanel({
  icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-left group w-full"
        aria-expanded={open}
      >
        <span className="shrink-0 text-white/60 group-hover:text-white/80 transition-colors">
          {icon}
        </span>
        <span className="flex-1 text-sm font-semibold text-white tracking-tight group-hover:text-white/90 transition-colors">
          {title}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[11px] font-semibold text-white/40 bg-white/[0.045] border border-white/10 rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
        <span className="text-white/30 group-hover:text-white/60 transition-colors shrink-0">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryHero
// ---------------------------------------------------------------------------

interface SummaryHeroProps {
  summary: TaxYearSummary;
  currency: string;
  isPrefilled: boolean;
}

function SummaryHero({ summary, currency, isPrefilled }: SummaryHeroProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6 space-y-4">
      {isPrefilled && (
        <p className="text-[11px] text-white/35 uppercase tracking-widest font-semibold">
          Last Generated:{' '}
          {new Date(summary.generatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Income */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3 sm:p-4">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">
            Total Income
          </p>
          <p className="text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
            {formatAmount(summary.totalIncome, currency)}
          </p>
        </div>

        {/* Deductible Expenses */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 sm:p-4">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">
            Deductible Expenses
          </p>
          <p className="text-lg sm:text-xl font-bold text-blue-400 tabular-nums">
            {formatAmount(summary.deductibleExpenses, currency)}
          </p>
        </div>

        {/* Total Deductions */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-3 sm:p-4">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">
            Total Deductions
          </p>
          <p className="text-lg sm:text-xl font-bold text-indigo-400 tabular-nums">
            {formatAmount(summary.totalDeductions, currency)}
          </p>
          {summary.totalDeductions > summary.deductibleExpenses && (
            <p className="text-[11px] text-white/30">
              incl. manual deductions
            </p>
          )}
        </div>

        {/* Estimated Taxable Income — most prominent */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-white/[0.06] border border-white/15 p-3 sm:p-4 col-span-2 lg:col-span-1">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">
            Est. Taxable Income
          </p>
          <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">
            {formatAmount(summary.estimatedTaxableIncome, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryBreakdownPanel
// ---------------------------------------------------------------------------

interface CategoryBreakdownPanelProps {
  breakdown: TaxCategoryBreakdown[];
  currency: string;
}

function CategoryBreakdownPanel({ breakdown, currency }: CategoryBreakdownPanelProps) {
  if (breakdown.length === 0) {
    return (
      <EmptyState
        title="No Category Data"
        description="Assign tax categories to your transactions to see a breakdown here."
        icon={Calculator}
      />
    );
  }

  // Largest total first so the table reads as a rough bar-chart proxy.
  const sorted = [...breakdown].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-1.5">
      {sorted.map((item) => (
        <div
          key={item.category}
          className={cn(
            'flex items-center justify-between rounded-lg border px-3 py-2.5 gap-2',
            TAX_CATEGORY_ROW[item.category],
          )}
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <TaxCategoryBadge category={item.category} />
            <span className="text-[11px] text-white/40 shrink-0">
              {item.transactionCount} tx
            </span>
          </div>
          <span className="text-sm font-bold text-white tabular-nums shrink-0">
            {formatAmount(item.total, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeductionsPanel
// ---------------------------------------------------------------------------

interface DeductionsPanelProps {
  deductions: TaxDeduction[];
  currency: string;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

function DeductionsPanel({ deductions, currency, onDelete, onAdd }: DeductionsPanelProps) {
  if (deductions.length === 0) {
    return (
      <EmptyState
        title="No Deductions"
        description="Add manual deductions to further reduce your taxable income."
        icon={TrendingDown}
        action={
          <NeuralButton
            variant="outline"
            size="sm"
            themeColor="indigo"
            onClick={onAdd}
          >
            <Plus size={14} />
            Add Deduction
          </NeuralButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {deductions.map((ded) => (
        <div
          key={ded.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3"
        >
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{ded.label}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <TaxCategoryBadge category={ded.category} />
              {ded.notes && (
                <span className="text-[11px] text-white/35 truncate">{ded.notes}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-bold text-white tabular-nums">
              {formatAmount(ded.amount, currency)}
            </span>
            <button
              aria-label={`Delete deduction: ${ded.label}`}
              onClick={() => onDelete(ded.id)}
              className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      <NeuralButton
        variant="outline"
        size="sm"
        themeColor="indigo"
        onClick={onAdd}
        className="w-full mt-1"
      >
        <Plus size={14} />
        Add Deduction
      </NeuralButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentDeductibleTransactions
// ---------------------------------------------------------------------------

interface RecentDeductibleTransactionsProps {
  transactions: Transaction[];
  currency: string;
  onSelectTransaction: (txId: string) => void;
}

function RecentDeductibleTransactions({
  transactions,
  currency,
  onSelectTransaction,
}: RecentDeductibleTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No Deductible Transactions"
        description="Transactions tagged 'Deductible' or 'Partial' for this year will appear here."
        icon={Receipt}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {transactions.map((tx) => (
        <button
          key={tx.id}
          onClick={() => onSelectTransaction(tx.id)}
          className="w-full flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] hover:bg-white/[0.07] hover:border-white/20 transition-colors p-3 text-left group"
        >
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate group-hover:text-white/90 transition-colors">
              {tx.description}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {tx.taxCategory && <TaxCategoryBadge category={tx.taxCategory} />}
              <span className="text-[11px] text-white/40">
                {new Date(tx.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
          <span className="text-sm font-bold text-white tabular-nums shrink-0 pt-0.5">
            {formatAmount(tx.amount, currency)}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddDeductionModal
// ---------------------------------------------------------------------------

interface AddDeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: DeductionFormState;
  onFormChange: (patch: Partial<DeductionFormState>) => void;
  onSubmit: () => void;
}

function AddDeductionModal({
  isOpen,
  onClose,
  form,
  onFormChange,
  onSubmit,
}: AddDeductionModalProps) {
  const isValid = form.label.trim().length > 0 && parseFloat(form.amount) > 0;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Deduction"
      subtitle="Record a manual tax deduction entry"
      themeColor="indigo"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        <NeuralInput
          label="Label"
          placeholder="e.g. Home Office Expenses"
          value={form.label}
          onChange={(e) => onFormChange({ label: e.target.value })}
        />

        <NeuralInput
          label="Amount"
          type="number"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => onFormChange({ amount: e.target.value })}
        />

        {/* NeuralSelectMenu intentionally has no label prop — wrap with a plain label */}
        <div className="space-y-2">
          <p className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Category
          </p>
          <NeuralSelectMenu<TaxCategory>
            value={form.category}
            options={CATEGORY_OPTIONS}
            onChange={(val) => onFormChange({ category: val })}
            ariaLabel="Select deduction category"
            placeholder="Select category"
          />
        </div>

        <NeuralInput
          label="Tax Year"
          type="number"
          placeholder={String(CURRENT_YEAR)}
          value={String(form.taxYear)}
          onChange={(e) =>
            onFormChange({ taxYear: parseInt(e.target.value, 10) || CURRENT_YEAR })
          }
        />

        <NeuralInput
          label="Notes (optional)"
          placeholder="Additional context…"
          value={form.notes}
          onChange={(e) => onFormChange({ notes: e.target.value })}
        />

        <div className="flex gap-3 pt-2">
          <NeuralButton
            variant="ghost"
            size="md"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </NeuralButton>
          <NeuralButton
            variant="primary"
            size="md"
            themeColor="indigo"
            disabled={!isValid}
            onClick={onSubmit}
            className="flex-1"
          >
            <Plus size={16} />
            Add Deduction
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

// ---------------------------------------------------------------------------
// CategoryAssignModal
// ---------------------------------------------------------------------------

interface CategoryAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  selectedCategory: TaxCategory;
  onCategoryChange: (cat: TaxCategory) => void;
  onConfirm: () => void;
  currency: string;
}

function CategoryAssignModal({
  isOpen,
  onClose,
  transactions,
  selectedCategory,
  onCategoryChange,
  onConfirm,
  currency,
}: CategoryAssignModalProps) {
  const subtitle =
    transactions.length === 1
      ? transactions[0]?.description ?? 'Transaction'
      : `${transactions.length} transactions selected`;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Tax Category"
      subtitle={subtitle}
      themeColor="indigo"
      maxWidth="sm"
    >
      <div className="flex flex-col gap-4">
        {/* Selected transaction preview */}
        <div className="rounded-xl border border-white/10 bg-white/[0.045] divide-y divide-white/5 overflow-hidden">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {tx.description}
                </p>
                <p className="text-[11px] text-white/40">
                  {new Date(tx.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {tx.taxCategory && <TaxCategoryBadge category={tx.taxCategory} />}
                <span className="text-sm font-bold text-white tabular-nums">
                  {formatAmount(tx.amount, currency)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Category picker */}
        <div className="space-y-2">
          <p className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Assign Category
          </p>
          <NeuralSelectMenu<TaxCategory>
            value={selectedCategory}
            options={CATEGORY_OPTIONS}
            onChange={onCategoryChange}
            ariaLabel="Select new tax category"
            placeholder="Select category"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <NeuralButton
            variant="ghost"
            size="md"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </NeuralButton>
          <NeuralButton
            variant="primary"
            size="md"
            themeColor="indigo"
            onClick={onConfirm}
            className="flex-1"
          >
            <Tag size={16} />
            Confirm
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

// ---------------------------------------------------------------------------
// TaxCenter — main export
// ---------------------------------------------------------------------------

export default function TaxCenter({
  profile,
  currency,
  onSetTaxCategory,
  onAddDeduction,
  onDeleteDeduction,
  onGenerateSummary,
  onExportTaxSummary,
}: TaxCenterProps) {
  // ── Local state ──────────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);

  const [isAddDeductionOpen, setIsAddDeductionOpen] = useState(false);
  const [deductionForm, setDeductionForm] =
    useState<DeductionFormState>(BLANK_DEDUCTION_FORM);

  const [isCategoryAssignOpen, setIsCategoryAssignOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [pendingCategory, setPendingCategory] = useState<TaxCategory>('deductible');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ── Year selector options ────────────────────────────────────────────────
  const yearOptions = useMemo<NeuralSelectMenuOption<number>[]>(
    () => [
      { value: CURRENT_YEAR, label: `${CURRENT_YEAR} (Current)` },
      { value: CURRENT_YEAR - 1, label: String(CURRENT_YEAR - 1) },
    ],
    [],
  );

  // ── Derived data (all memoised) ──────────────────────────────────────────

  /**
   * If the profile already has a saved summary for the selected year, prefer
   * it (shows the persisted/generated values).  Otherwise compute live.
   */
  const displaySummary = useMemo<TaxYearSummary>(() => {
    if (
      profile.lastTaxSummary &&
      profile.lastTaxSummary.taxYear === selectedYear
    ) {
      return profile.lastTaxSummary;
    }
    return buildTaxYearSummary(profile, selectedYear);
  }, [profile, selectedYear]);

  const isPrefilled =
    Boolean(profile.lastTaxSummary) &&
    profile.lastTaxSummary?.taxYear === selectedYear;

  const breakdown = useMemo(
    () => computeTaxBreakdown(profile, selectedYear),
    [profile, selectedYear],
  );

  const yearDeductions = useMemo(
    () => (profile.taxDeductions ?? []).filter((d) => d.taxYear === selectedYear),
    [profile.taxDeductions, selectedYear],
  );

  const recentDeductibleTransactions = useMemo(
    () =>
      getRecentDeductibleTransactions(profile.transactions ?? [], selectedYear),
    [profile.transactions, selectedYear],
  );

  /** Full transaction objects for the IDs currently selected in the assignment modal. */
  const selectedTransactionObjects = useMemo(
    () =>
      (profile.transactions ?? []).filter((tx) =>
        selectedTransactionIds.includes(tx.id),
      ),
    [profile.transactions, selectedTransactionIds],
  );

  // ── Action handlers ──────────────────────────────────────────────────────

  function handleGenerateSummary() {
    setIsGenerating(true);
    try {
      onGenerateSummary(selectedYear);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleExport() {
    setIsExporting(true);
    try {
      onExportTaxSummary(selectedYear);
    } finally {
      setIsExporting(false);
    }
  }

  function openAddDeduction() {
    setDeductionForm({ ...BLANK_DEDUCTION_FORM, taxYear: selectedYear });
    setIsAddDeductionOpen(true);
  }

  function handleAddDeduction() {
    const amount = parseFloat(deductionForm.amount);
    if (!deductionForm.label.trim() || !(amount > 0)) return;

    onAddDeduction({
      label: deductionForm.label.trim(),
      amount,
      category: deductionForm.category,
      taxYear: deductionForm.taxYear,
      notes: deductionForm.notes.trim() || undefined,
    });

    setIsAddDeductionOpen(false);
    setDeductionForm(BLANK_DEDUCTION_FORM);
  }

  function openCategoryAssign(txId: string) {
    setSelectedTransactionIds([txId]);
    setPendingCategory('deductible');
    setIsCategoryAssignOpen(true);
  }

  function handleCategoryAssign() {
    if (selectedTransactionIds.length === 0) return;
    onSetTaxCategory(selectedTransactionIds, pendingCategory);
    setIsCategoryAssignOpen(false);
    setSelectedTransactionIds([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl border border-blue-500/25 bg-blue-500/10 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
              Tax Center
            </h2>
            <p className="text-[11px] text-white/35 uppercase tracking-widest font-semibold">
              Tax Year {selectedYear}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <NeuralSelectMenu<number>
            value={selectedYear}
            options={yearOptions}
            onChange={(year) => setSelectedYear(year)}
            ariaLabel="Select tax year"
            placeholder="Select year"
          />
          <NeuralButton
            variant="outline"
            size="sm"
            themeColor="indigo"
            loading={isGenerating}
            onClick={handleGenerateSummary}
          >
            <FileText size={14} />
            Generate Summary
          </NeuralButton>
          <NeuralButton
            variant="outline"
            size="sm"
            themeColor="indigo"
            loading={isExporting}
            onClick={handleExport}
          >
            <Download size={14} />
            Export
          </NeuralButton>
        </div>
      </div>

      {/* ── 2. Summary Hero ── */}
      <SummaryHero
        summary={displaySummary}
        currency={currency}
        isPrefilled={isPrefilled}
      />

      {/* ── 3. Three-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Category Breakdown */}
        <CollapsiblePanel
          icon={<Tag className="w-4 h-4 text-blue-400" />}
          title="Category Breakdown"
          badge={breakdown.length}
        >
          <CategoryBreakdownPanel breakdown={breakdown} currency={currency} />
        </CollapsiblePanel>

        {/* Manual Deductions */}
        <CollapsiblePanel
          icon={<TrendingDown className="w-4 h-4 text-indigo-400" />}
          title="Deductions"
          badge={yearDeductions.length}
        >
          <DeductionsPanel
            deductions={yearDeductions}
            currency={currency}
            onDelete={onDeleteDeduction}
            onAdd={openAddDeduction}
          />
        </CollapsiblePanel>

        {/* Recent Deductible Transactions */}
        <CollapsiblePanel
          icon={<Receipt className="w-4 h-4 text-amber-400" />}
          title="Deductible Transactions"
          badge={recentDeductibleTransactions.length}
        >
          <RecentDeductibleTransactions
            transactions={recentDeductibleTransactions}
            currency={currency}
            onSelectTransaction={openCategoryAssign}
          />
        </CollapsiblePanel>

      </div>

      {/* ── 4. Add Deduction Modal ── */}
      <AddDeductionModal
        isOpen={isAddDeductionOpen}
        onClose={() => setIsAddDeductionOpen(false)}
        form={deductionForm}
        onFormChange={(patch) =>
          setDeductionForm((prev) => ({ ...prev, ...patch }))
        }
        onSubmit={handleAddDeduction}
      />

      {/* ── 5. Category Assignment Modal ── */}
      <CategoryAssignModal
        isOpen={isCategoryAssignOpen}
        onClose={() => setIsCategoryAssignOpen(false)}
        transactions={selectedTransactionObjects}
        selectedCategory={pendingCategory}
        onCategoryChange={setPendingCategory}
        onConfirm={handleCategoryAssign}
        currency={currency}
      />
    </div>
  );
}
