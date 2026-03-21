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

const PLANNING_VIEWS: {
  key: Exclude<AtlasView, 'focus'>;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { key: 'today', label: 'Today', icon: Calendar },
  { key: 'week', label: 'Week', icon: CalendarDays },
  { key: 'month', label: 'Month', icon: CalendarRange },
];

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  const reducedMotion = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, currentKey: AtlasView) => {
    // Only handle arrow keys for planning views
    if (currentKey === 'focus') return;
    
    const currentIndex = PLANNING_VIEWS.findIndex((t) => t.key === currentKey);
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % PLANNING_VIEWS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + PLANNING_VIEWS.length) % PLANNING_VIEWS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = PLANNING_VIEWS.length - 1;
    }

    if (nextIndex >= 0) {
      onViewChange(PLANNING_VIEWS[nextIndex].key);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 3-segment toggle for planning views */}
      <nav
        role="tablist"
        aria-label="Atlas planning view switcher"
        className="inline-flex items-center gap-1 rounded-xl bg-black/20 backdrop-blur-md border border-white/[0.05] shadow-inner p-1"
      >
        {PLANNING_VIEWS.map(({ key, label, icon: Icon }) => {
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
                'relative flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold tracking-[0.02em] whitespace-nowrap transition-all duration-300',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
                isActive ? 'text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.02]',
                isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 md:h-4 md:w-4", isActive ? "text-white" : "text-white/40")} aria-hidden />
              <span className="relative z-10">{label}</span>

              {/* Active background pill */}
              {isActive && (
                <motion.div
                  layoutId="atlas-planning-pill"
                  className={cn(
                    "absolute inset-0 rounded-lg",
                    "bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]",
                    "shadow-[inset_0_0_12px_rgba(255,255,255,0.05)]"
                  )}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 500, damping: 35 }
                  }
                >
                  <div 
                    className="absolute inset-0 rounded-lg opacity-20 blur-md bg-[var(--module-accent)]" 
                    style={{ filter: 'blur(8px)' }}
                  />
                </motion.div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Detached Focus button */}
      <NeuralButton
        variant={activeView === 'focus' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('focus')}
        className={cn(
          "h-[40px] px-4 gap-2",
          activeView === 'focus' 
            ? "shadow-[0_0_20px_var(--module-accent)30]" 
            : "bg-black/20 backdrop-blur-md border border-white/[0.05] hover:bg-white/5 text-white/70 hover:text-white"
        )}
      >
        <Crosshair className="w-4 h-4" />
        <span className="font-semibold tracking-[0.02em]">Focus Mode</span>
      </NeuralButton>
    </div>
  );
}