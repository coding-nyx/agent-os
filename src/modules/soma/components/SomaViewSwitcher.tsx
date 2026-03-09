/**
 * Soma View Switcher - Tab navigation for Soma module
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Heart, Dumbbell, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export type SomaView = 'dashboard' | 'vitals' | 'assessments' | 'history';

interface SomaViewSwitcherProps {
  activeView: SomaView;
  onViewChange: (view: SomaView) => void;
}

const VIEW_TABS: {
  key: SomaView;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Activity },
  { key: 'vitals', label: 'Vitals', icon: Heart },
  { key: 'assessments', label: 'Assessments', icon: Dumbbell },
  { key: 'history', label: 'History', icon: History },
];

export function SomaViewSwitcher({ activeView, onViewChange }: SomaViewSwitcherProps) {
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, currentKey: SomaView) => {
    const currentIndex = VIEW_TABS.findIndex((t) => t.key === currentKey);
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % VIEW_TABS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = VIEW_TABS.length - 1;
    }

    if (nextIndex >= 0) {
      onViewChange(VIEW_TABS[nextIndex].key);
    }
  };

  return (
    <nav
      role="tablist"
      aria-label="Soma view switcher"
      className="inline-flex items-center gap-1 rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/10 p-1"
    >
      {VIEW_TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeView === key;

        return (
          <button
            key={key}
            role="tab"
            id={`soma-tab-${key}`}
            aria-selected={isActive}
            aria-controls={`soma-panel-${key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onViewChange(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
              isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            <span>{label}</span>

            {/* Active background pill */}
            {isActive && (
              <motion.div
                layoutId="soma-view-pill"
                className="absolute inset-0 rounded-xl bg-cyan-500/10 border border-cyan-500/20"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              />
            )}

            {/* Active cyan underline */}
            {isActive && (
              <motion.div
                layoutId="soma-view-underline"
                className="absolute bottom-0 left-3 right-3 h-0.5 bg-cyan-400 rounded-full"
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
