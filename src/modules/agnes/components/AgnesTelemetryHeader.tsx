import React from 'react';
import { Brain, Zap, Heart, Shield } from 'lucide-react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { motion } from 'framer-motion';

export function AgnesTelemetryHeader() {
  const { globalSoul } = useGlobalSoul();
  const emotional = globalSoul?.crossFunctionalState?.emotional;

  if (!emotional) return null;

  const metrics = [
    { 
      label: 'Resilience', 
      value: emotional.emotionalResilience ?? 0, 
      icon: Heart, 
      color: 'text-indigo-400',
      bg: 'bg-indigo-400/10' 
    },
    { 
      label: 'Stress Load', 
      value: emotional.stressLoad ?? 0, 
      icon: Zap, 
      color: emotional.stressLoad && emotional.stressLoad > 7 ? 'text-rose-400' : 'text-amber-400',
      bg: emotional.stressLoad && emotional.stressLoad > 7 ? 'bg-rose-400/10' : 'bg-amber-400/10'
    },
    { 
        label: 'Sync Status', 
        value: 'E2EE', 
        icon: Shield, 
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10' 
      },
  ];

  return (
    <div className="w-full flex items-center gap-3 sm:gap-6 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/[0.03] border border-white/5 backdrop-blur-xl overflow-x-auto no-scrollbar">
      {metrics.map((m, i) => (
        <div key={i} className="flex items-center gap-2.5 group">
          <div className={`p-1.5 rounded-lg ${m.bg} ${m.color} transition-transform group-hover:scale-110`}>
            <m.icon className="w-3 h-3" />
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-white/30">{m.label}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-white tabular-nums leading-none">
                {typeof m.value === 'number' ? `${m.value}/10` : m.value}
            </span>
          </div>
          {i < metrics.length - 1 && (
            <div className="h-3 sm:h-4 w-px bg-white/5 ml-1 sm:ml-2" />
          )}
        </div>
      ))}
    </div>
  );
}
