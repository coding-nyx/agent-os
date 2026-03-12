import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, CalendarDays, CalendarRange, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// ViewSwitcher — Atlas tab navigation (Today | Week | Month | Focus)
// ---------------------------------------------------------------------------

type AtlasView = 'today' | 'week' | 'month' | 'focus';

interface ViewSwitcherProps {
  activeView: AtlasView;
  onViewChange: (view: AtlasView) => void;
}

const VIEW_TABS: {
  key: AtlasView;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { key: 'today', label: 'Today', icon: Calendar },
  { key: 'week', label: 'Week', icon: CalendarDays },
  { key: 'month', label: 'Month', icon: CalendarRange },
  { key: 'focus', label: 'Focus', icon: Crosshair },
];

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, currentKey: AtlasView) => {
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
    <div className="w-full overflow-x-auto no-scrollbar">
    <nav
      role="tablist"
      aria-label="Atlas view switcher"
      className="inline-flex items-center gap-1 rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/10 p-1"
    >
      {VIEW_TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeView === key;

        return (
          <button
            key={key}
            role="tab"
            id={`atlas-tab-${key}`}
            aria-selected={isActive}
            aria-controls={`atlas-panel-${key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onViewChange(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
            className={cn(
              'relative shrink-0 flex items-center gap-2 px-3 py-1.5 min-h-[36px] sm:min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
              isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>

            {/* Active background pill */}
            {isActive && (
              <motion.div
                layoutId="atlas-view-pill"
                className="absolute inset-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              />
            )}

            {/* Active emerald underline */}
            {isActive && (
              <motion.div
                layoutId="atlas-view-underline"
                className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-400 rounded-full"
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
    </div>
  );
}
