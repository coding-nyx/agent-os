import React from 'react';
import { Zap, Heart, Shield } from 'lucide-react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';

export function AgnesTelemetryHeader() {
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
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
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl sm:rounded-full bg-white/[0.045] border border-white/[0.09] backdrop-blur-xl">
      {metrics.map((m, i) => (
        <div key={i} className="flex items-center gap-2 sm:gap-2.5 group min-w-0">
          <div
            title={m.label}
            className={`shrink-0 p-1.5 rounded-lg ${m.bg} ${m.color} transition-transform group-hover:scale-110`}
          >
            <m.icon className="w-3 h-3" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40 truncate">
              {m.label}
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold text-white tabular-nums leading-none">
                {typeof m.value === 'number' ? `${m.value}/10` : m.value}
            </span>
          </div>
          {i < metrics.length - 1 && (
            <div className="hidden sm:block h-4 w-px bg-white/[0.045] ml-2" />
          )}
        </div>
      ))}
    </div>
  );
}
