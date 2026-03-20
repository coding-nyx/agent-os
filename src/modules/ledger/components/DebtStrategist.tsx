/**
 * DebtStrategist.tsx
 *
 * Avalanche vs Snowball debt payoff simulator with interactive extra-payment
 * input, side-by-side strategy summary cards, and a Recharts line chart
 * comparing balance trajectories over time.
 *
 * Layout:
 *  1. Header + extra monthly payment input.
 *  2. Side-by-side summary cards: Avalanche | Snowball.
 *  3. Balance-over-time line chart (up to 60 months).
 *  4. Empty state when no debts are tracked.
 *
 * Complexity: chart data derivation is O(max(A, S)) where A and S are the
 * number of months in the avalanche and snowball schedules respectively.
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CreditCard, TrendingDown, Clock, DollarSign } from 'lucide-react';

import { GlassCard } from '@/core/components/GlassCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralInput } from '@/core/components/NeuralInput';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

import type { DebtItem } from '../services/ledger-intake-service';
import {
  computeDebtPayoffSchedule,
  type DebtPayoffResult,
} from '../services/ledger-aggregation-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebtStrategistProps {
  debtItems: DebtItem[];
  currency?: string;
  extraMonthlyPayment?: number;
  onExtraPaymentChange?: (amount: number) => void;
  /** When true, recommend the Snowball strategy (lower balance first) based on NSV stressLoad. */
  recommendSnowball?: boolean;
  /** FIX-P3: CRUD callbacks */
  onAddDebt?: (debt: Omit<DebtItem, 'id'>) => void;
  onUpdateDebt?: (id: string, updates: Partial<DebtItem>) => void;
  onDeleteDebt?: (id: string) => void;
}

/** Chart data point: one row per month with both strategy balances. */
interface ChartDataPoint {
  month: number;
  avalanche: number;
  snowball: number;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-black/80 border border-white/10 rounded-xl p-3 text-xs shadow-xl backdrop-blur-xl">
      <p className="text-white/60 mb-2 font-semibold">Month {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-white/80 capitalize">{entry.name}:</span>
          <span className="text-white font-bold">{formatCurrency(entry.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card sub-component
// ---------------------------------------------------------------------------

interface StrategySummaryCardProps {
  result: DebtPayoffResult;
  currency: string;
  isBetter: boolean;
}

/** Returns a human-readable debt-free date from monthsToPayoff. */
function getDebtFreeDate(monthsToPayoff: number): string | null {
  if (monthsToPayoff <= 0) return null;
  const target = new Date();
  target.setMonth(target.getMonth() + monthsToPayoff);
  return target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function StrategySummaryCard({ result, currency, isBetter }: StrategySummaryCardProps) {
  const isAvalanche = result.strategy === 'avalanche';
  const accentColor = isAvalanche ? 'cyan' : 'purple';

  const accentBorder = isAvalanche
    ? 'border-[var(--module-accent-border)]'
    : 'border-purple-500/30';
  const accentText = isAvalanche ? 'text-[var(--module-color-400)]' : 'text-purple-400';
  const accentBg = isAvalanche ? 'bg-[var(--module-accent-muted)]' : 'bg-purple-500/10';
  const glowColor = isAvalanche
    ? 'rgba(6,182,212,0.15)'
    : 'rgba(168,85,247,0.15)';

  const label = isAvalanche ? 'Avalanche' : 'Snowball';
  const tagline = isAvalanche
    ? 'Highest APR first — minimum interest paid'
    : 'Lowest balance first — psychological wins';

  return (
    <GlassCard
      className={cn('p-5 border', accentBorder, isBetter && 'ring-1 ring-offset-0', isAvalanche ? 'ring-[var(--module-accent-ring)]' : 'ring-purple-500/40')}
      glow={isBetter}
      glowColor={glowColor}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={cn('w-2.5 h-2.5 rounded-full', isAvalanche ? 'bg-[var(--module-color-400)]' : 'bg-purple-400')} />
            <h3 className={cn('text-sm font-bold uppercase tracking-widest', accentText)}>
              {label}
            </h3>
            {isBetter && (
              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', accentBg, accentText)}>
                Recommended
              </span>
            )}
          </div>
          <p className="text-white/40 text-xs leading-relaxed">{tagline}</p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="space-y-3">
        {/* Months to payoff */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>Time to payoff</span>
          </div>
          <span className="text-white font-bold text-sm">
            {result.monthsToPayoff === 0
              ? '—'
              : result.monthsToPayoff < 12
                ? `${result.monthsToPayoff}mo`
                : `${Math.floor(result.monthsToPayoff / 12)}y ${result.monthsToPayoff % 12}mo`}
          </span>
        </div>

        {/* Debt-free date */}
        {result.monthsToPayoff > 0 && (() => {
          const debtFreeDate = getDebtFreeDate(result.monthsToPayoff);
          return debtFreeDate ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/50 text-xs">
                <Clock className="w-3.5 h-3.5 opacity-0" />
                <span>Debt-free by</span>
              </div>
              <span className={cn('font-semibold text-xs', isAvalanche ? 'text-[var(--module-color-300)]' : 'text-purple-300')}>
                {debtFreeDate}
              </span>
            </div>
          ) : null;
        })()}

        {/* Total interest paid */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Total interest</span>
          </div>
          <span className="text-white font-bold text-sm">
            {formatCurrency(result.totalInterestPaid, currency)}
          </span>
        </div>

        {/* Interest saved vs minimums */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Saved vs minimums</span>
          </div>
          <span
            className={cn(
              'font-bold text-sm',
              result.interestSavedVsMinimum > 0 ? 'text-emerald-400' : 'text-white/60',
            )}
          >
            {result.interestSavedVsMinimum > 0
              ? `+${formatCurrency(result.interestSavedVsMinimum, currency)}`
              : formatCurrency(0, currency)}
          </span>
        </div>
      </div>

      {/* Colour bar accent */}
      <div className={cn('mt-4 h-0.5 w-full rounded-full', isAvalanche ? 'bg-[var(--module-accent-border)]' : 'bg-purple-500/30')} />
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * DebtStrategist renders an interactive debt payoff comparison between the
 * Avalanche (highest APR first) and Snowball (lowest balance first) strategies.
 *
 * It is intentionally stateless with respect to debt data — callers supply
 * `debtItems` and the component purely derives the schedule via
 * `computeDebtPayoffSchedule`, which is pure/side-effect-free.
 */
export function DebtStrategist({
  debtItems,
  currency = 'USD',
  extraMonthlyPayment: controlledExtra,
  onExtraPaymentChange,
  recommendSnowball = false,
  onAddDebt,
  onUpdateDebt: _onUpdateDebt,
  onDeleteDebt,
}: DebtStrategistProps) {
  // Semi-controlled: internal state seeded from prop; reports changes upward.
  const [internalExtra, setInternalExtra] = useState<number>(controlledExtra ?? 0);
  const extra = controlledExtra ?? internalExtra;

  function handleExtraChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseFloat(e.target.value);
    const sanitized = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    setInternalExtra(sanitized);
    onExtraPaymentChange?.(sanitized);
  }

  // Empty state — render early before any heavy computation.
  if (debtItems.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No debts tracked yet"
        description="Add debt items in your financial profile to simulate payoff strategies and see how much interest you can save."
        size="lg"
        className="min-h-[400px] justify-center rounded-xl"
      />
    );
  }

  // Derive payoff schedules. Memoised so we only recompute when inputs change.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const avalancheResult = useMemo(
    () => computeDebtPayoffSchedule(debtItems, 'avalanche', extra),
    [debtItems, extra],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const snowballResult = useMemo(
    () => computeDebtPayoffSchedule(debtItems, 'snowball', extra),
    [debtItems, extra],
  );

  // Determine which strategy to highlight as "Recommended".
  // Avalanche is mathematically optimal (less interest), but when the user's
  // stress load is high, Snowball provides quicker psychological wins.
  // `recommendSnowball` is set by the caller based on NSV stressLoad > 7.
  const avalancheBetter = recommendSnowball
    ? false
    : avalancheResult.totalInterestPaid <= snowballResult.totalInterestPaid;

  // Build merged chart data: one row per month, both balances present.
  // Cap at 60 months for readability; if both strategies finish earlier, use that.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const maxMonths = Math.min(
      60,
      Math.max(avalancheResult.monthsToPayoff, snowballResult.monthsToPayoff),
    );
    if (maxMonths === 0) return [];

    return Array.from({ length: maxMonths }, (_, i) => {
      const month = i + 1;
      const av = avalancheResult.months[i];
      const sw = snowballResult.months[i];
      return {
        month,
        avalanche: av?.totalBalance ?? 0,
        snowball: sw?.totalBalance ?? 0,
      };
    });
  }, [avalancheResult, snowballResult]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-white font-bold text-lg tracking-tight">Debt Payoff Strategist</h2>
          <p className="text-white/40 text-xs mt-0.5">
            Compare avalanche vs snowball payoff strategies for your debts
          </p>
          {recommendSnowball && (
            <p className="text-amber-400/80 text-[11px] mt-1">
              ⚡ High stress detected — Snowball wins recommended for quicker psychological relief
            </p>
          )}
        </div>

        {/* Extra monthly payment input */}
        <div className="w-full sm:w-56">
          <NeuralInput
            label="Extra monthly payment"
            type="number"
            min={0}
            step={10}
            value={extra === 0 ? '' : extra}
            placeholder="0"
            onChange={handleExtraChange}
            icon={<DollarSign className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* ── Strategy summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StrategySummaryCard
          result={avalancheResult}
          currency={currency}
          isBetter={avalancheBetter}
        />
        <StrategySummaryCard
          result={snowballResult}
          currency={currency}
          isBetter={!avalancheBetter}
        />
      </div>

      {/* ── Balance over time chart ── */}
      {chartData.length > 0 && (
        <GlassCard className="p-5">
          <div className="mb-4">
            <h3 className="text-white/80 text-sm font-semibold">Balance Over Time</h3>
            <p className="text-white/40 text-xs mt-0.5">
              Remaining total balance each month under each strategy
              {chartData.length < Math.max(avalancheResult.monthsToPayoff, snowballResult.monthsToPayoff)
                ? ' (first 60 months shown)'
                : ''}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                label={{
                  value: 'Month',
                  position: 'insideBottomRight',
                  offset: -4,
                  fill: 'rgba(255,255,255,0.3)',
                  fontSize: 10,
                }}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${formatCurrency(v / 1000, currency).replace(/\.00$/, '')}k` : formatCurrency(v, currency)
                }
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                content={<CustomTooltip currency={currency} />}
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}
                formatter={(value: string) => (
                  <span style={{ color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize', fontSize: '11px' }}>
                    {value}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="avalanche"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                name="avalanche"
              />
              <Line
                type="monotone"
                dataKey="snowball"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }}
                name="snowball"
              />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>
      )}

      {/* ── Debt list context ── */}
      <GlassCard className="p-5">
        <h3 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-3">
          Debts included ({debtItems.filter(d => d.balance > 0).length})
        </h3>
        <div className="space-y-2">
          {debtItems
            .filter((d) => d.balance > 0)
            .sort((a, b) => b.apr - a.apr)
            .map((debt) => (
              <motion.div
                key={debt.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: debtItems.filter(d => d.balance > 0).sort((a, b) => b.apr - a.apr).indexOf(debt) * 0.04, duration: 0.2 }}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--module-color-400)] flex-shrink-0" />
                  <span className="text-white/80 text-sm truncate">{debt.name}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <span className="text-white/40 text-xs">{debt.apr.toFixed(1)}% APR</span>
                  <span className="text-white text-sm font-semibold tabular-nums">
                    {formatCurrency(debt.balance, currency)}
                  </span>
                </div>
              </motion.div>
            ))}
        </div>
      </GlassCard>
    </div>
  );
}
