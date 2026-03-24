import { describe, expect, it } from 'vitest';
import type { NeuralStateVector } from '@/lib/types';
import { getSpecVectorBreakdown, getSpecVectorSnapshot } from './spec-vector-service';

const sampleNSV: NeuralStateVector = {
  biological: {
    cnsFatigue: 2,
    sleepQuality: 8,
    recoveryScore: 7,
    hormonalContext: 'steady',
    aerobicLoad: 3,
  },
  emotional: {
    emotionalResilience: 9,
    stressLoad: 2,
    moodTrend: 'up',
    traumaMarkers: null,
  },
  cognitive: {
    energyBudget: 8,
    focusScore: 7,
    activeLoad: 3,
    researchLoad: 2,
    planningLoad: 4,
    taskCompletionRate: 0.8,
    interestDiversity: 6,
  },
  planning: {
    streakHealth: 8,
    deadlinePressure: 2,
    reflectionStreak: 5,
    goalAlignment: 0.8,
    habitMomentum: 0.6,
  },
  resource: {
    financialFriction: 4,
    resonanceROI: 0.7,
  },
  version: 1,
  lastUpdated: {},
  cnsFatigue: 2,
  emotionalResilience: 9,
  sleepQuality: 8,
  hormonalContext: 'steady',
  traumaMarkers: null,
};

describe('spec-vector-service', () => {
  it('creates normalized spec-facing vector snapshot', () => {
    const snapshot = getSpecVectorSnapshot(sampleNSV);
    expect(snapshot.resilience).toBe(0.9);
    expect(snapshot.bandwidth).not.toBeNull();
    expect(snapshot.vitality).not.toBeNull();
    expect(snapshot.output).not.toBeNull();
    expect(snapshot.friction).toBe(0.4);
  });

  it('provides breakdown metadata for compatibility mapping', () => {
    const breakdown = getSpecVectorBreakdown(sampleNSV);
    expect(breakdown).toHaveLength(5);
    expect(breakdown.find((entry) => entry.vector === 'output')?.notes[0]).toContain('compatibility aggregate');
    expect(breakdown.find((entry) => entry.vector === 'bandwidth')?.inputs.length).toBeGreaterThan(1);
  });
});
