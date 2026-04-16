import React, { useState, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  Heart,
  Car,
  Home,
} from 'lucide-react';
import { NeuralButton }     from '@/core/components/NeuralButton';
import { NeuralModal }      from '@/core/components/NeuralModal';
import { NeuralInput }      from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState }       from '@/core/components/EmptyState';
import type {
  InsurancePolicy,
  InsurancePolicyType,
  InsuranceBillingCycle,
} from '../services/ledger-intake-service';
import {
  computeInsuranceSummary,
  getUpcomingRenewals,
  detectCoverageGaps,
  toMonthlyPremium,
} from '../services/aggregation/insurance-aggregation';

// ─── Public Props ─────────────────────────────────────────────────────────────

export interface InsuranceManagerProps {
  policies:       InsurancePolicy[];
  currency:       string;
  onCreatePolicy: (data: Partial<InsurancePolicy>) => void;
  onUpdatePolicy: (policyId: string, data: Partial<InsurancePolicy>) => void;
  onDeletePolicy: (policyId: string) => void;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface FormState {
  name:             string;
  type:             InsurancePolicyType;
  provider:         string;
  premium:          string;
  billingCycle:     InsuranceBillingCycle;
  nextRenewalDate:  string;
  startDate:        string;
  coverageAmount:   string;
  deductible:       string;
  policyNumber:     string;
  isActive:         boolean;
  notes:            string;
}

interface StatCardProps {
  icon:   React.ReactNode;
  label:  string;
  value:  string;
  sub?:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Accent colour and icon configuration keyed by InsurancePolicyType.
 * Colours follow the spec: health=red, dental/vision=orange, auto=blue,
 * home/renters=green, life/disability=purple, everything else=gray.
 */
const POLICY_TYPE_CONFIG: Record<
  InsurancePolicyType,
  { color: string; icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }
> = {
  health:     { color: '#ef4444', icon: Heart    },
  dental:     { color: '#f97316', icon: Shield   },
  vision:     { color: '#f97316', icon: Shield   },
  auto:       { color: '#3b82f6', icon: Car      },
  home:       { color: '#10b981', icon: Home     },
  renters:    { color: '#10b981', icon: Home     },
  life:       { color: '#8b5cf6', icon: Shield   },
  disability: { color: '#8b5cf6', icon: Shield   },
  umbrella:   { color: '#6b7280', icon: Shield   },
  pet:        { color: '#6b7280', icon: Shield   },
  other:      { color: '#6b7280', icon: Shield   },
};

const POLICY_TYPE_OPTIONS: Array<{ label: string; value: InsurancePolicyType }> = [
  { label: 'Health',      value: 'health'     },
  { label: 'Dental',      value: 'dental'     },
  { label: 'Vision',      value: 'vision'     },
  { label: 'Auto',        value: 'auto'       },
  { label: 'Home',        value: 'home'       },
  { label: 'Renters',     value: 'renters'    },
  { label: 'Life',        value: 'life'       },
  { label: 'Disability',  value: 'disability' },
  { label: 'Umbrella',    value: 'umbrella'   },
  { label: 'Pet',         value: 'pet'        },
  { label: 'Other',       value: 'other'      },
];

const BILLING_CYCLE_OPTIONS: Array<{ label: string; value: InsuranceBillingCycle }> = [
  { label: 'Monthly',   value: 'monthly'   },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Biannual',  value: 'biannual'  },
  { label: 'Yearly',    value: 'yearly'    },
];

/** Human-readable suffix for each billing cycle, used on premium display. */
const BILLING_CYCLE_SUFFIX: Record<InsuranceBillingCycle, string> = {
  monthly:   '/mo',
  quarterly: '/qtr',
  biannual:  '/6mo',
  yearly:    '/yr',
};

const BLANK_FORM: FormState = {
  name:            '',
  type:            'health',
  provider:        '',
  premium:         '',
  billingCycle:    'monthly',
  nextRenewalDate: '',
  startDate:       '',
  coverageAmount:  '',
  deductible:      '',
  policyNumber:    '',
  isActive:        true,
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

/** Parse a form string to an optional float; returns undefined when blank. */
function parseOptionalFloat(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

/**
 * Compact summary card rendered inside the stats row.
 * Intentionally simple — single responsibility, no side-effects.
 */
function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.12] bg-white/[0.045] px-5 py-4">
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

// ─── PolicyCard ───────────────────────────────────────────────────────────────

interface PolicyCardProps {
  policy:   InsurancePolicy;
  currency: string;
  onEdit:   (policy: InsurancePolicy) => void;
  onDelete: (policyId: string) => void;
}

/**
 * Individual insurance policy card.
 * Isolated component to keep InsuranceManager's render tree shallow.
 */
function PolicyCard({ policy, currency, onEdit, onDelete }: PolicyCardProps) {
  const config  = POLICY_TYPE_CONFIG[policy.type];
  const IconCmp = config.icon;
  const color   = config.color;

  const monthlyAmount = useMemo(
    () => toMonthlyPremium(policy.premium, policy.billingCycle),
    [policy.premium, policy.billingCycle],
  );

  const typeLabelMap: Record<InsurancePolicyType, string> = {
    health:     'Health',
    dental:     'Dental',
    vision:     'Vision',
    auto:       'Auto',
    home:       'Home',
    renters:    'Renters',
    life:       'Life',
    disability: 'Disability',
    umbrella:   'Umbrella',
    pet:        'Pet',
    other:      'Other',
  };

  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-5 transition-colors hover:bg-white/[0.05]">
      {/* Header row — icon + name + badges */}
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
          style={{
            backgroundColor: `${color}18`,
            borderColor:      `${color}35`,
          }}
        >
          <IconCmp size={20} color={color} strokeWidth={1.75} />
        </div>

        {/* Name + provider */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{policy.name}</p>
          <p className="truncate text-[11px] text-white/50">{policy.provider}</p>
        </div>

        {/* Active / inactive badge */}
        <span
          className={
            policy.isActive
              ? 'shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400 ring-1 ring-inset ring-emerald-500/20'
              : 'shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/40 ring-1 ring-inset ring-white/10'
          }
        >
          {policy.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Type badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: `${color}18`,
            color,
            boxShadow: `inset 0 0 0 1px ${color}35`,
          }}
        >
          {typeLabelMap[policy.type]}
        </span>
      </div>

      {/* Premium + coverage details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        {/* Premium */}
        <div>
          <p className="text-white/40 uppercase tracking-widest">Premium</p>
          <p className="mt-0.5 font-semibold text-white">
            {formatCurrency(policy.premium, currency)}
            <span className="ml-0.5 text-white/40">{BILLING_CYCLE_SUFFIX[policy.billingCycle]}</span>
          </p>
          {policy.billingCycle !== 'monthly' && (
            <p className="text-white/35">
              ≈ {formatCurrency(monthlyAmount, currency)}/mo
            </p>
          )}
        </div>

        {/* Renewal date */}
        <div>
          <p className="text-white/40 uppercase tracking-widest">Renews</p>
          <p className="mt-0.5 font-semibold text-white">{formatDate(policy.nextRenewalDate)}</p>
        </div>

        {/* Coverage amount (optional) */}
        {policy.coverageAmount !== undefined && (
          <div>
            <p className="text-white/40 uppercase tracking-widest">Coverage</p>
            <p className="mt-0.5 font-semibold text-white">
              {formatCurrency(policy.coverageAmount, currency)}
            </p>
          </div>
        )}

        {/* Deductible (optional) */}
        {policy.deductible !== undefined && (
          <div>
            <p className="text-white/40 uppercase tracking-widest">Deductible</p>
            <p className="mt-0.5 font-semibold text-white">
              {formatCurrency(policy.deductible, currency)}
            </p>
          </div>
        )}

        {/* Policy number (optional) */}
        {policy.policyNumber && (
          <div className="col-span-2">
            <p className="text-white/40 uppercase tracking-widest">Policy #</p>
            <p className="mt-0.5 font-mono text-white/70">{policy.policyNumber}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <NeuralButton
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 text-white/50 hover:text-white"
          onClick={() => onEdit(policy)}
        >
          <Pencil size={13} />
          Edit
        </NeuralButton>
        <NeuralButton
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 text-rose-400/70 hover:text-rose-400"
          onClick={() => onDelete(policy.id)}
        >
          <Trash2 size={13} />
          Delete
        </NeuralButton>
      </div>
    </div>
  );
}

// ─── InsuranceManager ─────────────────────────────────────────────────────────

/**
 * InsuranceManager — primary UI for the Ara Ledger insurance sub-module.
 *
 * Responsibilities (Single Responsibility boundaries):
 *  • Aggregates summary data via pure service functions (no business logic inline).
 *  • Owns CRUD modal state and delegates persistence to parent via callbacks.
 *  • Renders stats, gap alerts, renewal notices, and the policy grid.
 *
 * Complexity:
 *  • All derived values are O(n) where n = policies.length.
 *  • useMemo prevents re-computation on unrelated renders.
 */
export default function InsuranceManager({
  policies,
  currency,
  onCreatePolicy,
  onUpdatePolicy,
  onDeletePolicy,
}: InsuranceManagerProps) {
  // ── Modal / editing state ───────────────────────────────────────────────────
  const [isModalOpen,    setIsModalOpen]    = useState(false);
  const [editingPolicy,  setEditingPolicy]  = useState<InsurancePolicy | null>(null);
  const [form,           setForm]           = useState<FormState>(BLANK_FORM);
  const [isSubmitting,   setIsSubmitting]   = useState(false);

  // ── Derived data (O(n) each, memoised) ─────────────────────────────────────
  const summary       = useMemo(() => computeInsuranceSummary(policies),       [policies]);
  const renewalsSoon  = useMemo(() => getUpcomingRenewals(policies, 30),        [policies]);
  const coverageGaps  = useMemo(() => detectCoverageGaps(policies),             [policies]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openCreateModal() {
    setEditingPolicy(null);
    setForm(BLANK_FORM);
    setIsModalOpen(true);
  }

  function openEditModal(policy: InsurancePolicy) {
    setEditingPolicy(policy);
    setForm({
      name:            policy.name,
      type:            policy.type,
      provider:        policy.provider,
      premium:         String(policy.premium),
      billingCycle:    policy.billingCycle,
      nextRenewalDate: policy.nextRenewalDate.slice(0, 10),
      startDate:       policy.startDate.slice(0, 10),
      coverageAmount:  policy.coverageAmount !== undefined ? String(policy.coverageAmount) : '',
      deductible:      policy.deductible     !== undefined ? String(policy.deductible)     : '',
      policyNumber:    policy.policyNumber   ?? '',
      isActive:        policy.isActive,
      notes:           policy.notes          ?? '',
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPolicy(null);
    setForm(BLANK_FORM);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const premiumRaw = parseFloat(form.premium);
    if (!form.name.trim() || !form.provider.trim() || !Number.isFinite(premiumRaw)) return;

    const payload: Partial<InsurancePolicy> = {
      name:            form.name.trim(),
      type:            form.type,
      provider:        form.provider.trim(),
      premium:         premiumRaw,
      billingCycle:    form.billingCycle,
      monthlyPremium:  toMonthlyPremium(premiumRaw, form.billingCycle),
      nextRenewalDate: form.nextRenewalDate || new Date().toISOString(),
      startDate:       form.startDate       || new Date().toISOString(),
      coverageAmount:  parseOptionalFloat(form.coverageAmount),
      deductible:      parseOptionalFloat(form.deductible),
      policyNumber:    form.policyNumber.trim() || undefined,
      isActive:        form.isActive,
      notes:           form.notes.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      if (editingPolicy) {
        onUpdatePolicy(editingPolicy.id, payload);
      } else {
        onCreatePolicy(payload);
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-white">Insurance Coverage</h2>
          <p className="text-[11px] text-white/40 uppercase tracking-widest mt-0.5">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'} total
          </p>
        </div>
        <NeuralButton
          variant="primary"
          size="sm"
          themeColor="emerald"
          onClick={openCreateModal}
          className="gap-1.5 shrink-0"
        >
          <Plus size={14} />
          Add Policy
        </NeuralButton>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Shield size={18} className="text-emerald-400" />}
          label="Monthly Premiums"
          value={formatCurrency(summary.totalMonthly, currency)}
          sub={`${formatCurrency(summary.totalAnnual, currency)} annually`}
        />
        <StatCard
          icon={<ShieldCheck size={18} className="text-blue-400" />}
          label="Active Policies"
          value={String(summary.activeCount)}
          sub={summary.inactiveCount > 0 ? `${summary.inactiveCount} inactive` : undefined}
        />
        <StatCard
          icon={<Clock size={18} className="text-amber-400" />}
          label="Renewals (30 days)"
          value={String(renewalsSoon.length)}
          sub={renewalsSoon.length > 0 ? 'Review upcoming renewals' : 'No renewals due soon'}
        />
      </div>

      {/* ── Coverage gaps alert strip ───────────────────────────────────────── */}
      {coverageGaps.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={15} strokeWidth={2} />
            <p className="text-xs font-semibold uppercase tracking-widest">Coverage Gaps Detected</p>
          </div>
          <ul className="ml-1 flex flex-col gap-1">
            {coverageGaps.map((gap, i) => (
              <li key={i} className="text-[11px] text-amber-300/80 leading-relaxed">
                • {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Upcoming renewals strip ─────────────────────────────────────────── */}
      {renewalsSoon.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-5 py-4">
          <div className="flex items-center gap-2 text-blue-400">
            <ShieldAlert size={15} strokeWidth={2} />
            <p className="text-xs font-semibold uppercase tracking-widest">
              Upcoming Renewals Within 30 Days
            </p>
          </div>
          <ul className="ml-1 flex flex-col gap-1">
            {renewalsSoon.map(policy => (
              <li key={policy.id} className="text-[11px] text-blue-300/80 leading-relaxed">
                • <span className="font-medium text-blue-200">{policy.name}</span> renews on{' '}
                {formatDate(policy.nextRenewalDate)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Policy grid ────────────────────────────────────────────────────── */}
      {policies.length === 0 ? (
        <EmptyState
          title="No insurance policies yet"
          description="Add your health, auto, home, and other policies to track premiums and coverage gaps."
          action={
            <NeuralButton
              variant="outline"
              size="sm"
              themeColor="emerald"
              onClick={openCreateModal}
              className="gap-1.5"
            >
              <Plus size={13} />
              Add Your First Policy
            </NeuralButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {policies.map(policy => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              currency={currency}
              onEdit={openEditModal}
              onDelete={onDeletePolicy}
            />
          ))}
        </div>
      )}

      {/* ── CRUD Modal ─────────────────────────────────────────────────────── */}
      <NeuralModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingPolicy ? 'Edit Policy' : 'Add Policy'}
        subtitle={editingPolicy ? editingPolicy.name : 'New insurance policy'}
        themeColor="emerald"
        maxWidth="lg"
      >
        <div className="flex flex-col gap-5">

          {/* Name */}
          <NeuralInput
            label="Policy Name"
            placeholder="e.g. Blue Cross Health Plan"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
          />

          {/* Type + Provider row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                Policy Type
              </p>
              <NeuralSelectMenu
                value={form.type}
                options={POLICY_TYPE_OPTIONS}
                onChange={v => setField('type', v)}
                placeholder="Select type"
                ariaLabel="Policy type"
              />
            </div>

            <NeuralInput
              label="Provider / Insurer"
              placeholder="e.g. Blue Cross Blue Shield"
              value={form.provider}
              onChange={e => setField('provider', e.target.value)}
            />
          </div>

          {/* Premium + Billing cycle row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NeuralInput
              label="Premium Amount"
              placeholder="0.00"
              type="number"
              value={form.premium}
              onChange={e => setField('premium', e.target.value)}
            />

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                Billing Cycle
              </p>
              <NeuralSelectMenu
                value={form.billingCycle}
                options={BILLING_CYCLE_OPTIONS}
                onChange={v => setField('billingCycle', v)}
                placeholder="Select cycle"
                ariaLabel="Billing cycle"
              />
            </div>
          </div>

          {/* Start date + Next renewal date row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NeuralInput
              label="Start Date"
              type="date"
              value={form.startDate}
              onChange={e => setField('startDate', e.target.value)}
            />
            <NeuralInput
              label="Next Renewal Date"
              type="date"
              value={form.nextRenewalDate}
              onChange={e => setField('nextRenewalDate', e.target.value)}
            />
          </div>

          {/* Coverage + Deductible row (optional) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NeuralInput
              label="Coverage Amount (optional)"
              placeholder="e.g. 500000"
              type="number"
              value={form.coverageAmount}
              onChange={e => setField('coverageAmount', e.target.value)}
            />
            <NeuralInput
              label="Deductible (optional)"
              placeholder="e.g. 1500"
              type="number"
              value={form.deductible}
              onChange={e => setField('deductible', e.target.value)}
            />
          </div>

          {/* Policy number (optional) */}
          <NeuralInput
            label="Policy Number (optional)"
            placeholder="e.g. XYZ-123456"
            value={form.policyNumber}
            onChange={e => setField('policyNumber', e.target.value)}
          />

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.12] bg-white/[0.045] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Active Policy</p>
              <p className="text-[11px] text-white/40">
                Inactive policies are excluded from premium totals and gap analysis.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => setField('isActive', !form.isActive)}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-black',
                form.isActive ? 'bg-emerald-500' : 'bg-white/20',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
                  'transform transition-transform duration-200',
                  form.isActive ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Notes (optional)
            </p>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any additional details about this policy…"
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/[0.12] bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all duration-300"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={closeModal}
              disabled={isSubmitting}
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="primary"
              size="sm"
              themeColor="emerald"
              loading={isSubmitting}
              onClick={handleSubmit}
              className="gap-1.5"
            >
              {editingPolicy ? 'Save Changes' : 'Add Policy'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}
