import React, { ReactNode } from 'react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: string | number;
  icon?: ReactNode;
  colorClass?: string;
  labelColorClass?: string;
}

interface StatsGridProps {
  stats: StatItem[];
  className?: string;
}

export function StatsGrid({ stats, className }: StatsGridProps) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3", className)}>
      {stats.map((stat, i) => (
        <SurfaceCard key={i} className="p-3">
          <div className={cn("text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1", stat.labelColorClass || "text-white/40")}>
            {stat.icon}
            {stat.label}
          </div>
          <div className={cn("text-2xl font-black tabular-nums", stat.colorClass || "text-white/90")}>
            {stat.value}
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
}