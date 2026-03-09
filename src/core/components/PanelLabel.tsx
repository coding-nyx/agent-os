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
 * Enforces text-chip (12px) styling and consistent visual rhythm.
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
      className={cn('flex items-center justify-between', className)}
      style={{ marginBottom: 'var(--panel-section-gap)' }}
    >
      <span className={cn(
        'text-chip text-white/50 tracking-[0.25em]',
        labelClassName
      )}>
        {label}
      </span>
      {metadata && (
        <span className={cn(
          'text-[10px] font-mono uppercase text-white/30 tracking-widest',
          metadataClassName
        )}>
          {metadata}
        </span>
      )}
    </div>
  );
}
