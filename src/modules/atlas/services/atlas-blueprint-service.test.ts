import { describe, expect, it } from 'vitest';
import type { GlobalProjection, NeuralStateVector } from '@/lib/types';
import { createEmptyAtlasProfile } from './atlas-profile-service';
import {
  computeAtlasReviewBlueprint,
  inferAtlasDocumentIngestionMode,
} from './atlas-blueprint-service';

function makeSoul(overrides: Partial<NeuralStateVector>): GlobalProjection {
  const base: NeuralStateVector = {
    biological: { cnsFatigue: 4, sleepQuality: 6, recoveryScore: 6, hormonalContext: null },
    emotional: { emotionalResilience: 6, stressLoad: 4, moodTrend: null, traumaMarkers: null },
    cognitive: { energyBudget: 6, focusScore: 6, activeLoad: 4, planningLoad: 4, taskCompletionRate: 0.7 },
    planning: { streakHealth: 6, deadlinePressure: 4, goalAlignment: 0.7, habitMomentum: 0.75 },
    resource: { financialFriction: 3, resonanceROI: 6 },
    version: 1,
    lastUpdated: {},
    cnsFatigue: 4,
    emotionalResilience: 6,
    sleepQuality: 6,
  };

  return {
    lastSync: new Date().toISOString(),
    overallWellnessScore: 7,
    displayNames: { atlas: 'Atlas' },
    agentGenders: { atlas: 'non-binary' },
    compactedInsights: [],
    crossFunctionalState: {
      ...base,
      ...overrides,
      biological: { ...base.biological, ...overrides.biological },
      emotional: { ...base.emotional, ...overrides.emotional },
      cognitive: { ...base.cognitive, ...overrides.cognitive },
      planning: { ...base.planning, ...overrides.planning },
      resource: { ...base.resource, ...overrides.resource },
      cnsFatigue: overrides.biological?.cnsFatigue ?? overrides.cnsFatigue ?? base.cnsFatigue,
      emotionalResilience:
        overrides.emotional?.emotionalResilience ?? overrides.emotionalResilience ?? base.emotionalResilience,
      sleepQuality: overrides.biological?.sleepQuality ?? overrides.sleepQuality ?? base.sleepQuality,
    },
  };
}

describe('AtlasBlueprintService', () => {
  it('compresses capacity when friction is high and resilience is low', () => {
    const profile = createEmptyAtlasProfile();
    profile.energyWave = Array.from({ length: 7 }, (_, index) => ({
      id: `wave-${index}`,
      slot: `Day ${index + 1}`,
      energy: 6,
      focus: 5,
      load: 6,
    }));
    profile.tasks = [
      {
        id: 'task-1',
        title: 'Finish launch brief',
        priority: 1,
        energyCost: 9,
        status: 'active',
        dependencies: [],
        deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Prep stakeholder deck',
        priority: 2,
        energyCost: 8,
        status: 'queued',
        dependencies: [],
        deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    profile.habits = [
      {
        id: 'habit-1',
        title: 'Daily planning',
        frequency: 'daily',
        targetStreak: 30,
        currentStreak: 1,
        bestStreak: 4,
        energyCost: 3,
        minimumViableVersion: 'Review the top three tasks',
        status: 'active',
        lastCompleted: new Date(Date.now() - 26 * 3600000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const soul = makeSoul({
      biological: { cnsFatigue: 8, sleepQuality: 4, recoveryScore: 3, hormonalContext: null },
      emotional: { emotionalResilience: 3, stressLoad: 8, moodTrend: null, traumaMarkers: null },
      cognitive: { energyBudget: 3, focusScore: 4, activeLoad: 8, planningLoad: 8, taskCompletionRate: 0.4 },
      planning: { streakHealth: 3, deadlinePressure: 8, goalAlignment: 0.25, habitMomentum: 0.3 },
      resource: { financialFriction: 8, resonanceROI: 3 },
      cnsFatigue: 8,
      emotionalResilience: 3,
      sleepQuality: 4,
    });

    const blueprint = computeAtlasReviewBlueprint({ profile, soul });

    expect(blueprint.capacity.recommendedCapacityPct).toBeLessThan(80);
    expect(['recover', 'compress']).toContain(blueprint.capacity.state);
    expect(blueprint.projection.recommendedActions.some((action) => action.id === 'schedule-recovery')).toBe(true);
  });

  it('holds or expands capacity when vitality and alignment are healthy', () => {
    const profile = createEmptyAtlasProfile();
    profile.energyWave = Array.from({ length: 7 }, (_, index) => ({
      id: `wave-${index}`,
      slot: `Day ${index + 1}`,
      energy: 7,
      focus: 7,
      load: 4,
    }));
    profile.tasks = [
      {
        id: 'task-1',
        title: 'Ship weekly planning update',
        priority: 2,
        energyCost: 5,
        status: 'queued',
        dependencies: [],
        goalId: 'goal-1',
        deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    profile.goals = [
      {
        id: 'goal-1',
        title: 'Stabilize planning system',
        milestones: [],
        associatedTaskIds: ['task-1'],
        successCriteria: 'Consistent weekly review rhythm',
        progressPercent: 55,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    profile.habits = [
      {
        id: 'habit-1',
        title: 'Weekly review',
        frequency: 'weekly',
        targetStreak: 12,
        currentStreak: 6,
        bestStreak: 6,
        energyCost: 2,
        minimumViableVersion: 'Review load and capacity',
        status: 'active',
        lastCompleted: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const soul = makeSoul({
      biological: { cnsFatigue: 2, sleepQuality: 8, recoveryScore: 8, hormonalContext: null },
      emotional: { emotionalResilience: 8, stressLoad: 3, moodTrend: null, traumaMarkers: null },
      cognitive: { energyBudget: 8, focusScore: 8, activeLoad: 3, planningLoad: 3, taskCompletionRate: 0.9 },
      planning: { streakHealth: 8, deadlinePressure: 2, goalAlignment: 0.9, habitMomentum: 0.85 },
      resource: { financialFriction: 2, resonanceROI: 7 },
      cnsFatigue: 2,
      emotionalResilience: 8,
      sleepQuality: 8,
    });

    const blueprint = computeAtlasReviewBlueprint({ profile, soul });

    expect(blueprint.capacity.recommendedCapacityPct).toBeGreaterThanOrEqual(95);
    expect(['hold', 'expand']).toContain(blueprint.capacity.state);
    expect(blueprint.capacity.headroom).toBeGreaterThan(0);
  });

  it('distinguishes structured vs unstructured document ingestion by confidence', () => {
    expect(inferAtlasDocumentIngestionMode(0.85)).toBe('structured');
    expect(inferAtlasDocumentIngestionMode(0.45)).toBe('unstructured');
  });
});
