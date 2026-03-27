import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { AlertTriangle, CreditCard, Lock, Upload, TrendingUp, Target, PieChart as PieChartIcon, Activity, FileText, Info, Zap, ArrowUpRight, ArrowDownRight, ShieldCheck } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import type { SpineEvent } from '@/lib/types';
import type { GlobalProjection } from '@/lib/types';
import { EVENT_DISPLAY_NAMES } from '@/lib/state-display-config';
import { LedgerIntakeProfile } from '../services/ledger-intake-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { ProgressRow } from '@/core/components/ProgressRow';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';
import { CashFlowChart, DebtPayoffTracker } from './FinancialCharts';
import { SpendingTrendsChart } from './SpendingTrendsChart';
import { computeDashboardMetrics, computeMonthlyTotals, computeBudgetActuals, computeRunwayProjection, evaluateAlerts } from '../services/aggregation';
import type { LedgerAlert } from '../services/aggregation';
import { AIFinancialAdvisor } from './AIFinancialAdvisor';
import { cn } from '@/lib/utils';

export function LedgerDashboard({
  soul,
  profile,
  onAnalyzeDocument,
  onToggleDocumentAnalysis,
  onAskAI,
  isLocked = false,
  recentEvents = []
}: {
  soul: GlobalProjection | null;
  profile: LedgerIntakeProfile | null;
  onAnalyzeDocument?: () => void;
  onToggleDocumentAnalysis?: (enabled: boolean) => void;
  onAskAI?: (question: string) => void;
  isLocked?: boolean;
  recentEvents?: SpineEvent[];
}) {
  const [activeView, setActiveView] = useState<'overview' | 'cashflow' | 'debt'>('overview');
  // FIX-P9: Behavioral insights toggle persisted to localStorage
  const [behavioralEnabled, setBehavioralEnabled] = useState(
    () => localStorage.getItem('nexus:ledger:behavioral') === 'true'
  );
  const handleToggleBehavioral = () => {
    const next = !behavioralEnabled;
    setBehavioralEnabled(next);
    localStorage.setItem('nexus:ledger:behavioral', String(next));
  };

  const hasSoul = Boolean(soul);
  const resource = soul?.crossFunctionalState?.resource || {};
  const lastUpdated = soul?.crossFunctionalState?.lastUpdated || {};

  // Financial health score (lightweight, derived from profile)
  const healthScore = useMemo(() => {
    if (!profile) return null;
    const txs = profile.transactions ?? [];
    const metrics = computeDashboardMetrics(txs, (profile.debtItems ?? []).reduce((s, d) => s + d.balance, 0));
    const savingsRate = metrics.savingsRate ?? 0;
    const savingsScore = Math.min(30, Math.round(savingsRate * 30));
    const actuals = computeBudgetActuals(txs, profile.budgetCategories ?? []);
    const overBudget = actuals.filter(a => a.status === 'over').length;
    const budgetScore = Math.round(25 * (1 - overBudget / Math.max(actuals.length, 1)));
    const goals = profile.financialGoals ?? [];
    const avgGoalProg = goals.length === 0 ? 0.5
      : goals.reduce((s, g) => s + Math.min(1, g.currentAmount / Math.max(g.targetAmount, 1)), 0) / goals.length;
    const goalScore = Math.round(20 * avgGoalProg);
    const totalDebt = (profile.debtItems ?? []).reduce((s, d) => s + d.balance, 0);
    const monthlyIncome = metrics.currentMonthIncome || profile.monthlyIncome || 1;
    const dti = totalDebt / (monthlyIncome * 12);
    const debtScore = dti === 0 ? 15 : Math.max(0, Math.round(15 * (1 - Math.min(1, dti / 2))));
    const cashFlowScore = metrics.currentMonthNet >= 0 ? 10 : 0;
    const total = savingsScore + budgetScore + goalScore + debtScore + cashFlowScore;
    const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';
    return { score: total, grade };
  }, [profile]);

  // --- Real computed metrics from transaction history ---

  // Total current debt from profile items (O(d) where d = number of debt items).
  const totalDebt = useMemo(
    () => (profile?.debtItems ?? []).reduce((sum, item) => sum + item.balance, 0),
     
    [profile?.debtItems],
  );

  // All dashboard stat-card numbers derived from actual transactions.
  const metrics = useMemo(
    () => computeDashboardMetrics(profile?.transactions ?? [], totalDebt),
     
    [profile?.transactions, totalDebt],
  );

  // Keep nullable wrappers so downstream conditional renders and prop types
  // continue to work unchanged — null signals "no profile loaded yet".
  const monthlyIncome = profile !== null ? metrics.currentMonthIncome : null;
  const totalExpense = profile !== null ? metrics.currentMonthExpenses : null;
  const monthlyBuffer = profile !== null ? metrics.currentMonthNet : null;

  const warnings: string[] = [];
  if (metrics.currentMonthIncome > 0 && metrics.currentMonthNet < 0) {
    warnings.push('Monthly cashflow is negative. Reduce variable spend or restructure debt payments.');
  }
  if (resource.financialFriction !== undefined && resource.financialFriction !== null && resource.financialFriction >= 8) {
    warnings.push('Financial friction is high. Pause non-essential spend until buffer stabilizes.');
  }
  if (!profile?.activePlanId) warnings.push('No active financial plan. Ledger bot will create one in chat.');

  const spendingRows = useMemo(() => {
    if (!profile) return [];
    const all = [...profile.fixedExpenses, ...profile.variableExpenses];
    if (all.length === 0) return [];
    const max = Math.max(...all.map((item) => item.amount));
    return all
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((item) => ({ ...item, max }));
  }, [profile]);

  // Cash-flow chart: real per-month income vs expenses from transaction history.
  // computeMonthlyTotals returns the last 6 calendar months ordered oldest→newest.
  // We map `label` (e.g. "Mar 2025") to `month` as expected by CashFlowChart.
  const cashFlowData = useMemo(
    () =>
      computeMonthlyTotals(profile?.transactions ?? []).map((t) => ({
        month: t.label,
        income: t.income,
        expenses: t.expenses,
      })),
     
    [profile?.transactions],
  );

  // Budget actuals: derive per-category spend from transaction history for the
  // current calendar month. O(n + b) where n = transactions, b = categories.
  const budgetActuals = useMemo(
    () => computeBudgetActuals(profile?.transactions ?? [], profile?.budgetCategories ?? []),
     
    [profile?.transactions, profile?.budgetCategories],
  );

  // Number of budget categories where actual spend exceeds the allocation.
  const overBudgetCount = useMemo(
    () => budgetActuals.filter((p) => p.actual > p.allocated).length,
    [budgetActuals],
  );

  // Debt snapshot: each debt item becomes one data point.
  // The `month` field is repurposed as the debt-item name so the tracker
  // displays each account's current balance as a comparative bar.
  const debtData = useMemo(
    () =>
      (profile?.debtItems ?? []).map((item) => ({
        month: item.name,
        balance: item.balance,
      })),
     
    [profile?.debtItems],
  );

  // Recent transactions — derived directly from profile (FIX-P5)
  const recentTransactions = useMemo(
    () =>
      (profile?.transactions ?? [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    [profile?.transactions],
  );

  // totalDebt is already computed above via useMemo.
  const totalSavings = monthlyBuffer !== null && monthlyBuffer > 0 ? monthlyBuffer * 3 : 0;
  const runwayProjection = useMemo(() => computeRunwayProjection(profile), [profile]);

  // Smart alert evaluation — pure derived state from existing memos.
  // O(b + g) where b = budgetActuals.length, g = financialGoals.length.
  const alerts = useMemo(
    () => evaluateAlerts(profile, budgetActuals, metrics),
     
    [profile, budgetActuals, metrics],
  );

  // Collapse control: show summary pill when > 3 alerts.
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const ALERT_COLLAPSE_THRESHOLD = 3;
  const visibleAlerts: LedgerAlert[] =
    alerts.length > ALERT_COLLAPSE_THRESHOLD && !alertsExpanded
      ? alerts.slice(0, ALERT_COLLAPSE_THRESHOLD)
      : alerts;
  const runwayToneByStatus = {
    needs_data: 'border-white/10 bg-white/[0.045] text-white/70',
    stable: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    healthy: 'border-sky-500/20 bg-sky-500/5 text-sky-300',
    watch: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    critical: 'border-rose-500/20 bg-rose-500/5 text-rose-300',
    depleted: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
  } as const;
  const runwayStatusLabel = runwayProjection
    ? {
        needs_data: 'Needs data',
        stable: 'Cashflow-positive',
        healthy: 'Healthy runway',
        watch: 'Watch closely',
        critical: 'Critical runway',
        depleted: 'Liquidity depleted',
      }[runwayProjection.status]
    : null;
  const runwayHeadline = runwayProjection
    ? runwayProjection.monthsRemaining === null
      ? runwayProjection.status === 'needs_data'
        ? 'Add income, expenses, or reserves to estimate runway.'
        : `You are covering burn with current cashflow.`
      : `${formatNumber(runwayProjection.monthsRemaining, 1, 1)} months of modeled runway`
    : null;
  const runwayFormulaText = runwayProjection
    ? `Formula: (${formatCurrency(runwayProjection.ledgerBalance, profile?.currency)} ledger balance + ${formatCurrency(runwayProjection.reserveSavings, profile?.currency)} reserves) ÷ ${formatCurrency(runwayProjection.monthlyBurn, profile?.currency)}/mo burn`
    : null;

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Ledger"
        moduleDescription="Financial analysis and encrypted transaction intelligence."
      />
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      <SectionHeader
        label="Resource Control"
        title="Financial Command Center"
        subtitle="AI-powered tracking and optimization across spend, savings, and plan execution."
        accentClassName="text-[var(--module-color-400)]"
      />

      {/* Loading skeleton when profile unavailable */}
      {!profile ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white/[0.045] rounded-lg h-24" />
          ))}
        </div>
      ) : (
      <>

      {/* View Tabs + Behavioral Insights Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2" role="tablist" aria-label="Dashboard views">
        <button
          role="tab"
          aria-selected={activeView === 'overview'}
          onClick={() => setActiveView('overview')}
          className={cn(
            "px-4 py-2 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]",
            activeView === 'overview'
              ? "bg-[var(--module-accent)] text-white"
              : "bg-white/[0.045] text-white/60 hover:bg-white/10"
          )}
        >
          Overview
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'cashflow'}
          onClick={() => setActiveView('cashflow')}
          className={cn(
            "px-4 py-2 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]",
            activeView === 'cashflow'
              ? "bg-[var(--module-accent)] text-white"
              : "bg-white/[0.045] text-white/60 hover:bg-white/10"
          )}
        >
          <TrendingUp className="w-3 h-3 inline mr-1" />
          Cash Flow
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'debt'}
          onClick={() => setActiveView('debt')}
          className={cn(
            "px-4 py-2 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]",
            activeView === 'debt'
              ? "bg-[var(--module-accent)] text-white"
              : "bg-white/[0.045] text-white/60 hover:bg-white/10"
          )}
        >
          <Target className="w-3 h-3 inline mr-1" />
          Debt Tracker
        </button>
        </div>
        {/* FIX-P9: Behavioral insights user toggle */}
        <button
          onClick={handleToggleBehavioral}
          aria-pressed={behavioralEnabled}
          className={cn(
            "px-3 py-2 rounded-lg text-xs font-semibold transition-colors border",
            behavioralEnabled
              ? "bg-violet-500/20 border-violet-500/30 text-violet-300"
              : "bg-white/[0.045] border-white/10 text-white/50 hover:bg-white/10"
          )}
        >
          {behavioralEnabled ? '✦ Behavioral Insights On' : 'Enable Behavioral Insights'}
        </button>
      </div>

      {/* Overview View */}
      {activeView === 'overview' && (
        <>
          {/* ── Smart Alert Banners ─────────────────────────────────────────── */}
          <AnimatePresence initial={false}>
            {alerts.length > 0 && (
              <motion.section
                key="alert-banners"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-2"
                aria-label="Financial alerts"
              >
                <AnimatePresence initial={false}>
                  {visibleAlerts.map((alert) => {
                    const isDanger = alert.severity === 'danger';
                    const isInfo   = alert.severity === 'info';
                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className={cn(
                          'flex items-start gap-3 px-4 py-2.5 rounded-lg border bg-white/[0.045]',
                          isDanger
                            ? 'border-red-500/30 border-l-2 border-l-red-500'
                            : isInfo
                              ? 'border-blue-500/30 border-l-2 border-l-blue-400'
                              : 'border-amber-500/30 border-l-2 border-l-amber-400',
                        )}
                        role="alert"
                      >
                        {isDanger || alert.severity === 'warning' ? (
                          <AlertTriangle
                            className={cn(
                              'w-4 h-4 mt-0.5 shrink-0',
                              isDanger ? 'text-red-400' : 'text-amber-400',
                            )}
                            aria-hidden="true"
                          />
                        ) : (
                          <Info
                            className="w-4 h-4 mt-0.5 shrink-0 text-blue-400"
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-xs font-bold',
                              isDanger
                                ? 'text-red-300'
                                : isInfo
                                  ? 'text-blue-300'
                                  : 'text-amber-300',
                            )}
                          >
                            {alert.title}
                          </p>
                          <p className="text-[11px] text-white/68 mt-0.5 leading-relaxed">
                            {alert.message}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Collapse / expand pill when > ALERT_COLLAPSE_THRESHOLD alerts */}
                {alerts.length > ALERT_COLLAPSE_THRESHOLD && (
                  <button
                    onClick={() => setAlertsExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.045] border border-white/10 hover:bg-white/10 transition-colors text-[11px] font-bold text-white/60 uppercase tracking-wider"
                    aria-expanded={alertsExpanded}
                    aria-label={
                      alertsExpanded
                        ? 'Collapse alerts'
                        : `Show all ${alerts.length} issues`
                    }
                  >
                    {alertsExpanded
                      ? 'Show less'
                      : `${alerts.length} issues detected — show all`}
                  </button>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* Financial Health Score pill */}
          {healthScore && (
            <div className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl border',
              healthScore.grade === 'A' || healthScore.grade === 'B'
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : healthScore.grade === 'C'
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-rose-500/5 border-rose-500/20'
            )}>
              <ShieldCheck className={cn('w-4 h-4 shrink-0', {
                'text-emerald-400': healthScore.grade === 'A' || healthScore.grade === 'B',
                'text-amber-400': healthScore.grade === 'C',
                'text-rose-400': healthScore.grade === 'D' || healthScore.grade === 'F',
              })} />
              <div className="flex-1">
                <p className="text-[11px] text-white/50 uppercase tracking-wider">Financial Health Score</p>
                <p className={cn('text-sm font-bold', {
                  'text-emerald-300': healthScore.grade === 'A' || healthScore.grade === 'B',
                  'text-amber-300': healthScore.grade === 'C',
                  'text-rose-300': healthScore.grade === 'D' || healthScore.grade === 'F',
                })}>
                  Grade {healthScore.grade} — {healthScore.score}/100
                </p>
              </div>
              <button
                onClick={() => onAskAI?.('What does my financial health score mean and how can I improve it?')}
                className="text-[11px] text-white/50 hover:text-white/70 transition-colors font-semibold min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
              >
                Explain →
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Monthly Income"
              value={monthlyIncome}
              suffix={profile?.currency ? ` ${profile.currency}` : ''}
              isEmpty={!profile}
              accentClassName="text-[var(--module-color-300)]"
            />
            <StatCard
              label="Total Expenses"
              value={totalExpense}
              suffix={profile?.currency ? ` ${profile.currency}` : ''}
              isEmpty={!profile}
              accentClassName={monthlyBuffer !== null && monthlyBuffer < 0 ? 'text-red-400' : 'text-emerald-400'}
            />
            <StatCard
              label="Net Savings"
              value={monthlyBuffer}
              suffix={profile?.currency ? ` ${profile.currency}` : ''}
              isEmpty={!profile}
              accentClassName="text-emerald-400"
            />
            <StatCard
              label="Resonance ROI"
              value={typeof resource.resonanceROI === 'number' ? Math.round(resource.resonanceROI * 100) : null}
              suffix="%"
              isEmpty={!hasSoul}
              accentClassName="text-indigo-300"
              isDerived={
                NSV_DERIVED_METRICS.includes('resource.resonanceROI') ||
                isMetricStale(lastUpdated['resource.resonanceROI'], 7)
              }
            />
          </div>

          {runwayProjection && (
            <SurfaceCard
              className="p-5 space-y-4"
              aria-label="Runway projection"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/50">
                    Runway Projection
                  </p>
                  <h3 className="text-lg font-semibold text-white">
                    {runwayHeadline}
                  </h3>
                  <p className="text-[11px] leading-relaxed text-white/55 max-w-2xl">
                    Auditable from current liquidity and monthly burn assumptions. Income uses the profile baseline first, expenses use fixed + variable + debt minimums, and liquidity combines positive ledger balance with funded reserves.
                  </p>
                </div>
                <div
                  className={cn(
                    'px-3 py-2 rounded-full border text-[11px] font-semibold',
                    runwayToneByStatus[runwayProjection.status],
                  )}
                >
                  {runwayStatusLabel}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Modeled Liquidity</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(runwayProjection.modeledLiquidity, profile?.currency)}
                  </p>
                  <p className="mt-1 text-[11px] text-white/60">
                    Ledger balance {formatCurrency(runwayProjection.ledgerBalance, profile?.currency)} + reserves {formatCurrency(runwayProjection.reserveSavings, profile?.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Monthly Burn</p>
                  <p className={cn(
                    'mt-2 text-2xl font-semibold',
                    runwayProjection.monthlyBurn > 0 ? 'text-rose-300' : 'text-emerald-300',
                  )}>
                    {runwayProjection.monthlyBurn > 0 ? '−' : ''}{formatCurrency(runwayProjection.monthlyBurn, profile?.currency)}
                  </p>
                  <p className="mt-1 text-[11px] text-white/60">
                    Expenses {formatCurrency(runwayProjection.monthlyExpenseBaseline, profile?.currency)} − income {formatCurrency(runwayProjection.monthlyIncome, profile?.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Projected Coverage</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {runwayProjection.monthsRemaining === null
                      ? runwayProjection.status === 'needs_data'
                        ? '—'
                        : 'Stable'
                      : `${formatNumber(runwayProjection.monthsRemaining, 1, 1)} mo`}
                  </p>
                  <p className="mt-1 text-[11px] text-white/60">
                    {runwayProjection.daysRemaining === null
                      ? 'Runway is self-funded at the current baseline.'
                      : `≈ ${formatNumber(runwayProjection.daysRemaining, 0, 0)} days at current burn.`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-between">
                <p className="text-[11px] text-white/50 leading-relaxed">
                  {runwayFormulaText}
                </p>
                <button
                  onClick={() => onAskAI?.('Explain my runway projection math and show the fastest ways to extend it.')}
                  className="text-[11px] text-white/50 hover:text-white/70 transition-colors font-semibold min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
                >
                  Explain runway →
                </button>
              </div>
            </SurfaceCard>
          )}

          {/* Recent Transactions */}
          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Recent Transactions</h4>
              <FileText className="w-4 h-4 text-[var(--module-color-400)]" />
            </div>
            {recentTransactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Add transactions to see recent activity here."
                icon={Upload}
                size="sm"
                className="bg-transparent border-white/10"
              />
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.045]">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{tx.description}</p>
                      <p className="text-xs text-white/60">{tx.category} · {tx.date}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-sm font-bold', tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, profile?.currency)}
                      </p>
                      <p className="text-xs text-white/50 capitalize">{tx.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          <div className="grid grid-cols-1 gap-4">
            <SurfaceCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/50">Spending</span>
                <span className="text-[11px] text-white/50 uppercase tracking-widest">Breakdown</span>
              </div>
              {spendingRows.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No spending data yet"
                  description="Log expenses or upload transactions to populate this view."
                  icon={CreditCard}
                  className="bg-transparent border-white/10"
                />
              ) : (
                <div className="space-y-3">
                  {spendingRows.map((item) => (
                    <ProgressRow
                      key={item.id}
                      label={item.label}
                      value={item.amount}
                      max={item.max}
                      suffix={profile?.currency ? ` ${profile.currency}` : ''}
                      accentClassName="bg-[var(--module-accent)]"
                    />
                  ))}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/50">Active Plan</span>
                <span className="text-[11px] text-white/50 uppercase tracking-widest">Planner</span>
              </div>
              {profile?.activePlanId ? (
                <div className="rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] p-4 space-y-2">
                  {(() => {
                    const activePlan = profile.plans?.find((p) => p.id === profile.activePlanId);
                    return activePlan ? (
                      <>
                        <p className="text-xs text-[var(--module-color-300)] font-medium">{activePlan.title}</p>
                        {activePlan.summary && (
                          <p className="text-[11px] text-white/60 leading-relaxed">{activePlan.summary}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--module-color-300)] truncate">Plan: {profile.activePlanId.slice(0, 8)}…</p>
                    );
                  })()}
                  <p className="text-[11px] text-white/60">Planner state: {profile.plannerBotState.toUpperCase()}</p>
                </div>
              ) : (
                <EmptyState
                  size="sm"
                  title="No active plan"
                  description="Ask Ledger to generate a financial plan."
                  className="bg-transparent border-white/10"
                />
              )}
            </SurfaceCard>
          </div>
        </>
      )}

      {/* Cash Flow View */}
      {activeView === 'cashflow' && (
        <SurfaceCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cash Flow Analysis</h3>
              <p className="text-[11px] text-white/60 mt-1">Income vs expenses over time</p>
            </div>
            <TrendingUp className="w-5 h-5 text-[var(--module-color-400)]" />
          </div>
          <CashFlowChart 
            data={cashFlowData} 
            currency={profile?.currency || 'USD'}
          />
          <SpendingTrendsChart
            transactions={profile?.transactions ?? []}
            currency={profile?.currency ?? 'USD'}
          />
          <div className="mt-6 space-y-3">
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">Financial Events</h4>
            {recentEvents.length === 0 ? (
              <EmptyState
                title="No financial events yet"
                description="Transaction activity will appear here."
                icon={FileText}
                size="sm"
                className="bg-transparent border-white/10"
              />
            ) : (
              <div className="space-y-2">
                {recentEvents.slice(0, 8).map((evt) => (
                  <div key={evt.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.045] border border-white/10">
                    <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--module-color-400)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">
                        {EVENT_DISPLAY_NAMES[evt.type] ?? evt.type}
                      </p>
                      {!!evt.data?.description && (
                        <p className="text-[11px] text-white/50 truncate mt-0.5">{String(evt.data.description)}</p>
                      )}
                    </div>
                    {typeof evt.data?.amount === 'number' && (
                      <span className={cn('text-xs font-mono shrink-0', evt.data?.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>
                        {evt.data.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(evt.data.amount as number), profile?.currency)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SurfaceCard>
      )}

      {activeView === 'debt' && (
        <SurfaceCard className="p-6">
          {totalDebt > 0 ? (
            <>
              <DebtPayoffTracker
                debts={debtData.map(d => ({ name: d.month, balance: d.balance, color: '#ef4444' }))}
                currency={profile.currency}
              />
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">Debt Items</h4>
                {profile?.debtItems.map((debt) => (
                  <div key={debt.id} className="p-3 rounded-lg bg-white/[0.045] border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">{debt.name}</span>
                      <span className="text-sm font-bold text-[var(--module-color-400)]">
                        {formatCurrency(debt.balance, profile?.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>Min Payment: {formatCurrency(debt.minPayment, profile?.currency)}</span>
                      {debt.apr && <span>APR: {debt.apr}%</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">Financial Events</h4>
                {recentEvents.length === 0 ? (
                  <EmptyState
                    title="No financial events yet"
                    description="Transaction activity will appear here."
                    icon={FileText}
                    size="sm"
                    className="bg-transparent border-white/10"
                  />
                ) : (
                  <div className="space-y-2">
                    {recentEvents.slice(0, 8).map((evt) => (
                      <div key={evt.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.045] border border-white/10">
                        <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--module-color-400)]" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/80 truncate">
                            {EVENT_DISPLAY_NAMES[evt.type] ?? evt.type}
                          </p>
                          {!!evt.data?.description && (
                            <p className="text-[11px] text-white/50 truncate mt-0.5">{String(evt.data.description)}</p>
                          )}
                        </div>
                        {typeof evt.data?.amount === 'number' && (
                          <span className={cn('text-xs font-mono shrink-0', evt.data?.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>
                            {evt.data.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(evt.data.amount as number), profile?.currency)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="No debt tracked"
              description="You have no outstanding debt. Great job!"
              icon={Target}
              size="lg"
            />
          )}
        </SurfaceCard>
      )}

      {/* AI Financial Advisor - Always visible */}
      {monthlyIncome !== null && totalExpense !== null && (
        <AIFinancialAdvisor
          monthlyIncome={monthlyIncome}
          totalExpenses={totalExpense}
          totalSavings={totalSavings}
          debtTotal={totalDebt}
          currency={profile?.currency || 'USD'}
          onAskAI={onAskAI}
        />
      )}

      <section className="space-y-3">
        <h4 className="text-[11px] font-bold text-white/60 uppercase tracking-[0.12em] font-display">Statement Analysis</h4>
        <SurfaceCard className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Enable Document Analysis</p>
              <p className="text-[11px] text-white/60 mt-1">Upload bank statements and receipts for AI extraction. Images are analyzed in memory, never stored to cloud.</p>
            </div>
            <Switch.Root
              checked={profile?.documentAnalysisEnabled || false}
              onCheckedChange={(checked) => onToggleDocumentAnalysis?.(checked)}
              className="w-11 h-6 rounded-full bg-white/10 border border-white/20 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600 cursor-pointer relative"
            >
              <Switch.Thumb className="w-5 h-5 rounded-full bg-white block data-[state=checked]:translate-x-5 transition-transform" />
            </Switch.Root>
          </div>

          {profile?.documentAnalysisEnabled && (
            <div className="space-y-2">
              <button
                onClick={onAnalyzeDocument}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 transition-colors text-xs font-bold text-violet-300 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
              >
                <Upload className="w-4 h-4" />
                Analyze Bank Statement
              </button>

              {profile?.lastDocumentAnalysis && (
                <div className="text-[11px] text-white/60 p-2 rounded border border-white/10">
                  <p>Last analysis: {new Date(profile.lastDocumentAnalysis.analyzedAt).toLocaleDateString()}</p>
                  <p>Period: {profile.lastDocumentAnalysis.periodLabel}</p>
                  <p>Transactions: {profile.lastDocumentAnalysis.transactionCount}</p>
                </div>
              )}
            </div>
          )}
        </SurfaceCard>
      </section>

      <section className="space-y-3">
        <h4 className="text-[11px] font-bold text-white/60 uppercase tracking-[0.12em] font-display">Risk Flags</h4>
        {warnings.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
            Resource profile is stable.
          </div>
        ) : (
          warnings.map((warning, index) => (
            <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <p className="text-sm text-amber-100/80 leading-relaxed">{warning}</p>
            </div>
          ))
        )}
      </section>
      </>
      )}
    </div>
  );
}
