import { useState, useMemo } from 'react';
import {
  Receipt as ReceiptIcon,
  Plus,
  Trash2,
  Link2,
  Search,
  Filter,
  FileText,
  Tag,
  Calendar,
} from 'lucide-react';

import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';

import type { Receipt, TaxCategory, Transaction } from '../services/ledger-intake-service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_CATEGORY_COLORS: Record<TaxCategory, string> = {
  deductible: '#3b82f6',
  essential: '#6b7280',
  discretionary: '#f59e0b',
  investment: '#6366f1',
  'non-deductible': '#ef4444',
  partial: '#f97316',
  unknown: '#9ca3af',
};

const TAX_CATEGORY_OPTIONS: { label: string; value: TaxCategory }[] = [
  { label: 'Deductible', value: 'deductible' },
  { label: 'Essential', value: 'essential' },
  { label: 'Discretionary', value: 'discretionary' },
  { label: 'Investment', value: 'investment' },
  { label: 'Non-Deductible', value: 'non-deductible' },
  { label: 'Partial', value: 'partial' },
  { label: 'Unknown', value: 'unknown' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getTaxCategoryColor(taxCategory?: TaxCategory): string {
  if (!taxCategory) return TAX_CATEGORY_COLORS.unknown;
  return TAX_CATEGORY_COLORS[taxCategory] ?? TAX_CATEGORY_COLORS.unknown;
}

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface AddReceiptFormState {
  label: string;
  amount: string;
  date: string;
  category: string;
  taxCategory: TaxCategory | '';
  taxYear: string;
  imageRef: string;
  notes: string;
}

const EMPTY_ADD_FORM: AddReceiptFormState = {
  label: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  category: '',
  taxCategory: '',
  taxYear: String(new Date().getFullYear()),
  imageRef: '',
  notes: '',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReceiptLibraryProps {
  receipts: Receipt[];
  transactions: Transaction[];
  currency: string;
  onAddReceipt: (data: Partial<Receipt>) => void;
  onDeleteReceipt: (receiptId: string) => void;
  onLinkToTransaction: (receiptId: string, transactionId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceiptLibrary({
  receipts,
  transactions,
  currency,
  onAddReceipt,
  onDeleteReceipt,
  onLinkToTransaction,
}: ReceiptLibraryProps) {
  // ── Modal state ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddReceiptFormState>(EMPTY_ADD_FORM);
  const [isAddLoading, setIsAddLoading] = useState(false);

  const [linkReceiptId, setLinkReceiptId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [taxCategoryFilter, setTaxCategoryFilter] = useState<string>('');

  // ─── Derived data ──────────────────────────────────────────────────────────

  const distinctYears: number[] = useMemo(() => {
    const years = new Set<number>();
    receipts.forEach((r) => {
      if (r.taxYear != null) years.add(r.taxYear);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [receipts]);

  const yearOptions = useMemo(
    () => [
      { label: 'All Years', value: '' },
      ...distinctYears.map((y) => ({ label: String(y), value: String(y) })),
    ],
    [distinctYears],
  );

  const taxCategoryFilterOptions = useMemo(
    () => [
      { label: 'All Categories', value: '' },
      ...TAX_CATEGORY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    ],
    [],
  );

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts.filter((r) => {
      const matchesSearch =
        !q ||
        r.label.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q);
      const matchesYear = !yearFilter || String(r.taxYear) === yearFilter;
      const matchesTaxCategory = !taxCategoryFilter || r.taxCategory === taxCategoryFilter;
      return matchesSearch && matchesYear && matchesTaxCategory;
    });
  }, [receipts, searchQuery, yearFilter, taxCategoryFilter]);

  // Group by taxYear (descending), then ungrouped at end
  const groupedReceipts = useMemo(() => {
    const groups = new Map<string, Receipt[]>();
    filteredReceipts.forEach((r) => {
      const key = r.taxYear != null ? String(r.taxYear) : 'No Year';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    // Sort group keys: numeric years descending, then 'No Year' last
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return nb - na;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return 0;
    });
    return sortedKeys.map((key) => ({ year: key, items: groups.get(key)! }));
  }, [filteredReceipts]);

  // Stats
  const stats = useMemo(() => {
    const total = receipts.length;
    const unlinked = receipts.filter((r) => !r.transactionId).length;
    const totalDeductible = receipts
      .filter((r) => r.taxCategory === 'deductible' || r.taxCategory === 'partial')
      .reduce((sum, r) => sum + r.amount, 0);
    return { total, unlinked, totalDeductible };
  }, [receipts]);

  // Transaction map for quick lookup
  const transactionMap = useMemo(() => {
    const m = new Map<string, Transaction>();
    transactions.forEach((t) => m.set(t.id, t));
    return m;
  }, [transactions]);

  // Filtered transactions for link modal
  const filteredTransactions = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q),
    );
  }, [transactions, linkSearch]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openAddModal() {
    setAddForm(EMPTY_ADD_FORM);
    setIsAddModalOpen(true);
  }

  function closeAddModal() {
    setIsAddModalOpen(false);
  }

  function updateAddForm(field: keyof AddReceiptFormState, value: string) {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddReceipt() {
    const label = addForm.label.trim();
    if (!label) return;

    setIsAddLoading(true);
    try {
      const payload: Partial<Receipt> = {
        label,
        amount: parseFloat(addForm.amount) || 0,
        date: addForm.date,
        category: addForm.category.trim() || undefined,
        taxCategory: (addForm.taxCategory as TaxCategory) || undefined,
        taxYear: addForm.taxYear ? parseInt(addForm.taxYear, 10) : undefined,
        imageRef: addForm.imageRef.trim() || undefined,
        notes: addForm.notes.trim() || undefined,
      };
      onAddReceipt(payload);
      setIsAddModalOpen(false);
    } finally {
      setIsAddLoading(false);
    }
  }

  function openLinkModal(receiptId: string) {
    setLinkReceiptId(receiptId);
    setLinkSearch('');
  }

  function closeLinkModal() {
    setLinkReceiptId(null);
    setLinkSearch('');
  }

  function handleLinkTransaction(transactionId: string) {
    if (linkReceiptId) {
      onLinkToTransaction(linkReceiptId, transactionId);
      closeLinkModal();
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(99,102,241,0.12)' }}
          >
            <ReceiptIcon className="h-5 w-5" style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Receipt Library</h2>
            <p className="text-xs text-white/50">Tax records &amp; expense documentation</p>
          </div>
        </div>
        <NeuralButton
          variant="primary"
          size="sm"
          themeColor="indigo"
          onClick={openAddModal}
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Receipt
        </NeuralButton>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total Receipts"
          value={String(stats.total)}
          icon={<FileText className="h-4 w-4" style={{ color: '#6366f1' }} />}
          accent="#6366f1"
        />
        <StatCard
          label="Unlinked"
          value={String(stats.unlinked)}
          icon={<Link2 className="h-4 w-4" style={{ color: '#f59e0b' }} />}
          accent="#f59e0b"
        />
        <StatCard
          label="Deductible Total"
          value={formatCurrency(stats.totalDeductible, currency)}
          icon={<Tag className="h-4 w-4" style={{ color: '#3b82f6' }} />}
          accent="#3b82f6"
        />
      </div>

      {/* ── Search + Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <NeuralInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search receipts…"
            type="text"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Filter className="h-4 w-4 text-white/40" />
          <div className="min-w-[130px]">
            <NeuralSelectMenu
              value={yearFilter}
              options={yearOptions}
              onChange={(val) => setYearFilter(val)}
              placeholder="All Years"
              ariaLabel="Filter by tax year"
            />
          </div>
          <div className="min-w-[160px]">
            <NeuralSelectMenu
              value={taxCategoryFilter}
              options={taxCategoryFilterOptions}
              onChange={(val) => setTaxCategoryFilter(val)}
              placeholder="All Categories"
              ariaLabel="Filter by tax category"
            />
          </div>
        </div>
      </div>

      {/* ── Receipts List ── */}
      {filteredReceipts.length === 0 ? (
        <EmptyState
          title="No receipts found"
          description={
            receipts.length === 0
              ? 'Add your first receipt to start building your tax library.'
              : 'No receipts match your current filters. Try adjusting your search.'
          }
          action={
            receipts.length === 0 ? (
              <NeuralButton variant="primary" size="sm" themeColor="indigo" onClick={openAddModal}>
                Add Receipt
              </NeuralButton>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groupedReceipts.map(({ year, items }) => (
            <div key={year} className="flex flex-col gap-2">
              {/* Year header */}
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3.5 w-3.5 text-white/30" />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                  {year}
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-xs text-white/30">{items.length} receipt{items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Receipt rows */}
              {items.map((receipt) => (
                <ReceiptRow
                  key={receipt.id}
                  receipt={receipt}
                  currency={currency}
                  linkedTransaction={
                    receipt.transactionId
                      ? transactionMap.get(receipt.transactionId)
                      : undefined
                  }
                  onLinkClick={() => openLinkModal(receipt.id)}
                  onDelete={() => onDeleteReceipt(receipt.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Add Receipt Modal ── */}
      <NeuralModal
        isOpen={isAddModalOpen}
        onClose={closeAddModal}
        title="Add Receipt"
        subtitle="Attach a receipt to your tax library for record-keeping"
        themeColor="indigo"
        maxWidth="md"
      >
        <div className="flex flex-col gap-4 pt-2">
          <NeuralInput
            label="Label *"
            value={addForm.label}
            onChange={(e) => updateAddForm('label', e.target.value)}
            placeholder="e.g. Amazon — Office Supplies"
          />
          <div className="grid grid-cols-2 gap-3">
            <NeuralInput
              label="Amount"
              value={addForm.amount}
              onChange={(e) => updateAddForm('amount', e.target.value)}
              placeholder="0.00"
              type="number"
            />
            <NeuralInput
              label="Date"
              value={addForm.date}
              onChange={(e) => updateAddForm('date', e.target.value)}
              type="date"
            />
          </div>
          <NeuralInput
            label="Category"
            value={addForm.category}
            onChange={(e) => updateAddForm('category', e.target.value)}
            placeholder="e.g. Office Supplies"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/60">Tax Category</span>
            <NeuralSelectMenu
              value={addForm.taxCategory}
              options={[
                { label: 'Select tax category…', value: '' },
                ...TAX_CATEGORY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
              ]}
              onChange={(val) => updateAddForm('taxCategory', val)}
              ariaLabel="Tax category"
            />
          </div>
          <NeuralInput
            label="Tax Year"
            value={addForm.taxYear}
            onChange={(e) => updateAddForm('taxYear', e.target.value)}
            placeholder={String(new Date().getFullYear())}
            type="number"
          />
          <NeuralInput
            label="Image / File Reference (optional)"
            value={addForm.imageRef}
            onChange={(e) => updateAddForm('imageRef', e.target.value)}
            placeholder="URL or storage reference"
          />
          <NeuralInput
            label="Notes (optional)"
            value={addForm.notes}
            onChange={(e) => updateAddForm('notes', e.target.value)}
            placeholder="Additional context…"
          />

          <div className="flex justify-end gap-2 pt-2">
            <NeuralButton variant="ghost" size="sm" onClick={closeAddModal}>
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="primary"
              size="sm"
              themeColor="indigo"
              loading={isAddLoading}
              onClick={handleAddReceipt}
              disabled={!addForm.label.trim()}
            >
              Save Receipt
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      {/* ── Link to Transaction Modal ── */}
      <NeuralModal
        isOpen={linkReceiptId !== null}
        onClose={closeLinkModal}
        title="Link to Transaction"
        subtitle="Select a transaction to associate with this receipt"
        themeColor="indigo"
        maxWidth="md"
      >
        <div className="flex flex-col gap-3 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <NeuralInput
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Search transactions…"
            />
          </div>

          {filteredTransactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No matching transactions.</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
              {filteredTransactions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleLinkTransaction(t.id)}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-white/90 truncate">
                      {t.description}
                    </span>
                    <span className="text-xs text-white/40">{formatDate(t.date)}</span>
                  </div>
                  <span
                    className="ml-3 flex-shrink-0 text-sm font-semibold"
                    style={{
                      color: t.type === 'income' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatCurrency(Math.abs(t.amount), currency)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <NeuralButton variant="ghost" size="sm" onClick={closeLinkModal}>
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${accent}18` }}
        >
          {icon}
        </div>
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}

// ─── ReceiptRow ───────────────────────────────────────────────────────────────

interface ReceiptRowProps {
  receipt: Receipt;
  currency: string;
  linkedTransaction?: Transaction;
  onLinkClick: () => void;
  onDelete: () => void;
}

function ReceiptRow({
  receipt,
  currency,
  linkedTransaction,
  onLinkClick,
  onDelete,
}: ReceiptRowProps) {
  const iconColor = getTaxCategoryColor(receipt.taxCategory);

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.045]"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Icon */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${iconColor}18` }}
      >
        <FileText className="h-4 w-4" style={{ color: iconColor }} />
      </div>

      {/* Main info */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Top row: label + amount */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-white/90 truncate">{receipt.label}</span>
          <span className="flex-shrink-0 text-sm font-bold text-white/80">
            {formatCurrency(receipt.amount, currency)}
          </span>
        </div>

        {/* Middle row: date + badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/40">{formatDate(receipt.date)}</span>

          {receipt.category && (
            <CategoryBadge color="#6b7280" label={receipt.category} />
          )}

          {receipt.taxCategory && (
            <CategoryBadge
              color={getTaxCategoryColor(receipt.taxCategory)}
              label={receipt.taxCategory}
            />
          )}
        </div>

        {/* Bottom row: link info */}
        {linkedTransaction ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Link2 className="h-3 w-3 flex-shrink-0 text-white/30" />
            <span className="text-xs text-white/40 truncate">
              {linkedTransaction.description}
            </span>
          </div>
        ) : (
          <div className="mt-0.5">
            <NeuralButton
              variant="ghost"
              size="sm"
              themeColor="indigo"
              onClick={onLinkClick}
              className="flex items-center gap-1 !px-2 !py-0.5 text-xs"
            >
              <Link2 className="h-3 w-3" />
              Link to transaction
            </NeuralButton>
          </div>
        )}
      </div>

      {/* Delete action */}
      <button
        onClick={onDelete}
        aria-label={`Delete receipt: ${receipt.label}`}
        className="flex-shrink-0 rounded-lg p-1.5 text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── CategoryBadge ────────────────────────────────────────────────────────────

interface CategoryBadgeProps {
  color: string;
  label: string;
}

function CategoryBadge({ color, label }: CategoryBadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}35`,
      }}
    >
      {label}
    </span>
  );
}
