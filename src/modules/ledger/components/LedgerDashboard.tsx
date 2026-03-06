import React, { useMemo } from 'react';
import { AlertTriangle, CreditCard, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { LedgerIntakeProfile } from '../services/ledger-intake-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { ProgressRow } from '@/core/components/ProgressRow';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

export function LedgerDashboard({
  soul,
  profile,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: LedgerIntakeProfile | null;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Ledger to view financial telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
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

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Resource Control"
        title="Financial Command Center"
        subtitle="AI-powered tracking and optimization across spend, savings, and plan execution."
        accentClassName="text-cyan-400"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
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
              <p className="text-xs text-cyan-200/80">Active plan ID: {profile.activePlanId}</p>
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

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Risk Flags</h4>
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
