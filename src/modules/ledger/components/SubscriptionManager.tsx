import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  TrendingDown,
  RotateCcw,
  Check,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionBillingCycle,
} from '../services/ledger-intake-service';
import {
  computeSubscriptionSummary,
  getExpiringTrials,
  getUpcomingRenewals,
  toMonthlyEquivalent,
} from '../services/aggregation/subscription-aggregation';

// ─── Public Props ─────────────────────────────────────────────────────────────

export interface SubscriptionManagerProps {
  subscriptions: Subscription[];
  currency: string;
  onCreateSubscription: (data: Partial<Subscription>) => void;
  onUpdateSubscription: (subscriptionId: string, data: Partial<Subscription>) => void;
  onDeleteSubscription: (subscriptionId: string) => void;
  onCancelSubscription: (subscriptionId: string) => void;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type FilterTab = 'all' | SubscriptionStatus;

interface FormState {
  name: string;
  category: string;
  amount: string;
  billingCycle: SubscriptionBillingCycle;
  status: SubscriptionStatus;
  nextRenewalDate: string;
  trialEndsAt: string;
  website: string;
  notes: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fallback accent colors cycled by subscription index when sub.color is absent. */
const DEFAULT_COLOR_PALETTE: readonly string[] = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#d946ef', // fuchsia
];

const BILLING_CYCLE_OPTIONS: Array<{ label: string; value: SubscriptionBillingCycle }> = [
  { label: 'Weekly',    value: 'weekly'    },
  { label: 'Monthly',   value: 'monthly'   },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly',    value: 'yearly'    },
  { label: 'Lifetime',  value: 'lifetime'  },
];

const STATUS_OPTIONS: Array<{ label: string; value: SubscriptionStatus }> = [
  { label: 'Active',    value: 'active'    },
  { label: 'Trial',     value: 'trial'     },
  { label: 'Paused',    value: 'paused'    },
  { label: 'Cancelled', value: 'cancelled' },
];

const BILLING_CYCLE_BADGE: Record<SubscriptionBillingCycle, { label: string; className: string }> = {
  weekly:    { label: 'Weekly',    className: 'bg-sky-500/15 text-sky-400 ring-sky-500/20'         },
  monthly:   { label: 'Monthly',   className: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/20'       },
  quarterly: { label: 'Quarterly', className: 'bg-purple-500/15 text-purple-400 ring-purple-500/20' },
  yearly:    { label: 'Yearly',    className: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' },
  lifetime:  { label: 'Lifetime',  className: 'bg-amber-500/15 text-amber-400 ring-amber-500/20'   },
};

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; className: string }> = {
  active:    { label: 'Active',    className: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' },
  trial:     { label: 'Trial',     className: 'bg-amber-500/15 text-amber-400 ring-amber-500/20'       },
  paused:    { label: 'Paused',    className: 'bg-white/10 text-white/50 ring-white/10'                },
  cancelled: { label: 'Cancelled', className: 'bg-rose-500/15 text-rose-400 ring-rose-500/20'          },
};

/** Short suffix appended to the amount display, e.g. "$9.99/mo". */
const BILLING_CYCLE_SUFFIX: Record<SubscriptionBillingCycle, string> = {
  weekly:    '/wk',
  monthly:   '/mo',
  quarterly: '/qtr',
  yearly:    '/yr',
  lifetime:  ' one-time',
};

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'trial',     label: 'Trial'     },
  { key: 'paused',    label: 'Paused'    },
  { key: 'cancelled', label: 'Cancelled' },
];

const BLANK_FORM: FormState = {
  name:            '',
  category:        '',
  amount:          '',
  billingCycle:    'monthly',
  status:          'active',
  nextRenewalDate: '',
  trialEndsAt:     '',
  website:         '',
  notes:           '',
};

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Format a numeric amount as a localised currency string.
 * Time: O(1) — delegates to the browser's Intl engine.
 */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style:                 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Resolve a display accent colour for a subscription card. O(1). */
function resolveAccentColor(sub: Subscription, index: number): string {
  return sub.color ?? DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
}

/** Format an ISO-8601 date string for human display. O(1). */
function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── StatCard (local, mirrors RecurringManager pattern) ───────────────────────

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

// ─── SubscriptionManager ──────────────────────────────────────────────────────

export default function SubscriptionManager({
  subscriptions,
  currency,
  onCreateSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onCancelSubscription,
}: SubscriptionManagerProps) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [isModalOpen,         setIsModalOpen]         = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [deleteTargetId,      setDeleteTargetId]      = useState<string | null>(null);
  const [activeFilter,        setActiveFilter]        = useState<FilterTab>('all');
  const [form,                setForm]                = useState<FormState>(BLANK_FORM);

  // ── Derived data — O(n) per aggregation pass ─────────────────────────────────
  const summary = useMemo(
    () => computeSubscriptionSummary(subscriptions),
    [subscriptions],
  );

  const expiringTrials = useMemo(
    () => getExpiringTrials(subscriptions, 7),
    [subscriptions],
  );

  // Kept in scope for potential future use (e.g. an upcoming-renewals strip).
  const _upcomingRenewals = useMemo(
    () => getUpcomingRenewals(subscriptions, 7),
    [subscriptions],
  );

  const filteredSubscriptions = useMemo(() => {
    if (activeFilter === 'all') return subscriptions;
    return subscriptions.filter(s => s.status === activeFilter);
  }, [subscriptions, activeFilter]);

  // ── Tab counts ───────────────────────────────────────────────────────────────
  function tabCount(key: FilterTab): number {
    switch (key) {
      case 'all':       return subscriptions.length;
      case 'active':    return summary.activeCount;
      case 'trial':     return summary.trialCount;
      case 'paused':    return summary.pausedCount;
      case 'cancelled': return summary.cancelledCount;
    }
  }

  // ── Modal handlers ───────────────────────────────────────────────────────────
  function openCreateModal(): void {
    setEditingSubscription(null);
    setForm(BLANK_FORM);
    setIsModalOpen(true);
  }

  function openEditModal(sub: Subscription): void {
    setEditingSubscription(sub);
    setForm({
      name:            sub.name,
      category:        sub.category,
      amount:          String(sub.amount),
      billingCycle:    sub.billingCycle,
      status:          sub.status,
      nextRenewalDate: sub.nextRenewalDate ?? '',
      trialEndsAt:     sub.trialEndsAt    ?? '',
      website:         sub.website        ?? '',
      notes:           sub.notes          ?? '',
    });
    setIsModalOpen(true);
  }

  function closeModal(): void {
    setIsModalOpen(false);
    setEditingSubscription(null);
    setForm(BLANK_FORM);
  }

  function handleFormChange<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(): void {
    const amount = parseFloat(form.amount);
    if (!form.name.trim() || isNaN(amount) || amount < 0) return;

    const data: Partial<Subscription> = {
      name:              form.name.trim(),
      category:          form.category.trim(),
      amount,
      billingCycle:      form.billingCycle,
      monthlyEquivalent: toMonthlyEquivalent(amount, form.billingCycle),
      status:            form.status,
      nextRenewalDate:   form.nextRenewalDate,
      // Only persist trialEndsAt when the subscription is actually in trial
      ...(form.status === 'trial' && form.trialEndsAt ? { trialEndsAt: form.trialEndsAt } : {}),
      ...(form.website.trim() ? { website: form.website.trim() } : {}),
      ...(form.notes.trim()   ? { notes:   form.notes.trim()   } : {}),
    };

    if (editingSubscription) {
      onUpdateSubscription(editingSubscription.id, data);
    } else {
      onCreateSubscription(data);
    }
    closeModal();
  }

  function requestDelete(id: string): void {
    setDeleteTargetId(id);
  }

  function confirmDelete(): void {
    if (deleteTargetId) {
      onDeleteSubscription(deleteTargetId);
      setDeleteTargetId(null);
    }
  }

  // ── Derived UI values ────────────────────────────────────────────────────────
  const isSubmitDisabled =
    !form.name.trim() ||
    !form.amount.trim() ||
    isNaN(parseFloat(form.amount)) ||
    parseFloat(form.amount) < 0;

  const deleteTarget = subscriptions.find(s => s.id === deleteTargetId);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Subscriptions</h2>
          <p className="mt-0.5 text-sm text-white/40">Track and manage your recurring services</p>
        </div>
        <NeuralButton
          variant="primary"
          size="sm"
          onClick={openCreateModal}
          className="shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Subscription
        </NeuralButton>
      </div>

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<CreditCard className="h-5 w-5 text-cyan-400" />}
          label="Monthly Spend"
          value={formatCurrency(summary.totalMonthly, currency)}
          sub={`${formatCurrency(summary.totalAnnual, currency)}/yr`}
        />
        <StatCard
          icon={<Check className="h-5 w-5 text-emerald-400" />}
          label="Active Subscriptions"
          value={String(summary.activeCount)}
          sub={summary.trialCount > 0 ? `${summary.trialCount} on trial` : undefined}
        />
        <StatCard
          icon={<AlertCircle className="h-5 w-5 text-amber-400" />}
          label="Trials Ending Soon"
          value={String(expiringTrials.length)}
          sub="within 7 days"
        />
      </div>

      {/* ── Expiring Trials Alert Strip ──────────────────────────────────────── */}
      {expiringTrials.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-300">
              {expiringTrials.length === 1
                ? '1 trial is ending within 7 days'
                : `${expiringTrials.length} trials are ending within 7 days`}
            </p>
            <p className="mt-1 text-xs text-amber-400/80">
              {expiringTrials.map(s => s.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-1 scrollbar-none">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeFilter === tab.key
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab.label}
            <span
              className={[
                'rounded px-1 text-[10px] font-semibold',
                activeFilter === tab.key ? 'text-white/60' : 'text-white/30',
              ].join(' ')}
            >
              {tabCount(tab.key)}
            </span>
          </button>
        ))}
      </div>

      {/* ── Subscription Grid ────────────────────────────────────────────────── */}
      {filteredSubscriptions.length === 0 ? (
        <EmptyState
          title={
            activeFilter === 'all'
              ? 'No subscriptions yet'
              : `No ${activeFilter} subscriptions`
          }
          description={
            activeFilter === 'all'
              ? 'Add your first subscription to start tracking recurring services.'
              : `You have no ${activeFilter} subscriptions at the moment.`
          }
          action={
            activeFilter === 'all' ? (
              <NeuralButton variant="primary" size="sm" onClick={openCreateModal}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Subscription
              </NeuralButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredSubscriptions.map((sub, index) => {
            const accentColor  = resolveAccentColor(sub, index);
            const cycleBadge   = BILLING_CYCLE_BADGE[sub.billingCycle];
            const statusBadge  = STATUS_BADGE[sub.status];
            const suffix       = BILLING_CYCLE_SUFFIX[sub.billingCycle];
            const canCancel    = sub.status === 'active' || sub.status === 'trial';
            const showMonthly  =
              sub.billingCycle !== 'monthly' && sub.billingCycle !== 'lifetime';

            return (
              <div
                key={sub.id}
                className="relative flex overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/[0.07]"
              >
                {/* Colored left accent bar */}
                <div
                  className="w-1 shrink-0"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true"
                />

                <div className="flex flex-1 flex-col gap-3 p-4">

                  {/* Top row: name + action buttons */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{sub.name}</p>
                      {sub.website && (
                        <p className="truncate text-xs text-white/30">{sub.website}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {/* Edit */}
                      <NeuralButton
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(sub)}
                        className="h-7 w-7 p-0"
                        aria-label={`Edit ${sub.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </NeuralButton>

                      {/* Cancel (active / trial only) */}
                      {canCancel && (
                        <NeuralButton
                          variant="ghost"
                          size="sm"
                          onClick={() => onCancelSubscription(sub.id)}
                          className="h-7 w-7 p-0 text-amber-400/70 hover:text-amber-400"
                          aria-label={`Cancel ${sub.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </NeuralButton>
                      )}

                      {/* Delete */}
                      <NeuralButton
                        variant="ghost"
                        size="sm"
                        onClick={() => requestDelete(sub.id)}
                        className="h-7 w-7 p-0 text-rose-400/70 hover:text-rose-400"
                        aria-label={`Delete ${sub.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </NeuralButton>
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sub.category && (
                      <span className="inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/60 ring-1 ring-inset ring-white/10">
                        {sub.category}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cycleBadge.className}`}
                    >
                      {cycleBadge.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Amount + renewal date */}
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-white">
                        {formatCurrency(sub.amount, currency)}
                        <span className="ml-0.5 text-xs font-normal text-white/40">{suffix}</span>
                      </p>
                      {showMonthly && (
                        <p className="text-xs text-white/30">
                          ≈{' '}
                          {formatCurrency(
                            toMonthlyEquivalent(sub.amount, sub.billingCycle),
                            currency,
                          )}
                          /mo
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      {sub.status === 'trial' && sub.trialEndsAt ? (
                        <p className="text-xs text-amber-400/80">
                          Trial ends {formatDate(sub.trialEndsAt)}
                        </p>
                      ) : sub.status !== 'cancelled' ? (
                        <p className="text-xs text-white/30">
                          Renews {formatDate(sub.nextRenewalDate)}
                        </p>
                      ) : (
                        <p className="text-xs text-white/20">Cancelled</p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CRUD Modal ──────────────────────────────────────────────────────── */}
      <NeuralModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSubscription ? 'Edit Subscription' : 'Add Subscription'}
        subtitle={
          editingSubscription
            ? `Editing ${editingSubscription.name}`
            : 'Track a new recurring service'
        }
        themeColor="cyan"
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Name */}
            <NeuralInput
              label="Name"
              value={form.name}
              onChange={e => handleFormChange('name', e.target.value)}
              placeholder="e.g. Netflix, Spotify"
            />

            {/* Category */}
            <NeuralInput
              label="Category"
              value={form.category}
              onChange={e => handleFormChange('category', e.target.value)}
              placeholder="e.g. Entertainment, Productivity"
            />

            {/* Amount */}
            <NeuralInput
              label="Amount"
              type="number"
              value={form.amount}
              onChange={e => handleFormChange('amount', e.target.value)}
              placeholder="0.00"
            />

            {/* Billing Cycle — NeuralSelectMenu has no label prop; render label manually */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium uppercase tracking-widest text-white/40">
                Billing Cycle
              </p>
              <NeuralSelectMenu
                value={form.billingCycle}
                options={BILLING_CYCLE_OPTIONS}
                onChange={val => handleFormChange('billingCycle', val as SubscriptionBillingCycle)}
                placeholder="Select cycle"
                ariaLabel="Billing cycle"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium uppercase tracking-widest text-white/40">
                Status
              </p>
              <NeuralSelectMenu
                value={form.status}
                options={STATUS_OPTIONS}
                onChange={val => handleFormChange('status', val as SubscriptionStatus)}
                placeholder="Select status"
                ariaLabel="Status"
              />
            </div>

            {/* Next Renewal Date */}
            <NeuralInput
              label="Next Renewal Date"
              type="date"
              value={form.nextRenewalDate}
              onChange={e => handleFormChange('nextRenewalDate', e.target.value)}
            />

            {/* Trial Ends At — conditionally shown when status = trial */}
            {form.status === 'trial' && (
              <NeuralInput
                label="Trial Ends At"
                type="date"
                value={form.trialEndsAt}
                onChange={e => handleFormChange('trialEndsAt', e.target.value)}
              />
            )}

            {/* Website */}
            <NeuralInput
              label="Website"
              type="url"
              value={form.website}
              onChange={e => handleFormChange('website', e.target.value)}
              placeholder="https://..."
            />

          </div>

          {/* Notes — full-width textarea; no NeuralInput equivalent */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Notes</p>
            <textarea
              value={form.notes}
              onChange={e => handleFormChange('notes', e.target.value)}
              placeholder="Optional notes…"
              rows={3}
              className={[
                'w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2',
                'text-sm text-white placeholder-white/20 outline-none transition-colors',
                'focus:border-white/20 focus:bg-white/[0.07]',
              ].join(' ')}
            />
          </div>

          {/* Modal action row */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <NeuralButton variant="ghost" size="sm" onClick={closeModal}>
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {editingSubscription ? 'Save Changes' : 'Add Subscription'}
            </NeuralButton>
          </div>

        </div>
      </NeuralModal>

      {/* ── Delete Confirmation Modal ────────────────────────────────────────── */}
      <NeuralModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Subscription"
        subtitle={
          deleteTarget
            ? `Remove "${deleteTarget.name}" permanently`
            : undefined
        }
        themeColor="amber"
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/60">
            This action cannot be undone. The subscription and all its data will be permanently
            removed.
          </p>
          <div className="flex items-center justify-end gap-3">
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTargetId(null)}
            >
              Cancel
            </NeuralButton>
            <NeuralButton variant="danger" size="sm" onClick={confirmDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

    </div>
  );
}
