
import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, Heart, Wind } from 'lucide-react';
import { GlobalSoul } from '@/lib/types';

interface TitanDashboardProps {
  soul: GlobalSoul | null;
}

export function TitanDashboard({ soul }: TitanDashboardProps) {
  const stats = [
    { label: 'CNS FATIGUE', value: soul?.crossFunctionalState.cnsFatigue || 5, max: 10, icon: Zap, color: 'text-orange-400' },
    { label: 'RESILIENCE', value: soul?.crossFunctionalState.emotionalResilience || 5, max: 10, icon: Heart, color: 'text-indigo-400' },
    { label: 'SLEEP_REC', value: soul?.crossFunctionalState.sleepQuality || 7, max: 10, icon: Wind, color: 'text-cyan-400' },
    { label: 'BIO_SYNC', value: soul?.overallWellnessScore || 75, max: 100, icon: Activity, color: 'text-emerald-400' }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-black/40 border-b border-white/5 backdrop-blur-xl">
      {stats.map((stat, i) => (
        <motion.div 
          key={stat.label}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="p-4 border border-white/5 rounded-2xl bg-white/[0.02] space-y-3"
        >
          <div className="flex items-center justify-between">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{stat.label}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-end justify-between">
              <span className="text-xl font-black italic tabular-nums">{stat.value}<span className="text-[10px] text-white/20 not-italic ml-1">/{stat.max}</span></span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(stat.value / stat.max) * 100}%` }}
                className={`h-full ${stat.color.replace('text-', 'bg-')}`}
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
