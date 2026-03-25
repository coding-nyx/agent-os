/**
 * RetirementPlanner.tsx
 *
 * Nexus Ledger — Retirement Planning module.
 *
 * Responsibilities (one per section, single-responsibility throughout):
 *   1. Header — title + "Add Plan" CTA
 *   2. Plan Selector — pill tabs (multiple plans) or static label (single plan)
 *   3. Hero Projection Panel — projected vs required nest egg, on-track badge,
 *      shortfall / surplus, years to retirement, 4 % rule income
 *   4. Projection Chart — Recharts AreaChart over milestone years with a
 *      ReferenceLine at the required nest egg
 *   5. Contribution Simulator — live NeuralInput sliders that recompute the
 *      projection client-side WITHOUT persisting (no onProjectRetirement call)
 *   6. Plan Details — read-only parameter summary
 *   7. CRUD Modal — add / edit plan with all RetirementPlan fields
 *
 * Business logic is fully isolated in the aggregation layer; this file is
 * presentation + local UI state only.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Target,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';

import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { cn } from '@/lib/utils';
import { useCRUDModal } from './shared/useCRUDModal';

import type { RetirementPlan, RetirementProjection } from '../services/ledger-intake-service';
import {
  projectRetirement,
  requiredMonthlyContribution,
} from '../services/aggregation/retirement-calculator';

// ─── Local currency formatter ─────────────────────────────────────────────────

/**
 * Formats a numeric value as a localised currency string.
 * Compacts values ≥ 1 M / 1 K for chart labels.
 *
 * Time complexity: O(1)   Space complexity: O(1)
 */
function formatCurrency(value: number, currency = 'USD', compact = false): string {
  if (compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RetirementPlannerProps {
  retirementPlans: RetirementPlan[];
  /** The last server-persisted projection (may be undefined until first run). */
  lastRetirementProjection: RetirementProjection | undefined;
  currency: string;
  onCreatePlan: (data: Partial<RetirementPlan>) => void;
  onUpdatePlan: (planId: string, data: Partial<RetirementPlan>) => void;
  onDeletePlan: (planId: string) => void;
  /** Triggers a server-side projection run. Called only from "Run Projection". */
  onProjectRetirement: (planId?: string) => void;
}

// ─── Default form values ──────────────────────────────────────────────────────

const EMPTY_PLAN: Partial<RetirementPlan> = {
  name: '',
  currentAge: 30,
  targetRetirementAge: 65,
  currentSavings: 0,
  monthlyContribution: 500,
  expectedAnnualReturnPct: 7,
  inflationRatePct: 3,
  targetMonthlyIncome: 5000,
  notes: '',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Compact read-only metric cell used in the hero panel and plan details. */
function MetricCell({
  icon: Icon,
  label,
  value,
  subtext,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-1.5 text-white/50 text-[10px] font-semibold uppercase tracking-wider">
        <Icon className="size-3 shrink-0" />
        {label}
      </div>
      <span className="text-lg font-black text-white leading-tight">{value}</span>
      {subtext && <span className="text-[10px] text-white/40">{subtext}</span>}
    </div>
  );
}

/** On-track / off-track badge shown in the hero panel. */
function TrackBadge({ onTrack }: { onTrack: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
        onTrack
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-red-500/15 text-red-400 border border-red-500/30',
      )}
    >
      {onTrack ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <AlertTriangle className="size-3.5" />
      )}
      {onTrack ? 'On Track' : 'Off Track'}
    </span>
  );
}

/** Custom Recharts tooltip that formats values as currency. */
function ProjectionTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string | number;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900/95 border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-white/50 mb-1">{label}</p>
      <p className="text-white font-bold">{formatCurrency(payload[0].value, currency)}</p>
    </div>
  );
}

// ─── Form field wrapper used inside the CRUD modal ────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-white/60 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * RetirementPlanner
 *
 * Complexity notes:
 *   - Plan selection: O(1) via Map lookup after O(n) index build on first render
 *   - projectRetirement (memoised): O(y/5) where y = years to retirement (milestone loop)
 *   - Chart data build: O(m) where m = milestone count (≤ 12 for a 60-year horizon)
 *   - All other operations: O(1)
 */
export default function RetirementPlanner({
  retirementPlans,
  lastRetirementProjection,
  currency,
  onCreatePlan,
  onUpdatePlan,
  onDeletePlan,
  onProjectRetirement,
}: RetirementPlannerProps) {
  // ── Selected plan index ───────────────────────────────────────────────────
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(
    retirementPlans[0]?.id,
  );

  const selectedPlan = useMemo(
    () => retirementPlans.find((p) => p.id === selectedPlanId) ?? retirementPlans[0],
    [retirementPlans, selectedPlanId],
  );

  // ── Simulator local state ─────────────────────────────────────────────────
  const [simContribution, setSimContribution] = useState<number>(
    selectedPlan?.monthlyContribution ?? 500,
  );
  const [simReturn, setSimReturn] = useState<number>(
    selectedPlan?.expectedAnnualReturnPct ?? 7,
  );

  // Reset simulator whenever the active plan changes
  const handleSelectPlan = useCallback(
    (planId: string) => {
      const plan = retirementPlans.find((p) => p.id === planId);
      setSelectedPlanId(planId);
      if (plan) {
        setSimContribution(plan.monthlyContribution);
        setSimReturn(plan.expectedAnnualReturnPct);
      }
    },
    [retirementPlans],
  );

  // ── Live projection for the hero panel (uses real plan values) ────────────
  const liveProjection = useMemo<RetirementProjection | null>(() => {
    if (!selectedPlan) return null;
    try {
      return projectRetirement(selectedPlan);
    } catch {
      return null;
    }
  }, [selectedPlan]);

  // ── Simulator projection (uses sim overrides, never persisted) ────────────
  const simProjection = useMemo<RetirementProjection | null>(() => {
    if (!selectedPlan) return null;
    try {
      return projectRetirement({
        ...selectedPlan,
        monthlyContribution: simContribution,
        expectedAnnualReturnPct: simReturn,
      });
    } catch {
      return null;
    }
  }, [selectedPlan, simContribution, simReturn]);

  // ── Required monthly contribution hint ───────────────────────────────────
  const requiredContribution = useMemo<number>(() => {
    if (!selectedPlan) return 0;
    try {
      return requiredMonthlyContribution(selectedPlan);
    } catch {
      return 0;
    }
  }, [selectedPlan]);

  // ── Chart data (milestone series) ─────────────────────────────────────────
  /**
   * Prepend the "today" data point (year = current year, balance = currentSavings)
   * then append each projection milestone.
   * O(m) where m = milestones.length
   */
  const chartData = useMemo(() => {
    if (!liveProjection || !selectedPlan) return [];
    const currentYear = new Date().getFullYear();
    const startPoint = {
      year: currentYear,
      label: `${currentYear} (Now)`,
      projectedBalance: selectedPlan.currentSavings,
    };
    const milestonePoints = liveProjection.milestones.map((m) => ({
      year: m.year,
      label: `${m.year} (Age ${m.age})`,
      projectedBalance: m.projectedBalance,
    }));
    return [startPoint, ...milestonePoints];
  }, [liveProjection, selectedPlan]);

  // ── CRUD Modal ────────────────────────────────────────────────────────────
  const {
    isOpen: isModalOpen,
    editingItem: editingPlan,
    formData,
    setField,
    openCreate,
    openEdit,
    handleClose: handleModalClose,
    handleSave,
  } = useCRUDModal<RetirementPlan>({
    initialForm: EMPTY_PLAN,
    validate: (f) =>
      Boolean(
        f.name?.trim() &&
          f.currentAge &&
          f.targetRetirementAge &&
          f.targetRetirementAge > f.currentAge &&
          f.targetMonthlyIncome,
      ),
    onCreate: onCreatePlan,
    onUpdate: (id, data) => onUpdatePlan(id, data),
  });

  // Derive the on-track colour scheme once so it propagates consistently
  const onTrack = liveProjection?.onTrack ?? false;
  const accentColor = onTrack ? 'emerald' : 'red';
  const areaStroke = onTrack ? '#10b981' : '#ef4444';
  const areaFill = onTrack ? '#10b98120' : '#ef444420';

  // ── Empty state ───────────────────────────────────────────────────────────
  if (retirementPlans.length === 0) {
    return (
      <SurfaceCard className="overflow-hidden">
        <div className="flex flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-cyan-400" />
              <h2 className="text-base font-black text-white tracking-tight">
                Retirement Planner
              </h2>
            </div>
            <NeuralButton
              variant="primary"
              size="sm"
              themeColor="cyan"
              onClick={() => openCreate()}
            >
              <Plus className="size-3.5 mr-1.5" />
              Add Plan
            </NeuralButton>
          </div>

          {/* Empty illustration */}
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="size-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Target className="size-8 text-cyan-400/60" />
            </div>
            <div>
              <p className="text-white/70 font-semibold">No retirement plans yet</p>
              <p className="text-white/40 text-sm mt-1">
                Create your first plan to start projecting your retirement savings.
              </p>
            </div>
            <NeuralButton variant="primary" size="md" themeColor="cyan" onClick={() => openCreate()}>
              <Plus className="size-4 mr-1.5" />
              Create Retirement Plan
            </NeuralButton>
          </div>
        </div>

        {/* Add Plan Modal */}
        <PlanCRUDModal
          isOpen={isModalOpen}
          editingPlan={editingPlan}
          formData={formData}
          setField={setField}
          onClose={handleModalClose}
          onSave={handleSave}
          currency={currency}
        />
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="overflow-hidden">
      <div className="flex flex-col gap-6 p-6">
        {/* ── 1. Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-cyan-400" />
            <h2 className="text-base font-black text-white tracking-tight">
              Retirement Planner
            </h2>
          </div>
          <NeuralButton
            variant="primary"
            size="sm"
            themeColor="cyan"
            onClick={() => openCreate()}
          >
            <Plus className="size-3.5 mr-1.5" />
            Add Plan
          </NeuralButton>
        </div>

        {/* ── 2. Plan Selector ────────────────────────────────────────── */}
        {retirementPlans.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Retirement plans">
            {retirementPlans.map((plan) => (
              <button
                key={plan.id}
                role="tab"
                aria-selected={plan.id === selectedPlan?.id}
                onClick={() => handleSelectPlan(plan.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150',
                  plan.id === selectedPlan?.id
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20',
                )}
              >
                {plan.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-white/60">{selectedPlan?.name}</p>
        )}

        {/* ── 3. Hero Projection Panel ─────────────────────────────────── */}
        {liveProjection && selectedPlan && (
          <div
            className={cn(
              'rounded-xl border p-5 grid gap-5',
              'sm:grid-cols-2 lg:grid-cols-4',
              onTrack
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20',
            )}
          >
            {/* Projected nest egg */}
            <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 flex-wrap">
                <TrackBadge onTrack={onTrack} />
              </div>
              <MetricCell
                icon={DollarSign}
                label="Projected Nest Egg"
                value={formatCurrency(liveProjection.projectedNestEgg, currency)}
                subtext="At retirement"
              />
              <MetricCell
                icon={Target}
                label="Required Nest Egg (4% Rule)"
                value={formatCurrency(liveProjection.requiredNestEgg, currency)}
                subtext={`${formatCurrency(selectedPlan.targetMonthlyIncome, currency)}/mo target`}
              />
            </div>

            {/* Shortfall / surplus */}
            <div className="flex flex-col justify-center gap-1">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                {liveProjection.shortfallOrSurplus >= 0 ? 'Surplus' : 'Shortfall'}
              </p>
              <p
                className={cn(
                  'text-2xl font-black',
                  liveProjection.shortfallOrSurplus >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400',
                )}
              >
                {liveProjection.shortfallOrSurplus >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(liveProjection.shortfallOrSurplus), currency)}
              </p>
              <p className="text-[10px] text-white/40">
                {liveProjection.shortfallOrSurplus >= 0
                  ? 'You will exceed your target'
                  : 'Increase contributions or reduce target income'}
              </p>
            </div>

            {/* Years + target age */}
            <MetricCell
              icon={Calendar}
              label="Years to Retirement"
              value={`${liveProjection.yearsToRetirement} yrs`}
              subtext={`Target age ${selectedPlan.targetRetirementAge}`}
            />

            {/* Monthly income supported */}
            <MetricCell
              icon={TrendingUp}
              label="Monthly Income (4% Rule)"
              value={formatCurrency(liveProjection.fourPercentRuleMonthly, currency)}
              subtext="Sustainable monthly withdrawal"
            />

            {/* Action row */}
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
              <NeuralButton
                variant="primary"
                size="sm"
                themeColor={onTrack ? 'emerald' : 'red'}
                onClick={() => onProjectRetirement(selectedPlan.id)}
              >
                <TrendingUp className="size-3.5 mr-1.5" />
                Run Projection
              </NeuralButton>
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={() => openEdit(selectedPlan)}
              >
                <Pencil className="size-3.5 mr-1.5" />
                Edit Plan
              </NeuralButton>
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={() => onDeletePlan(selectedPlan.id)}
                className="text-red-400/70 hover:text-red-400 ml-auto"
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Delete
              </NeuralButton>
            </div>
          </div>
        )}

        {/* ── 4. Projection Chart ──────────────────────────────────────── */}
        {chartData.length > 1 && liveProjection && (
          <div>
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">
              Projected Balance Over Time
            </p>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="retirementGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={areaStroke} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={areaStroke} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(v: number) => formatCurrency(v, currency, true)}
                  />
                  <Tooltip
                    content={
                      <ProjectionTooltip currency={currency} />
                    }
                  />

                  {/* Required nest egg reference line */}
                  <ReferenceLine
                    y={liveProjection.requiredNestEgg}
                    stroke={onTrack ? '#10b981' : '#ef4444'}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{
                      value: 'Target',
                      fill: onTrack ? '#6ee7b7' : '#fca5a5',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="projectedBalance"
                    stroke={areaStroke}
                    strokeWidth={2}
                    fill="url(#retirementGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: areaStroke, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── 5. Contribution Simulator ───────────────────────────────── */}
        {selectedPlan && (
          <div className="rounded-xl bg-white/[0.03] border border-white/8 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-md bg-cyan-500/15 flex items-center justify-center">
                <TrendingUp className="size-3.5 text-cyan-400" />
              </div>
              <p className="text-sm font-bold text-white/80">Contribution Simulator</p>
              <span className="ml-auto text-[10px] text-white/30 italic">
                Changes are not saved automatically
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Monthly contribution input */}
              <div>
                <FormField label="Monthly Contribution">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">
                      {currency}
                    </span>
                    <NeuralInput
                      type="number"
                      value={simContribution}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSimContribution(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      placeholder="500"
                      min={0}
                      step={50}
                      className="pl-14"
                    />
                  </div>
                  <p className="text-[10px] text-white/40 mt-1.5">
                    Required to hit target:{' '}
                    <span className="text-cyan-400 font-semibold">
                      {formatCurrency(requiredContribution, currency)}/mo
                    </span>
                  </p>
                </FormField>
              </div>

              {/* Expected return input */}
              <div>
                <FormField label="Expected Annual Return (%)">
                  <div className="relative">
                    <NeuralInput
                      type="number"
                      value={simReturn}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSimReturn(
                          Math.min(30, Math.max(0, parseFloat(e.target.value) || 0)),
                        )
                      }
                      placeholder="7"
                      min={0}
                      max={30}
                      step={0.5}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">
                      %
                    </span>
                  </div>
                </FormField>
              </div>
            </div>

            {/* Simulator result summary */}
            {simProjection && (
              <div
                className={cn(
                  'rounded-lg border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2',
                  simProjection.onTrack
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-red-500/5 border-red-500/20',
                )}
              >
                <TrackBadge onTrack={simProjection.onTrack} />
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">
                    Projected Nest Egg
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatCurrency(simProjection.projectedNestEgg, currency)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">
                    {simProjection.shortfallOrSurplus >= 0 ? 'Surplus' : 'Shortfall'}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-bold',
                      simProjection.shortfallOrSurplus >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400',
                    )}
                  >
                    {simProjection.shortfallOrSurplus >= 0 ? '+' : '−'}
                    {formatCurrency(
                      Math.abs(simProjection.shortfallOrSurplus),
                      currency,
                    )}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">
                    Monthly Income (4%)
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatCurrency(simProjection.fourPercentRuleMonthly, currency)}/mo
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 6. Plan Details ─────────────────────────────────────────── */}
        {selectedPlan && (
          <div className="rounded-xl bg-white/[0.02] border border-white/6 p-5">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-4">
              Plan Parameters
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <DetailRow label="Current Age" value={`${selectedPlan.currentAge} yrs`} />
              <DetailRow label="Retirement Age" value={`${selectedPlan.targetRetirementAge} yrs`} />
              <DetailRow
                label="Current Savings"
                value={formatCurrency(selectedPlan.currentSavings, currency)}
              />
              <DetailRow
                label="Monthly Contribution"
                value={formatCurrency(selectedPlan.monthlyContribution, currency)}
              />
              <DetailRow
                label="Expected Return"
                value={`${selectedPlan.expectedAnnualReturnPct}%`}
              />
              <DetailRow
                label="Inflation Rate"
                value={`${selectedPlan.inflationRatePct}%`}
              />
              <DetailRow
                label="Target Monthly Income"
                value={formatCurrency(selectedPlan.targetMonthlyIncome, currency)}
              />
              {selectedPlan.notes && (
                <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                  <DetailRow label="Notes" value={selectedPlan.notes} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 7. CRUD Modal ───────────────────────────────────────────────── */}
      <PlanCRUDModal
        isOpen={isModalOpen}
        editingPlan={editingPlan}
        formData={formData}
        setField={setField}
        onClose={handleModalClose}
        onSave={handleSave}
        currency={currency}
      />
    </SurfaceCard>
  );
}

// ─── Extracted sub-components (keep main component readable) ──────────────────

/** Single label/value pair in the plan details grid. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-semibold text-white/80">{value}</span>
    </div>
  );
}

// ── CRUD Modal ────────────────────────────────────────────────────────────────

interface PlanCRUDModalProps {
  isOpen: boolean;
  editingPlan: RetirementPlan | null;
  formData: Partial<RetirementPlan>;
  setField: <K extends keyof RetirementPlan>(field: K, value: RetirementPlan[K]) => void;
  onClose: () => void;
  onSave: () => void;
  currency: string;
}

/**
 * Add / Edit modal for a RetirementPlan.
 *
 * Extracted to keep RetirementPlanner's JSX lean and honour SRP.
 * All validation lives in the useCRUDModal config — this component is
 * purely a form shell.
 */
function PlanCRUDModal({
  isOpen,
  editingPlan,
  formData,
  setField,
  onClose,
  onSave,
  currency,
}: PlanCRUDModalProps) {
  const isEditing = Boolean(editingPlan);
  const canSave =
    Boolean(formData.name?.trim()) &&
    Boolean(formData.currentAge) &&
    Boolean(formData.targetRetirementAge) &&
    (formData.targetRetirementAge ?? 0) > (formData.currentAge ?? 0) &&
    Boolean(formData.targetMonthlyIncome);

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Retirement Plan' : 'Create Retirement Plan'}
      subtitle={
        isEditing
          ? `Editing "${editingPlan?.name}"`
          : 'Configure your retirement savings projection'
      }
      themeColor="cyan"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-5">
        {/* Plan name */}
        <FormField label="Plan Name">
          <NeuralInput
            type="text"
            value={formData.name ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setField('name', e.target.value)
            }
            placeholder="e.g. Early Retirement, Standard Plan"
          />
        </FormField>

        {/* Age row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Current Age">
            <NeuralInput
              type="number"
              value={formData.currentAge ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('currentAge', parseInt(e.target.value, 10) || 0)
              }
              placeholder="30"
              min={18}
              max={80}
            />
          </FormField>
          <FormField label="Target Retirement Age">
            <NeuralInput
              type="number"
              value={formData.targetRetirementAge ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('targetRetirementAge', parseInt(e.target.value, 10) || 0)
              }
              placeholder="65"
              min={(formData.currentAge ?? 18) + 1}
              max={90}
            />
          </FormField>
        </div>

        {/* Savings row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label={`Current Savings (${currency})`}>
            <NeuralInput
              type="number"
              value={formData.currentSavings ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('currentSavings', parseFloat(e.target.value) || 0)
              }
              placeholder="0"
              min={0}
              step={1000}
            />
          </FormField>
          <FormField label={`Monthly Contribution (${currency})`}>
            <NeuralInput
              type="number"
              value={formData.monthlyContribution ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('monthlyContribution', parseFloat(e.target.value) || 0)
              }
              placeholder="500"
              min={0}
              step={50}
            />
          </FormField>
        </div>

        {/* Return / inflation row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Expected Annual Return (%)">
            <NeuralInput
              type="number"
              value={formData.expectedAnnualReturnPct ?? 7}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField(
                  'expectedAnnualReturnPct',
                  parseFloat(e.target.value) || 0,
                )
              }
              placeholder="7"
              min={0}
              max={30}
              step={0.5}
            />
          </FormField>
          <FormField label="Inflation Rate (%)">
            <NeuralInput
              type="number"
              value={formData.inflationRatePct ?? 3}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setField('inflationRatePct', parseFloat(e.target.value) || 0)
              }
              placeholder="3"
              min={0}
              max={15}
              step={0.25}
            />
          </FormField>
        </div>

        {/* Target income */}
        <FormField label={`Target Monthly Retirement Income (${currency})`}>
          <NeuralInput
            type="number"
            value={formData.targetMonthlyIncome ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setField('targetMonthlyIncome', parseFloat(e.target.value) || 0)
            }
            placeholder="5000"
            min={0}
            step={100}
          />
          <p className="text-[10px] text-white/40 mt-1">
            Required nest egg = annual income ÷ 4% (25× rule)
          </p>
        </FormField>

        {/* Notes */}
        <FormField label="Notes (optional)">
          <NeuralInput
            type="text"
            value={formData.notes ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setField('notes', e.target.value)
            }
            placeholder="Any additional context..."
          />
        </FormField>

        {/* Age validation hint */}
        {(formData.targetRetirementAge ?? 0) <= (formData.currentAge ?? 0) &&
          formData.currentAge &&
          formData.targetRetirementAge && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="size-3.5 shrink-0" />
              Target retirement age must be greater than current age.
            </div>
          )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <NeuralButton
            variant="primary"
            size="md"
            themeColor="cyan"
            onClick={onSave}
            disabled={!canSave}
            className="flex-1"
          >
            {isEditing ? 'Save Changes' : 'Create Plan'}
          </NeuralButton>
          <NeuralButton variant="secondary" size="md" onClick={onClose} className="flex-1">
            Cancel
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}
