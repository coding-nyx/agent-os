/**
 * SpendingTrendsChart.tsx
 *
 * Stacked bar chart showing per-category expense spend across the last 6
 * calendar months.  Data is derived entirely from `computeCategoryTrends` —
 * no hardcoded values, no Math.random().
 *
 * Architecture
 * ------------
 * - Pure presentational component; all aggregation lives in the service layer.
 * - Recharts `BarChart` with `stackId="a"` on every `Bar` for true stacking.
 * - A 6-color rotating palette ensures visual distinctiveness up to 6 categories.
 * - Empty state (zero spend) renders the shared `EmptyState` shell instead of
 *   an empty chart frame.
 *
 * Complexity: O(n) — driven entirely by `computeCategoryTrends` inside the
 * single `useMemo` hook.
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import type { Transaction } from '../services/ledger-intake-service';
import { computeCategoryTrends } from '../services/ledger-aggregation-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fixed 6-color palette for category bars.  Colours are cycled via modulo so
 * the chart remains functional even when topN is set higher than 6.
 */
const CATEGORY_COLORS = [
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#6b7280', // gray-500
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpendingTrendsChartProps {
  transactions: Transaction[];
  currency?: string;
}

// ---------------------------------------------------------------------------
// Tooltip formatter helpers
// ---------------------------------------------------------------------------

/**
 * Formats a raw Recharts tooltip value as a localised currency string.
 * The parameter is typed as `unknown` to satisfy Recharts v3's `Formatter`
 * contract, which passes `ValueType | undefined` (where ValueType includes
 * arrays and undefined).  Returning a plain `ReactNode` (string) is valid —
 * Recharts uses it as the display value and keeps the series name unchanged.
 */
function makeTooltipFormatter(currency: string) {
  return (value: unknown): string => {
    if (typeof value === 'number') return formatCurrency(value, currency);
    return String(value ?? '');
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpendingTrendsChart({
  transactions,
  currency = 'USD',
}: SpendingTrendsChartProps) {
  // O(n + k log k) — see computeCategoryTrends for full analysis.
  const { data, categories } = useMemo(
    () => computeCategoryTrends(transactions),
    [transactions],
  );

  /**
   * Empty when either no categories were found (no expense transactions in the
   * window) or every category's total across all months is zero.
   */
  const isEmpty =
    categories.length === 0 ||
    data.every((row) => categories.every((cat) => (row[cat] as number) === 0));

  const tooltipFormatter = useMemo(() => makeTooltipFormatter(currency), [currency]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Spending by Category
          </h3>
          <p className="text-[10px] text-white/50 mt-1">Last 6 months</p>
        </div>
        <BarChart2 className="w-5 h-5 text-cyan-400" />
      </div>

      {/* Body */}
      {isEmpty ? (
        <EmptyState
          title="No spending data yet"
          description="Add transactions to see trends."
          size="sm"
          className="bg-transparent border-white/10"
        />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
            barCategoryGap="25%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: unknown) =>
                typeof value === 'number' ? formatCurrency(value, currency) : String(value)
              }
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              width={72}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15, 15, 25, 0.95)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{
                color: 'rgba(255,255,255,0.8)',
                fontWeight: 'bold',
                marginBottom: 4,
              }}
              itemStyle={{ color: 'rgba(255,255,255,0.7)' }}
              formatter={tooltipFormatter}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.6)',
                paddingTop: '8px',
              }}
            />
            {categories.map((cat, index) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
