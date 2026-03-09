import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export type NeuralThemeColor = 'lime' | 'sky' | 'orange' | 'cyan' | 'purple' | 'rose' | 'amber' | 'indigo' | 'emerald' | 'white';

export interface NeuralTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
}

interface NeuralTabGroupProps<T extends string = string> {
  tabs: NeuralTabItem<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  themeColor?: NeuralThemeColor;
  className?: string;
  layoutIdPrefix?: string;
  variant?: 'pill' | 'ghost' | 'underlined';
}

const THEME_MAP: Record<NeuralThemeColor, { 
  activeText: string, 
  pillBg: string, 
  pillBorder: string, 
  underline: string,
  badgeBg: string,
  badgeBorder: string,
  badgeText: string
}> = {
  lime: {
    activeText: 'text-white',
    pillBg: 'bg-lime-500/10',
    pillBorder: 'border-lime-500/20',
    underline: 'bg-lime-400',
    badgeBg: 'bg-lime-500/20',
    badgeBorder: 'border-lime-500/30',
    badgeText: 'text-lime-300'
  },
  sky: {
    activeText: 'text-white',
    pillBg: 'bg-sky-500/10',
    pillBorder: 'border-sky-500/20',
    underline: 'bg-sky-400',
    badgeBg: 'bg-sky-500/20',
    badgeBorder: 'border-sky-500/30',
    badgeText: 'text-sky-300'
  },
  orange: {
    activeText: 'text-white',
    pillBg: 'bg-orange-500/10',
    pillBorder: 'border-orange-500/20',
    underline: 'bg-orange-400',
    badgeBg: 'bg-orange-500/20',
    badgeBorder: 'border-orange-500/30',
    badgeText: 'text-orange-300'
  },
  cyan: {
    activeText: 'text-white',
    pillBg: 'bg-cyan-500/10',
    pillBorder: 'border-cyan-500/20',
    underline: 'bg-cyan-400',
    badgeBg: 'bg-cyan-500/20',
    badgeBorder: 'border-cyan-500/30',
    badgeText: 'text-cyan-300'
  },
  purple: {
    activeText: 'text-white',
    pillBg: 'bg-purple-500/10',
    pillBorder: 'border-purple-500/20',
    underline: 'bg-purple-400',
    badgeBg: 'bg-purple-500/20',
    badgeBorder: 'border-purple-500/30',
    badgeText: 'text-purple-300'
  },
  rose: {
    activeText: 'text-white',
    pillBg: 'bg-rose-500/10',
    pillBorder: 'border-rose-500/20',
    underline: 'bg-rose-400',
    badgeBg: 'bg-rose-500/20',
    badgeBorder: 'border-rose-500/30',
    badgeText: 'text-rose-300'
  },
  amber: {
    activeText: 'text-white',
    pillBg: 'bg-amber-500/10',
    pillBorder: 'border-amber-500/20',
    underline: 'bg-amber-400',
    badgeBg: 'bg-amber-500/20',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-300'
  },
  indigo: {
    activeText: 'text-white',
    pillBg: 'bg-indigo-500/10',
    pillBorder: 'border-indigo-500/20',
    underline: 'bg-indigo-400',
    badgeBg: 'bg-indigo-500/20',
    badgeBorder: 'border-indigo-500/30',
    badgeText: 'text-indigo-300'
  },
  white: {
    activeText: 'text-white',
    pillBg: 'bg-white/10',
    pillBorder: 'border-white/20',
    underline: 'bg-white',
    badgeBg: 'bg-white/10',
    badgeBorder: 'border-white/20',
    badgeText: 'text-white/80'
  },
  emerald: {
    activeText: 'text-white',
    pillBg: 'bg-emerald-500/10',
    pillBorder: 'border-emerald-500/20',
    underline: 'bg-emerald-400',
    badgeBg: 'bg-emerald-500/20',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-300'
  }
};

const VARIANT_BADGE_COLORS: Record<string, string> = {
  success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  error: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
  default: '',
};

export function NeuralTabGroup<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  themeColor = 'white',
  className,
  layoutIdPrefix = 'neural-tab',
  variant = 'pill'
}: NeuralTabGroupProps<T>) {
  const reducedMotion = useReducedMotion();
  const theme = THEME_MAP[themeColor];

  const handleKeyDown = (e: React.KeyboardEvent, currentId: T) => {
    const currentIndex = tabs.findIndex((t) => t.id === currentId);
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex >= 0) {
      onTabChange(tabs[nextIndex].id);
    }
  };

  return (
    <nav
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl p-1 overflow-x-auto no-scrollbar max-w-full transition-all duration-500",
        variant === 'pill' && "bg-black/20 backdrop-blur-md border border-white/[0.05] shadow-inner",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.15em] transition-all duration-500 whitespace-nowrap shrink-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
              isActive ? theme.activeText : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]',
              isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            )}
            style={{
              // Add a subtle text shadow for active tabs to make them pop
              textShadow: isActive ? `0 0 15px ${theme.underline}30` : 'none'
            } as React.CSSProperties}
          >
            {Icon && <Icon className={cn("w-3 md:w-3.5 h-3 md:h-3.5", isActive ? theme.activeText : "text-white/40")} aria-hidden />}
            <span>{tab.label}</span>

            {/* Badges */}
            {tab.badge !== undefined && (
              <span className={cn(
                "ml-0.5 md:ml-1 inline-flex items-center justify-center min-w-[14px] md:min-w-[18px] h-[14px] md:h-[18px] rounded-full border text-[8px] md:text-[9px] font-bold tabular-nums px-1 md:px-1.5",
                tab.badgeVariant && tab.badgeVariant !== 'default' 
                  ? VARIANT_BADGE_COLORS[tab.badgeVariant] 
                  : cn(theme.badgeBg, theme.badgeBorder, theme.badgeText)
              )}>
                {tab.badge}
              </span>
            )}

            {/* Active background pill */}
            {isActive && variant === 'pill' && (
              <motion.div
                layoutId={`${layoutIdPrefix}-pill`}
                className={cn("absolute inset-0 rounded-xl", theme.pillBg, theme.pillBorder)}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 35 }
                }
              />
            )}

            {/* Active underline */}
            {isActive && (variant === 'pill' || variant === 'underlined') && (
              <motion.div
                layoutId={`${layoutIdPrefix}-underline`}
                className={cn("absolute bottom-0 left-3 right-3 h-0.5 rounded-full", theme.underline)}
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
