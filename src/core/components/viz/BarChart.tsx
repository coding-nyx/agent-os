import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BarChartDataPoint {
  category: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDataPoint[];
  orientation?: 'vertical' | 'horizontal';
  height?: number;
  className?: string;
  showValues?: boolean;
  animate?: boolean;
  color?: 'indigo' | 'orange' | 'cyan' | 'green' | 'blue' | 'purple' | 'amber' | 'teal' | 'emerald' | 'sky';
}

const COLOR_CONFIGS = {
  indigo: { base: 'rgba(99, 102, 241, 0.7)', hover: 'rgba(99, 102, 241, 0.9)', glow: 'rgba(99, 102, 241, 0.3)' },
  purple: { base: 'rgba(139, 92, 246, 0.7)', hover: 'rgba(139, 92, 246, 0.9)', glow: 'rgba(139, 92, 246, 0.3)' },
  orange: { base: 'rgba(251, 146, 60, 0.7)', hover: 'rgba(251, 146, 60, 0.9)', glow: 'rgba(251, 146, 60, 0.3)' },
  amber: { base: 'rgba(245, 158, 11, 0.7)', hover: 'rgba(245, 158, 11, 0.9)', glow: 'rgba(245, 158, 11, 0.3)' },
  cyan: { base: 'rgba(6, 182, 212, 0.7)', hover: 'rgba(6, 182, 212, 0.9)', glow: 'rgba(6, 182, 212, 0.3)' },
  teal: { base: 'rgba(20, 184, 166, 0.7)', hover: 'rgba(20, 184, 166, 0.9)', glow: 'rgba(20, 184, 166, 0.3)' },
  green: { base: 'rgba(34, 197, 94, 0.7)', hover: 'rgba(34, 197, 94, 0.9)', glow: 'rgba(34, 197, 94, 0.3)' },
  emerald: { base: 'rgba(16, 185, 129, 0.7)', hover: 'rgba(16, 185, 129, 0.9)', glow: 'rgba(16, 185, 129, 0.3)' },
  blue: { base: 'rgba(59, 130, 246, 0.7)', hover: 'rgba(59, 130, 246, 0.9)', glow: 'rgba(59, 130, 246, 0.3)' },
  sky: { base: 'rgba(14, 165, 233, 0.7)', hover: 'rgba(14, 165, 233, 0.9)', glow: 'rgba(14, 165, 233, 0.3)' },
};

export function BarChart({
  data,
  orientation = 'vertical',
  height = 300,
  className,
  showValues = true,
  animate = true,
  color = 'indigo',
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const colors = COLOR_CONFIGS[color];

  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <p className="text-sm text-white/40">No data available</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const width = 600;
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;

  if (orientation === 'horizontal') {
    const barHeight = chartHeight / data.length;
    const barGap = Math.min(barHeight * 0.2, 10);
    const actualBarHeight = barHeight - barGap;

    return (
      <div className={cn('relative w-full', className)}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height }}
          role="img"
          aria-label="Horizontal bar chart"
        >
          <defs>
            <filter id={`bar-glow-${color}`}>
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          <g opacity="0.1">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const x = padding.left + chartWidth * fraction;
              return (
                <line
                  key={fraction}
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              );
            })}
          </g>

          {/* Bars */}
          {data.map((item, index) => {
            const barWidth = (item.value / maxValue) * chartWidth;
            const y = padding.top + index * barHeight + barGap / 2;
            const isHovered = hoveredIndex === index;

            return (
              <g key={index}>
                {/* Bar */}
                <motion.rect
                  x={padding.left}
                  y={y}
                  width={barWidth}
                  height={actualBarHeight}
                  rx="6"
                  fill={isHovered ? colors.hover : colors.base}
                  filter={isHovered ? `url(#bar-glow-${color})` : undefined}
                  style={{ cursor: 'pointer' }}
                  initial={animate ? { width: 0 } : undefined}
                  animate={{ width: barWidth }}
                  transition={{ duration: 0.8, delay: index * 0.1, ease: 'easeOut' }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  whileHover={{ y: y - 2 }}
                />

                {/* Category label */}
                <text
                  x={padding.left - 10}
                  y={y + actualBarHeight / 2}
                  textAnchor="end"
                  fill="rgba(255, 255, 255, 0.7)"
                  fontSize="12"
                  fontWeight="500"
                  dominantBaseline="middle"
                >
                  {item.category}
                </text>

                {/* Value label */}
                {showValues && (
                  <motion.text
                    x={padding.left + barWidth + 8}
                    y={y + actualBarHeight / 2}
                    textAnchor="start"
                    fill="rgba(255, 255, 255, 0.9)"
                    fontSize="13"
                    fontWeight="700"
                    dominantBaseline="middle"
                    initial={animate ? { opacity: 0 } : undefined}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.1 + 0.4 }}
                  >
                    {item.value.toFixed(1)}
                  </motion.text>
                )}
              </g>
            );
          })}

          {/* X-axis labels */}
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const x = padding.left + chartWidth * fraction;
              const value = (maxValue * fraction).toFixed(0);
              return (
                <text
                  key={fraction}
                  x={x}
                  y={height - padding.bottom + 20}
                  textAnchor="middle"
                  fill="rgba(255, 255, 255, 0.4)"
                  fontSize="10"
                >
                  {value}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    );
  }

  // Vertical orientation
  const barWidth = chartWidth / data.length;
  const barGap = Math.min(barWidth * 0.2, 20);
  const actualBarWidth = barWidth - barGap;

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Vertical bar chart"
      >
        <defs>
          <filter id={`bar-glow-${color}`}>
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        <g opacity="0.1">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padding.top + chartHeight * (1 - fraction);
            return (
              <line
                key={fraction}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}
        </g>

        {/* Bars */}
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const x = padding.left + index * barWidth + barGap / 2;
          const y = height - padding.bottom - barHeight;
          const isHovered = hoveredIndex === index;

          return (
            <g key={index}>
              {/* Bar */}
              <motion.rect
                x={x}
                y={y}
                width={actualBarWidth}
                height={barHeight}
                rx="6"
                fill={isHovered ? colors.hover : colors.base}
                filter={isHovered ? `url(#bar-glow-${color})` : undefined}
                style={{ cursor: 'pointer' }}
                initial={animate ? { height: 0, y: height - padding.bottom } : undefined}
                animate={{ height: barHeight, y }}
                transition={{ duration: 0.8, delay: index * 0.1, ease: 'easeOut' }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                whileHover={{ scaleX: 1.08, scaleY: 1.02 }}
              />

              {/* Value label */}
              {showValues && (
                <motion.text
                  x={x + actualBarWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  fill="rgba(255, 255, 255, 0.9)"
                  fontSize="12"
                  fontWeight="700"
                  initial={animate ? { opacity: 0 } : undefined}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 + 0.4 }}
                >
                  {item.value.toFixed(1)}
                </motion.text>
              )}

              {/* Category label */}
              <text
                x={x + actualBarWidth / 2}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fill="rgba(255, 255, 255, 0.7)"
                fontSize="11"
                fontWeight="500"
              >
                {item.category.length > 8 ? item.category.substring(0, 8) + '...' : item.category}
              </text>
            </g>
          );
        })}

        {/* Y-axis labels */}
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padding.top + chartHeight * (1 - fraction);
            const value = (maxValue * fraction).toFixed(0);
            return (
              <text
                key={fraction}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="rgba(255, 255, 255, 0.4)"
                fontSize="10"
              >
                {value}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
