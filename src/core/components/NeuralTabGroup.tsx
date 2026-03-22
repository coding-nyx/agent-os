import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export type NeuralThemeColor = 'lime' | 'sky' | 'orange' | 'cyan' | 'purple' | 'rose' | 'amber' | 'indigo' | 'emerald' | 'white' | 'module';

export interface NeuralTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
  renderRight?: (isActive: boolean) => React.ReactNode;
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
  },
  module: {
    activeText: 'text-white',
    pillBg: 'bg-[var(--module-accent-muted)]',
    pillBorder: 'border-[var(--module-accent-border)]',
    underline: 'bg-[var(--module-accent)]',
    badgeBg: 'bg-[var(--module-accent-muted)]',
    badgeBorder: 'border-[var(--module-accent-border)]',
    badgeText: 'text-[var(--module-accent)]'
  }
};

const VARIANT_BADGE_COLORS: Record<string, string> = {
  success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  error: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
  default: '',
};

interface NeuralTabButtonProps {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
  isActive: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  theme: any;
  variant: 'pill' | 'ghost' | 'underlined';
  layoutIdPrefix: string;
  renderRight?: (isActive: boolean) => React.ReactNode;
}

const NeuralTabButton = React.forwardRef<HTMLDivElement, NeuralTabButtonProps>(({
  id,
  label,
  icon: Icon,
  badge,
  badgeVariant,
  isActive,
  onClick,
  onKeyDown,
  theme,
  variant,
  layoutIdPrefix,
  renderRight
}, ref) => {
  const reducedMotion = useReducedMotion();

  return (
    <div
      ref={ref}
      role="tab"
      id={`tab-${id}`}
      aria-selected={isActive}
      aria-controls={`tab-panel-${id}`}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex min-h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] md:text-[12px] font-semibold tracking-[0.02em] whitespace-nowrap transition-[color,background-color,opacity,transform] duration-300 group/tab cursor-pointer outline-none',
        isActive ? theme.activeText : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]',
        isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
      )}
      style={{
        textShadow: isActive ? `0 0 15px ${theme.underline}30` : 'none'
      } as React.CSSProperties}
    >
      <div className="relative z-10 flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 pr-0.5">
          {Icon && <Icon className={cn("h-3.5 w-3.5", isActive ? theme.activeText : "text-white/40")} aria-hidden />}
          <span className={cn(Icon ? "hidden sm:inline" : undefined)}>{label}</span>
        </div>

        {badge !== undefined && (
          <span className={cn(
            "ml-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[10px] font-semibold tabular-nums",
            badgeVariant && badgeVariant !== 'default' 
              ? VARIANT_BADGE_COLORS[badgeVariant] 
              : cn(theme.badgeBg, theme.badgeBorder, theme.badgeText)
          )}>
            {badge}
          </span>
        )}

        {renderRight?.(isActive)}
      </div>

      {isActive && variant === 'pill' && (
        <motion.div
          layoutId={`${layoutIdPrefix}-pill`}
          className={cn(
            "absolute inset-0 rounded-md", 
            theme.pillBg, 
            theme.pillBorder,
            "shadow-[inset_0_0_8px_rgba(255,255,255,0.04)]"
          )}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 35 }
          }
        >
          <div 
            className={cn("absolute inset-0 rounded-xl opacity-20 blur-md", theme.underline)} 
            style={{ filter: 'blur(12px)' }}
          />
        </motion.div>
      )}

      {isActive && variant === 'underlined' && (
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
    </div>
  );
});

NeuralTabButton.displayName = 'NeuralTabButton';

export function NeuralTabGroup<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  themeColor = 'module',
  className,
  layoutIdPrefix = 'neural-tab',
  variant = 'pill'
}: NeuralTabGroupProps<T>) {
  const theme = THEME_MAP[themeColor];
  const tabRefs = useRef<Map<T, HTMLDivElement>>(new Map());

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
      const nextId = tabs[nextIndex].id;
      onTabChange(nextId);
      tabRefs.current.get(nextId)?.focus();
    }
  };

  return (
    <nav
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex w-fit max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-lg p-0.5 no-scrollbar transition-[background-color,border-color,box-shadow] duration-300",
        variant === 'pill' && "bg-black/20 backdrop-blur-md border border-white/[0.05] shadow-inner",
        className
      )}
    >
      {tabs.map((tab) => (
        <NeuralTabButton
          key={tab.id}
          ref={(el: HTMLDivElement | null) => {
            if (el) tabRefs.current.set(tab.id, el);
            else tabRefs.current.delete(tab.id);
          }}
          {...tab}
          isActive={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, tab.id)}
          theme={theme}
          variant={variant}
          layoutIdPrefix={layoutIdPrefix}
        />
      ))}
    </nav>
  );
}
