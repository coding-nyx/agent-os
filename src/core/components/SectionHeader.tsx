import React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  label?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  accentClassName?: string;
}

export function SectionHeader({
  label,
  title,
  subtitle,
  action,
  className,
  accentClassName = 'text-white/40'
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-1 min-w-0">
        {label && (
          <div className={cn('text-[11px] sm:text-xs font-semibold uppercase tracking-[0.15em] font-display', accentClassName)}>{label}</div>
        )}
        <div className="text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-tight text-white font-display">{title}</div>
        {subtitle && <p className="text-[11px] sm:text-xs md:text-sm text-white/60 max-w-xl leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
