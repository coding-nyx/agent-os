/**
 * BehavioralInsightsPanel
 *
 * Inline panel (not a modal) displayed inside the Ledger dashboard "Insights"
 * tab.  Shows:
 *   - ROI league table: top 5 high-ROI vs bottom 3 low-ROI tracked expenses
 *   - Tax deductible total (YTD) and estimated 25 % marginal-rate savings
 *   - Debt payoff timeline as horizontal SVG bars
 *   - Savings goal progress rings (inline SVG)
 *
 * Feature-gated: only rendered when `VITE_LEDGER_BEHAVIORAL_INSIGHTS=true`
 * OR `localStorage` key `nexus:ledger:behavioral` is `"true"`.
 */

import React, { useEffect, useMemo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { cn } from '@/lib/utils';
import {
  analyzeProfile,
  checkAndEmitFinancialFriction,
  LedgerAnalysisSummary,
} from '../services/ledger-cross-verification-engine';
import { LedgerIntakeProfile } from '../services/ledger-intake-service';
import { GlobalProjection } from '@/lib/types';

// ─── Feature toggle helper ────────────────────────────────────────────────────

export function isBehavioralInsightsEnabled(): boolean {
  return (
    (import.meta.env.VITE_LEDGER_BEHAVIORAL_INSIGHTS as string | undefined) === 'true' ||
    localStorage.getItem('nexus:ledger:behavioral') === 'true'
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BehavioralInsightsPanelProps {
  profile: LedgerIntakeProfile;
  soul?: GlobalProjection | null;
  uid?: string | null;
  currency?: string;
  className?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Circular SVG progress ring for a savings goal. */
function SavingsRing({
  percent,
  label,
  monthsToGoal,
  targetAmount,
  currency,
}: {
  percent: number;
  label: string;
  monthsToGoal: number;
  targetAmount: number;
  currency: string;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(percent, 100) / 100) * circumference;
  const gap = circumference - dash;

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
      <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
        <circle cx="36" cy="36" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          stroke="var(--module-accent)"
          strokeWidth="6"
          fill="none"
          strokeDasharray={`${dash} ${gap}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      {/* Overlay text rendered separately (SVG text inside rotated SVG is awkward) */}
      <div className="-mt-[58px] mb-[30px] text-center pointer-events-none select-none">
        <span className="text-[11px] font-bold text-[var(--module-color-300)]">{percent}%</span>
      </div>
      <p className="text-[11px] font-black uppercase tracking-widest text-white/50 text-center truncate max-w-[80px]">
        {label}
      </p>
      <p className="text-[11px] text-white/30 text-center">
        {formatCurrency(targetAmount, currency)}
      </p>
      <p className="text-[11px] text-[var(--module-color-400)] text-center">
        {isFinite(monthsToGoal) ? `${monthsToGoal} mo` : '∞'}
      </p>
    </div>
  );
}

/** Horizontal bar for a debt payoff timeline. */
function DebtBar({
  name,
  months,
  maxMonths,
  order,
  currency,
  interestPaid,
}: {
  name: string;
  months: number;
  maxMonths: number;
  order: number;
  currency: string;
  interestPaid: number;
}) {
  const safeMax = Math.max(maxMonths, 1);
  const safeMonths = Math.min(months, safeMax);
  const widthPct = isFinite(months) ? (safeMonths / safeMax) * 100 : 100;

  const colors = [
    'bg-emerald-500',
    'bg-cyan-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
  ];
  const color = colors[(order - 1) % colors.length];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-black uppercase tracking-widest text-white/60 truncate max-w-[120px]">
          {order}. {name}
        </span>
        <span className="text-white/30 tabular-nums">
          {isFinite(months) ? `${months} mo` : '∞'} · {currency}{' '}
          {interestPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })} interest
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/[0.045] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

/** ROI score badge. */
function RoiBadge({ score }: { score: number }) {
  const color =
    score >= 7
      ? 'text-emerald-400 bg-emerald-400/10'
      : score >= 4
      ? 'text-amber-400 bg-amber-400/10'
      : 'text-rose-400 bg-rose-400/10';

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-black tabular-nums', color)}>
      {formatNumber(score, 1, 1)}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function BehavioralInsightsPanel({
  profile,
  soul: _soul,
  uid,
  currency = 'USD',
  className,
}: BehavioralInsightsPanelProps) {
  // Compute full analysis (pure — no side-effects)
  const analysis: LedgerAnalysisSummary = useMemo(
    () => analyzeProfile(profile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      profile.fixedExpenses,
      profile.variableExpenses,
      profile.debtItems,
      profile.savingsGoals,
      profile.monthlyIncome,
    ],
  );

  // Emit financial friction signal when over-budget (side-effect, runs once per profile change)
  useEffect(() => {
    if (uid) {
      checkAndEmitFinancialFriction(profile, uid).catch((err) =>
        console.error('[BehavioralInsightsPanel] Friction emit failed:', err),
      );
    }
  }, [profile, uid]);

  // ── ROI league table ─────────────────────────────────────────────────────
  const sortedByROI = [...analysis.roiScores].sort((a, b) => b.roiScore - a.roiScore);
  const top5 = sortedByROI.slice(0, 5);
  const bottom3 = [...sortedByROI].reverse().slice(0, 3);

  // ── Debt chart bounds ────────────────────────────────────────────────────
  const maxDebtMonths = Math.max(
    ...analysis.debtSnowballPlan.map((d) => (isFinite(d.monthsToPayoff) ? d.monthsToPayoff : 0)),
    1,
  );

  // ── Savings goals check ──────────────────────────────────────────────────
  const hasGoals = analysis.savingsProjections.length > 0;
  const hasDebts = analysis.debtSnowballPlan.length > 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--module-color-400)]" />
        <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50">
          Behavioral Insights
        </h3>
      </div>

      {/* ── Tax deductible summary ───────────────────────────────────────── */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            Tax Deductibles
          </span>
          <DollarSign className="w-3.5 h-3.5 text-emerald-400/60" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[11px] text-white/40 uppercase tracking-widest">YTD Estimate</p>
            <p className="text-lg font-black text-emerald-300 tabular-nums">
              {currency}{' '}
              {analysis.ytdDeductibleTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-white/30">Deductible expenses × 12 months</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-white/40 uppercase tracking-widest">Est. Tax Saving</p>
            <p className="text-lg font-black text-[var(--module-color-300)] tabular-nums">
              {currency}{' '}
              {analysis.estimatedTaxSaving.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-white/30">At 25 % marginal rate</p>
          </div>
        </div>

        {analysis.ytdDeductibleTotal === 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-200/70 leading-relaxed">
              No deductible expenses detected. Label expenses with keywords like "medical",
              "equipment", or "course" to auto-categorise them.
            </p>
          </div>
        )}

        {/* Per-category breakdown */}
        {analysis.categorizedExpenses.length > 0 && (
          <div className="space-y-2 pt-1">
            {(['deductible', 'partial', 'non-deductible', 'unknown'] as const).map((cat) => {
              const items = analysis.categorizedExpenses.filter((e) => e.taxCategory === cat);
              if (items.length === 0) return null;
              const total = items.reduce((s, e) => s + e.amount, 0);
              const label =
                cat === 'deductible'
                  ? 'Fully Deductible'
                  : cat === 'partial'
                  ? 'Partially Deductible'
                  : cat === 'non-deductible'
                  ? 'Non-Deductible'
                  : 'Unclassified';
              const accent =
                cat === 'deductible'
                  ? 'text-emerald-400'
                  : cat === 'partial'
                  ? 'text-amber-400'
                  : cat === 'non-deductible'
                  ? 'text-rose-400'
                  : 'text-white/30';

              return (
                <div key={cat} className="flex items-center justify-between text-[11px]">
                  <span className="text-white/50">{label}</span>
                  <span className={cn('font-bold tabular-nums', accent)}>
                    {formatCurrency(total, currency)} / mo
                    <span className="text-white/20 ml-1">({items.length})</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {/* ── ROI league table ─────────────────────────────────────────────── */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            ROI League Table
          </span>
          <BarChart2 className="w-3.5 h-3.5 text-violet-400/60" />
        </div>

        {sortedByROI.length === 0 ? (
          <EmptyState
            size="sm"
            title="No expenses tracked"
            description="Add expenses to see ROI analysis."
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="space-y-5">
            {/* Top performers */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400/70">
                  Top {top5.length} — High ROI
                </span>
              </div>
              {top5.map(({ item, usageFrequency, roiScore }) => (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <RoiBadge score={roiScore} />
                    <span className="text-[11px] text-white/70 truncate">{item.label}</span>
                  </div>
                  <span className="text-[11px] text-white/30 shrink-0 tabular-nums">
                    {usageFrequency}×/mo · {currency}{' '}
                    {item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>

            {/* Low performers */}
            {bottom3.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.09]">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3 text-rose-400" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-rose-400/70">
                    Bottom {bottom3.length} — Low ROI
                  </span>
                </div>
                {bottom3.map(({ item, usageFrequency, roiScore }) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RoiBadge score={roiScore} />
                      <span className="text-[11px] text-white/60 truncate">{item.label}</span>
                    </div>
                    <span className="text-[11px] text-white/30 shrink-0 tabular-nums">
                      {usageFrequency}×/mo · {currency}{' '}
                      {item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SurfaceCard>

      {/* ── Debt payoff timeline ─────────────────────────────────────────── */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            Debt Snowball Timeline
          </span>
          <Target className="w-3.5 h-3.5 text-amber-400/60" />
        </div>

        {!hasDebts ? (
          <EmptyState
            size="sm"
            title="No debts tracked"
            description="Great! Add any outstanding debts to see payoff projection."
            icon={Target}
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="space-y-4">
            {analysis.debtSnowballPlan.map((plan) => (
              <DebtBar
                key={plan.name}
                name={plan.name}
                months={plan.monthsToPayoff}
                maxMonths={maxDebtMonths}
                order={plan.payoffOrder}
                currency={currency}
                interestPaid={plan.totalInterestPaid}
              />
            ))}
            <p className="text-[11px] text-white/20 pt-1">
              Snowball method — lowest balance paid first. Extra monthly surplus rolled into
              next debt on clearance.
            </p>
          </div>
        )}
      </SurfaceCard>

      {/* ── Savings goal progress rings ──────────────────────────────────── */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            Savings Goals
          </span>
          <TrendingUp className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
        </div>

        {!hasGoals ? (
          <EmptyState
            size="sm"
            title="No savings goals"
            description="Set a savings target in your profile to track progress."
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="flex flex-wrap gap-6 justify-center pt-2">
            {analysis.savingsProjections.map((proj) => (
              <SavingsRing
                key={proj.goalId}
                percent={proj.percentComplete}
                label={proj.label}
                monthsToGoal={proj.monthsToGoal}
                targetAmount={proj.targetAmount}
                currency={currency}
              />
            ))}
          </div>
        )}

        {/* Confidence band summary */}
        {hasGoals && analysis.savingsProjections[0] && (
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.09]">
            {(
              [
                ['Optimistic', analysis.savingsProjections[0].confidenceBand.optimistic, 'text-emerald-400'],
                ['Base', analysis.savingsProjections[0].confidenceBand.base, 'text-[var(--module-color-400)]'],
                ['Pessimistic', analysis.savingsProjections[0].confidenceBand.pessimistic, 'text-amber-400'],
              ] as const
            ).map(([label, months, color]) => (
              <div key={label} className="text-center space-y-0.5">
                <p className="text-[11px] text-white/30 uppercase tracking-widest">{label}</p>
                <p className={cn('text-[11px] font-black tabular-nums', color)}>
                  {isFinite(months) ? `${months} mo` : '∞'}
                </p>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
