import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, CalendarDays, CalendarRange, Crosshair } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
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
      className="inline-flex items-center gap-1.5 rounded-2xl bg-black/20 backdrop-blur-md border border-white/[0.05] shadow-inner p-1.5"
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
              'relative flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] md:text-[13px] font-semibold tracking-[0.02em] whitespace-nowrap transition-all duration-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
              isActive ? 'text-white' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]',
              isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            )}
            style={{
              textShadow: isActive ? `0 0 15px var(--module-accent)30` : 'none'
            } as React.CSSProperties}
          >
            <Icon className={cn("h-4 w-4 md:h-[1.125rem] md:w-[1.125rem]", isActive ? "text-white" : "text-white/40")} aria-hidden />
            <span className="relative z-10">{label}</span>

            {/* Active background pill */}
            {isActive && (
              <motion.div
                layoutId="atlas-view-pill"
                className={cn(
                  "absolute inset-0 rounded-xl",
                  "bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]",
                  "shadow-[inset_0_0_12px_rgba(255,255,255,0.05)]"
                )}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              >
                {/* Glow effect matching the theme color */}
                <div 
                  className="absolute inset-0 rounded-xl opacity-20 blur-md bg-[var(--module-accent)]" 
                  style={{ filter: 'blur(12px)' }}
                />
              </motion.div>
            )}
          </button>
        );
      })}
    </nav>
    </div>
  );
}
