import { describe, it, expect } from 'vitest';
import {
  NSV_OWNERSHIP,
  getMetricOwner,
  getMetricValue,
  getUncalibratedOwnedMetrics,
  isMetricStale,
  buildCalibrationPrompt,
  type NSVMetricPath,
} from './nsv-ownership';
import type { NeuralStateVector } from '@/lib/types';

describe('NSV_OWNERSHIP map', () => {
  it('agnes owns emotional metrics', () => {
    expect(NSV_OWNERSHIP.agnes).toContain('emotional.emotionalResilience');
    expect(NSV_OWNERSHIP.agnes).toContain('emotional.stressLoad');
  });

  it('titan owns biological fatigue/sleep', () => {
    expect(NSV_OWNERSHIP.titan).toContain('biological.cnsFatigue');
    expect(NSV_OWNERSHIP.titan).toContain('biological.sleepQuality');
  });

  it('orchestrator owns no metrics', () => {
    expect(NSV_OWNERSHIP.orchestrator).toHaveLength(0);
  });
});

describe('getMetricOwner', () => {
  it('returns agnes for emotional.emotionalResilience', () => {
    expect(getMetricOwner('emotional.emotionalResilience')).toBe('agnes');
  });

  it('returns titan for biological.cnsFatigue', () => {
    expect(getMetricOwner('biological.cnsFatigue')).toBe('titan');
  });

  it('returns ledger for resource.financialFriction', () => {
    expect(getMetricOwner('resource.financialFriction')).toBe('ledger');
  });

  it('falls back to orchestrator for unknown metric', () => {
    expect(getMetricOwner('unknown.metric' as NSVMetricPath)).toBe('orchestrator');
  });
});

describe('getMetricValue', () => {
  const nsv: NeuralStateVector = {
    biological: { cnsFatigue: 5, sleepQuality: 7, recoveryScore: null, hormonalContext: null },
    emotional: { emotionalResilience: 8, stressLoad: 3, moodTrend: 'stable', traumaMarkers: null },
    cognitive: { 
      energyBudget: 6, focusScore: 7, activeLoad: 4, researchLoad: 2,
      planningLoad: 3, taskCompletionRate: 0.8, interestDiversity: 5
    },
    planning: { streakHealth: 9, deadlinePressure: 2 },
    resource: { financialFriction: 2, resonanceROI: 0.8 },
    lastUpdated: {},
    cnsFatigue: 5,
    emotionalResilience: 8,
    sleepQuality: 7,
  };

  it('reads nested values correctly', () => {
    expect(getMetricValue(nsv, 'biological.cnsFatigue')).toBe(5);
    expect(getMetricValue(nsv, 'emotional.emotionalResilience')).toBe(8);
  });

  it('returns undefined for null NSV', () => {
    expect(getMetricValue(null, 'biological.cnsFatigue')).toBeUndefined();
  });

  it('returns null for null fields within NSV', () => {
    expect(getMetricValue(nsv, 'biological.recoveryScore')).toBeNull();
  });
});

describe('getUncalibratedOwnedMetrics', () => {
  it('returns all owned metrics when NSV is null', () => {
    const result = getUncalibratedOwnedMetrics(null, 'agnes');
    expect(result).toEqual(NSV_OWNERSHIP.agnes);
  });

  it('returns only null/undefined metrics', () => {
    const nsv: NeuralStateVector = {
      biological: { cnsFatigue: 5, sleepQuality: null, recoveryScore: null, hormonalContext: null },
      emotional: { emotionalResilience: 8, stressLoad: null, moodTrend: null, traumaMarkers: null },
      cognitive: { 
        energyBudget: null, focusScore: null, activeLoad: null, researchLoad: null,
        planningLoad: null, taskCompletionRate: null, interestDiversity: null
      },
      planning: { streakHealth: null, deadlinePressure: null },
      resource: { financialFriction: null, resonanceROI: null },
      lastUpdated: {},
      cnsFatigue: 5,
      emotionalResilience: 8,
      sleepQuality: null,
    };
    const result = getUncalibratedOwnedMetrics(nsv, 'titan');
    // cnsFatigue=5 is calibrated, sleepQuality=null is not
    expect(result).toContain('biological.sleepQuality');
    expect(result).not.toContain('biological.cnsFatigue');
  });
});

describe('isMetricStale', () => {
  it('returns true when lastUpdated is undefined', () => {
    expect(isMetricStale(undefined, 1)).toBe(true);
  });

  it('returns true for invalid date string', () => {
    expect(isMetricStale('not-a-date', 1)).toBe(true);
  });

  it('returns false for a recently updated metric', () => {
    const now = new Date().toISOString();
    expect(isMetricStale(now, 1)).toBe(false);
  });

  it('returns true for a metric older than threshold', () => {
    const threeDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    expect(isMetricStale(threeDaysAgo, 3)).toBe(true);
  });
});

describe('buildCalibrationPrompt', () => {
  it('includes prompt lines for modules with owned metrics', () => {
    const prompt = buildCalibrationPrompt('agnes');
    expect(prompt).toContain('Calibration required');
    expect(prompt).toContain('resilient');
  });

  it('returns generic prompt for modules with no owned metrics', () => {
    const prompt = buildCalibrationPrompt('orchestrator');
    expect(prompt).toContain('Calibration required');
    expect(prompt).toContain('missing vital metrics');
  });
});
