import { describe, it, expect } from 'vitest';
import {
  NSV_OWNERSHIP,
  getMetricOwner,
  getMetricValue,
  getUncalibratedOwnedMetrics,
  isMetricStale,
  buildCalibrationPrompt,
  filterNSVForModule,
  filterGlobalSoulForModule,
  type NSVMetricPath,
} from './nsv-ownership';
import type { GlobalProjection, NeuralStateVector } from '@/lib/types';

describe('NSV_OWNERSHIP map', () => {
  it('agnes owns emotional metrics', () => {
    expect(NSV_OWNERSHIP.agnes).toContain('emotional.emotionalResilience');
    expect(NSV_OWNERSHIP.agnes).toContain('emotional.stressLoad');
  });

  it('titan owns biological fatigue/sleep', () => {
    expect(NSV_OWNERSHIP.titan).toContain('biological.cnsFatigue');
    expect(NSV_OWNERSHIP.titan).toContain('biological.sleepQuality');
  });

  it('nexus owns no metrics', () => {
    expect(NSV_OWNERSHIP.nexus).toHaveLength(0);
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

  it('falls back to nexus for unknown metric', () => {
    expect(getMetricOwner('unknown.metric' as NSVMetricPath)).toBe('nexus');
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
    const prompt = buildCalibrationPrompt('nexus');
    expect(prompt).toContain('Calibration required');
    expect(prompt).toContain('missing vital metrics');
  });
});

describe('filterNSVForModule', () => {
  const sampleNSV: NeuralStateVector = {
    biological: { cnsFatigue: 6, sleepQuality: 7, recoveryScore: 5, hormonalContext: 'luteal' },
    emotional: { emotionalResilience: 4, stressLoad: 8, moodTrend: 'declining', traumaMarkers: ['flashback'] },
    cognitive: { energyBudget: 5, focusScore: 6, activeLoad: 7, researchLoad: 2, planningLoad: 4, taskCompletionRate: 0.5, interestDiversity: 3 },
    planning: { streakHealth: 6, deadlinePressure: 9 },
    resource: { financialFriction: 8, resonanceROI: 0.6 },
    lastUpdated: {
      'biological.cnsFatigue': '2024-01-01T00:00:00.000Z',
      'emotional.traumaMarkers': '2024-01-02T00:00:00.000Z'
    },
    cnsFatigue: 6,
    emotionalResilience: 4,
    sleepQuality: 7,
    hormonalContext: 'luteal',
    traumaMarkers: ['flashback']
  };

  it('redacts disallowed metrics for module-level reads', () => {
    const filtered = filterNSVForModule(sampleNSV, 'forge');
    expect(filtered.biological.cnsFatigue).toBe(6); // allowed for forge
    expect(filtered.cognitive.activeLoad).toBe(7);  // allowed for forge

    // disallowed emotional/resource data should be nullified
    expect(filtered.emotional.traumaMarkers).toBeNull();
    expect(filtered.emotional.emotionalResilience).toBeNull();
    expect(filtered.resource.financialFriction).toBeNull();

    // lastUpdated only retains allowed paths
    expect(filtered.lastUpdated['biological.cnsFatigue']).toBe('2024-01-01T00:00:00.000Z');
    expect(filtered.lastUpdated['emotional.traumaMarkers']).toBeUndefined();
  });

  it('returns full access for nexus', () => {
    const filtered = filterNSVForModule(sampleNSV, 'nexus');
    expect(filtered.emotional.traumaMarkers).toEqual(['flashback']);
    expect(filtered.resource.financialFriction).toBe(8);
    expect(filtered.lastUpdated['emotional.traumaMarkers']).toBe('2024-01-02T00:00:00.000Z');
  });
});

describe('filterGlobalSoulForModule', () => {
  const projection: GlobalProjection = {
    lastSync: '2024-02-01T00:00:00.000Z',
    overallWellnessScore: 7,
    displayNames: { nexus: 'Nexus' },
    agentGenders: { nexus: 'female' },
    crossFunctionalState: {
      biological: { cnsFatigue: 3, sleepQuality: 6, recoveryScore: 5, hormonalContext: 'follicular' },
      emotional: { emotionalResilience: 8, stressLoad: 1, moodTrend: 'stable', traumaMarkers: ['redacted'] },
      cognitive: { energyBudget: 7, focusScore: 8, activeLoad: 5, researchLoad: 1, planningLoad: 2, taskCompletionRate: 0.9, interestDiversity: 6 },
      planning: { streakHealth: 8, deadlinePressure: 1 },
      resource: { financialFriction: 1, resonanceROI: 0.9 },
      lastUpdated: { 'emotional.traumaMarkers': '2024-01-03T00:00:00.000Z' },
      cnsFatigue: 3,
      emotionalResilience: 8,
      sleepQuality: 6,
      hormonalContext: 'follicular',
      traumaMarkers: ['redacted']
    },
    compactedInsights: ['insight-1']
  };

  it('filters projection crossFunctionalState while keeping envelope data', () => {
    const filtered = filterGlobalSoulForModule(projection, 'forge');
    expect(filtered?.displayNames).toBe(projection.displayNames);
    expect(filtered?.compactedInsights).toBe(projection.compactedInsights);
    expect(filtered?.crossFunctionalState.emotional.traumaMarkers).toBeNull();
    expect(filtered?.crossFunctionalState.emotional.emotionalResilience).toBeNull();
  });
});
