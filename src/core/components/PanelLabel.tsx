import React from 'react';
import { cn } from '@/lib/utils';

interface PanelLabelProps {
  label: string;
  metadata?: string;
  className?: string;
  labelClassName?: string;
  metadataClassName?: string;
}

/**
 * PanelLabel - Standardized sub-header for panel sections.
 * Even spacing and typography across breakpoints.
 */
export function PanelLabel({
  label,
  metadata,
  className,
  labelClassName,
  metadataClassName
}: PanelLabelProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 min-h-[1.5rem] mb-3 sm:mb-4',
        className
      )}
    >
      <span
        className={cn(
          'text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] text-white/50 leading-tight',
          labelClassName
        )}
      >
        {label}
      </span>
      {metadata && (
        <span
          className={cn(
            'text-[11px] sm:text-xs uppercase tracking-wider text-white/40 tabular-nums shrink-0',
            metadataClassName
          )}
        >
          {metadata}
        </span>
      )}
    </div>
  );
}
