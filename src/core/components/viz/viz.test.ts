/**
 * Basic type and import tests for viz components
 * Run with: npm run test
 */
import { describe, it, expect } from 'vitest';
import type { TimeSeriesDataPoint, BarChartDataPoint, PieChartSegment } from './index';

describe('Viz Component Types', () => {
  it('should have correct TimeSeriesDataPoint shape', () => {
    const dataPoint: TimeSeriesDataPoint = {
      date: '2024-03-01',
      value: 85,
    };
    expect(dataPoint).toBeDefined();
    expect(dataPoint.date).toBe('2024-03-01');
    expect(dataPoint.value).toBe(85);
  });

  it('should have correct BarChartDataPoint shape', () => {
    const dataPoint: BarChartDataPoint = {
      category: 'Sleep',
      value: 8.5,
    };
    expect(dataPoint).toBeDefined();
    expect(dataPoint.category).toBe('Sleep');
    expect(dataPoint.value).toBe(8.5);
  });

  it('should have correct PieChartSegment shape', () => {
    const segment: PieChartSegment = {
      label: 'Cardio',
      value: 45,
      color: 'rgba(99, 102, 241, 0.9)',
    };
    expect(segment).toBeDefined();
    expect(segment.label).toBe('Cardio');
    expect(segment.value).toBe(45);
  });
});

describe('Viz Component Exports', () => {
  it('should export all component modules', async () => {
    const vizModule = await import('./index');
    
    expect(vizModule.TimeSeriesChart).toBeDefined();
    expect(vizModule.BarChart).toBeDefined();
    expect(vizModule.PieChart).toBeDefined();
    expect(vizModule.MetricCard).toBeDefined();
    expect(vizModule.TrendIndicator).toBeDefined();
    expect(vizModule.ProgressRing).toBeDefined();
    expect(vizModule.computeTrendValue).toBeDefined();
  });
});

describe('TrendIndicator utilities', () => {
  it('should compute trend value correctly', async () => {
    const { computeTrendValue } = await import('./TrendIndicator');
    
    // Upward trend
    const upTrend = computeTrendValue(110, 100);
    expect(upTrend.value).toBe(10);
    expect(upTrend.direction).toBe('up');
    
    // Downward trend
    const downTrend = computeTrendValue(90, 100);
    expect(downTrend.value).toBe(-10);
    expect(downTrend.direction).toBe('down');
    
    // Neutral trend
    const neutralTrend = computeTrendValue(100.2, 100);
    expect(neutralTrend.direction).toBe('neutral');
    
    // Zero previous value
    const zeroTrend = computeTrendValue(100, 0);
    expect(zeroTrend.value).toBe(0);
    expect(zeroTrend.direction).toBe('neutral');
  });
});
