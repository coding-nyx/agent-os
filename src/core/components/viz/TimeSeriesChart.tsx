import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  metric: string;
  color?: 'indigo' | 'orange' | 'cyan' | 'green' | 'blue' | 'purple' | 'amber' | 'teal' | 'emerald' | 'sky';
  showGradient?: boolean;
  height?: number;
  className?: string;
  showDots?: boolean;
  animate?: boolean;
}

const COLOR_CONFIGS = {
  indigo: { stroke: 'rgba(99, 102, 241, 0.9)', fill: 'rgba(99, 102, 241, 0.2)', glow: 'rgba(99, 102, 241, 0.4)' },
  purple: { stroke: 'rgba(139, 92, 246, 0.9)', fill: 'rgba(139, 92, 246, 0.2)', glow: 'rgba(139, 92, 246, 0.4)' },
  orange: { stroke: 'rgba(251, 146, 60, 0.9)', fill: 'rgba(251, 146, 60, 0.2)', glow: 'rgba(251, 146, 60, 0.4)' },
  amber: { stroke: 'rgba(245, 158, 11, 0.9)', fill: 'rgba(245, 158, 11, 0.2)', glow: 'rgba(245, 158, 11, 0.4)' },
  cyan: { stroke: 'rgba(6, 182, 212, 0.9)', fill: 'rgba(6, 182, 212, 0.2)', glow: 'rgba(6, 182, 212, 0.4)' },
  teal: { stroke: 'rgba(20, 184, 166, 0.9)', fill: 'rgba(20, 184, 166, 0.2)', glow: 'rgba(20, 184, 166, 0.4)' },
  green: { stroke: 'rgba(34, 197, 94, 0.9)', fill: 'rgba(34, 197, 94, 0.2)', glow: 'rgba(34, 197, 94, 0.4)' },
  emerald: { stroke: 'rgba(16, 185, 129, 0.9)', fill: 'rgba(16, 185, 129, 0.2)', glow: 'rgba(16, 185, 129, 0.4)' },
  blue: { stroke: 'rgba(59, 130, 246, 0.9)', fill: 'rgba(59, 130, 246, 0.2)', glow: 'rgba(59, 130, 246, 0.4)' },
  sky: { stroke: 'rgba(14, 165, 233, 0.9)', fill: 'rgba(14, 165, 233, 0.2)', glow: 'rgba(14, 165, 233, 0.4)' },
};

export function TimeSeriesChart({
  data,
  metric,
  color = 'indigo',
  showGradient = true,
  height = 200,
  className,
  showDots = true,
  animate = true,
}: TimeSeriesChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const colors = COLOR_CONFIGS[color];

  const { pathData, areaData, points, maxValue, minValue, yScale } = useMemo(() => {
    if (!data || data.length === 0) {
      return { pathData: '', areaData: '', points: [], maxValue: 0, minValue: 0, yScale: (v: number) => 0 };
    }

    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = 600; // Base width for SVG viewBox
    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.left - padding.right;

    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const scaleY = (value: number) => {
      return padding.top + chartHeight - ((value - min) / range) * chartHeight;
    };

    const scaleX = (index: number) => {
      return padding.left + (index / (data.length - 1)) * chartWidth;
    };

    // Generate smooth curve path using quadratic Bezier curves
    let path = '';
    let area = '';
    const pts: Array<{ x: number; y: number; value: number; date: string }> = [];

    data.forEach((point, i) => {
      const x = scaleX(i);
      const y = scaleY(point.value);
      pts.push({ x, y, value: point.value, date: point.date });

      if (i === 0) {
        path += `M ${x} ${y}`;
        area += `M ${x} ${height - padding.bottom}`;
        area += ` L ${x} ${y}`;
      } else {
        const prevX = scaleX(i - 1);
        const prevY = scaleY(data[i - 1].value);
        const cpX = (prevX + x) / 2;
        
        path += ` Q ${cpX} ${prevY}, ${x} ${y}`;
        area += ` Q ${cpX} ${prevY}, ${x} ${y}`;
      }
    });

    // Close area path
    if (data.length > 0) {
      const lastX = scaleX(data.length - 1);
      area += ` L ${lastX} ${height - padding.bottom} Z`;
    }

    return {
      pathData: path,
      areaData: area,
      points: pts,
      maxValue: max,
      minValue: min,
      yScale: scaleY,
    };
  }, [data, height]);

  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <p className="text-sm text-white/40">No data available</p>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <p className="text-sm text-white/40">Add more readings to see a trend</p>
      </div>
    );
  }

  return (
    <div className={cn('relative w-full', className)}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">{metric}</span>
        <span className="text-xs text-white/40 tabular-nums">
          {data.length} point{data.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Chart SVG */}
      <svg
        viewBox={`0 0 600 ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Time series chart for ${metric}`}
      >
        <defs>
          {/* Gradient fill */}
          {showGradient && (
            <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.fill} stopOpacity="0.8" />
              <stop offset="100%" stopColor={colors.fill} stopOpacity="0.05" />
            </linearGradient>
          )}

          {/* Glow filter */}
          <filter id={`glow-${color}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        <g opacity="0.1">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = 20 + (height - 50) * fraction;
            return (
              <line
                key={fraction}
                x1="40"
                y1={y}
                x2="580"
                y2={y}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}
        </g>

        {/* Area fill */}
        {showGradient && areaData && (
          <motion.path
            d={areaData}
            fill={`url(#gradient-${color})`}
            initial={animate ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}

        {/* Line path */}
        {pathData && (
          <motion.path
            d={pathData}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${color})`}
            initial={animate ? { pathLength: 0, opacity: 0 } : undefined}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          />
        )}

        {/* Data points */}
        {showDots && points.map((point, i) => (
          <g key={i}>
            <motion.circle
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === i ? 6 : 4}
              fill={colors.stroke}
              stroke="rgba(0, 0, 0, 0.5)"
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              initial={animate ? { scale: 0, opacity: 0 } : undefined}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ scale: 1.3 }}
            />
            {/* Tooltip on hover */}
            {hoveredIndex === i && (
              <g>
                <rect
                  x={point.x - 40}
                  y={point.y - 45}
                  width="80"
                  height="35"
                  rx="6"
                  fill="rgba(0, 0, 0, 0.9)"
                  stroke={colors.stroke}
                  strokeWidth="1"
                />
                <text
                  x={point.x}
                  y={point.y - 28}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="600"
                >
                  {point.value.toFixed(1)}
                </text>
                <text
                  x={point.x}
                  y={point.y - 15}
                  textAnchor="middle"
                  fill="rgba(255, 255, 255, 0.5)"
                  fontSize="9"
                >
                  {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              </g>
            )}
          </g>
        ))}

        {/* Y-axis labels */}
        <g>
          {[maxValue, (maxValue + minValue) / 2, minValue].map((value, i) => {
            const y = yScale(value);
            return (
              <text
                key={i}
                x="35"
                y={y + 4}
                textAnchor="end"
                fill="rgba(255, 255, 255, 0.4)"
                fontSize="10"
                fontWeight="500"
              >
                {value.toFixed(0)}
              </text>
            );
          })}
        </g>

        {/* X-axis labels */}
        {data.length <= 10 && (
          <g>
            {points.map((point, i) => {
              if (i % Math.ceil(points.length / 5) === 0 || i === points.length - 1) {
                return (
                  <text
                    key={i}
                    x={point.x}
                    y={height - 10}
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.4)"
                    fontSize="9"
                  >
                    {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                );
              }
              return null;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
