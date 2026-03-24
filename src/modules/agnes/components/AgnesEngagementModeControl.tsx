import React from 'react';
import { cn } from '@/lib/utils';
import {
  AGNES_ENGAGEMENT_MODE_DEFINITIONS,
  AgnesEngagementMode,
} from '../engagement-modes';

interface AgnesEngagementModeControlProps {
  value: AgnesEngagementMode;
  onChange: (mode: AgnesEngagementMode) => void;
  modes: AgnesEngagementMode[];
  compact?: boolean;
  className?: string;
  label?: string;
}

export function AgnesEngagementModeControl({
  value,
  onChange,
  modes,
  compact = false,
  className,
  label = 'Agnes engagement modes',
}: AgnesEngagementModeControlProps) {
  return (
    <div
      className={cn(
        compact
          ? 'flex flex-wrap items-center gap-2'
          : 'grid grid-cols-1 sm:grid-cols-3 gap-3',
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {modes.map((mode) => {
        const definition = AGNES_ENGAGEMENT_MODE_DEFINITIONS[mode];
        const selected = value === mode;

        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={definition.label}
            onClick={() => onChange(mode)}
            className={cn(
              'transition-all duration-300 border text-left',
              compact
                ? 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.24em]'
                : 'rounded-2xl p-4 bg-white/[0.02] min-h-[7.5rem] flex flex-col justify-between',
              selected
                ? 'border-indigo-400/60 bg-indigo-500/12 text-white shadow-[0_0_0_1px_rgba(129,140,248,0.18)]'
                : 'border-white/8 bg-black/20 text-white/55 hover:border-white/20 hover:text-white/80',
            )}
          >
            <div className="space-y-1.5">
              <div className={cn(
                'font-black uppercase italic tracking-wider',
                compact ? 'text-[9px]' : 'text-sm',
              )}>
                {compact ? definition.shortLabel : definition.label}
              </div>
              {!compact && (
                <p className="text-[11px] font-medium leading-relaxed text-inherit/80">
                  {definition.tagline}
                </p>
              )}
            </div>
            {!compact && (
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-inherit/60">
                {definition.summary}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
