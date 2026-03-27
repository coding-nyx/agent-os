import React, { useState, useMemo, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  BarChart2,
  DollarSign,
  Camera,
} from 'lucide-react';

import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';

import type { Investment, InvestmentType, PortfolioSnapshot } from '../services/ledger-intake-service';
import { computePortfolioSummary } from '../services/aggregation/portfolio-aggregation';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOCATION_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#f97316',
] as const;

const INVESTMENT_TYPE_OPTIONS: { value: InvestmentType; label: string }[] = [
  { value: 'stock',        label: 'Stock' },
  { value: 'etf',          label: 'ETF' },
  { value: 'mutual_fund',  label: 'Mutual Fund' },
  { value: 'bond',         label: 'Bond' },
  { value: 'crypto',       label: 'Crypto' },
  { value: 'real_estate',  label: 'Real Estate' },
  { value: 'cash',         label: 'Cash' },
  { value: 'other',        label: 'Other' },
];

const TYPE_LABEL: Record<InvestmentType, string> = {
  stock:        'Stock',
  etf:          'ETF',
  mutual_fund:  'Mutual Fund',
  bond:         'Bond',
  crypto:       'Crypto',
  real_estate:  'Real Estate',
  cash:         'Cash',
  other:        'Other',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TypeBadgeProps {
  type: InvestmentType;
}

function TypeBadge({ type }: TypeBadgeProps): React.ReactElement {
  const colorMap: Record<InvestmentType, string> = {
    stock:       'bg-indigo-500/20 text-indigo-300',
    etf:         'bg-emerald-500/20 text-emerald-300',
    mutual_fund: 'bg-amber-500/20 text-amber-300',
    bond:        'bg-red-500/20 text-red-300',
    crypto:      'bg-blue-500/20 text-blue-300',
    real_estate: 'bg-pink-500/20 text-pink-300',
    cash:        'bg-violet-500/20 text-violet-300',
    other:       'bg-orange-500/20 text-orange-300',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${colorMap[type]}`}>
      {TYPE_LABEL[type]}
    </span>
  );
}

// ─── CRUD form state ──────────────────────────────────────────────────────────

interface InvestmentFormState {
  name: string;
  ticker: string;
  type: InvestmentType;
  quantity: string;
  costBasis: string;
  currentPrice: string;
  purchasedAt: string;
  accountId: string;
  notes: string;
  dividendsReceived: string;
}

const EMPTY_FORM: InvestmentFormState = {
  name:               '',
  ticker:             '',
  type:               'stock',
  quantity:           '',
  costBasis:          '',
  currentPrice:       '',
  purchasedAt:        '',
  accountId:          '',
  notes:              '',
  dividendsReceived:  '',
};

function formToPartialInvestment(form: InvestmentFormState): Partial<Investment> {
  const quantity      = parseFloat(form.quantity)           || 0;
  const costBasis     = parseFloat(form.costBasis)          || 0;
  const currentPrice  = parseFloat(form.currentPrice)       || 0;
  const currentValue  = quantity * currentPrice;
  const totalCost     = quantity * costBasis;

  return {
    name:               form.name.trim(),
    ticker:             form.ticker.trim() || undefined,
    type:               form.type,
    quantity,
    costBasis,
    currentPrice,
    currentValue,
    totalCost,
    unrealizedGain:     currentValue - totalCost,
    purchasedAt:        form.purchasedAt || undefined,
    accountId:          form.accountId.trim() || undefined,
    notes:              form.notes.trim() || undefined,
    dividendsReceived:  parseFloat(form.dividendsReceived) || undefined,
  };
}

function investmentToForm(inv: Investment): InvestmentFormState {
  return {
    name:               inv.name,
    ticker:             inv.ticker ?? '',
    type:               inv.type,
    quantity:           String(inv.quantity),
    costBasis:          String(inv.costBasis),
    currentPrice:       String(inv.currentPrice),
    purchasedAt:        inv.purchasedAt ?? '',
    accountId:          inv.accountId ?? '',
    notes:              inv.notes ?? '',
    dividendsReceived:  inv.dividendsReceived != null ? String(inv.dividendsReceived) : '',
  };
}

// ─── Summary Hero Bar ─────────────────────────────────────────────────────────

interface SummaryHeroBarProps {
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  totalDividends: number;
  currency: string;
}

function SummaryHeroBar({
  totalValue,
  totalCost,
  unrealizedGain,
  unrealizedGainPct,
  totalDividends,
  currency,
}: SummaryHeroBarProps): React.ReactElement {
  const isPositive = unrealizedGain >= 0;

  const stats = [
    {
      label: 'Total Portfolio Value',
      value: formatCurrency(totalValue, currency),
      icon: <DollarSign className="h-4 w-4 text-white/50" />,
      valueClass: 'text-white',
    },
    {
      label: 'Unrealized Gain / Loss',
      value: `${formatCurrency(Math.abs(unrealizedGain), currency)} (${formatPct(unrealizedGainPct)})`,
      icon: isPositive
        ? <TrendingUp className="h-4 w-4 text-emerald-400" />
        : <TrendingDown className="h-4 w-4 text-red-400" />,
      valueClass: isPositive ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Total Cost Basis',
      value: formatCurrency(totalCost, currency),
      icon: <BarChart2 className="h-4 w-4 text-white/50" />,
      valueClass: 'text-white',
    },
    {
      label: 'Dividends Received',
      value: formatCurrency(totalDividends, currency),
      icon: <DollarSign className="h-4 w-4 text-amber-400" />,
      valueClass: 'text-amber-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-white/[0.12] bg-white/[0.045] px-4 py-3 backdrop-blur-sm"
        >
          <div className="mb-1 flex items-center gap-1.5">
            {stat.icon}
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">
              {stat.label}
            </span>
          </div>
          <p className={`text-lg font-bold leading-tight ${stat.valueClass}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Allocation Pie Chart ─────────────────────────────────────────────────────

interface AllocationChartProps {
  allocationByType: Partial<Record<InvestmentType, number>>;
  currency: string;
}

function AllocationChart({ allocationByType, currency }: AllocationChartProps): React.ReactElement {
  const chartData = useMemo(
    () =>
      Object.entries(allocationByType)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([type, value], idx) => ({
          name: TYPE_LABEL[type as InvestmentType] ?? type,
          value: value ?? 0,
          color: ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length],
        })),
    [allocationByType],
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-white/40">
        No allocation data
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatCurrency(Number(value), currency)}
            contentStyle={{
              background: '#1a1a2e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '12px',
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Holdings Table ───────────────────────────────────────────────────────────

interface HoldingsTableProps {
  investments: Investment[];
  currency: string;
  onEdit: (inv: Investment) => void;
  onDelete: (investmentId: string) => void;
  onAddDividendClick: (inv: Investment) => void;
}

function HoldingsTable({
  investments,
  currency,
  onEdit,
  onDelete,
  onAddDividendClick,
}: HoldingsTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.12] text-left text-[11px] uppercase tracking-wide text-white/40">
            <th className="pb-2 pr-3">Name / Ticker</th>
            <th className="pb-2 pr-3">Type</th>
            <th className="pb-2 pr-3 text-right">Qty</th>
            <th className="pb-2 pr-3 text-right">Cost Basis</th>
            <th className="pb-2 pr-3 text-right">Price</th>
            <th className="pb-2 pr-3 text-right">Value</th>
            <th className="pb-2 pr-3 text-right">Unrealized P&L</th>
            <th className="pb-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {investments.map((inv) => {
            const isGain = inv.unrealizedGain >= 0;
            const gainPct =
              inv.totalCost > 0 ? (inv.unrealizedGain / inv.totalCost) * 100 : 0;

            return (
              <tr key={inv.id} className="group transition-colors hover:bg-white/[0.045]">
                {/* Name / Ticker */}
                <td className="py-2.5 pr-3">
                  <p className="font-medium text-white">{inv.name}</p>
                  {inv.ticker && (
                    <p className="text-[11px] text-white/40 uppercase">{inv.ticker}</p>
                  )}
                </td>

                {/* Type */}
                <td className="py-2.5 pr-3">
                  <TypeBadge type={inv.type} />
                </td>

                {/* Quantity */}
                <td className="py-2.5 pr-3 text-right font-mono text-white/80">
                  {inv.quantity.toLocaleString()}
                </td>

                {/* Cost Basis */}
                <td className="py-2.5 pr-3 text-right font-mono text-white/70">
                  {formatCurrency(inv.costBasis, currency)}
                </td>

                {/* Current Price */}
                <td className="py-2.5 pr-3 text-right font-mono text-white/70">
                  {formatCurrency(inv.currentPrice, currency)}
                </td>

                {/* Current Value */}
                <td className="py-2.5 pr-3 text-right font-mono font-semibold text-white">
                  {formatCurrency(inv.currentValue, currency)}
                </td>

                {/* Unrealized P&L */}
                <td className="py-2.5 pr-3 text-right">
                  <p className={`font-mono font-semibold ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isGain ? '+' : ''}{formatCurrency(inv.unrealizedGain, currency)}
                  </p>
                  <p className={`text-[11px] ${isGain ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    {formatPct(gainPct)}
                  </p>
                </td>

                {/* Actions */}
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Add dividend */}
                    <button
                      aria-label={`Add dividend for ${inv.name}`}
                      onClick={() => onAddDividendClick(inv)}
                      className="rounded-md p-1.5 text-amber-400/60 transition-colors hover:bg-amber-400/10 hover:text-amber-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    {/* Edit */}
                    <button
                      aria-label={`Edit ${inv.name}`}
                      onClick={() => onEdit(inv)}
                      className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      aria-label={`Delete ${inv.name}`}
                      onClick={() => onDelete(inv.id)}
                      className="rounded-md p-1.5 text-red-400/40 transition-colors hover:bg-red-400/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── CRUD Modal ───────────────────────────────────────────────────────────────

interface CRUDModalProps {
  isOpen: boolean;
  editingInvestment: Investment | null;
  currency: string;
  onClose: () => void;
  onSubmit: (data: Partial<Investment>) => void;
}

function CRUDModal({
  isOpen,
  editingInvestment,
  currency,
  onClose,
  onSubmit,
}: CRUDModalProps): React.ReactElement {
  const isEditing = editingInvestment !== null;

  const [form, setForm] = useState<InvestmentFormState>(
    isEditing && editingInvestment ? investmentToForm(editingInvestment) : EMPTY_FORM,
  );

  // Re-sync form when the modal opens with a different investment
  const prevEditId = React.useRef<string | null>(null);
  if (isOpen) {
    const incomingId = editingInvestment?.id ?? null;
    if (incomingId !== prevEditId.current) {
      prevEditId.current = incomingId;
      // Derive initialiser outside of render — schedule via layout effect below
    }
  }

  React.useLayoutEffect(() => {
    if (isOpen) {
      setForm(editingInvestment ? investmentToForm(editingInvestment) : EMPTY_FORM);
    }
  }, [isOpen, editingInvestment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(
    <K extends keyof InvestmentFormState>(field: K, value: InvestmentFormState[K]) =>
      setForm((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const computedValue = useMemo(() => {
    const qty   = parseFloat(form.quantity)      || 0;
    const price = parseFloat(form.currentPrice)  || 0;
    return qty * price;
  }, [form.quantity, form.currentPrice]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(formToPartialInvestment(form));
    onClose();
  }

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Investment' : 'Add Investment'}
      subtitle={isEditing ? `Editing ${editingInvestment?.name}` : 'Add a new holding to your portfolio'}
      themeColor="indigo"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Name + Ticker */}
        <div className="grid grid-cols-2 gap-3">
          <NeuralInput
            label="Name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Apple Inc."
          />
          <NeuralInput
            label="Ticker (optional)"
            value={form.ticker}
            onChange={(e) => set('ticker', e.target.value)}
            placeholder="e.g. AAPL"
          />
        </div>

        {/* Row 2: Type */}
        <div>
          <p className="mb-1 text-xs font-medium text-white/60">Type</p>
          <NeuralSelectMenu
            value={form.type}
            options={INVESTMENT_TYPE_OPTIONS}
            onChange={(val) => set('type', val as InvestmentType)}
            placeholder="Select type"
            ariaLabel="Investment type"
          />
        </div>

        {/* Row 3: Quantity + Cost Basis */}
        <div className="grid grid-cols-2 gap-3">
          <NeuralInput
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            placeholder="0"
          />
          <NeuralInput
            label="Cost Basis per Share"
            type="number"
            value={form.costBasis}
            onChange={(e) => set('costBasis', e.target.value)}
            placeholder="0.00"
          />
        </div>

        {/* Row 4: Current Price + computed value */}
        <div className="grid grid-cols-2 gap-3">
          <NeuralInput
            label="Current Price per Share"
            type="number"
            value={form.currentPrice}
            onChange={(e) => set('currentPrice', e.target.value)}
            placeholder="0.00"
          />
          {/* Live computed current value — read-only */}
          <div>
            <p className="mb-1 text-xs font-medium text-white/60">Current Value (computed)</p>
            <div className="flex h-10 items-center rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 text-sm font-semibold text-emerald-400">
              {formatCurrency(computedValue, currency)}
            </div>
          </div>
        </div>

        {/* Row 5: Purchased At + Account ID */}
        <div className="grid grid-cols-2 gap-3">
          <NeuralInput
            label="Purchase Date (optional)"
            type="date"
            value={form.purchasedAt}
            onChange={(e) => set('purchasedAt', e.target.value)}
            placeholder=""
          />
          <NeuralInput
            label="Account ID (optional)"
            value={form.accountId}
            onChange={(e) => set('accountId', e.target.value)}
            placeholder="e.g. brokerage-01"
          />
        </div>

        {/* Row 6: Dividends + Notes */}
        <div className="grid grid-cols-2 gap-3">
          <NeuralInput
            label="Dividends Received (optional)"
            type="number"
            value={form.dividendsReceived}
            onChange={(e) => set('dividendsReceived', e.target.value)}
            placeholder="0.00"
          />
          <NeuralInput
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any notes…"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <NeuralButton variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </NeuralButton>
          <NeuralButton
            variant="primary"
            size="sm"
            themeColor="indigo"
            type="submit"
          >
            {isEditing ? 'Save Changes' : 'Add Investment'}
          </NeuralButton>
        </div>
      </form>
    </NeuralModal>
  );
}

// ─── Dividend Modal ───────────────────────────────────────────────────────────

interface DividendModalProps {
  isOpen: boolean;
  investment: Investment | null;
  onClose: () => void;
  onSubmit: (investmentId: string, amount: number) => void;
}

function DividendModal({
  isOpen,
  investment,
  onClose,
  onSubmit,
}: DividendModalProps): React.ReactElement {
  const [amount, setAmount] = useState('');

  React.useLayoutEffect(() => {
    if (isOpen) setAmount('');
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!investment || isNaN(parsed) || parsed <= 0) return;
    onSubmit(investment.id, parsed);
    onClose();
  }

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Dividend"
      subtitle={investment ? `Adding dividend for ${investment.name}` : undefined}
      themeColor="amber"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <NeuralInput
          label="Dividend Amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <div className="flex justify-end gap-2 pt-1">
          <NeuralButton variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </NeuralButton>
          <NeuralButton variant="primary" size="sm" themeColor="amber" type="submit">
            Record
          </NeuralButton>
        </div>
      </form>
    </NeuralModal>
  );
}

// ─── Snapshot Modal ───────────────────────────────────────────────────────────

interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (note?: string) => void;
}

function SnapshotModal({ isOpen, onClose, onSubmit }: SnapshotModalProps): React.ReactElement {
  const [note, setNote] = useState('');

  React.useLayoutEffect(() => {
    if (isOpen) setNote('');
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSubmit(note.trim() || undefined);
    onClose();
  }

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Snapshot"
      subtitle="Capture the current state of your portfolio"
      themeColor="indigo"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <NeuralInput
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. End of Q2 review"
        />
        <div className="flex justify-end gap-2 pt-1">
          <NeuralButton variant="ghost" size="sm" onClick={onClose} type="button">
            Cancel
          </NeuralButton>
          <NeuralButton variant="primary" size="sm" themeColor="indigo" type="submit">
            Record Snapshot
          </NeuralButton>
        </div>
      </form>
    </NeuralModal>
  );
}

// ─── Modal state types ────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'edit'; investment: Investment }
  | { kind: 'dividend'; investment: Investment }
  | { kind: 'snapshot' };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InvestmentPortfolioProps {
  investments: Investment[];
  portfolioHistory: PortfolioSnapshot[];
  currency: string;
  onAddInvestment: (data: Partial<Investment>) => void;
  onUpdateInvestment: (investmentId: string, data: Partial<Investment>) => void;
  onDeleteInvestment: (investmentId: string) => void;
  onRecordSnapshot: (note?: string) => void;
  onAddDividend: (investmentId: string, amount: number) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvestmentPortfolio({
  investments,
  portfolioHistory: _portfolioHistory,
  currency,
  onAddInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  onRecordSnapshot,
  onAddDividend,
}: InvestmentPortfolioProps): React.ReactElement {
  // ── Modal state ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const openAdd      = useCallback(() => setModal({ kind: 'add' }), []);
  const openEdit     = useCallback((inv: Investment) => setModal({ kind: 'edit', investment: inv }), []);
  const openDividend = useCallback((inv: Investment) => setModal({ kind: 'dividend', investment: inv }), []);
  const openSnapshot = useCallback(() => setModal({ kind: 'snapshot' }), []);
  const closeModal   = useCallback(() => setModal({ kind: 'none' }), []);

  // ── Derived data ─────────────────────────────────────────────────────────
  const summary = useMemo(() => computePortfolioSummary(investments), [investments]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleCRUDSubmit(data: Partial<Investment>): void {
    if (modal.kind === 'edit') {
      onUpdateInvestment(modal.investment.id, data);
    } else {
      onAddInvestment(data);
    }
  }

  function handleDividendSubmit(investmentId: string, amount: number): void {
    onAddDividend(investmentId, amount);
  }

  function handleSnapshotSubmit(note?: string): void {
    onRecordSnapshot(note);
  }

  // ── Render: empty state ───────────────────────────────────────────────────
  if (investments.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Investment Portfolio</h2>
        </div>

        <EmptyState
          title="No investments yet"
          description="Start building your portfolio by adding your first investment holding."
          action={
            <NeuralButton
              variant="primary"
              size="md"
              themeColor="indigo"
              onClick={openAdd}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add your first investment
            </NeuralButton>
          }
        />

        {/* Add modal */}
        <CRUDModal
          isOpen={modal.kind === 'add'}
          editingInvestment={null}
          currency={currency}
          onClose={closeModal}
          onSubmit={handleCRUDSubmit}
        />
      </div>
    );
  }

  // ── Render: full portfolio ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Investment Portfolio</h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
            {summary.holdingCount} {summary.holdingCount === 1 ? 'holding' : 'holdings'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={openSnapshot}
            className="gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            Record Snapshot
          </NeuralButton>
          <NeuralButton
            variant="primary"
            size="sm"
            themeColor="indigo"
            onClick={openAdd}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Investment
          </NeuralButton>
        </div>
      </div>

      {/* ── Summary Hero Bar ────────────────────────────────────────────── */}
      <SummaryHeroBar
        totalValue={summary.totalValue}
        totalCost={summary.totalCost}
        unrealizedGain={summary.unrealizedGain}
        unrealizedGainPct={summary.unrealizedGainPct}
        totalDividends={summary.totalDividends}
        currency={currency}
      />

      {/* ── Two-column: Chart + Holdings ────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">

        {/* Left: Allocation chart */}
        <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-4 backdrop-blur-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
            Allocation by Type
          </p>
          <AllocationChart
            allocationByType={summary.allocationByType}
            currency={currency}
          />
        </div>

        {/* Right: Holdings table */}
        <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-4 backdrop-blur-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
            Holdings
          </p>
          <HoldingsTable
            investments={investments}
            currency={currency}
            onEdit={openEdit}
            onDelete={onDeleteInvestment}
            onAddDividendClick={openDividend}
          />
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {/* Add / Edit */}
      <CRUDModal
        isOpen={modal.kind === 'add' || modal.kind === 'edit'}
        editingInvestment={modal.kind === 'edit' ? modal.investment : null}
        currency={currency}
        onClose={closeModal}
        onSubmit={handleCRUDSubmit}
      />

      {/* Dividend */}
      <DividendModal
        isOpen={modal.kind === 'dividend'}
        investment={modal.kind === 'dividend' ? modal.investment : null}
        onClose={closeModal}
        onSubmit={handleDividendSubmit}
      />

      {/* Snapshot */}
      <SnapshotModal
        isOpen={modal.kind === 'snapshot'}
        onClose={closeModal}
        onSubmit={handleSnapshotSubmit}
      />
    </div>
  );
}
