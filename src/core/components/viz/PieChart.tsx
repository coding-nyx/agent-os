import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface PieChartSegment {
  label: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieChartSegment[];
  size?: number;
  donut?: boolean;
  donutThickness?: number;
  className?: string;
  showLegend?: boolean;
  animate?: boolean;
}

const DEFAULT_COLORS = [
  'rgba(99, 102, 241, 0.9)',   // Indigo
  'rgba(251, 146, 60, 0.9)',   // Orange
  'rgba(6, 182, 212, 0.9)',    // Cyan
  'rgba(34, 197, 94, 0.9)',    // Green
  'rgba(139, 92, 246, 0.9)',   // Purple
  'rgba(245, 158, 11, 0.9)',   // Amber
  'rgba(14, 165, 233, 0.9)',   // Sky
  'rgba(20, 184, 166, 0.9)',   // Teal
];

export function PieChart({
  data,
  size = 300,
  donut = true,
  donutThickness = 0.4,
  className,
  showLegend = true,
  animate = true,
}: PieChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ width: size, height: size }}>
        <p className="text-sm text-white/40">No data available</p>
      </div>
    );
  }

  const total = data.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2.5;
  const innerRadius = donut ? radius * (1 - donutThickness) : 0;
  const centerX = size / 2;
  const centerY = size / 2;

  // Calculate segments with angles
  let currentAngle = -Math.PI / 2; // Start at top
  const segments = data.map((segment, index) => {
    const percentage = segment.value / total;
    const angle = percentage * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const color = segment.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

    return {
      ...segment,
      percentage,
      startAngle,
      endAngle,
      color,
    };
  });

  const createArcPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) => {
    const startX = centerX + outerRadius * Math.cos(startAngle);
    const startY = centerY + outerRadius * Math.sin(startAngle);
    const endX = centerX + outerRadius * Math.cos(endAngle);
    const endY = centerY + outerRadius * Math.sin(endAngle);

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    if (innerRadius === 0) {
      // Pie slice
      return `M ${centerX} ${centerY} L ${startX} ${startY} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    } else {
      // Donut slice
      const innerStartX = centerX + innerRadius * Math.cos(startAngle);
      const innerStartY = centerY + innerRadius * Math.sin(startAngle);
      const innerEndX = centerX + innerRadius * Math.cos(endAngle);
      const innerEndY = centerY + innerRadius * Math.sin(endAngle);

      return `M ${startX} ${startY} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`;
    }
  };

  const handleSegmentClick = (index: number) => {
    setSelectedIndex(selectedIndex === index ? null : index);
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Chart */}
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Pie chart"
        >
          <defs>
            {segments.map((segment, index) => (
              <filter key={index} id={`pie-glow-${index}`}>
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Segments */}
          {segments.map((segment, index) => {
            const isSelected = selectedIndex === index;
            const isHovered = hoveredIndex === index;
            const isActive = isSelected || isHovered;
            
            // Calculate expanded position for active segment
            const midAngle = (segment.startAngle + segment.endAngle) / 2;
            const expandDistance = isActive ? 10 : 0;
            const offsetX = Math.cos(midAngle) * expandDistance;
            const offsetY = Math.sin(midAngle) * expandDistance;

            const path = createArcPath(
              segment.startAngle,
              segment.endAngle,
              radius,
              innerRadius
            );

            return (
              <g key={index} transform={`translate(${offsetX}, ${offsetY})`}>
                <motion.path
                  d={path}
                  fill={segment.color}
                  stroke="rgba(0, 0, 0, 0.3)"
                  strokeWidth="2"
                  filter={isActive ? `url(#pie-glow-${index})` : undefined}
                  style={{ cursor: 'pointer' }}
                  initial={animate ? { scale: 0, opacity: 0 } : undefined}
                  animate={{ scale: 1, opacity: isActive ? 1 : 0.85 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  onClick={() => handleSegmentClick(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  whileHover={{ opacity: 1 }}
                />

                {/* Percentage label on segment */}
                {segment.percentage > 0.08 && (
                  <text
                    x={centerX + (radius * 0.7) * Math.cos(midAngle) + offsetX}
                    y={centerY + (radius * 0.7) * Math.sin(midAngle) + offsetY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="700"
                    style={{ pointerEvents: 'none' }}
                  >
                    {(segment.percentage * 100).toFixed(0)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Center label for donut */}
          {donut && (
            <g>
              <text
                x={centerX}
                y={centerY - 5}
                textAnchor="middle"
                fill="rgba(255, 255, 255, 0.9)"
                fontSize="28"
                fontWeight="800"
              >
                {total.toFixed(0)}
              </text>
              <text
                x={centerX}
                y={centerY + 18}
                textAnchor="middle"
                fill="rgba(255, 255, 255, 0.5)"
                fontSize="12"
                fontWeight="600"
              >
                TOTAL
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="grid grid-cols-2 gap-3">
          {segments.map((segment, index) => {
            const isSelected = selectedIndex === index;
            const isHovered = hoveredIndex === index;
            return (
              <motion.button
                key={index}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg transition-all',
                  'hover:bg-white/5',
                  (isSelected || isHovered) && 'bg-white/10 ring-1 ring-white/20'
                )}
                onClick={() => handleSegmentClick(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Color dot */}
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: segment.color,
                    boxShadow: `0 0 8px ${segment.color}`,
                  }}
                />

                {/* Label and value */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-white/80 truncate">{segment.label}</p>
                  <p className="text-[10px] text-white/50 font-medium">
                    {segment.value.toFixed(1)} ({(segment.percentage * 100).toFixed(0)}%)
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
