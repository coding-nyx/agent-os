/**
 * CashFlowForecast.tsx
 *
 * Visualises a rolling cash-flow projection for the personal-finance ledger.
 * Responsibilities (single per section):
 *   1. Horizon selector — drives onRegenerateForecast
 *   2. KPI summary cards — starting balance, end balance, lowest point
 *   3. Recharts area chart — running balance over time
 *   4. Monthly summary table — income / expenses / net per calendar month
 *   5. What-if panel — client-side rule exclusion with live preview
 *   6. Empty / loading states
 *
 * All business logic lives in the aggregation layer; this component is
 * purely presentation + local UI state.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { BarChart3, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';

import type {
  CashFlowForecast as CashFlowForecastData,
  CashFlowEvent,
  RecurringRule,
} from '../services/ledger-intake-service';
import {
  computeCashFlowForecast,
  summarizeForecastByMonth,
} from '../services/aggregation/forecast-aggregation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Horizon = 30 | 60 | 90;

interface CashFlowForecastProps {
  forecast: CashFlowForecastData | null;
  recurringRules: RecurringRule[];
  startingBalance: number;
  currency?: string;
  onRegenerateForecast: (horizon: Horizon) => void;
  disabled?: boolean;
}

// Chart datum produced from CashFlowForecastDay
interface ChartDatum {
  date: string;
  balance: number;
  events: CashFlowEvent[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Compact dollar formatter — keeps axis labels tight.
 * e.g. 12500 → "$12.5k", -3000 → "-$3k", 500 → "$500"
 */
function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Full currency formatter for cards and tooltips.
 */
function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Short date for tooltip header  — "Jun 12"
 */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ── Horizon Pill ──────────────────────────────────────────────────────────────

interface HorizonPillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function HorizonPill({ label, active, disabled, onClick }: HorizonPillProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-3 py-1 rounded-full text-sm font-medium transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
        active
          ? 'bg-[var(--module-accent)] text-white'
          : 'bg-white/5 text-white/60 hover:bg-white/10',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  subLabel?: string;
  colorClass?: string; // Tailwind text colour class
}

function SummaryCard({ label, value, subLabel, colorClass = 'text-white' }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex-1 min-w-0">
      <span className="text-xs text-white/60 uppercase tracking-wide truncate">{label}</span>
      <span className={`text-lg font-semibold leading-tight truncate ${colorClass}`}>{value}</span>
      {subLabel && <span className="text-xs text-white/40 truncate">{subLabel}</span>}
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDatum }>;
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const datum = payload[0].payload;
  const balance = payload[0].value;

  return (
    <div className="rounded-xl bg-gray-900/90 border border-white/10 p-3 shadow-xl backdrop-blur-sm min-w-[180px] max-w-[260px]">
      <p className="text-xs text-white/60 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white mb-2">
        {formatCurrency(balance, currency)}
      </p>
      {datum.events.length > 0 && (
        <ul className="space-y-1">
          {datum.events.map((ev, idx) => (
            <li key={idx} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-white/70 truncate">{ev.label}</span>
              <span
                className={`font-medium shrink-0 ${
                  ev.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {ev.type === 'income' ? '+' : '-'}
                {formatCurrency(Math.abs(ev.amount), currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Monthly Summary Table ─────────────────────────────────────────────────────

interface MonthlyTableProps {
  forecast: CashFlowForecastData;
  currency: string;
}

function MonthlyTable({ forecast, currency }: MonthlyTableProps) {
  const months = useMemo(() => summarizeForecastByMonth(forecast), [forecast]);

  if (!months.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            {['Month', 'Income', 'Expenses', 'Net'].map((col) => (
              <th
                key={col}
                className={`pb-2 font-medium text-white/50 ${
                  col === 'Month' ? 'text-left' : 'text-right'
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              <td className="py-2 text-white/80">{m.label}</td>
              <td className="py-2 text-right text-emerald-400">
                {formatCurrency(m.totalIncome, currency)}
              </td>
              <td className="py-2 text-right text-rose-400">
                {formatCurrency(m.totalExpenses, currency)}
              </td>
              <td
                className={`py-2 text-right font-medium ${
                  m.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {m.net >= 0 ? '+' : ''}
                {formatCurrency(m.net, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── What-If Panel ─────────────────────────────────────────────────────────────

interface WhatIfPanelProps {
  recurringRules: RecurringRule[];
  startingBalance: number;
  horizon: Horizon;
  currency: string;
  baseEndBalance: number;
}

function WhatIfPanel({
  recurringRules,
  startingBalance,
  horizon,
  currency,
  baseEndBalance,
}: WhatIfPanelProps) {
  // Track which rule IDs are excluded from the what-if simulation
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const activeRules = useMemo(
    () => recurringRules.filter((r) => r.isActive),
    [recurringRules],
  );

  // Recompute forecast locally when exclusion set changes — O(n·h) where n=rules, h=horizon days
  const previewEndBalance = useMemo(() => {
    if (excluded.size === 0) return baseEndBalance;
    const filteredRules = activeRules.filter((r) => !excluded.has(r.id));
    try {
      const preview = computeCashFlowForecast(filteredRules, startingBalance, horizon);
      return preview.endBalance;
    } catch {
      return baseEndBalance;
    }
  }, [excluded, activeRules, startingBalance, horizon, baseEndBalance]);

  const delta = previewEndBalance - baseEndBalance;

  const toggleRule = useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {/* Live preview badge */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-white/50">
          Uncheck rules to see their impact on the end balance.
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Preview end balance:</span>
          <span
            className={`text-sm font-semibold ${
              previewEndBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(previewEndBalance, currency)}
          </span>
          {excluded.size > 0 && (
            <span
              className={`text-xs font-medium ${
                delta > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              ({delta >= 0 ? '+' : ''}
              {formatCurrency(delta, currency)})
            </span>
          )}
        </div>
      </div>

      {/* Rule checklist */}
      <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {activeRules.map((rule) => {
          const isExcluded = excluded.has(rule.id);
          return (
            <li key={rule.id}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => toggleRule(rule.id)}
                  className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-cyan-400 cursor-pointer"
                />
                <span
                  className={`text-xs flex-1 truncate transition-colors ${
                    isExcluded ? 'text-white/30 line-through' : 'text-white/70 group-hover:text-white/90'
                  }`}
                >
                  {(rule as { description?: string }).description ?? rule.id}
                </span>
                <span
                  className={`text-xs font-medium shrink-0 ${
                    rule.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {rule.type === 'income' ? '+' : '-'}
                  {formatCurrency(Math.abs(rule.amount), currency)}
                </span>
              </label>
            </li>
          );
        })}
        {activeRules.length === 0 && (
          <li className="text-xs text-white/40 py-2 text-center">No active recurring rules.</li>
        )}
      </ul>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  hasRules: boolean;
  onGenerate: () => void;
  disabled?: boolean;
}

function EmptyState({ hasRules, onGenerate, disabled }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
        <BarChart3 className="w-7 h-7 text-white/30" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-white/70">No forecast yet</p>
        <p className="text-xs text-white/40 max-w-xs">
          {hasRules
            ? 'Generate a forecast to visualise your projected cash flow.'
            : 'Add recurring rules to generate a cash flow forecast.'}
        </p>
      </div>
      {hasRules && (
        <NeuralButton
          onClick={onGenerate}
          disabled={disabled}
          size="sm"
          variant="primary"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Generate Forecast
        </NeuralButton>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CashFlowForecast({
  forecast,
  recurringRules,
  startingBalance,
  currency = 'USD',
  onRegenerateForecast,
  disabled = false,
}: CashFlowForecastProps) {
  // ── Local state ────────────────────────────────────────────────────────────
  const [horizon, setHorizon] = useState<Horizon>(forecast?.horizon ?? 30);
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  const hasRules = recurringRules.some((r) => r.isActive);

  // ── Horizon change ─────────────────────────────────────────────────────────
  const handleHorizonChange = useCallback(
    (h: Horizon) => {
      setHorizon(h);
      onRegenerateForecast(h);
    },
    [onRegenerateForecast],
  );

  // ── Chart data preparation ─────────────────────────────────────────────────
  // For 60d/90d we sample every other day to keep the chart readable.
  // Complexity: O(n) where n = forecast.days.length (max 90)
  const chartData: ChartDatum[] = useMemo(() => {
    if (!forecast) return [];
    return (forecast.days ?? [])
      .filter((_, i) => forecast.horizon === 30 ? true : i % 2 === 0)
      .map((d) => ({
        date: new Date(d.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        balance: d.runningBalance,
        events: d.events,
      }));
  }, [forecast]);

  // ── X-axis tick interval ───────────────────────────────────────────────────
  // Show a label every 7 days for 30d, every 14 days for 60/90d
  const xTickInterval = horizon === 30 ? 6 : 13; // 0-based index gaps

  // ── Summary card values ────────────────────────────────────────────────────
  const endBalance = forecast?.endBalance ?? startingBalance;
  const lowestBalance = forecast?.lowestPoint.balance ?? startingBalance;
  const lowestDate = forecast?.lowestPoint.date
    ? formatShortDate(forecast.lowestPoint.date)
    : '—';

  const endBalanceColor =
    endBalance > startingBalance
      ? 'text-emerald-400'
      : endBalance < startingBalance
      ? 'text-rose-400'
      : 'text-white';

  const lowestBalanceColor =
    lowestBalance < 0
      ? 'text-rose-400'
      : lowestBalance < startingBalance * 0.2
      ? 'text-amber-400'
      : 'text-white';

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!forecast && !hasRules) {
    return (
      <SurfaceCard>
        <EmptyState hasRules={false} onGenerate={() => handleHorizonChange(horizon)} disabled={disabled} />
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard>
      <div className="space-y-5">
        {/* ── Header row ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-white/90">Cash Flow Forecast</h3>

          <div className="flex items-center gap-1.5">
            {([30, 60, 90] as Horizon[]).map((h) => (
              <HorizonPill
                key={h}
                label={`${h}d`}
                active={horizon === h}
                disabled={disabled}
                onClick={() => handleHorizonChange(h)}
              />
            ))}
          </div>
        </div>

        {/* ── Empty state when rules exist but no forecast ───────────────────── */}
        {!forecast ? (
          <EmptyState
            hasRules={hasRules}
            onGenerate={() => handleHorizonChange(horizon)}
            disabled={disabled}
          />
        ) : (
          <>
            {/* ── Summary cards ────────────────────────────────────────────── */}
            <div className="flex gap-3 flex-wrap sm:flex-nowrap">
              <SummaryCard
                label="Starting Balance"
                value={formatCurrency(startingBalance, currency)}
              />
              <SummaryCard
                label="Projected End Balance"
                value={formatCurrency(endBalance, currency)}
                colorClass={endBalanceColor}
                subLabel={`in ${horizon} days`}
              />
              <SummaryCard
                label="Lowest Point"
                value={formatCurrency(lowestBalance, currency)}
                colorClass={lowestBalanceColor}
                subLabel={lowestDate}
              />
            </div>

            {/* ── Area chart ───────────────────────────────────────────────── */}
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={xTickInterval}
                  />

                  <YAxis
                    tickFormatter={formatCompact}
                    tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />

                  <Tooltip
                    content={<CustomTooltip currency={currency} />}
                    cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
                  />

                  {/* Zero-balance danger line */}
                  <ReferenceLine
                    y={0}
                    stroke="rgba(239,68,68,0.4)"
                    strokeDasharray="4 4"
                  />

                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#cashFlowGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Monthly summary table ─────────────────────────────────────── */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
                Monthly Summary
              </p>
              <MonthlyTable forecast={forecast} currency={currency} />
            </div>

            {/* ── What-if panel ─────────────────────────────────────────────── */}
            <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
              <button
                onClick={() => setWhatIfOpen((o) => !o)}
                className={[
                  'w-full flex items-center justify-between px-4 py-3',
                  'text-xs font-medium text-white/60 hover:text-white/90',
                  'transition-colors duration-150 focus:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400',
                ].join(' ')}
                aria-expanded={whatIfOpen}
              >
                <span>What-if Scenarios</span>
                {whatIfOpen ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {whatIfOpen && (
                <div className="px-4 pb-4 border-t border-white/10 pt-3">
                  <WhatIfPanel
                    recurringRules={recurringRules}
                    startingBalance={startingBalance}
                    horizon={horizon}
                    currency={currency}
                    baseEndBalance={endBalance}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SurfaceCard>
  );
}
