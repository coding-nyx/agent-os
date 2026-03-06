import React from 'react';
import { CalendarClock, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { AtlasProfile } from '../services/atlas-profile-service';
import { EnergyWaveChart } from './EnergyWaveChart';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

export function AtlasDashboard({
  soul,
  profile,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: AtlasProfile | null;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Atlas to view cognitive telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

  if (!soul) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Cognitive link pending"
          description="Share your task load to activate the Atlas waveboard."
          size="lg"
        />
      </div>
    );
  }

  const cognitive = soul.crossFunctionalState.cognitive;
  const lastUpdated = soul.crossFunctionalState.lastUpdated || {};
  const activeWindows = profile?.recoveryWindows.filter((window) => window.status === 'active').length || 0;

  const toneWhenBelow = (value: number | null | undefined, threshold: number, lowClass: string, highClass: string) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value < threshold ? lowClass : highClass;
  };

  const toneWhenAbove = (value: number | null | undefined, threshold: number, highClass: string, lowClass: string) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value > threshold ? highClass : lowClass;
  };

  const riskFlags: string[] = [];
  if (typeof cognitive.activeLoad === 'number' && cognitive.activeLoad > 7) {
    riskFlags.push('Task load is elevated. Trigger schedule flattening.');
  }
  if (typeof cognitive.focusScore === 'number' && cognitive.focusScore < 4) {
    riskFlags.push('Low focus signal. Insert a recovery window before deep work.');
  }
  if (typeof cognitive.energyBudget === 'number' && cognitive.energyBudget < 4) {
    riskFlags.push('Energy budget is constrained. Prioritize critical tasks only.');
  }

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Cognitive Domain"
        title="Atlas Waveboard"
        subtitle="Schedule stabilization, cognitive load, and recovery windows."
        accentClassName="text-sky-400"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Energy Budget"
          value={typeof cognitive.energyBudget === 'number' ? cognitive.energyBudget : null}
          isEmpty={cognitive.energyBudget === undefined || cognitive.energyBudget === null}
          accentClassName={toneWhenBelow(cognitive.energyBudget, 4, 'text-amber-300', 'text-sky-300')}
          isDerived={
            NSV_DERIVED_METRICS.includes('cognitive.energyBudget') ||
            isMetricStale(lastUpdated['cognitive.energyBudget'], 7)
          }
        />
        <StatCard
          label="Focus Score"
          value={typeof cognitive.focusScore === 'number' ? cognitive.focusScore : null}
          isEmpty={cognitive.focusScore === undefined || cognitive.focusScore === null}
          accentClassName={toneWhenBelow(cognitive.focusScore, 4, 'text-red-400', 'text-sky-300')}
          isDerived={
            NSV_DERIVED_METRICS.includes('cognitive.focusScore') ||
            isMetricStale(lastUpdated['cognitive.focusScore'], 7)
          }
        />
        <StatCard
          label="Active Load"
          value={typeof cognitive.activeLoad === 'number' ? cognitive.activeLoad : null}
          isEmpty={cognitive.activeLoad === undefined || cognitive.activeLoad === null}
          accentClassName={toneWhenAbove(cognitive.activeLoad, 7, 'text-red-400', 'text-sky-300')}
          isDerived={
            NSV_DERIVED_METRICS.includes('cognitive.activeLoad') ||
            isMetricStale(lastUpdated['cognitive.activeLoad'], 7)
          }
        />
        <StatCard
          label="Recovery Windows"
          value={activeWindows || null}
          isEmpty={!profile}
          accentClassName="text-emerald-300"
        />
      </div>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Energy Wave</h4>
        {profile?.energyWave?.length ? (
          <EnergyWaveChart points={profile.energyWave.slice(0, 10)} flattenedUntil={profile.flattenedUntil} />
        ) : null}
        {(profile?.energyWave || []).slice(0, 5).map((point) => (
          <div key={point.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{point.slot}</span>
              <span className="text-sky-300 font-bold">Energy {point.energy}/10</span>
            </div>
            <div className="mt-2 text-[10px] text-white/45">
              Focus {point.focus}/10 · Load {point.load}/10
            </div>
          </div>
        ))}
        {!profile?.energyWave.length && (
          <EmptyState
            size="sm"
            title="No energy wave points yet"
            description="Atlas will build this as you chat."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Task Graph</h4>
        {(profile?.taskGraph || []).slice(0, 5).map((task) => (
          <div key={task.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{task.title}</span>
              <span className="text-sky-300 font-bold">Energy {task.energyCost}/10</span>
            </div>
            <div className="mt-1 text-[10px] text-white/45 uppercase tracking-[0.2em]">{task.status}</div>
            {task.dependencies?.length ? (
              <div className="mt-2 text-[10px] text-white/40">
                Depends on {task.dependencies.length} node{task.dependencies.length > 1 ? 's' : ''}
              </div>
            ) : null}
          </div>
        ))}
        {!profile?.taskGraph.length && (
          <EmptyState
            size="sm"
            title="Task graph is empty"
            description="Atlas will build dependencies from your work stream."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Recovery Windows</h4>
        {(profile?.recoveryWindows || []).slice(0, 3).map((window) => (
          <SurfaceCard key={window.id} className="p-3 text-xs border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between text-emerald-300">
              <span>{window.title}</span>
              <CalendarClock className="w-4 h-4" />
            </div>
            <p className="mt-1 text-emerald-100/70">{window.reason}</p>
          </SurfaceCard>
        ))}
        {!profile?.recoveryWindows.length && (
          <EmptyState
            size="sm"
            title="No recovery windows scheduled"
            description="Atlas will recommend recovery windows as load spikes."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Risk Flags</h4>
        {riskFlags.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[10px] text-emerald-300">
            Cognitive profile stable.
          </div>
        ) : (
          riskFlags.map((flag, index) => (
            <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] text-amber-100/80">
              {flag}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
