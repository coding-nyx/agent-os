import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Zap, ShieldAlert, Activity, Moon, Brain } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VitalsGrid } from '@/core/components/VitalsGrid';

interface NeuralGap {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    icon: any;
    color: string;
}

export function LedgerDashboard({ soul }: { soul: GlobalProjection | null }) {
  if (!soul) return (
    <div className="h-full flex items-center justify-center p-8 text-white/20 text-[10px] font-black uppercase tracking-[0.2em] italic">
        Telemetry Link Pending...
    </div>
  );

  const state = soul.crossFunctionalState;
  
  // Anomaly Synthesis Logic
  const gaps: NeuralGap[] = [];
  
  if (state.cnsFatigue > 7 && state.emotionalResilience < 4) {
      gaps.push({
          id: 'burnout',
          title: 'Burnout Trajectory',
          description: 'High CNS fatigue coupled with low emotional resilience detected. Risk of neural exhaustion.',
          severity: 'high',
          icon: Zap,
          color: 'text-red-400'
      });
  }

  if (state.sleepQuality < 4 && state.cnsFatigue > 6) {
      gaps.push({
          id: 'recovery',
          title: 'Recovery Deficit',
          description: 'Systemic failure to enter deep restoration states. Physical performance will degrade.',
          severity: 'medium',
          icon: Moon,
          color: 'text-orange-400'
      });
  }

  if (state.emotionalResilience < 3) {
      gaps.push({
          id: 'integrity',
          title: 'Neural Integrity Gap',
          description: 'Psychological baseline is below stability threshold. Recommend immediate therapeutic sync.',
          severity: 'high',
          icon: ShieldAlert,
          color: 'text-red-500'
      });
  }

  const primaryMetrics = [
    { label: 'CNS Fatigue', value: state.cnsFatigue, max: 10, icon: Activity, colorClass: state.cnsFatigue > 7 ? 'text-red-500' : 'text-orange-400' },
    { label: 'Emotional Resilience', value: state.emotionalResilience, max: 10, icon: Brain, colorClass: state.emotionalResilience < 4 ? 'text-red-500' : 'text-indigo-400' }
  ];

  return (
    <div className="p-8 space-y-10">
      <header className="space-y-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 italic">Biological Synthesis</h3>
        <p className="text-2xl font-black italic uppercase tracking-tighter text-white">Neural Overview</p>
      </header>

      {/* Primary Metrics Grid */}
      <VitalsGrid metrics={primaryMetrics} columns={1} />

      {/* Neural Gaps Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] italic">Neural Gaps Detected</span>
            <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="space-y-4">
            {gaps.length === 0 ? (
                <div className="p-8 rounded-[32px] border border-emerald-500/10 bg-emerald-500/5 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60 italic">All Systems Synchronized</p>
                </div>
            ) : (
                gaps.map((gap) => (
                    <motion.div 
                        key={gap.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                            "p-6 rounded-[32px] border flex gap-4 transition-all",
                            gap.severity === 'high' ? "bg-red-500/5 border-red-500/20" : "bg-orange-500/5 border-orange-500/20"
                        )}
                    >
                        <div className={cn("w-10 h-10 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0", gap.color)}>
                            <gap.icon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-xs font-black italic uppercase tracking-wider text-white">{gap.title}</h4>
                            <p className="text-[10px] text-white/40 leading-relaxed font-medium italic">{gap.description}</p>
                        </div>
                    </motion.div>
                ))
            )}
        </div>
      </div>

      {/* Insights Section */}
      <div className="space-y-4">
        <h4 className="text-[9px] font-black text-white/30 uppercase tracking-widest italic ml-4">System Insights</h4>
        <div className="space-y-2">
            {soul.compactedInsights.map((insight, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-[10px] text-white/60 font-medium italic leading-relaxed">
                    • {insight}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
