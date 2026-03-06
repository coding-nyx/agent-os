import { NeuralStateVector, NeuralStateVectorPatch } from '@/lib/types';

const DEFAULT_NSV: NeuralStateVector = {
  biological: {
    cnsFatigue: null,
    sleepQuality: null,
    recoveryScore: null,
    hormonalContext: null
  },
  emotional: {
    emotionalResilience: null,
    stressLoad: null,
    moodTrend: null,
    traumaMarkers: null
  },
  cognitive: {
    energyBudget: null,
    focusScore: null,
    activeLoad: null,
    researchLoad: null
  },
  resource: {
    financialFriction: null,
    resonanceROI: null
  },
  lastUpdated: {},
  cnsFatigue: null,
  emotionalResilience: null,
  sleepQuality: null,
  hormonalContext: null,
  traumaMarkers: null
};

export function createDefaultNSV(): NeuralStateVector {
  return JSON.parse(JSON.stringify(DEFAULT_NSV)) as NeuralStateVector;
}

function bindLegacyAliases(state: NeuralStateVector): NeuralStateVector {
  state.cnsFatigue = state.biological.cnsFatigue;
  state.sleepQuality = state.biological.sleepQuality;
  state.hormonalContext = state.biological.hormonalContext;

  state.emotionalResilience = state.emotional.emotionalResilience;
  state.traumaMarkers = state.emotional.traumaMarkers;

  return state;
}

export function normalizeNSV(input?: Partial<NeuralStateVector> | null): NeuralStateVector {
  const base = createDefaultNSV();
  if (!input) return base;

  const pickDefined = <T>(...values: Array<T | undefined>): T => {
    for (const value of values) {
      if (value !== undefined) return value;
    }
    return values[values.length - 1] as T;
  };

  const merged: NeuralStateVector = {
    ...base,
    ...input,
    biological: {
      ...base.biological,
      ...(input.biological || {}),
      cnsFatigue: pickDefined(input.cnsFatigue, input.biological?.cnsFatigue, base.biological.cnsFatigue),
      sleepQuality: pickDefined(input.sleepQuality, input.biological?.sleepQuality, base.biological.sleepQuality),
      recoveryScore: pickDefined(input.biological?.recoveryScore, base.biological.recoveryScore),
      hormonalContext: pickDefined(input.hormonalContext, input.biological?.hormonalContext, base.biological.hormonalContext)
    },
    emotional: {
      ...base.emotional,
      ...(input.emotional || {}),
      emotionalResilience: pickDefined(
        input.emotionalResilience,
        input.emotional?.emotionalResilience,
        base.emotional.emotionalResilience
      ),
      stressLoad: pickDefined(input.emotional?.stressLoad, base.emotional.stressLoad),
      moodTrend: pickDefined(input.emotional?.moodTrend, base.emotional.moodTrend),
      traumaMarkers: pickDefined(input.traumaMarkers, input.emotional?.traumaMarkers, base.emotional.traumaMarkers)
    },
    cognitive: {
      ...base.cognitive,
      ...(input.cognitive || {})
    },
    resource: {
      ...base.resource,
      ...(input.resource || {})
    },
    lastUpdated: {
      ...(base.lastUpdated || {}),
      ...(input.lastUpdated || {})
    }
  };

  return bindLegacyAliases(merged);
}

export function mergeNSV(
  current: NeuralStateVector | null | undefined,
  updates: Partial<NeuralStateVector>
): NeuralStateVector {
  const normalizedCurrent = normalizeNSV(current);
  return normalizeNSV({
    ...normalizedCurrent,
    ...updates,
    biological: {
      ...normalizedCurrent.biological,
      ...(updates.biological || {})
    },
    emotional: {
      ...normalizedCurrent.emotional,
      ...(updates.emotional || {})
    },
    cognitive: {
      ...normalizedCurrent.cognitive,
      ...(updates.cognitive || {})
    },
    resource: {
      ...normalizedCurrent.resource,
      ...(updates.resource || {})
    }
  });
}

export function mergeNSVPatch(
  base: NeuralStateVectorPatch,
  updates: NeuralStateVectorPatch
): NeuralStateVectorPatch {
  return {
    ...base,
    ...updates,
    biological: {
      ...(base.biological || {}),
      ...(updates.biological || {})
    },
    emotional: {
      ...(base.emotional || {}),
      ...(updates.emotional || {})
    },
    cognitive: {
      ...(base.cognitive || {}),
      ...(updates.cognitive || {})
    },
    resource: {
      ...(base.resource || {}),
      ...(updates.resource || {})
    }
  };
}

export function formatNSVForPrompt(nsv: NeuralStateVector): string {
  const display = (value: unknown, fallback = 'unknown') => {
    if (value === null || value === undefined || Number.isNaN(value)) return fallback;
    return String(value);
  };

  return [
    '[GLOBAL NEURAL STATE]',
    `Biological: CNS Fatigue ${display(nsv.biological.cnsFatigue)}/10, Sleep ${display(nsv.biological.sleepQuality)}/10, Recovery ${display(nsv.biological.recoveryScore)}/10, Hormonal ${display(nsv.biological.hormonalContext)}`,
    `Emotional: Resilience ${display(nsv.emotional.emotionalResilience)}/10, Stress ${display(nsv.emotional.stressLoad)}/10, Mood ${display(nsv.emotional.moodTrend)}`,
    `Cognitive: Energy ${display(nsv.cognitive.energyBudget)}/10, Focus ${display(nsv.cognitive.focusScore)}/10, Active Load ${display(nsv.cognitive.activeLoad)}, Research Load ${display(nsv.cognitive.researchLoad)}`,
    `Resource: Financial Friction ${display(nsv.resource.financialFriction)}/10, Resonance ROI ${display(nsv.resource.resonanceROI)}`
  ].join('\n');
}
