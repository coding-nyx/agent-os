import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface OptimalDeviationScaleProps {
  label: string;
  value: number;
  deviation: number; // -1.0 to 1.0 (relative to optimal)
  unit: string;
  optimalRange: string;
}

export function OptimalDeviationScale({
  label,
  value,
  deviation,
  unit,
  optimalRange
}: OptimalDeviationScaleProps) {
  // deviation of 0 means perfect alignment with optimal.
  // We'll map -1.0 to 1.0 to 0% to 100% on the scale.
  const percentage = 50 + (deviation * 50);
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  const isAnomaly = Math.abs(deviation) > 0.3;

  return (
    <div className="p-4 rounded-2xl bg-white/[0.045] border border-white/[0.09] space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30">{label}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-white tabular-nums">{value}</span>
            <span className="text-[11px] text-white/40 font-mono uppercase">{unit}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-bold text-white/20 uppercase tracking-widest block">Optimal</span>
          <span className="text-xs font-mono text-emerald-400/60">{optimalRange}</span>
        </div>
      </div>

      <div className="relative pt-4 pb-2">
        {/* Scale Track */}
        <div className="h-1.5 w-full bg-white/[0.045] rounded-full relative overflow-hidden">
          {/* Optimal Zone (Center) */}
          <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/20" />
        </div>

        {/* Deviation Marker */}
        <motion.div 
          initial={{ left: '50%' }}
          animate={{ left: `${clampedPercentage}%` }}
          transition={{ type: 'spring', damping: 15 }}
          className="absolute top-2 w-3 h-5 -ml-1.5 flex flex-col items-center gap-1"
        >
          <div className={cn(
            "w-3 h-3 rounded-full border-2 border-black shadow-[0_0_10px_rgba(255,255,255,0.3)]",
            isAnomaly ? "bg-red-500" : "bg-emerald-400"
          )} />
          <div className="w-0.5 h-2 bg-white/20" />
        </motion.div>

        {/* Labels */}
        <div className="flex justify-between mt-2 text-[11px] font-black text-white/20 uppercase tracking-[0.15em]">
          <span>Low</span>
          <span className="text-emerald-500/40">Optimal</span>
          <span>High</span>
        </div>
      </div>

      {isAnomaly && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/5 border border-red-500/10">
          <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-bold text-red-400/80 uppercase tracking-wider">
            {deviation > 0 ? 'Hyper-Deviation Detected' : 'Hypo-Deviation Detected'}
          </span>
        </div>
      )}
    </div>
  );
}
