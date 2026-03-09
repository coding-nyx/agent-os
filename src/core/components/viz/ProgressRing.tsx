import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  percentage: number;
  label?: string;
  size?: number;
  strokeWidth?: number;
  color?: 'indigo' | 'orange' | 'cyan' | 'green' | 'blue' | 'purple' | 'amber' | 'teal' | 'emerald' | 'sky' | 'rose';
  showPercentage?: boolean;
  animate?: boolean;
  className?: string;
}

const COLOR_CONFIGS = {
  indigo: { stroke: 'rgba(99, 102, 241, 0.9)', bg: 'rgba(99, 102, 241, 0.15)', glow: 'rgba(99, 102, 241, 0.4)' },
  purple: { stroke: 'rgba(139, 92, 246, 0.9)', bg: 'rgba(139, 92, 246, 0.15)', glow: 'rgba(139, 92, 246, 0.4)' },
  orange: { stroke: 'rgba(251, 146, 60, 0.9)', bg: 'rgba(251, 146, 60, 0.15)', glow: 'rgba(251, 146, 60, 0.4)' },
  amber: { stroke: 'rgba(245, 158, 11, 0.9)', bg: 'rgba(245, 158, 11, 0.15)', glow: 'rgba(245, 158, 11, 0.4)' },
  cyan: { stroke: 'rgba(6, 182, 212, 0.9)', bg: 'rgba(6, 182, 212, 0.15)', glow: 'rgba(6, 182, 212, 0.4)' },
  teal: { stroke: 'rgba(20, 184, 166, 0.9)', bg: 'rgba(20, 184, 166, 0.15)', glow: 'rgba(20, 184, 166, 0.4)' },
  green: { stroke: 'rgba(34, 197, 94, 0.9)', bg: 'rgba(34, 197, 94, 0.15)', glow: 'rgba(34, 197, 94, 0.4)' },
  emerald: { stroke: 'rgba(16, 185, 129, 0.9)', bg: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.4)' },
  blue: { stroke: 'rgba(59, 130, 246, 0.9)', bg: 'rgba(59, 130, 246, 0.15)', glow: 'rgba(59, 130, 246, 0.4)' },
  sky: { stroke: 'rgba(14, 165, 233, 0.9)', bg: 'rgba(14, 165, 233, 0.15)', glow: 'rgba(14, 165, 233, 0.4)' },
  rose: { stroke: 'rgba(244, 63, 94, 0.9)', bg: 'rgba(244, 63, 94, 0.15)', glow: 'rgba(244, 63, 94, 0.4)' },
};

export function ProgressRing({
  percentage,
  label,
  size = 120,
  strokeWidth = 8,
  color = 'indigo',
  showPercentage = true,
  animate = true,
  className,
}: ProgressRingProps) {
  const colors = COLOR_CONFIGS[color] ?? COLOR_CONFIGS.indigo;

  // Clamp percentage between 0 and 100
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  // Calculate circle properties
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedPercentage / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        role="progressbar"
        aria-valuenow={clampedPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label}: ${clampedPercentage}%` : `${clampedPercentage}%`}
      >
        <defs>
          {/* Gradient for progress ring */}
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={colors.stroke} stopOpacity="0.7" />
          </linearGradient>

          {/* Glow filter */}
          <filter id={`ring-glow-${color}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.bg}
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#gradient-${color})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animate ? circumference : offset}
          filter={`url(#ring-glow-${color})`}
          animate={animate ? { strokeDashoffset: offset } : undefined}
          transition={{
            duration: 1.5,
            ease: 'easeInOut',
            delay: 0.2,
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <motion.div
            className="text-center"
            initial={animate ? { opacity: 0, scale: 0.5 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <span
              className="font-black text-white tabular-nums"
              style={{ fontSize: size * 0.22 }}
            >
              {clampedPercentage.toFixed(0)}
            </span>
            <span
              className="font-bold text-white/50"
              style={{ fontSize: size * 0.12 }}
            >
              %
            </span>
          </motion.div>
        )}

        {label && (
          <motion.p
            className="text-white/60 font-semibold text-center px-2 mt-1"
            style={{ fontSize: size * 0.1 }}
            initial={animate ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            {label}
          </motion.p>
        )}
      </div>

      {/* Outer glow effect */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`,
        }}
      />
    </div>
  );
}
