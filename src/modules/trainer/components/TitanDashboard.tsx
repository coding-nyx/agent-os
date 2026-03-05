import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Heart, Wind, Moon, Thermometer, Info } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { VitalsGrid } from '@/core/components/VitalsGrid';

interface TitanDashboardProps {
  soul: GlobalProjection | null;
}

export function TitanDashboard({ soul }: TitanDashboardProps) {
  const { profile } = useAuth();
  const isFemale = profile?.assignedSexAtBirth === 'female';

  const metrics = [
    { label: 'CNS FATIGUE', value: soul?.crossFunctionalState.cnsFatigue || 5, max: 10, icon: Zap, colorClass: 'text-orange-400' },
    { label: 'RESILIENCE', value: soul?.crossFunctionalState.emotionalResilience || 5, max: 10, icon: Heart, colorClass: 'text-indigo-400' },
    { label: 'SLEEP_REC', value: soul?.crossFunctionalState.sleepQuality || 7, max: 10, icon: Wind, colorClass: 'text-cyan-400' },
    { label: 'BIO_SYNC', value: soul?.overallWellnessScore || 75, max: 100, icon: Activity, colorClass: 'text-emerald-400' }
  ];

  return (
    <div className="p-6 bg-black/40 border-b border-white/5 backdrop-blur-xl space-y-6">
      <VitalsGrid metrics={metrics} />

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
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest italic mb-1">Current State</span>
                            <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter italic">{soul?.crossFunctionalState.hormonalContext || 'Follicular Calibration'}</span>
                        </div>
                        <div className="w-px h-6 bg-white/5 self-center" />
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest italic mb-1">Metabolic Intensity</span>
                            <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter italic">Baseline Optimization</span>
                        </div>
                    </div>

                    <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-3 max-w-xs">
                        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <p className="text-[9px] text-white/40 leading-relaxed italic">Titan leverages your cycle data to optimize workload. Workload is currently adjusted for peak neural resilience.</p>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
