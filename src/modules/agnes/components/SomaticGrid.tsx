import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SomaticCell {
  label: string;
  color: string;
  vector: 'resilience' | 'bandwidth';
}

const GRID_CONFIG: SomaticCell[][] = [
  [
    { label: 'TENSION', color: '#ef4444', vector: 'resilience' },
    { label: 'STRESS', color: '#f97316', vector: 'resilience' },
    { label: 'ANGER', color: '#dc2626', vector: 'resilience' },
  ],
  [
    { label: 'GRIEF', color: '#8b5cf6', vector: 'resilience' },
    { label: 'CALM', color: '#10b981', vector: 'resilience' },
    { label: 'JOY', color: '#ec4899', vector: 'resilience' },
  ],
  [
    { label: 'FOG', color: '#64748b', vector: 'bandwidth' },
    { label: 'FLOW', color: '#06b6d4', vector: 'bandwidth' },
    { label: 'PEAK', color: '#f59e0b', vector: 'bandwidth' },
  ]
];

export function SomaticGrid({ onLog }: { onLog: (data: { label: string, intensity: number, valence: number, arousal: number }) => void }) {
  const [activeCell, setActiveCell] = useState<{ r: number, c: number } | null>(null);
  const [intensity, setIntensity] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStart = (r: number, c: number) => {
    setActiveCell({ r, c });
    setIntensity(0.1);
    timerRef.current = setInterval(() => {
      setIntensity(prev => Math.min(1.0, prev + 0.05));
    }, 100);
  };

  const handleEnd = () => {
    if (activeCell && intensity > 0.1) {
      const cell = GRID_CONFIG[activeCell.r][activeCell.c];
      
      // Mapping coordinates to Valence (x) and Arousal (y)
      // r (y): top=0 (High Arousal), middle=1 (Neutral), bottom=2 (Low Arousal)
      // c (x): left=0 (Negative Valence), middle=1 (Neutral), right=2 (Positive Valence)
      
      const valence = (activeCell.c - 1); // -1, 0, 1
      const arousal = (1 - activeCell.r); // 1, 0, -1
      
      onLog({ 
        label: cell.label, 
        intensity, 
        valence,
        arousal
      });
    }
    setActiveCell(null);
    setIntensity(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-900/50 rounded-3xl border border-white/[0.09] backdrop-blur-sm">
      <div className="text-center mb-2">
        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Somatic Input Protocol</span>
        <p className="text-[11px] text-white/20">Press and hold to increase intensity</p>
      </div>

      <div className="grid grid-cols-3 gap-2 aspect-square">
        {GRID_CONFIG.map((row, r) => (
          row.map((cell, c) => {
            const isActive = activeCell?.r === r && activeCell?.c === c;
            return (
              <motion.button
                key={`${r}-${c}`}
                onPointerDown={() => handleStart(r, c)}
                onPointerUp={handleEnd}
                onPointerLeave={handleEnd}
                className="relative rounded-2xl overflow-hidden border border-white/[0.09] bg-white/[0.045] flex flex-col items-center justify-center gap-1 touch-none"
                whileTap={{ scale: 0.95 }}
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 0.2, scale: 2 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: cell.color }}
                    />
                  )}
                </AnimatePresence>
                <span className="text-[11px] font-black tracking-widest text-white/40 z-10">{cell.label}</span>
                {isActive && (
                  <motion.div 
                    className="h-1 bg-white/40 rounded-full mt-1 z-10"
                    style={{ width: `${intensity * 80}%` }}
                  />
                )}
              </motion.button>
            );
          })
        ))}
      </div>

      {intensity > 0 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-[11px] font-mono text-white/20">INTENSITY</span>
          <span className="text-xs font-black tabular-nums text-white">{(intensity * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
