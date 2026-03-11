import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { AlertTriangle, CreditCard, Lock, Upload, TrendingUp, Target, PieChart as PieChartIcon, Clock, Activity, FileText, Info } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import { GlobalProjection } from '@/lib/types';
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
import { computeDashboardMetrics, computeMonthlyTotals, computeBudgetActuals, evaluateAlerts } from '../services/ledger-aggregation-service';
import type { LedgerAlert } from '../services/ledger-aggregation-service';
import { AIFinancialAdvisor } from './AIFinancialAdvisor';
import { spineEventService } from '../services/spine-event-service';
import { LedgerSpineEventType } from '../actions/ledger-field-actions';
import { cn } from '@/lib/utils';

export function LedgerDashboard({
  soul,
  profile,
  onAnalyzeDocument,
  onToggleDocumentAnalysis,
  onAskAI,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: LedgerIntakeProfile | null;
  onAnalyzeDocument?: () => void;
  onToggleDocumentAnalysis?: (enabled: boolean) => void;
  onAskAI?: (question: string) => void;
  isLocked?: boolean;
}) {
  const [activeView, setActiveView] = useState<'overview' | 'cashflow' | 'debt'>('overview');
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Ledger"
        moduleDescription="Financial analysis and encrypted transaction intelligence."
      />
    );
  }

  const hasSoul = Boolean(soul);
  const resource = soul?.crossFunctionalState?.resource || {};
  const lastUpdated = soul?.crossFunctionalState?.lastUpdated || {};

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

  // Recent events display
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setIsLoadingEvents(true);
    spineEventService.getLedgerEvents({
      type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000 // Last 30 days
    }).then(events => {
      setRecentEvents(events.slice(0, 5)); // Show last 5 transactions
    }).finally(() => setIsLoadingEvents(false));
  }, [profile]);

  // totalDebt is already computed above via useMemo.
  const totalSavings = monthlyBuffer !== null && monthlyBuffer > 0 ? monthlyBuffer * 3 : 0;

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

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Resource Control"
        title="Financial Command Center"
        subtitle="AI-powered tracking and optimization across spend, savings, and plan execution."
        accentClassName="text-cyan-400"
      />

      {/* View Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('overview')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
            activeView === 'overview'
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveView('cashflow')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
            activeView === 'cashflow'
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          )}
        >
          <TrendingUp className="w-3 h-3 inline mr-1" />
          Cash Flow
        </button>
        <button
          onClick={() => setActiveView('debt')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
            activeView === 'debt'
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          )}
        >
          <Target className="w-3 h-3 inline mr-1" />
          Debt Tracker
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
                          'flex items-start gap-3 px-4 py-2.5 rounded-lg border bg-white/5',
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
                          <p className="text-[10px] text-white/60 mt-0.5 leading-relaxed">
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
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[10px] font-bold text-white/50 uppercase tracking-wider"
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

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Monthly Income"
              value={monthlyIncome}
              suffix={profile?.currency ? ` ${profile.currency}` : ''}
              isEmpty={!profile}
              accentClassName="text-cyan-300"
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

          {/* Recent Transactions */}
          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Recent Transactions</h4>
              {isLoadingEvents ? (
                <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            {isLoadingEvents ? (
              <div className="flex items-center justify-center py-8">
                <Clock className="w-6 h-6 text-cyan-400 animate-spin" />
              </div>
            ) : recentEvents.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Add transactions to see recent activity here."
                icon={Upload}
                size="sm"
                className="bg-transparent border-white/10"
              />
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{event.data.description || 'Transaction'}</p>
                      <p className="text-xs text-white/60">
                        {event.data.transactionType} - {formatCurrency(event.data.amount, profile?.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-cyan-400">
                        {event.data.transactionType === 'income' ? '+' : '-'}{formatCurrency(event.data.amount, profile?.currency)}
                      </p>
                      <p className="text-xs text-white/40">{new Date(event.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          <div className="grid grid-cols-1 gap-4">
            <SurfaceCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Spending</span>
                <span className="text-[9px] text-white/50 uppercase tracking-widest">Breakdown</span>
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
                      accentClassName="bg-cyan-500"
                    />
                  ))}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Active Plan</span>
                <span className="text-[9px] text-white/50 uppercase tracking-widest">Planner</span>
              </div>
              {profile?.activePlanId ? (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-2">
                  {(() => {
                    const activePlan = profile.plans?.find((p) => p.id === profile.activePlanId);
                    return activePlan ? (
                      <>
                        <p className="text-xs text-cyan-200/80 font-medium">{activePlan.title}</p>
                        {activePlan.summary && (
                          <p className="text-[10px] text-white/40 leading-relaxed">{activePlan.summary}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-cyan-200/80 truncate">Plan: {profile.activePlanId.slice(0, 8)}…</p>
                    );
                  })()}
                  <p className="text-[10px] text-white/50">Planner state: {profile.plannerBotState.toUpperCase()}</p>
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
              <p className="text-[10px] text-white/50 mt-1">Income vs expenses over time</p>
            </div>
            <TrendingUp className="w-5 h-5 text-cyan-400" />
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
            <EmptyState
              title="No financial events yet"
              description="Transaction activity will appear here."
              icon={FileText}
              size="sm"
              className="bg-transparent border-white/10"
            />
          </div>
        </SurfaceCard>
      )}

      {/* Debt Tracker View */}
      {activeView === 'debt' && (
        <SurfaceCard className="p-6">
          {totalDebt > 0 ? (
            <>
              <DebtPayoffTracker 
                data={debtData} 
                currency={profile?.currency || 'USD'}
              />
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">Debt Items</h4>
                {profile?.debtItems.map((debt) => (
                  <div key={debt.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">{debt.name}</span>
                      <span className="text-sm font-bold text-cyan-400">
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
                <EmptyState
                  title="No financial events yet"
                  description="Transaction activity will appear here."
                  icon={FileText}
                  size="sm"
                  className="bg-transparent border-white/10"
                />
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
        <h4 className="text-[9px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">Statement Analysis</h4>
        <SurfaceCard className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Enable Document Analysis</p>
              <p className="text-[9px] text-white/50 mt-1">Upload bank statements and receipts for AI extraction. Images are analyzed in memory, never stored to cloud.</p>
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
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 transition-colors text-xs font-bold text-violet-300"
              >
                <Upload className="w-4 h-4" />
                Analyze Bank Statement
              </button>

              {profile?.lastDocumentAnalysis && (
                <div className="text-[9px] text-white/50 p-2 rounded border border-white/10">
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
        <h4 className="text-[9px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">Risk Flags</h4>
        {warnings.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[10px] text-emerald-300">
            Resource profile is stable.
          </div>
        ) : (
          warnings.map((warning, index) => (
            <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <p className="text-[10px] text-amber-100/80 leading-relaxed">{warning}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
