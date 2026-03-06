import React from 'react';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { Skeleton } from '@/core/components/Skeleton';

interface StatCardProps {
  label: string;
  value?: string | number | null;
  suffix?: string;
  delta?: string;
  accentClassName?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  isLocked?: boolean;
  isDerived?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  suffix,
  delta,
  accentClassName = 'text-emerald-400',
  isLoading = false,
  isEmpty = false,
  isLocked = false,
  isDerived = false,
  className
}: StatCardProps) {
  const showSkeleton = isLoading || isEmpty || value === null || value === undefined;

  return (
    <SurfaceCard className={cn('p-4 md:p-5 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black italic">
          {isLocked ? 'SECURED' : label}
        </span>
        {!isLocked && delta && <span className={cn('text-[10px] font-semibold', accentClassName)}>{delta}</span>}
      </div>
      {isLocked ? (
        <div className="flex items-end gap-2">
          <span className="text-xl font-black tracking-tight text-amber-300/70">***</span>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-2 w-16 rounded-full opacity-60" />
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <span
            className={cn(
              'text-2xl font-black tracking-tight text-white tabular-nums',
              isDerived ? 'text-white/50 blur-[0.3px]' : ''
            )}
          >
            {value}
          </span>
          {suffix && <span className="text-[11px] text-white/40 mb-1">{suffix}</span>}
        </div>
      )}
    </SurfaceCard>
  );
}
