import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Heart, Wind, Thermometer, Info, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { VitalsGrid } from '@/core/components/VitalsGrid';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

interface TitanDashboardProps {
  soul: GlobalProjection | null;
  isLocked?: boolean;
  onCalibrate?: (metricKey: string) => void;
}

function ReadinessHeader() {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] font-display text-orange-400">Performance Coach</div>
      <h2 className="text-xl font-bold uppercase tracking-tight text-white font-display">Today&apos;s Readiness</h2>
      <p className="text-[11px] text-white/40 max-w-xl">CNS-aware training surfaced from biometrics, recovery load, and recent sessions.</p>
    </div>
  );
}

function CalibrationPrompt() {
  return (
    <p className="text-[11px] text-white/30 text-center leading-relaxed">
      Metrics update through module interactions, or tap <span className="text-white/50 font-semibold">Calibrate</span> to set values manually.
    </p>
  );
}

interface HormonalContextCardProps {
  isLocked: boolean;
  hormonalContext?: string | null;
}

function HormonalContextCard({ isLocked, hormonalContext }: HormonalContextCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-6 overflow-hidden"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Thermometer className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400 font-display">Biological Context</h4>
            <p className="text-xs font-bold uppercase text-white tracking-wider font-display">Hormonal Synchronicity Active</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em] mb-1">Current State</span>
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-tighter">
              {isLocked ? 'SECURED' : hormonalContext || 'Awaiting data'}
            </span>
          </div>
          <div className="w-px h-6 bg-white/5 self-center" />
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em] mb-1">Metabolic Intensity</span>
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-tighter">Baseline Optimization</span>
          </div>
        </div>

        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-3 max-w-xs">
          <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <p className="text-[10px] text-white/40 leading-relaxed italic">
            Titan adapts load using cycle context once biomarkers are active.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

interface ReadinessStatsProps {
  soul: GlobalProjection | null;
  hasSoul: boolean;
}

function ReadinessStats({ soul, hasSoul }: ReadinessStatsProps) {
  if (!hasSoul || typeof soul?.crossFunctionalState.cnsFatigue !== 'number') return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        label="Avg CNS Load"
        value={soul.crossFunctionalState.cnsFatigue * 10}
        suffix="%"
        isEmpty={false}
        accentClassName="text-cyan-400"
      />
    </div>
  );
}

function useTitanMetrics(soul: GlobalProjection | null) {
  const hasSoul = Boolean(soul);
  const lastUpdated = soul?.crossFunctionalState.lastUpdated || {};

  return React.useMemo(() => [
    {
      label: 'CNS LOAD',
      value: typeof soul?.crossFunctionalState.cnsFatigue === 'number' ? soul.crossFunctionalState.cnsFatigue : null,
      max: 10,
      icon: Zap,
      colorClass: 'text-orange-400',
      isEmpty: !hasSoul,
      metricKey: 'biological.cnsFatigue',
      lastUpdated: lastUpdated['biological.cnsFatigue'],
      isDerived: NSV_DERIVED_METRICS.includes('biological.cnsFatigue') || isMetricStale(lastUpdated['biological.cnsFatigue'], 7)
    },
    {
      label: 'RESILIENCE',
      value: typeof soul?.crossFunctionalState.emotionalResilience === 'number' ? soul.crossFunctionalState.emotionalResilience : null,
      max: 10,
      icon: Heart,
      colorClass: 'text-indigo-400',
      isEmpty: !hasSoul,
      metricKey: 'emotional.emotionalResilience',
      lastUpdated: lastUpdated['emotional.emotionalResilience'],
      isDerived: NSV_DERIVED_METRICS.includes('emotional.emotionalResilience') || isMetricStale(lastUpdated['emotional.emotionalResilience'], 7)
    },
    {
      label: 'SLEEP REC',
      value: typeof soul?.crossFunctionalState.sleepQuality === 'number' ? soul.crossFunctionalState.sleepQuality : null,
      max: 10,
      icon: Wind,
      colorClass: 'text-cyan-400',
      isEmpty: !hasSoul,
      metricKey: 'biological.sleepQuality',
      lastUpdated: lastUpdated['biological.sleepQuality'],
      isDerived: NSV_DERIVED_METRICS.includes('biological.sleepQuality') || isMetricStale(lastUpdated['biological.sleepQuality'], 7)
    },
    {
      label: 'BIO SYNC',
      value: typeof soul?.overallWellnessScore === 'number' ? soul.overallWellnessScore : null,
      max: 100,
      icon: Activity,
      colorClass: 'text-emerald-400',
      isEmpty: !hasSoul
    }
  ], [soul, hasSoul, lastUpdated]);
}

export function TitanDashboard({ soul, isLocked = false, onCalibrate }: TitanDashboardProps) {
  const { profile } = useAuth();
  const isFemale = profile?.assignedSexAtBirth === 'female';
  const hasSoul = Boolean(soul);
  const metrics = useTitanMetrics(soul);

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Titan"
        moduleDescription="Physical performance and structural development."
      />
    );
  }

  return (
    <div className="p-5 bg-black/40 border-b border-white/5 backdrop-blur-xl space-y-4">
      <ReadinessHeader />

      <VitalsGrid metrics={metrics} isLocked={isLocked} onCalibrate={onCalibrate} />

      {hasSoul && metrics.some(m => m.value === null || m.value === undefined) && !isLocked && (
        <CalibrationPrompt />
      )}

      {/* Stat cards only render when cross-functional state has real values */}
      <ReadinessStats soul={soul} hasSoul={hasSoul} />

      <AnimatePresence>
        {isFemale && (
          <HormonalContextCard
            isLocked={isLocked}
            hormonalContext={soul?.crossFunctionalState.hormonalContext}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
