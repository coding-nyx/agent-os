import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/core/components/Skeleton';
import { TrendArrow, TrendDirection } from '@/core/components/TrendArrow';

export interface MetricCardProps {
  label: string;
  value: number | string;
  unit?: string;
  change?: number;
  trendDirection?: TrendDirection;
  sparklineData?: number[];
  color?: 'indigo' | 'orange' | 'cyan' | 'green' | 'blue' | 'purple' | 'amber' | 'teal' | 'emerald' | 'sky';
  className?: string;
  isLoading?: boolean;
}

const COLOR_CONFIGS = {
  indigo: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', stroke: 'rgba(99, 102, 241, 0.9)' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', stroke: 'rgba(139, 92, 246, 0.9)' },
  orange: { text: 'text-[#FF7252]', bg: 'bg-[#DC4B1E]/10', border: 'border-[#DC4B1E]/20', stroke: 'rgba(220, 75, 30, 0.9)' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', stroke: 'rgba(245, 158, 11, 0.9)' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', stroke: 'rgba(6, 182, 212, 0.9)' },
  teal: { text: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', stroke: 'rgba(20, 184, 166, 0.9)' },
  green: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', stroke: 'rgba(34, 197, 94, 0.9)' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', stroke: 'rgba(16, 185, 129, 0.9)' },
  blue: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', stroke: 'rgba(59, 130, 246, 0.9)' },
  sky: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', stroke: 'rgba(14, 165, 233, 0.9)' },
};

export function MetricCard({
  label,
  value,
  unit,
  change,
  trendDirection = 'stable',
  sparklineData,
  color = 'indigo',
  className,
  isLoading = false,
}: MetricCardProps) {
  const colors = COLOR_CONFIGS[color];

  // Generate sparkline path
  const sparklinePath = useMemo(() => {
    if (!sparklineData || sparklineData.length < 2) return '';

    const width = 80;
    const height = 30;
    const points = sparklineData.length;
    const max = Math.max(...sparklineData);
    const min = Math.min(...sparklineData);
    const range = max - min || 1;

    const path = sparklineData
      .map((value, i) => {
        const x = (i / (points - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');

    return path;
  }, [sparklineData]);

  if (isLoading) {
    return (
      <div className={cn('surface-card p-6 space-y-4', className)}>
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-12 w-32 rounded-md" />
        <Skeleton className="h-4 w-16 rounded" />
      </div>
    );
  }

  const changeColor = change !== undefined
    ? change > 0
      ? 'text-emerald-400'
      : change < 0
      ? 'text-red-400'
      : 'text-white/40'
    : 'text-white/40';

  return (
    <motion.div
      className={cn(
        'surface-card p-4 sm:p-6 space-y-3 sm:space-y-4 relative overflow-hidden',
        colors.border,
        'border',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {/* Background accent */}
      <div
        className={cn('absolute inset-0 opacity-5', colors.bg)}
        style={{
          background: `radial-gradient(circle at top right, ${colors.stroke.replace('0.9', '0.15')}, transparent 70%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 space-y-4">
        {/* Label */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] sm:text-xs uppercase tracking-wider text-white/60 font-bold">
            {label}
          </span>
          {trendDirection !== 'stable' && <TrendArrow trend={trendDirection} size="sm" />}
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1.5 sm:gap-2">
          <motion.span
            className={cn('text-3xl sm:text-5xl font-black tracking-tight text-white tabular-nums', colors.text)}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </motion.span>
          {unit && (
            <span className="text-base sm:text-xl font-bold text-white/60 tracking-tight">
              {unit}
            </span>
          )}
        </div>

        {/* Change and Sparkline */}
        <div className="flex items-end justify-between">
          {/* Change percentage */}
          {change !== undefined && (
            <div className={cn('text-sm font-bold', changeColor)}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)}%
            </div>
          )}

          {/* Sparkline mini chart */}
          {sparklineData && sparklineData.length > 1 && (
            <svg
              width="80"
              height="30"
              viewBox="0 0 80 30"
              className="opacity-70"
            >
              <motion.path
                d={sparklinePath}
                fill="none"
                stroke={colors.stroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </svg>
          )}
        </div>
      </div>

      {/* Glow effect */}
      <div
        className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: colors.stroke }}
      />
    </motion.div>
  );
}
