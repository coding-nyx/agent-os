import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/core/components/Skeleton';

interface ProgressRowProps {
  label: string;
  value?: number | null;
  max?: number;
  suffix?: string;
  accentClassName?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  isLocked?: boolean;
  isDerived?: boolean;
  className?: string;
}

export function ProgressRow({
  label,
  value,
  max = 100,
  suffix,
  accentClassName = 'bg-emerald-500',
  isLoading = false,
  isEmpty = false,
  isLocked = false,
  isDerived = false,
  className
}: ProgressRowProps) {
  const showSkeleton = isLoading || isEmpty || value === null || value === undefined;
  const percent = value !== null && value !== undefined ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="uppercase tracking-[0.12em] text-[9px] font-semibold">{isLocked ? 'SECURED' : label}</span>
        {!showSkeleton && !isLocked && (
          <span className="text-[10px] text-white/40">
            {value}
            {suffix}
          </span>
        )}
      </div>
      {isLocked ? (
        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-white/10" />
        </div>
      ) : showSkeleton ? (
        <Skeleton className="h-2 w-full rounded-full" />
      ) : (
        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className={cn('h-full rounded-full', accentClassName, isDerived ? 'opacity-50' : '')}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
