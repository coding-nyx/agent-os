import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Heart, Wind, Thermometer, Info, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { VitalsGrid } from '@/core/components/VitalsGrid';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

interface TitanDashboardProps {
  soul: GlobalProjection | null;
  isLocked?: boolean;
  onCalibrate?: (metricKey: string) => void;
}

export function TitanDashboard({ soul, isLocked = false, onCalibrate }: TitanDashboardProps) {
  const { profile } = useAuth();
  const isFemale = profile?.assignedSexAtBirth === 'female';
  const hasSoul = Boolean(soul);
  const lastUpdated = soul?.crossFunctionalState.lastUpdated || {};

  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Titan to view readiness telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

  const metrics = [
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
  ];

  return (
    <div className="p-6 bg-black/40 border-b border-white/5 backdrop-blur-xl space-y-6">
      <SectionHeader
        label="Performance Coach"
        title="Today’s Readiness"
        subtitle="CNS-aware training surfaced from biometrics, recovery load, and recent sessions."
        accentClassName="text-orange-400"
      />

      <VitalsGrid metrics={metrics} isLocked={isLocked} onCalibrate={onCalibrate} />

      {/* Progress and Biometric Devices are hidden until data is populated via action tags */}

      {/* Stat cards only render when cross-functional state has real values */}
      {hasSoul && typeof soul?.crossFunctionalState.cnsFatigue === 'number' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Avg CNS Load"
            value={soul.crossFunctionalState.cnsFatigue * 10}
            suffix="%"
            isEmpty={false}
            accentClassName="text-cyan-400"
          />
        </div>
      )}

      <AnimatePresence>
        {isFemale && (
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
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 italic">Biological Context</h4>
                  <p className="text-xs font-black italic uppercase text-white tracking-widest">Hormonal Synchronicity Active</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest italic mb-1">Current State</span>
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter italic">
                    {isLocked ? 'SECURED' : soul?.crossFunctionalState.hormonalContext || 'Awaiting data'}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/5 self-center" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest italic mb-1">Metabolic Intensity</span>
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter italic">Baseline Optimization</span>
                </div>
              </div>

              <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-3 max-w-xs">
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <p className="text-[9px] text-white/40 leading-relaxed italic">
                  Titan adapts load using cycle context once biomarkers are active.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
