import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { LayoutList, Share2, Box, Activity, Shield, Sparkles, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import type { ReactiveGaugeProps } from '../constants';
import type { AuthMode } from '@/core/components/UnifiedAuthModal';
import type { ModuleId } from '@/lib/module-manifest';

// --- View Switcher with labels + keyboard shortcuts ---

type ViewMode = '3D' | 'GRAPH' | 'CARDS';

interface HubViewSwitcherProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function HubViewSwitcher({ viewMode, setViewMode }: HubViewSwitcherProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') setViewMode('CARDS');
      if (e.key === '2') setViewMode('GRAPH');
      if (e.key === '3') setViewMode('3D');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setViewMode]);

  const views = [
    { mode: 'CARDS' as const, icon: LayoutList, label: 'Cards', key: '1' },
    { mode: 'GRAPH' as const, icon: Share2, label: 'Graph', key: '2' },
    { mode: '3D' as const, icon: Box, label: '3D', key: '3' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Hub view modes"
      className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 shadow-2xl pointer-events-auto"
    >
      {views.map(({ mode, icon: ModeIcon, label, key }) => (
        <button
          key={mode}
          role="tab"
          id={`tab-${mode.toLowerCase()}`}
          aria-selected={viewMode === mode}
          aria-controls={`panel-${mode.toLowerCase()}`}
          tabIndex={viewMode === mode ? 0 : -1}
          onClick={() => setViewMode(mode)}
          onKeyDown={(e) => {
            const idx = views.findIndex(v => v.mode === mode);
            if (e.key === 'ArrowRight') setViewMode(views[(idx + 1) % views.length].mode);
            if (e.key === 'ArrowLeft') setViewMode(views[(idx - 1 + views.length) % views.length].mode);
          }}
          className={cn(
            "relative flex flex-col items-center gap-0.5 w-12 py-1.5 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50",
            viewMode === mode ? "bg-white/15 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5"
          )}
          aria-label={`Switch to ${label} View (${key})`}
        >
          <ModeIcon className="w-4 h-4" />
          <span className="text-[7px] uppercase tracking-wider font-bold">{label}</span>
        </button>
      ))}
    </div>
  );
}

// --- Reactive Gauge with progress bar ---

export function ReactiveGauge({ label, value, colorClass, icon: Icon }: ReactiveGaugeProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const prevValue = useRef(value);
  const isEmpty = value === null || value === undefined;
  const displayValue = isEmpty ? '—' : typeof value === 'number' ? `${Math.round(value)}%` : value;
  const numericValue = typeof value === 'number' ? value : null;

  useEffect(() => {
    if (prevValue.current !== value) {
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 1000);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <div
      className="flex flex-col min-w-[80px]"
      role="meter"
      aria-label={label}
      aria-valuenow={numericValue ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="text-[10px] text-white/50 uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className={cn(
        "text-2xl font-bold leading-none transition-all duration-300",
        isEmpty ? "text-white/40" : colorClass,
        !isEmpty && isSyncing && "animate-pulse scale-110 blur-[1px] brightness-150"
      )}>
        {displayValue}
      </span>
      {/* Progress bar */}
      <div className="h-1 w-full bg-white/5 rounded-full mt-2 overflow-hidden">
        {numericValue !== null && (
          <motion.div
            className={cn("h-full rounded-full", colorClass.replace('text-', 'bg-'))}
            initial={{ width: 0 }}
            animate={{ width: `${numericValue}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
}

// --- Bottom Dashboard ---

interface HubBottomDashboardProps {
  lockedModules: Array<{ id: string }>;
  wellnessGauge: number | null;
  stabilityGauge: number | null;
  resilienceGauge: number | null;
  openAuth: (mode: AuthMode) => void;
  primaryLockedModule: ModuleId | undefined;
}

export function HubBottomDashboard({
  lockedModules, wellnessGauge, stabilityGauge, resilienceGauge, openAuth, primaryLockedModule
}: HubBottomDashboardProps) {
  return (
    <div className="mt-auto pb-6 sm:pb-10 px-4 sm:px-6 md:px-12 pointer-events-auto relative z-20 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-black/60 backdrop-blur-3xl border border-white/10 p-2 rounded-[32px] shadow-2xl">
        {lockedModules.length > 0 ? (
          <div className="flex-1 flex items-center gap-4 px-6 py-3 bg-amber-500/5 rounded-[24px] border border-amber-500/10">
            <Lock className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block mb-0.5">Vault Encrypted</span>
              <p className="text-[9px] text-white/50 uppercase">
                {lockedModules.length} module{lockedModules.length > 1 ? 's' : ''} locked. Initialize handshake to sync.
              </p>
            </div>
            <NeuralButton size="sm" onClick={() => openAuth(primaryLockedModule ?? 'global')} className="bg-amber-600 hover:bg-amber-500 h-9 px-6 text-[10px]">
              Sync Now
            </NeuralButton>
          </div>
        ) : (
          <div className="flex-1 px-4">
            <NeuralIntegrity mode="global" onUpgrade={() => openAuth('global')} />
          </div>
        )}

        <div className="hidden md:block w-px h-12 bg-white/5" />

        <div className="flex items-center gap-4 sm:gap-8 px-4 sm:px-8 py-3">
          <ReactiveGauge label="Wellness" value={wellnessGauge} colorClass="text-indigo-400" icon={Sparkles} />
          <div className="w-px h-8 bg-white/5 shrink-0 hidden sm:block" />
          <ReactiveGauge label="Stability" value={stabilityGauge} colorClass="text-orange-400" icon={Activity} />
          <div className="w-px h-8 bg-white/5 shrink-0 hidden sm:block" />
          <ReactiveGauge label="Resilience" value={resilienceGauge} colorClass="text-cyan-400" icon={Shield} />
        </div>
      </div>
    </div>
  );
}
