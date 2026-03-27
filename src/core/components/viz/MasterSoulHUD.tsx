import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NeuralStateVector } from '@/lib/types';

export function MasterSoulHUD() {
  const { globalSoul } = useGlobalSoul();
  const state = globalSoul?.crossFunctionalState as NeuralStateVector | undefined;

  const clamp01 = (value: number | null | undefined, fallback = 0.5) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  };

  const toUnit = (value: number | null | undefined, max = 10, fallback = 0.5) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.max(0, Math.min(1, value / max));
  };

  // Root vectors (0.0 to 1.0)
  const vectors = useMemo(() => {
    if (!state) return { resilience: 1, bandwidth: 1, vitality: 1, output: 1, friction: 1 };
    const vitalitySource =
      typeof state.biological?.recoveryScore === 'number'
        ? state.biological.recoveryScore
        : typeof state.biological?.cnsFatigue === 'number'
          ? 10 - state.biological.cnsFatigue
          : null;
    return {
      resilience: toUnit(state.emotional?.emotionalResilience ?? null),
      bandwidth: toUnit(state.cognitive?.energyBudget ?? null),
      vitality: toUnit(vitalitySource),
      output: clamp01(state.cognitive?.taskCompletionRate ?? null),
      friction: toUnit(state.resource?.financialFriction ?? null)
    };
  }, [state]);

  const config = [
    { key: 'resilience', color: '#a855f7', label: 'E' }, // Purple
    { key: 'bandwidth', color: '#3b82f6', label: 'C' },  // Blue
    { key: 'vitality', color: '#10b981', label: 'B' },   // Emerald
    { key: 'output', color: '#f59e0b', label: 'P' },     // Amber
    { key: 'friction', color: '#ef4444', label: 'M' }    // Red
  ];

  return (
    <div className="relative w-12 h-12 flex items-center justify-center group cursor-help">
      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
        {config.map((item, idx) => {
          const radius = 42 - idx * 7;
          const circumference = 2 * Math.PI * radius;
          const value = vectors[item.key as keyof typeof vectors];
          const offset = circumference - value * circumference;
          
          return (
            <g key={item.key}>
              {/* Track */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="white"
                strokeWidth="2"
                className="opacity-5"
              />
              {/* Vector Ring */}
              <motion.circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="3"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                strokeLinecap="round"
                className="drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]"
              />
            </g>
          );
        })}
      </svg>
      
      {/* Tooltip on hover */}
      <div className="absolute top-full right-0 mt-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/[0.12] p-3 rounded-xl shadow-2xl min-w-[140px]">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 mb-2 border-b border-white/[0.09] pb-1">
            GlobalSoul Projection
          </div>
          {config.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest">{item.key}</span>
              <span 
                className="text-[11px] font-mono font-black"
                style={{ color: item.color }}
              >
                {(vectors[item.key as keyof typeof vectors] * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
