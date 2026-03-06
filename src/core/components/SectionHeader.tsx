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
      <div className="space-y-1">
        {label && (
          <div className={cn('text-[9px] font-black uppercase tracking-[0.35em] italic', accentClassName)}>{label}</div>
        )}
        <div className="text-2xl md:text-3xl font-black italic uppercase tracking-tight text-white">{title}</div>
        {subtitle && <p className="text-xs md:text-sm text-white/50 max-w-xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
