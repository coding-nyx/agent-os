import React from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';
import { BarChart } from './BarChart';
import { PieChart } from './PieChart';
import { MetricCard } from './MetricCard';
import { TrendIndicator } from './TrendIndicator';
import { ProgressRing } from './ProgressRing';
import { SurfaceCard } from '../SurfaceCard';

/**
 * Visual test suite for all visualization components
 * 
 * This component displays all viz components with sample data
 * to verify styling, animations, and interactivity.
 * 
 * Usage:
 * Import this component in your app and render it to see all charts.
 */
export function VizShowcase() {
  // Sample data for TimeSeriesChart
  const timeSeriesData = [
    { date: '2024-03-01', value: 85 },
    { date: '2024-03-02', value: 88 },
    { date: '2024-03-03', value: 82 },
    { date: '2024-03-04', value: 90 },
    { date: '2024-03-05', value: 87 },
    { date: '2024-03-06', value: 93 },
    { date: '2024-03-07', value: 91 },
    { date: '2024-03-08', value: 95 },
  ];

  // Sample data for BarChart
  const barChartData = [
    { category: 'Sleep', value: 8.5 },
    { category: 'Exercise', value: 6.2 },
    { category: 'Nutrition', value: 7.8 },
    { category: 'Mindfulness', value: 5.5 },
    { category: 'Social', value: 9.1 },
  ];

  // Sample data for PieChart
  const pieChartData = [
    { label: 'Cardio', value: 45 },
    { label: 'Strength', value: 30 },
    { label: 'Flexibility', value: 15 },
    { label: 'Recovery', value: 10 },
  ];

  // Sample sparkline data
  const sparklineData = [65, 68, 72, 70, 75, 78, 82, 80, 85];

  return (
    <div className="min-h-screen bg-[var(--void)] p-8 space-y-12">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-black text-white tracking-tight">
            Neural Viz Library
          </h1>
          <p className="text-white/60 text-lg">
            Reusable SVG-based data visualization components with Neural styling
          </p>
        </div>

        {/* MetricCard Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Metric Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              label="Sleep Quality"
              value={85}
              unit="score"
              change={12.5}
              trendDirection="up"
              sparklineData={sparklineData}
              color="indigo"
            />
            <MetricCard
              label="Active Minutes"
              value={247}
              unit="min"
              change={-5.2}
              trendDirection="down"
              sparklineData={[120, 130, 125, 135, 145, 140, 150]}
              color="orange"
            />
            <MetricCard
              label="Calories Burned"
              value="2,450"
              unit="kcal"
              change={3.8}
              trendDirection="up"
              color="green"
            />
            <MetricCard
              label="Heart Rate"
              value={72}
              unit="bpm"
              change={0}
              trendDirection="stable"
              sparklineData={[70, 72, 71, 73, 72, 71, 72]}
              color="cyan"
            />
          </div>
        </section>

        {/* TrendIndicator Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Trend Indicators</h2>
          <SurfaceCard className="p-8">
            <div className="flex flex-wrap gap-4 items-center">
              <TrendIndicator value={12.5} direction="up" size="sm" />
              <TrendIndicator value={8.3} direction="up" size="md" />
              <TrendIndicator value={-5.2} direction="down" size="md" />
              <TrendIndicator value={-2.1} direction="down" size="lg" />
              <TrendIndicator value={0.3} direction="neutral" size="md" />
              <TrendIndicator value={25.8} direction="up" size="lg" showIcon={false} />
            </div>
          </SurfaceCard>
        </section>

        {/* ProgressRing Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Progress Rings</h2>
          <SurfaceCard className="p-8">
            <div className="flex flex-wrap gap-12 justify-center items-center">
              <ProgressRing percentage={75} label="Goals" color="indigo" size={120} />
              <ProgressRing percentage={92} label="Activity" color="orange" size={140} />
              <ProgressRing percentage={45} label="Recovery" color="cyan" size={100} />
              <ProgressRing percentage={88} label="Nutrition" color="green" size={120} />
              <ProgressRing percentage={100} color="emerald" size={100} />
            </div>
          </SurfaceCard>
        </section>

        {/* TimeSeriesChart Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Time Series Charts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SurfaceCard className="p-6">
              <TimeSeriesChart
                data={timeSeriesData}
                metric="Sleep Quality"
                color="indigo"
                showGradient
                height={250}
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <TimeSeriesChart
                data={[
                  { date: '2024-03-01', value: 180 },
                  { date: '2024-03-02', value: 195 },
                  { date: '2024-03-03', value: 210 },
                  { date: '2024-03-04', value: 205 },
                  { date: '2024-03-05', value: 220 },
                  { date: '2024-03-06', value: 235 },
                  { date: '2024-03-07', value: 240 },
                ]}
                metric="Active Minutes"
                color="orange"
                showGradient
                height={250}
              />
            </SurfaceCard>
          </div>

          {/* Additional color variations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SurfaceCard className="p-6">
              <TimeSeriesChart
                data={timeSeriesData}
                metric="Heart Rate Variability"
                color="cyan"
                showGradient={false}
                height={200}
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <TimeSeriesChart
                data={timeSeriesData}
                metric="Stress Level"
                color="amber"
                height={200}
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <TimeSeriesChart
                data={timeSeriesData}
                metric="Mindfulness"
                color="purple"
                height={200}
              />
            </SurfaceCard>
          </div>
        </section>

        {/* BarChart Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Bar Charts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Vertical Bar Chart</h3>
              <BarChart
                data={barChartData}
                orientation="vertical"
                color="indigo"
                height={300}
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Horizontal Bar Chart</h3>
              <BarChart
                data={barChartData}
                orientation="horizontal"
                color="orange"
                height={300}
              />
            </SurfaceCard>
          </div>

          {/* More bar charts with different colors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Workout Types</h3>
              <BarChart
                data={[
                  { category: 'Running', value: 12 },
                  { category: 'Cycling', value: 8 },
                  { category: 'Swimming', value: 5 },
                  { category: 'Yoga', value: 10 },
                ]}
                orientation="vertical"
                color="cyan"
                height={280}
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Daily Goals</h3>
              <BarChart
                data={[
                  { category: 'Mon', value: 95 },
                  { category: 'Tue', value: 88 },
                  { category: 'Wed', value: 92 },
                  { category: 'Thu', value: 78 },
                  { category: 'Fri', value: 85 },
                  { category: 'Sat', value: 90 },
                  { category: 'Sun', value: 100 },
                ]}
                orientation="vertical"
                color="green"
                height={280}
              />
            </SurfaceCard>
          </div>
        </section>

        {/* PieChart Section */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Pie Charts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Exercise Distribution (Donut)</h3>
              <PieChart
                data={pieChartData}
                donut
                size={300}
                showLegend
              />
            </SurfaceCard>
            <SurfaceCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Macronutrient Breakdown</h3>
              <PieChart
                data={[
                  { label: 'Protein', value: 120 },
                  { label: 'Carbs', value: 250 },
                  { label: 'Fats', value: 80 },
                ]}
                donut
                donutThickness={0.5}
                size={300}
                showLegend
              />
            </SurfaceCard>
          </div>

          <SurfaceCard className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">Sleep Stages</h3>
            <PieChart
              data={[
                { label: 'Deep Sleep', value: 2.5 },
                { label: 'Light Sleep', value: 4.0 },
                { label: 'REM', value: 1.5 },
                { label: 'Awake', value: 0.5 },
              ]}
              donut
              size={280}
              showLegend
            />
          </SurfaceCard>
        </section>

        {/* Combined Dashboard Example */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Combined Dashboard</h2>
          <p className="text-white/60">Example of all components working together</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <SurfaceCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">Weekly Progress</h3>
                  <TrendIndicator value={8.5} direction="up" />
                </div>
                <TimeSeriesChart
                  data={timeSeriesData}
                  metric="Overall Score"
                  color="emerald"
                  height={280}
                />
              </SurfaceCard>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Steps" value="12.5K" change={15.2} color="sky" />
                <MetricCard label="Water" value="2.4L" change={-3.1} color="cyan" />
                <MetricCard label="Mood" value={8.5} change={5.0} color="purple" />
                <MetricCard label="Energy" value={92} unit="%" change={2.3} color="amber" />
              </div>
            </div>

            <div className="space-y-6">
              <SurfaceCard className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Daily Goal</h3>
                <div className="flex justify-center">
                  <ProgressRing
                    percentage={78}
                    label="Complete"
                    color="indigo"
                    size={180}
                  />
                </div>
              </SurfaceCard>

              <SurfaceCard className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Activity Mix</h3>
                <PieChart
                  data={pieChartData.slice(0, 3)}
                  donut
                  size={200}
                  showLegend
                />
              </SurfaceCard>
            </div>
          </div>
        </section>

        {/* Color Palette Reference */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Color Palette</h2>
          <SurfaceCard className="p-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              {['indigo', 'orange', 'cyan', 'green', 'purple', 'amber', 'blue', 'teal', 'emerald', 'sky'].map((color) => (
                <div key={color} className="space-y-3">
                  <div className="flex items-center justify-center">
                    <ProgressRing
                      percentage={75}
                      color={color as any}
                      size={80}
                      showPercentage={false}
                    />
                  </div>
                  <p className="text-center text-sm font-semibold text-white/80 capitalize">
                    {color}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </section>

        {/* Module Colors */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Module-Specific Colors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <SurfaceCard className="p-6 text-center space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-indigo-400 font-bold">Therapy</h3>
              <ProgressRing percentage={85} color="indigo" size={100} />
              <p className="text-xs text-white/40">Indigo / Purple</p>
            </SurfaceCard>

            <SurfaceCard className="p-6 text-center space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-orange-400 font-bold">Trainer</h3>
              <ProgressRing percentage={72} color="orange" size={100} />
              <p className="text-xs text-white/40">Orange / Amber</p>
            </SurfaceCard>

            <SurfaceCard className="p-6 text-center space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-cyan-400 font-bold">Ledger</h3>
              <ProgressRing percentage={90} color="cyan" size={100} />
              <p className="text-xs text-white/40">Cyan / Teal</p>
            </SurfaceCard>

            <SurfaceCard className="p-6 text-center space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-emerald-400 font-bold">Soma</h3>
              <ProgressRing percentage={68} color="emerald" size={100} />
              <p className="text-xs text-white/40">Green / Emerald</p>
            </SurfaceCard>

            <SurfaceCard className="p-6 text-center space-y-3">
              <h3 className="text-sm uppercase tracking-wider text-sky-400 font-bold">Atlas</h3>
              <ProgressRing percentage={95} color="sky" size={100} />
              <p className="text-xs text-white/40">Blue / Sky</p>
            </SurfaceCard>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-8 text-white/40 text-sm">
          <p>Neural Viz Library • SVG-based • Fully Accessible • Framer Motion Animations</p>
        </div>
      </div>
    </div>
  );
}
