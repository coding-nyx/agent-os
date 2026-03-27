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
  /** Optional node rendered below the value — use for badges or secondary context. */
  subLabel?: React.ReactNode;
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
  className,
  subLabel,
}: StatCardProps) {
  const showSkeleton = isLoading || isEmpty || value === null || value === undefined;

  return (
    <SurfaceCard className={cn('p-4 md:p-5', className)}>
      <div className="flex items-start justify-between min-w-0 gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/50 font-semibold truncate leading-tight">
          {isLocked ? 'SECURED' : label}
        </span>
        {!isLocked && delta && (
          <span className={cn('text-[11px] font-bold shrink-0 tabular-nums', accentClassName)}>{delta}</span>
        )}
      </div>
      {isLocked ? (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-black tracking-tight text-amber-300/70">•••</span>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-2 w-14 rounded-full opacity-50" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cn(
                'text-2xl md:text-3xl font-black tracking-tight text-white/95 tabular-nums truncate leading-none',
                isDerived && 'text-white/45 blur-[0.3px]'
              )}
            >
              {value}
            </span>
            {suffix && (
              <span className="text-[12px] text-white/50 shrink-0 font-medium">{suffix}</span>
            )}
          </div>
          {subLabel && <div className="mt-2">{subLabel}</div>}
        </>
      )}
    </SurfaceCard>
  );
}
