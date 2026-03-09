/**
 * Quick Start Guide - Viz Components
 * 
 * Copy and paste these examples into your components
 */

// ============================================
// EXAMPLE 1: Simple Metric Cards Grid
// ============================================

import { MetricCard } from '@/core/components/viz';

export function MetricsOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        label="Sleep Quality"
        value={85}
        unit="score"
        change={12.5}
        trendDirection="up"
        sparklineData={[65, 70, 75, 80, 85]}
        color="indigo"
      />
      
      <MetricCard
        label="Active Minutes"
        value={247}
        unit="min"
        change={-5.2}
        trendDirection="down"
        color="orange"
      />
      
      <MetricCard
        label="Heart Rate"
        value={72}
        unit="bpm"
        change={0}
        trendDirection="stable"
        color="cyan"
      />
      
      <MetricCard
        label="Calories"
        value="2,450"
        unit="kcal"
        change={3.8}
        trendDirection="up"
        color="green"
      />
    </div>
  );
}

// ============================================
// EXAMPLE 2: Time Series Chart
// ============================================

import { TimeSeriesChart } from '@/core/components/viz';
import { SurfaceCard } from '@/core/components/SurfaceCard';

export function WeeklyProgress() {
  const weekData = [
    { date: '2024-03-01', value: 85 },
    { date: '2024-03-02', value: 88 },
    { date: '2024-03-03', value: 82 },
    { date: '2024-03-04', value: 90 },
    { date: '2024-03-05', value: 87 },
    { date: '2024-03-06', value: 93 },
    { date: '2024-03-07', value: 91 },
  ];

  return (
    <SurfaceCard className="p-6">
      <TimeSeriesChart
        data={weekData}
        metric="Sleep Quality Trend"
        color="indigo"
        showGradient
        height={250}
      />
    </SurfaceCard>
  );
}

// ============================================
// EXAMPLE 3: Progress Rings
// ============================================

import { ProgressRing } from '@/core/components/viz';

export function GoalsProgress() {
  return (
    <div className="flex gap-8 justify-center items-center">
      <ProgressRing
        percentage={75}
        label="Daily Goal"
        color="indigo"
        size={120}
      />
      
      <ProgressRing
        percentage={92}
        label="Weekly Goal"
        color="emerald"
        size={140}
      />
      
      <ProgressRing
        percentage={45}
        label="Monthly Goal"
        color="amber"
        size={120}
      />
    </div>
  );
}

// ============================================
// EXAMPLE 4: Bar Chart Comparison
// ============================================

import { BarChart } from '@/core/components/viz';

export function ActivityBreakdown() {
  const activityData = [
    { category: 'Sleep', value: 8.5 },
    { category: 'Exercise', value: 6.2 },
    { category: 'Work', value: 9.0 },
    { category: 'Social', value: 4.5 },
    { category: 'Leisure', value: 3.8 },
  ];

  return (
    <SurfaceCard className="p-6">
      <h3 className="text-lg font-bold text-white mb-4">Daily Time Allocation</h3>
      <BarChart
        data={activityData}
        orientation="horizontal"
        color="cyan"
        height={300}
      />
    </SurfaceCard>
  );
}

// ============================================
// EXAMPLE 5: Pie Chart Distribution
// ============================================

import { PieChart } from '@/core/components/viz';

export function MacronutrientBreakdown() {
  const macroData = [
    { label: 'Protein', value: 120 },
    { label: 'Carbs', value: 250 },
    { label: 'Fats', value: 80 },
  ];

  return (
    <SurfaceCard className="p-6">
      <h3 className="text-lg font-bold text-white mb-4">Daily Macros</h3>
      <PieChart
        data={macroData}
        donut
        size={300}
        showLegend
      />
    </SurfaceCard>
  );
}

// ============================================
// EXAMPLE 6: Trend Indicators
// ============================================

import { TrendIndicator, computeTrendValue } from '@/core/components/viz';

export function TrendExample() {
  // Manual trend
  return <TrendIndicator value={12.5} direction="up" size="md" />;
  
  // Or compute from values
  const current = 110;
  const previous = 100;
  const { value, direction } = computeTrendValue(current, previous);
  return <TrendIndicator value={value} direction={direction} />;
}

// ============================================
// EXAMPLE 7: Combined Dashboard
// ============================================

export function HealthDashboard() {
  const weekData = [
    { date: '2024-03-01', value: 85 },
    { date: '2024-03-02', value: 88 },
    { date: '2024-03-03', value: 82 },
    { date: '2024-03-04', value: 90 },
    { date: '2024-03-05', value: 87 },
    { date: '2024-03-06', value: 93 },
    { date: '2024-03-07', value: 91 },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Steps" value="12.5K" change={15.2} color="sky" />
        <MetricCard label="Water" value="2.4L" change={-3.1} color="cyan" />
        <MetricCard label="Mood" value={8.5} change={5.0} color="purple" />
        <MetricCard label="Energy" value={92} unit="%" change={2.3} color="amber" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        <SurfaceCard className="p-6">
          <TimeSeriesChart
            data={weekData}
            metric="Weekly Progress"
            color="emerald"
            height={250}
          />
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <div className="flex justify-center">
            <ProgressRing
              percentage={78}
              label="Daily Goal"
              color="indigo"
              size={200}
            />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

// ============================================
// Color Reference - Module Specific
// ============================================

const MODULE_COLORS = {
  therapy: 'indigo' as const,    // Mental health, therapy
  trainer: 'orange' as const,    // Fitness, workouts
  ledger: 'cyan' as const,       // Finances, tracking
  soma: 'emerald' as const,      // Health, vitals
  atlas: 'sky' as const,         // Navigation, maps
};

/**
 * Use in components:
 * <MetricCard label="Therapy Session" value={5} color={MODULE_COLORS.therapy} />
 * <TimeSeriesChart data={data} metric="Workout Intensity" color={MODULE_COLORS.trainer} />
 */
