import React from 'react';
import { ChevronUp, ChevronDown, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TrendDirection = 'up' | 'stable' | 'down' | 'unknown';

interface TrendArrowProps {
  trend: TrendDirection;
  size?: 'sm' | 'md';
  className?: string;
}

const TREND_CONFIG: Record<TrendDirection, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  colorClass: string;
}> = {
  up: { icon: ChevronUp, label: 'Trending up', colorClass: 'text-emerald-400' },
  stable: { icon: Minus, label: 'Stable', colorClass: 'text-sky-300' },
  down: { icon: ChevronDown, label: 'Trending down', colorClass: 'text-amber-400' },
  unknown: { icon: RefreshCw, label: 'Not yet calibrated', colorClass: 'text-white/40' }
};

export function TrendArrow({ trend, size = 'sm', className }: TrendArrowProps) {
  const config = TREND_CONFIG[trend];
  const Icon = config.icon;
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span
      className={cn('inline-flex items-center', config.colorClass, className)}
      aria-label={config.label}
      role="img"
    >
      <Icon className={sizeClass} />
    </span>
  );
}

export function computeTrend(
  current: number | null | undefined,
  previous: number | null | undefined
): TrendDirection {
  if (current === null || current === undefined) return 'unknown';
  if (previous === null || previous === undefined) return 'unknown';
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return 'stable';
  return diff > 0 ? 'up' : 'down';
}
