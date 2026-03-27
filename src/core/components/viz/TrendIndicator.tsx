import React from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TrendDirection = 'up' | 'down' | 'neutral';

interface TrendIndicatorProps {
  value: number;
  direction?: TrendDirection;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showSign?: boolean;
  className?: string;
  animate?: boolean;
}

const SIZE_CONFIG = {
  sm: { text: 'text-xs', icon: 'w-3 h-3' },
  md: { text: 'text-sm', icon: 'w-4 h-4' },
  lg: { text: 'text-base', icon: 'w-5 h-5' },
};

export function TrendIndicator({
  value,
  direction: propDirection,
  size = 'md',
  showIcon = true,
  showSign = true,
  className,
  animate = true,
}: TrendIndicatorProps) {
  // Auto-detect direction if not provided
  const direction = propDirection || (value > 0 ? 'up' : value < 0 ? 'down' : 'neutral');

  const sizeConfig = SIZE_CONFIG[size];

  // Color based on direction
  const colorClass = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-white/40',
  }[direction];

  const bgClass = {
    up: 'bg-emerald-500/10',
    down: 'bg-red-500/10',
    neutral: 'bg-white/[0.045]',
  }[direction];

  const IconComponent = {
    up: ChevronUp,
    down: ChevronDown,
    neutral: Minus,
  }[direction];

  const formattedValue = Math.abs(value).toFixed(1);

  return (
    <motion.div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full',
        bgClass,
        className
      )}
      initial={animate ? { opacity: 0, scale: 0.8 } : undefined}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Icon */}
      {showIcon && (
        <motion.div
          initial={animate ? { rotate: direction === 'up' ? -180 : direction === 'down' ? 180 : 0 } : undefined}
          animate={{ rotate: 0 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
        >
          <IconComponent className={cn(sizeConfig.icon, colorClass)} />
        </motion.div>
      )}

      {/* Value */}
      <span className={cn('font-bold tabular-nums', sizeConfig.text, colorClass)}>
        {showSign && direction !== 'neutral' && (direction === 'up' ? '+' : '-')}
        {formattedValue}%
      </span>
    </motion.div>
  );
}

// Utility function to compute trend from two values
export function computeTrendValue(current: number, previous: number): { value: number; direction: TrendDirection } {
  if (previous === 0) {
    return { value: 0, direction: 'neutral' };
  }

  const change = ((current - previous) / previous) * 100;
  const direction = Math.abs(change) < 0.5 ? 'neutral' : change > 0 ? 'up' : 'down';

  return { value: change, direction };
}
