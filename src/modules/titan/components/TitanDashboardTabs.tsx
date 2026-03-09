import React from 'react';
import { motion } from 'framer-motion';
import { Activity, TestTube2, ShieldCheck, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// TitanDashboardTabs — 3-tab switcher for the merged Titan dashboard
// Training | Biomarkers | Recovery
// ---------------------------------------------------------------------------

type TitanTab = 'training' | 'biomarkers' | 'recovery' | 'diagnosis';

interface TitanDashboardTabsProps {
  activeTab: TitanTab;
  onTabChange: (tab: TitanTab) => void;
  biomarkerCount?: number;
  clearanceStatus?: 'granted' | 'denied' | 'conditional' | null;
}

const TABS: {
  key: TitanTab;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { key: 'training', label: 'Training', icon: Activity },
  { key: 'biomarkers', label: 'Biomarkers', icon: TestTube2 },
  { key: 'recovery', label: 'Recovery', icon: ShieldCheck },
  { key: 'diagnosis', label: 'Diagnosis', icon: FileText },
];

const CLEARANCE_BADGE_COLORS: Record<string, string> = {
  granted: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  denied: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
  conditional: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
};

export function TitanDashboardTabs({
  activeTab,
  onTabChange,
  biomarkerCount,
  clearanceStatus,
}: TitanDashboardTabsProps) {
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, currentKey: TitanTab) => {
    const currentIndex = TABS.findIndex((t) => t.key === currentKey);
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = TABS.length - 1;
    }

    if (nextIndex >= 0) {
      onTabChange(TABS[nextIndex].key);
    }
  };

  return (
    <nav
      role="tablist"
      aria-label="Titan dashboard tabs"
      className="inline-flex items-center gap-1 rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/10 p-1"
    >
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            role="tab"
            id={`titan-tab-${key}`}
            aria-selected={isActive}
            aria-controls={`titan-panel-${key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
              isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            <span>{label}</span>

            {/* Biomarker count badge */}
            {key === 'biomarkers' && typeof biomarkerCount === 'number' && biomarkerCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-orange-500/20 border border-orange-500/30 text-[10px] font-bold text-orange-300 tabular-nums px-1">
                {biomarkerCount}
              </span>
            )}

            {/* Clearance status badge */}
            {key === 'recovery' && clearanceStatus && (
              <span
                className={cn(
                  'ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider',
                  CLEARANCE_BADGE_COLORS[clearanceStatus] ?? 'bg-white/10 border-white/20 text-white/50'
                )}
              >
                {clearanceStatus}
              </span>
            )}

            {/* Active background pill */}
            {isActive && (
              <motion.div
                layoutId="titan-tab-pill"
                className="absolute inset-0 rounded-xl bg-orange-500/10 border border-orange-500/20"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              />
            )}

            {/* Active orange underline */}
            {isActive && (
              <motion.div
                layoutId="titan-tab-underline"
                className="absolute bottom-0 left-3 right-3 h-0.5 bg-orange-400 rounded-full"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
