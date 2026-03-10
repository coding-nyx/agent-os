import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { AlertTriangle, CreditCard, Lock, Upload, TrendingUp, Target, PieChart as PieChartIcon } from 'lucide-react';
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
import { AIFinancialAdvisor } from './AIFinancialAdvisor';
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
  const totalFixed = profile ? profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0) : null;
  const totalVariable = profile ? profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0) : null;
  const monthlyIncome = profile ? profile.monthlyIncome : null;
  const totalExpense = monthlyIncome !== null && totalFixed !== null && totalVariable !== null ? totalFixed + totalVariable : null;
  const monthlyBuffer =
    monthlyIncome !== null && totalExpense !== null ? monthlyIncome - totalExpense : null;

  const warnings: string[] = [];
  if (monthlyIncome !== null && monthlyBuffer !== null && monthlyIncome > 0 && monthlyBuffer < 0) {
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

  // Generate mock data for charts (in real implementation, this would come from transaction history)
  const cashFlowData = useMemo(() => {
    if (!profile) return [];
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const totalExpenses = totalFixed !== null && totalVariable !== null ? totalFixed + totalVariable : 0;
    
    return months.map((month, index) => ({
      month,
      income: monthlyIncome !== null ? monthlyIncome * (0.95 + Math.random() * 0.1) : 0,
      expenses: totalExpenses * (0.9 + Math.random() * 0.2)
    }));
  }, [profile, monthlyIncome, totalFixed, totalVariable]);

  const debtData = useMemo(() => {
    if (!profile || profile.debtItems.length === 0) return [];
    
    const totalDebt = profile.debtItems.reduce((sum, item) => sum + item.balance, 0);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    
    return months.map((month, index) => ({
      month,
      balance: totalDebt * (1 - index * 0.12) // Simulating debt reduction
    }));
  }, [profile]);

  const totalDebt = profile?.debtItems.reduce((sum, item) => sum + item.balance, 0) || 0;
  const totalSavings = monthlyBuffer !== null && monthlyBuffer > 0 ? monthlyBuffer * 3 : 0; // Estimate

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
                  <div key={debt.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
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
