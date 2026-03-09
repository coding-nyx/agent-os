/**
 * BiomarkerCharts - Enhanced data visualization components for biomarker trends
 * Uses dashboard-viz components for improved rendering
 */

import React, { useMemo } from 'react';
import type { BiomarkerRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { TimeSeriesChart, TimeSeriesDataPoint } from '@/core/components/viz/TimeSeriesChart';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface BiomarkerChartsProps {
  biomarkers: BiomarkerRecord[];
  className?: string;
}

interface GroupedBiomarker {
  name: string;
  data: TimeSeriesDataPoint[];
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
  latestValue: number;
  sparklineData: number[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calculateTrend(data: TimeSeriesDataPoint[]): { trend: 'up' | 'down' | 'stable'; change: number } {
  if (data.length < 2) return { trend: 'stable', change: 0 };

  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  
  const change = ((last - first) / first) * 100;
  
  if (Math.abs(change) < 2) return { trend: 'stable', change };
  if (change > 0) return { trend: 'up', change };
  return { trend: 'down', change };
}

export function BiomarkerCharts({ biomarkers, className }: BiomarkerChartsProps) {
  // Group biomarkers by name and create time series
  const groupedBiomarkers = useMemo(() => {
    const grouped = new Map<string, BiomarkerRecord[]>();
    
    biomarkers.forEach((bio) => {
      const existing = grouped.get(bio.name) || [];
      existing.push(bio);
      grouped.set(bio.name, existing);
    });

    const result: GroupedBiomarker[] = [];

    grouped.forEach((records, name) => {
      // Only show biomarkers with numeric values and multiple data points
      const numericRecords = records.filter(r => typeof r.value === 'number');
      
      if (numericRecords.length > 1) {
        const data: TimeSeriesDataPoint[] = numericRecords
          .map(r => ({
            date: r.recordedAt,
            value: r.value as number,
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const { trend, change } = calculateTrend(data);
        const latestValue = data[data.length - 1].value;
        const sparklineData = data.slice(-7).map(d => d.value); // Last 7 data points

        result.push({
          name,
          data,
          unit: records[0].unit,
          trend,
          change,
          latestValue,
          sparklineData,
        });
      }
    });

    // Sort by most recent activity
    return result.sort((a, b) => {
      const aLatest = new Date(a.data[a.data.length - 1].date).getTime();
      const bLatest = new Date(b.data[b.data.length - 1].date).getTime();
      return bLatest - aLatest;
    });
  }, [biomarkers]);

  if (groupedBiomarkers.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Primary biomarkers as MetricCards */}
      {groupedBiomarkers.slice(0, 4).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {groupedBiomarkers.slice(0, 4).map((biomarker, idx) => (
            <MetricCard
              key={`metric-${biomarker.name}-${idx}`}
              label={biomarker.name}
              value={biomarker.latestValue.toFixed(1)}
              unit={biomarker.unit}
              change={biomarker.change}
              trendDirection={biomarker.trend}
              sparklineData={biomarker.sparklineData}
              color="orange"
            />
          ))}
        </div>
      )}

      {/* Detailed time series charts */}
      {groupedBiomarkers.slice(0, 6).map((biomarker, idx) => (
        <SurfaceCard key={`chart-${biomarker.name}-${idx}`} className="p-5">
          <TimeSeriesChart
            data={biomarker.data}
            metric={`${biomarker.name}${biomarker.unit ? ` (${biomarker.unit})` : ''}`}
            color="orange"
            showGradient
            showDots
            animate
            height={200}
          />
        </SurfaceCard>
      ))}
    </div>
  );
}

interface VitalsDashboardProps {
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  spo2?: number;
  className?: string;
}

export function VitalsDashboard({ 
  heartRate, 
  bloodPressureSystolic, 
  bloodPressureDiastolic, 
  spo2,
  className 
}: VitalsDashboardProps) {
  const vitals = [
    {
      label: 'Heart Rate',
      value: heartRate,
      unit: 'bpm',
      normalRange: '60-100',
      isNormal: heartRate ? heartRate >= 60 && heartRate <= 100 : null,
      icon: '❤️',
    },
    {
      label: 'Blood Pressure',
      value: bloodPressureSystolic && bloodPressureDiastolic 
        ? `${bloodPressureSystolic}/${bloodPressureDiastolic}` 
        : null,
      unit: 'mmHg',
      normalRange: '<120/80',
      isNormal: bloodPressureSystolic && bloodPressureDiastolic
        ? bloodPressureSystolic < 120 && bloodPressureDiastolic < 80
        : null,
      icon: '🩺',
    },
    {
      label: 'SpO2',
      value: spo2,
      unit: '%',
      normalRange: '95-100',
      isNormal: spo2 ? spo2 >= 95 && spo2 <= 100 : null,
      icon: '🫁',
    },
  ];

  const hasAnyVital = vitals.some(v => v.value !== null && v.value !== undefined);

  if (!hasAnyVital) {
    return null;
  }

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-3 gap-3', className)}>
      {vitals.map((vital) => {
        if (vital.value === null || vital.value === undefined) return null;

        const numericValue = typeof vital.value === 'number' ? vital.value : null;

        return (
          <MetricCard
            key={vital.label}
            label={vital.label}
            value={vital.value}
            unit={vital.unit}
            trendDirection={vital.isNormal === true ? 'stable' : vital.isNormal === false ? 'down' : 'stable'}
            color={vital.isNormal === true ? 'emerald' : vital.isNormal === false ? 'amber' : 'orange'}
          />
        );
      })}
    </div>
  );
}
