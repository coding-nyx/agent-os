import { useState, useMemo } from 'react';
import {
  RepeatIcon,
  Repeat,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Trash2,
  Play,
  SkipForward,
  CalendarDays,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import type { RecurringRule, Account, RecurrenceFrequency } from '../services/ledger-intake-service';
import { computeUpcomingBills } from '../services/recurring-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function toMonthlyEquivalent(amount: number, frequency: RecurrenceFrequency): number {
  const multipliers: Record<RecurrenceFrequency, number> = {
    daily: 30,
    weekly: 4.33,
    biweekly: 2.17,
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
  };
  return amount * (multipliers[frequency] ?? 1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Frequency badge config
// ---------------------------------------------------------------------------

const FREQUENCY_BADGE: Record<RecurrenceFrequency, { label: string; className: string }> = {
  daily:     { label: 'Daily',     className: 'bg-amber-500/15 text-amber-400 ring-amber-500/20' },
  weekly:    { label: 'Weekly',    className: 'bg-sky-500/15 text-sky-400 ring-sky-500/20' },
  biweekly:  { label: 'Biweekly', className: 'bg-purple-500/15 text-purple-400 ring-purple-500/20' },
  monthly:   { label: 'Monthly',   className: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/20' },
  quarterly: { label: 'Quarterly', className: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' },
  yearly:    { label: 'Yearly',    className: 'bg-rose-500/15 text-rose-400 ring-rose-500/20' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecurringManagerProps {
  rules: RecurringRule[];
  accounts?: Account[];
  currency?: string;
  disabled?: boolean;
  onAddRule: (rule: Omit<RecurringRule, 'id' | 'createdAt' | 'nextDueDate'>) => void;
  onUpdateRule: (id: string, updates: Partial<RecurringRule>) => void;
  onDeleteRule: (id: string) => void;
  onPostNow: (ruleId: string) => void;
  onSkipNext: (ruleId: string) => void;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface RuleFormState {
  description: string;
  amount: string;
  type: 'income' | 'expense';
  category: string;
  frequency: RecurrenceFrequency;
  startDate: string;
  accountId: string;
  autoPost: boolean;
  notes: string;
}

const EMPTY_FORM: RuleFormState = {
  description: '',
  amount: '',
  type: 'expense',
  category: '',
  frequency: 'monthly',
  startDate: new Date().toISOString().slice(0, 10),
  accountId: '',
  autoPost: false,
  notes: '',
};

function ruleToForm(rule: RecurringRule): RuleFormState {
  return {
    description: rule.description,
    amount: String(rule.amount),
    type: rule.type,
    category: rule.category,
    frequency: rule.frequency,
    startDate: rule.startDate,
    accountId: rule.accountId ?? '',
    autoPost: rule.autoPost,
    notes: rule.notes ?? '',
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-white/40">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-white">{value}</p>
        {sub && <p className="text-xs text-white/40">{sub}</p>}
      </div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2',
        'focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-white/20',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transform transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RecurringManager({
  rules,
  accounts = [],
  currency = 'USD',
  disabled = false,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onPostNow,
  onSkipNext,
}: RecurringManagerProps) {
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const activeCount = useMemo(() => rules.filter((r) => r.isActive).length, [rules]);

  const { monthlyOutflow, monthlyInflow } = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    for (const rule of rules) {
      if (!rule.isActive) continue;
      const monthly = toMonthlyEquivalent(rule.amount, rule.frequency);
      if (rule.type === 'expense') outflow += monthly;
      else inflow += monthly;
    }
    return { monthlyOutflow: outflow, monthlyInflow: inflow };
  }, [rules]);

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
      }),
    [rules],
  );

  const upcomingBills = useMemo(() => computeUpcomingBills(rules, 30), [rules]);

  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  // -------------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------------

  function handleOpenAdd() {
    setForm(EMPTY_FORM);
    setEditingRule(null); setIsOpen(true);
  }

  function handleOpenEdit(rule: RecurringRule) {
    setForm(ruleToForm(rule));
    setEditingRule(rule); setIsOpen(true);
  }

  function handleFieldChange<K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amount) || amount <= 0) return;

    const payload: Omit<RecurringRule, 'id' | 'createdAt' | 'nextDueDate'> = {
      description: form.description.trim(),
      amount,
      type: form.type,
      category: form.category.trim(),
      frequency: form.frequency,
      startDate: form.startDate,
      accountId: form.accountId || undefined,
      autoPost: form.autoPost,
      notes: form.notes.trim() || undefined,
      isActive: true,
      lastPostedDate: undefined,
    };

    if (!editingRule) {
      onAddRule(payload);
    } else {
      onUpdateRule(editingRule.id, payload);
    }
    setIsOpen(false);
    setEditingRule(null);
  }

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------

  function requestDelete(id: string) {
    setDeleteConfirmId(id);
  }

  function confirmDelete() {
    if (deleteConfirmId) onDeleteRule(deleteConfirmId);
    setDeleteConfirmId(null);
  }

  // -------------------------------------------------------------------------
  // Select options
  // -------------------------------------------------------------------------

  const typeOptions = [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
  ];

  const frequencyOptions: { value: RecurrenceFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Biweekly (every 2 weeks)' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
  ];

  const accountOptions = [
    { value: '', label: 'No account linked' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Recurring Rules</h2>
          <p className="text-sm text-white/40">Automate your regular income and expenses</p>
        </div>
        <NeuralButton
          variant="primary"
          size="sm"
          disabled={disabled}
          onClick={handleOpenAdd}
        >
          Add Rule
        </NeuralButton>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary stats                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Repeat className="h-5 w-5 text-white/60" />}
          label="Active Rules"
          value={String(activeCount)}
          sub={`${rules.length} total`}
        />
        <StatCard
          icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
          label="Monthly Outflow"
          value={formatCurrency(monthlyOutflow, currency)}
          sub="estimated"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          label="Monthly Inflow"
          value={formatCurrency(monthlyInflow, currency)}
          sub="estimated"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Upcoming bills strip                                                */}
      {/* ------------------------------------------------------------------ */}
      {upcomingBills.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
            Upcoming — Next 30 Days
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {upcomingBills.map((bill, idx) => (
              <div
                key={`${bill.id}-${idx}`}
                className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-3 min-w-[130px]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      bill.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400',
                    ].join(' ')}
                  />
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
                    {formatDate(bill.dueDateFormatted)}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs font-medium text-white leading-tight">
                  {bill.description}
                </p>
                <p
                  className={[
                    'text-xs font-semibold',
                    bill.type === 'income' ? 'text-emerald-400' : 'text-rose-400',
                  ].join(' ')}
                >
                  {bill.type === 'income' ? '+' : '-'}
                  {formatCurrency(bill.amount, currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rules list                                                          */}
      {/* ------------------------------------------------------------------ */}
      {sortedRules.length === 0 ? (
        <EmptyState
          title="No recurring rules"
          description="Set up automatic tracking for your regular income and bills."
        />
      ) : (
        <div className="flex flex-col divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {sortedRules.map((rule) => {
            const badge = FREQUENCY_BADGE[rule.frequency];
            const accountName = rule.accountId ? accountMap[rule.accountId] : undefined;

            return (
              <div
                key={rule.id}
                className={[
                  'flex flex-wrap items-center gap-3 px-4 py-3 transition-colors',
                  !rule.isActive && 'opacity-50',
                ].join(' ')}
              >
                {/* Active toggle */}
                <ToggleSwitch
                  checked={rule.isActive}
                  onChange={(next) => onUpdateRule(rule.id, { isActive: next })}
                  disabled={disabled}
                />

                {/* Type icon */}
                {rule.type === 'income' ? (
                  <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-rose-400" />
                )}

                {/* Description + meta */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-white">
                    {rule.description}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={[
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                        badge.className,
                      ].join(' ')}
                    >
                      {badge.label}
                    </span>
                    {rule.category && (
                      <span className="text-[11px] text-white/40">{rule.category}</span>
                    )}
                    {accountName && (
                      <span className="text-[11px] text-white/40">· {accountName}</span>
                    )}
                  </div>
                </div>

                {/* Amount + due date */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className={[
                      'text-sm font-semibold',
                      rule.type === 'income' ? 'text-emerald-400' : 'text-rose-400',
                    ].join(' ')}
                  >
                    {rule.type === 'income' ? '+' : '-'}
                    {formatCurrency(rule.amount, currency)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-white/40">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(rule.nextDueDate)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {rule.isActive && (
                    <NeuralButton
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onPostNow(rule.id)}
                      title="Post now"
                    >
                      Post
                    </NeuralButton>
                  )}
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onSkipNext(rule.id)}
                    title="Skip next occurrence"
                  />
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleOpenEdit(rule)}
                    title="Edit rule"
                  />
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => requestDelete(rule.id)}
                    title="Delete rule"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add / Edit modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      <NeuralModal
        isOpen={isOpen}
        onClose={() => { setIsOpen(false); setEditingRule(null); }}
        title={editingRule ? 'Edit Recurring Rule' : 'New Recurring Rule'}
        maxWidth="md"
      >
        <div className="flex flex-col gap-4">
          {/* Description */}
          <NeuralInput
            label="Description"
            placeholder="e.g. Netflix subscription"
            value={form.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            required
          />

          {/* Amount + Type row */}
          <div className="grid grid-cols-2 gap-3">
            <NeuralInput
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              required
            />
            <NeuralSelectMenu
              value={form.type}
              onChange={(val) => handleFieldChange('type', val as 'income' | 'expense')}
              options={typeOptions}
            />
          </div>

          {/* Category + Frequency row */}
          <div className="grid grid-cols-2 gap-3">
            <NeuralInput
              label="Category"
              placeholder="e.g. Subscriptions"
              value={form.category}
              onChange={(e) => handleFieldChange('category', e.target.value)}
            />
            <NeuralSelectMenu
              value={form.frequency}
              onChange={(val) => handleFieldChange('frequency', val as RecurrenceFrequency)}
              options={frequencyOptions}
            />
          </div>

          {/* Start date */}
          <NeuralInput
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={(e) => handleFieldChange('startDate', e.target.value)}
            required
          />

          {/* Account */}
          {accounts.length > 0 && (
            <NeuralSelectMenu
              value={form.accountId}
              onChange={(val) => handleFieldChange('accountId', val)}
              options={accountOptions}
            />
          )}

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-white/60">Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Any additional context…"
              value={form.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              className={[
                'w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2',
                'text-sm text-white placeholder:text-white/30 outline-none',
                'focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-colors',
              ].join(' ')}
            />
          </div>

          {/* Auto-post toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <ToggleSwitch
              checked={form.autoPost}
              onChange={(next) => handleFieldChange('autoPost', next)}
            />
            <span className="text-sm text-white/60">Auto-post without confirmation</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <NeuralButton variant="ghost" size="sm" onClick={close}>
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!form.description.trim() || !form.amount || parseFloat(form.amount) <= 0}
            >
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirmation modal                                           */}
      {/* ------------------------------------------------------------------ */}
      <NeuralModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Recurring Rule"
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/60">
            This rule will stop generating future transactions. Past postings will not be affected.
            Are you sure?
          </p>
          <div className="flex justify-end gap-2">
            <NeuralButton variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </NeuralButton>
            <NeuralButton variant="danger" size="sm" onClick={confirmDelete}>
              Delete Rule
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}
