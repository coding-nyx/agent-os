import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
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
  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-48 text-white/40 text-sm", className)}>
        No cash flow data available
      </div>
    );
  }

  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="month" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
            tickFormatter={(val) => formatCurrency(val, currency).replace(/\.00$/, '')}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
            formatter={(val: any) => [formatCurrency(Number(val), currency), '']}
          />
          <Area 
            type="monotone" 
            dataKey="income" 
            stroke="#10b981" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorIncome)" 
          />
          <Area 
            type="monotone" 
            dataKey="expenses" 
            stroke="#ef4444" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorExpenses)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DebtDataPoint {
  name: string;
  balance: number;
  color: string;
}

interface DebtPayoffTrackerProps {
  debts: DebtDataPoint[];
  currency?: string;
  className?: string;
}

export function DebtPayoffTracker({ debts, currency = 'USD', className }: DebtPayoffTrackerProps) {
  if (debts.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-48 text-white/40 text-sm", className)}>
        No debt data available
      </div>
    );
  }

  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={debts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis 
            type="number" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
            tickFormatter={(val) => formatCurrency(val, currency).replace(/\.00$/, '')}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 'bold' }}
            width={100}
          />
          <Tooltip 
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
            formatter={(val: any) => [formatCurrency(Number(val), currency), 'Balance']}
          />
          <Bar dataKey="balance" radius={[0, 4, 4, 0]} barSize={20}>
            {debts.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
