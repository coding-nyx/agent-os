import React, { useMemo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CashFlowDataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface CashFlowChartProps {
  data: CashFlowDataPoint[];
  currency?: string;
  className?: string;
}

export function CashFlowChart({ data, currency = 'USD', className }: CashFlowChartProps) {
  const { maxValue, paths, points } = useMemo(() => {
    if (data.length === 0) return { maxValue: 0, paths: { income: '', expenses: '' }, points: [] };

    const allValues = data.flatMap(d => [d.income, d.expenses]);
    const max = Math.max(...allValues, 1);
    
    const width = 600;
    const height = 200;
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const stepX = chartWidth / Math.max(data.length - 1, 1);
    
    const buildPath = (values: number[]) => {
      return values
        .map((value, index) => {
          const x = padding + index * stepX;
          const y = padding + chartHeight - (value / max) * chartHeight;
          return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
    };

    const incomePath = buildPath(data.map(d => d.income));
    const expensesPath = buildPath(data.map(d => d.expenses));

    return {
      maxValue: max,
      paths: {
        income: incomePath,
        expenses: expensesPath
      },
      points: data.map((d, index) => ({
        x: padding + index * stepX,
        income: padding + chartHeight - (d.income / max) * chartHeight,
        expenses: padding + chartHeight - (d.expenses / max) * chartHeight,
        month: d.month,
        incomeValue: d.income,
        expensesValue: d.expenses
      }))
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-48 text-white/40 text-sm", className)}>
        No cash flow data available
      </div>
    );
  }

  return (
    <div className={className}>
      <svg viewBox="0 0 600 200" className="w-full h-48">
        <defs>
          <linearGradient id="incomeGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="expensesGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((percent) => {
          const y = 20 + (180 * (100 - percent)) / 100;
          return (
            <g key={percent}>
              <line
                x1="20"
                y1={y}
                x2="580"
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x="10"
                y={y + 4}
                fill="rgba(255,255,255,0.3)"
                fontSize="10"
                textAnchor="end"
              >
                {percent}%
              </text>
            </g>
          );
        })}

        {/* Income area */}
        {paths.income && (
          <path
            d={`${paths.income} L 580 200 L 20 200 Z`}
            fill="url(#incomeGradient)"
          />
        )}

        {/* Expenses area */}
        {paths.expenses && (
          <path
            d={`${paths.expenses} L 580 200 L 20 200 Z`}
            fill="url(#expensesGradient)"
          />
        )}

        {/* Income line */}
        {paths.income && (
          <path
            d={paths.income}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Expenses line */}
        {paths.expenses && (
          <path
            d={paths.expenses}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.income}
              r="4"
              fill="#10b981"
              className="cursor-pointer hover:r-6 transition-all"
            >
              <title>
                {point.month}: {formatCurrency(point.incomeValue, currency)}
              </title>
            </circle>
            <circle
              cx={point.x}
              cy={point.expenses}
              r="4"
              fill="#ef4444"
              className="cursor-pointer hover:r-6 transition-all"
            >
              <title>
                {point.month}: {formatCurrency(point.expensesValue, currency)}
              </title>
            </circle>

            {/* Month labels */}
            {index % Math.ceil(data.length / 6) === 0 && (
              <text
                x={point.x}
                y="195"
                fill="rgba(255,255,255,0.4)"
                fontSize="9"
                textAnchor="middle"
              >
                {point.month}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-xs text-white/70">Income</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs text-white/70">Expenses</span>
        </div>
      </div>
    </div>
  );
}

interface DebtPayoffDataPoint {
  month: string;
  balance: number;
}

interface DebtPayoffTrackerProps {
  data: DebtPayoffDataPoint[];
  currency?: string;
  className?: string;
}

export function DebtPayoffTracker({ data, currency = 'USD', className }: DebtPayoffTrackerProps) {
  const { maxValue, path, trend } = useMemo(() => {
    if (data.length === 0) return { maxValue: 0, path: '', trend: null };

    const max = Math.max(...data.map(d => d.balance), 1);
    
    const width = 600;
    const height = 150;
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const stepX = chartWidth / Math.max(data.length - 1, 1);
    
    const pathStr = data
      .map((point, index) => {
        const x = padding + index * stepX;
        const y = padding + chartHeight - (point.balance / max) * chartHeight;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    // Calculate trend
    const firstBalance = data[0]?.balance || 0;
    const lastBalance = data[data.length - 1]?.balance || 0;
    const trendValue = data.length > 1 ? ((lastBalance - firstBalance) / firstBalance) * 100 : 0;

    return {
      maxValue: max,
      path: pathStr,
      trend: trendValue
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-36 text-white/40 text-sm", className)}>
        No debt data available
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Debt Reduction Timeline
        </span>
        {trend !== null && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-bold",
            trend < 0 ? "text-emerald-400" : "text-amber-400"
          )}>
            {trend < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>

      <svg viewBox="0 0 600 150" className="w-full h-36">
        <defs>
          <linearGradient id="debtGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((percent) => {
          const y = 20 + (130 * (100 - percent)) / 100;
          return (
            <line
              key={percent}
              x1="20"
              y1={y}
              x2="580"
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}

        {/* Area fill */}
        {path && (
          <path
            d={`${path} L 580 150 L 20 150 Z`}
            fill="url(#debtGradient)"
          />
        )}

        {/* Line */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points with labels */}
        {data.map((point, index) => {
          const x = 20 + index * ((600 - 40) / Math.max(data.length - 1, 1));
          const y = 20 + 130 - (point.balance / maxValue) * 130;
          
          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r="4"
                fill="#06b6d4"
                className="cursor-pointer"
              >
                <title>
                  {point.month}: {formatCurrency(point.balance, currency)}
                </title>
              </circle>
              
              {/* Show labels for first, last, and every few points */}
              {(index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 4) === 0) && (
                <>
                  <text
                    x={x}
                    y={y - 10}
                    fill="#06b6d4"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatCurrency(point.balance / 1000, currency)}
                  </text>
                  <text
                    x={x}
                    y="145"
                    fill="rgba(255,255,255,0.4)"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {point.month}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
