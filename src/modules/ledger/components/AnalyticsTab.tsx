/**
 * AnalyticsTab.tsx
 *
 * Dedicated financial analytics view for the Ledger module.
 *
 * Sections:
 *  1. Financial Health Score — composite 0–100 score with grade
 *  2. Category Breakdown — donut + ranked list with month selector
 *  3. Month-over-Month — income/expense deltas vs previous month
 *  4. Savings Rate Trend — rolling 6-month savings rate bars
 *  5. Budget Performance — allocated vs actual per category
 *  6. Top Merchants — most frequent expense sources
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
  Target,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import {
  computeMonthlyTotals,
  computeCategorySpend,
  computeBudgetActuals,
  computeDashboardMetrics,
} from '../services/ledger-aggregation-service';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';

interface AnalyticsTabProps {
  profile: LedgerIntakeProfile;
  onAskAI?: (question: string) => void;
}

// ---------------------------------------------------------------------------
// Financial Health Score (0–100)
// ---------------------------------------------------------------------------

function computeFinancialHealthScore(profile: LedgerIntakeProfile): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: { label: string; score: number; max: number; status: 'good' | 'ok' | 'bad' }[];
} {
  const txs = profile.transactions ?? [];
  const metrics = computeDashboardMetrics(txs, (profile.debtItems ?? []).reduce((s, d) => s + d.balance, 0));

  // 1. Savings rate (0–30 pts)
  const savingsRate = metrics.savingsRate ?? 0;
  const savingsScore = Math.min(30, Math.round(savingsRate * 30));

  // 2. Budget adherence (0–25 pts)
  const actuals = computeBudgetActuals(txs, profile.budgetCategories ?? []);
  const overBudget = actuals.filter(a => a.status === 'over').length;
  const totalBudgets = Math.max(actuals.length, 1);
  const budgetScore = Math.round(25 * (1 - overBudget / totalBudgets));

  // 3. Goal progress (0–20 pts)
  const goals = profile.financialGoals ?? [];
  const avgGoalProgress = goals.length === 0 ? 0.5
    : goals.reduce((sum, g) => sum + Math.min(1, g.currentAmount / Math.max(g.targetAmount, 1)), 0) / goals.length;
  const goalScore = Math.round(20 * avgGoalProgress);

  // 4. Debt-to-income (0–15 pts)
  const totalDebt = (profile.debtItems ?? []).reduce((s, d) => s + d.balance, 0);
  const monthlyIncome = metrics.currentMonthIncome || profile.monthlyIncome || 1;
  const dti = totalDebt / (monthlyIncome * 12);
  const debtScore = dti === 0 ? 15 : Math.max(0, Math.round(15 * (1 - Math.min(1, dti / 2))));

  // 5. Cash flow stability (0–10 pts)
  const monthTotals = computeMonthlyTotals(txs, 3);
  const negativeMonths = monthTotals.filter(m => m.net < 0).length;
  const cashFlowScore = Math.round(10 * (1 - negativeMonths / 3));

  const total = savingsScore + budgetScore + goalScore + debtScore + cashFlowScore;
  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';

  return {
    score: total,
    grade,
    factors: [
      { label: 'Savings Rate', score: savingsScore, max: 30, status: savingsScore >= 20 ? 'good' : savingsScore >= 10 ? 'ok' : 'bad' },
      { label: 'Budget Adherence', score: budgetScore, max: 25, status: budgetScore >= 18 ? 'good' : budgetScore >= 10 ? 'ok' : 'bad' },
      { label: 'Goal Progress', score: goalScore, max: 20, status: goalScore >= 14 ? 'good' : goalScore >= 7 ? 'ok' : 'bad' },
      { label: 'Debt-to-Income', score: debtScore, max: 15, status: debtScore >= 12 ? 'good' : debtScore >= 6 ? 'ok' : 'bad' },
      { label: 'Cash Flow', score: cashFlowScore, max: 10, status: cashFlowScore >= 8 ? 'good' : cashFlowScore >= 5 ? 'ok' : 'bad' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Category Donut (pure SVG, no external lib dependency)
// ---------------------------------------------------------------------------

const CATEGORY_COLORS = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#f97316', '#84cc16', '#a78bfa',
];

function DonutChart({ slices }: { slices: { value: number; color: string; label: string }[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <div className="w-36 h-36 rounded-full bg-white/5 border border-white/10 mx-auto" />;

  const size = 144;
  const r = 52;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let cumulativePercent = 0;
  const paths = slices.map((sl, i) => {
    const percent = sl.value / total;
    const startAngle = cumulativePercent * 360 - 90;
    const endAngle = (cumulativePercent + percent) * 360 - 90;
    cumulativePercent += percent;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = percent > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return <path key={i} d={d} fill={sl.color} opacity={0.85} />;
  });

  return (
    <svg width={size} height={size} className="mx-auto">
      <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={28} />
      {paths}
      <circle cx={cx} cy={cy} r={r - 14} fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Month Selector
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = [0, 1, 2].map(n => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { label, value };
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AnalyticsTab({ profile, onAskAI }: AnalyticsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);

  const txs = useMemo(() => profile.transactions ?? [], [profile.transactions]);
  const currency = profile.currency || 'USD';

  const healthScore = useMemo(() => computeFinancialHealthScore(profile), [profile]);

  const [year, month] = selectedMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const periodBounds = useMemo(() => ({
    start: `${selectedMonth}-01`,
    end: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
  }), [selectedMonth, lastDay]);

  const categorySpend = useMemo(
    () => computeCategorySpend(txs, periodBounds),
    [txs, periodBounds]
  );

  const monthTotals = useMemo(() => computeMonthlyTotals(txs, 6), [txs]);
  const currentMonthData = useMemo(() => monthTotals[monthTotals.length - 1], [monthTotals]);
  const previousMonthData = useMemo(() => monthTotals[monthTotals.length - 2], [monthTotals]);

  const budgetPerformance = useMemo(
    () => computeBudgetActuals(txs, profile.budgetCategories ?? [], periodBounds),
    [txs, profile.budgetCategories, periodBounds]
  );

  const savingsRates = useMemo(
    () => monthTotals.map(m => ({
      label: m.label,
      rate: m.income > 0 ? Math.max(0, (m.net / m.income) * 100) : 0,
      net: m.net,
    })),
    [monthTotals]
  );

  const donutSlices = useMemo(
    () => categorySpend.slice(0, 8).map((c, i) => ({
      value: c.amount,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      label: c.category,
    })),
    [categorySpend]
  );

  const incomeChange = previousMonthData?.income
    ? ((currentMonthData?.income - previousMonthData.income) / previousMonthData.income) * 100
    : 0;
  const expenseChange = previousMonthData?.expenses
    ? ((currentMonthData?.expenses - previousMonthData.expenses) / previousMonthData.expenses) * 100
    : 0;

  const gradeColor = {
    A: 'text-emerald-400', B: 'text-[var(--module-color-400)]', C: 'text-amber-400', D: 'text-orange-400', F: 'text-rose-400'
  }[healthScore.grade];

  const gradeRingColor = {
    A: '#10b981', B: '#06b6d4', C: '#f59e0b', D: '#f97316', F: '#ef4444'
  }[healthScore.grade];

  const hasTransactions = txs.length > 0;

  if (!hasTransactions) {
    return (
      <div className="p-4 md:p-8">
        <EmptyState
          title="No transaction data yet"
          description="Log some transactions to see financial analytics and insights."
          icon={BarChart3}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">

      {/* Row 1: Health Score + Month-over-Month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Financial Health Score */}
        <SurfaceCard className="p-6">
          <div className="flex items-start gap-4">
            {/* Score ring */}
            <div className="relative shrink-0">
              <svg width={80} height={80}>
                <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
                <circle
                  cx={40} cy={40} r={32}
                  fill="none"
                  stroke={gradeRingColor}
                  strokeWidth={8}
                  strokeDasharray={`${(healthScore.score / 100) * 201} 201`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn('text-xl font-black', gradeColor)}>{healthScore.grade}</span>
                <span className="text-[9px] text-white/40">{healthScore.score}</span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white uppercase tracking-wider mb-3">Financial Health</p>
              <div className="space-y-1.5">
                {healthScore.factors.map(f => (
                  <div key={f.label} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-white/50">{f.label}</span>
                        <span className="text-[10px] font-mono text-white/60">{f.score}/{f.max}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', {
                            'bg-emerald-500': f.status === 'good',
                            'bg-amber-500': f.status === 'ok',
                            'bg-rose-500': f.status === 'bad',
                          })}
                          style={{ width: `${(f.score / f.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {onAskAI && (
            <button
              onClick={() => onAskAI('Analyze my financial health score and give me specific actions to improve it')}
              className="mt-4 w-full text-[11px] text-[var(--module-color-400)] hover:text-[var(--module-color-300)] font-semibold text-left transition-colors flex items-center gap-1 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
            >
              <Activity className="w-3 h-3" /> Ask AI for improvement plan →
            </button>
          )}
        </SurfaceCard>

        {/* Month-over-Month */}
        <SurfaceCard className="p-6 space-y-4">
          <p className="text-xs font-bold text-white uppercase tracking-wider">Month-over-Month</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Income</p>
              <p className="text-lg font-black text-white tabular-nums">
                {formatCurrency(currentMonthData?.income ?? 0, currency)}
              </p>
              <div className={cn('flex items-center gap-1 text-xs font-bold', incomeChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {incomeChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(incomeChange).toFixed(1)}% vs prev
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Expenses</p>
              <p className="text-lg font-black text-white tabular-nums">
                {formatCurrency(currentMonthData?.expenses ?? 0, currency)}
              </p>
              <div className={cn('flex items-center gap-1 text-xs font-bold', expenseChange <= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {expenseChange <= 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {Math.abs(expenseChange).toFixed(1)}% vs prev
              </div>
            </div>
          </div>

          {/* 6-month savings rate bars */}
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Savings Rate (6 months)</p>
            <div className="flex items-end gap-1 h-16">
              {savingsRates.map((m, i) => {
                const isLast = i === savingsRates.length - 1;
                const barHeight = Math.max(4, (m.rate / 100) * 64);
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                      <div
                        className={cn('w-full rounded-t-sm transition-all', isLast ? 'bg-[var(--module-accent)]' : 'bg-white/20')}
                        style={{ height: barHeight }}
                        title={`${m.label}: ${m.rate.toFixed(1)}%`}
                      />
                    </div>
                    <span className="text-[9px] text-white/30">{m.label.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* Row 2: Category Breakdown */}
      <SurfaceCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-white uppercase tracking-wider">Spending by Category</p>
          <div className="flex gap-1">
            {MONTH_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedMonth(opt.value)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]',
                  selectedMonth === opt.value
                    ? 'bg-[var(--module-accent)] text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                )}
                aria-pressed={selectedMonth === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {categorySpend.length === 0 ? (
          <EmptyState
            title="No expenses this period"
            description="Add expense transactions to see category breakdown."
            icon={BarChart3}
            size="sm"
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="flex flex-col md:flex-row items-start gap-6">
            <DonutChart slices={donutSlices} />
            <div className="flex-1 space-y-2 w-full">
              {categorySpend.slice(0, 8).map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-white/80 truncate">{cat.category}</span>
                      <span className="text-xs font-mono font-bold text-white/70 ml-2 shrink-0">
                        {formatCurrency(cat.amount, currency)}
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${cat.percentOfTotal}%`,
                          backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-white/40 shrink-0 w-8 text-right">
                    {cat.percentOfTotal.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SurfaceCard>

      {/* Row 3: Budget Performance */}
      {budgetPerformance.length > 0 && (
        <SurfaceCard className="p-6">
          <p className="text-xs font-bold text-white uppercase tracking-wider mb-4">Budget vs Actuals</p>
          <div className="space-y-3">
            {budgetPerformance.map(bp => {
              const utilizationPct = bp.allocated > 0 ? Math.min(150, (bp.actual / bp.allocated) * 100) : 0;
              const statusColor = {
                under: 'bg-emerald-500/50',
                on_track: 'bg-[var(--module-accent)]',
                warning: 'bg-amber-500/60',
                over: 'bg-rose-500/70',
              }[bp.status];
              const badgeColor = {
                under: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                on_track: 'text-[var(--module-color-400)] bg-[var(--module-accent-muted)] border-[var(--module-accent-border)]',
                warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                over: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
              }[bp.status];

              return (
                <div key={bp.categoryId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white/80">{bp.categoryName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50 tabular-nums">
                        {formatCurrency(bp.actual, currency)} / {formatCurrency(bp.allocated, currency)}
                      </span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', badgeColor)}>
                        {bp.status === 'under' ? 'Under' : bp.status === 'on_track' ? 'On track' : bp.status === 'warning' ? 'Warning' : 'Over'}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', statusColor)}
                      style={{ width: `${utilizationPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {onAskAI && budgetPerformance.some(bp => bp.status === 'over') && (
            <button
              onClick={() => onAskAI('Which budget categories am I overspending on and how can I reduce them?')}
              className="mt-4 text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
            >
              <AlertTriangle className="w-3 h-3" /> Get AI advice on overspend →
            </button>
          )}
        </SurfaceCard>
      )}

      {/* Row 4: Top transactions list this month */}
      <SurfaceCard className="p-6">
        <p className="text-xs font-bold text-white uppercase tracking-wider mb-4">Largest Expenses This Month</p>
        {(() => {
          const [y, m] = selectedMonth.split('-').map(Number);
          const topExpenses = txs
            .filter(tx => tx.type === 'expense' && tx.date.startsWith(selectedMonth))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8);

          return topExpenses.length === 0 ? (
            <EmptyState
              title="No expenses this month"
              description="Log expenses to see your top spends."
              icon={DollarSign}
              size="sm"
              className="bg-transparent border-white/10"
            />
          ) : (
            <div className="space-y-2">
              {topExpenses.map((tx, i) => (
                <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors">
                  <span className="text-[10px] font-mono text-white/30 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 truncate">{tx.description}</p>
                    <p className="text-[10px] text-white/40">{tx.category} · {tx.date}</p>
                  </div>
                  <span className="text-sm font-bold text-rose-400 tabular-nums shrink-0">
                    {formatCurrency(tx.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </SurfaceCard>
    </div>
  );
}
