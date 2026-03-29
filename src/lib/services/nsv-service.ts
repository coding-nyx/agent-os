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
    researchLoad: null,
    planningLoad: null,
    taskCompletionRate: null,
    interestDiversity: null
  },
  planning: {
    streakHealth: null,
    deadlinePressure: null
  },
  resource: {
    financialFriction: null,
    resonanceROI: null
  },
  version: 1,
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
    planning: {
      ...base.planning,
      ...(input.planning || {})
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
    planning: {
      ...normalizedCurrent.planning,
      ...(updates.planning || {})
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
    planning: {
      ...(base.planning || {}),
      ...(updates.planning || {})
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
    `Cognitive: Energy ${display(nsv.cognitive.energyBudget)}/10, Focus ${display(nsv.cognitive.focusScore)}/10, Active Load ${display(nsv.cognitive.activeLoad)}, Research Load ${display(nsv.cognitive.researchLoad)}, Planning Load ${display(nsv.cognitive.planningLoad)}, Interest Diversity ${display(nsv.cognitive.interestDiversity)}`,
    `Planning: Streak Health ${display(nsv.planning.streakHealth)}/10, Deadline Pressure ${display(nsv.planning.deadlinePressure)}/10`,
    `Resource: Financial Friction ${display(nsv.resource.financialFriction)}/10, Resonance ROI ${display(nsv.resource.resonanceROI)}`
  ].join('\n');
}

/**
 * formatNSVForModulePrompt — filtered NSV formatter for per-module context injection.
 *
 * Renders only the NSV fields in `allowedPaths`, grouped by domain, with human-readable labels.
 * Used by `enhanceContextForModule()` to enforce the read permission matrix.
 *
 * @param nsv          - The full NeuralStateVector (from GlobalProjection.crossFunctionalState)
 * @param allowedPaths - The NSVMetricPath[] from NSV_READ_PERMISSIONS[moduleId]
 * @returns Formatted string ready for system prompt injection, or empty string if no data
 */
export function formatNSVForModulePrompt(
  nsv: NeuralStateVector,
  allowedPaths: string[]
): string {
  const d = (value: unknown, suffix = '') => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return `${String(value)}${suffix}`;
  };

  const pathSet = new Set(allowedPaths);

  const bio: string[] = [];
  if (pathSet.has('biological.cnsFatigue') && nsv.biological.cnsFatigue !== null && nsv.biological.cnsFatigue !== undefined) {
    bio.push(`CNS Fatigue ${d(nsv.biological.cnsFatigue, '/10')}`);
  }
  if (pathSet.has('biological.sleepQuality') && nsv.biological.sleepQuality !== null && nsv.biological.sleepQuality !== undefined) {
    bio.push(`Sleep Quality ${d(nsv.biological.sleepQuality, '/10')}`);
  }
  if (pathSet.has('biological.recoveryScore') && nsv.biological.recoveryScore !== null && nsv.biological.recoveryScore !== undefined) {
    bio.push(`Recovery ${d(nsv.biological.recoveryScore, '/10')}`);
  }
  if (pathSet.has('biological.hormonalContext') && nsv.biological.hormonalContext) {
    bio.push(`Hormonal Context: ${nsv.biological.hormonalContext}`);
  }

  const emo: string[] = [];
  if (pathSet.has('emotional.emotionalResilience') && nsv.emotional.emotionalResilience !== null && nsv.emotional.emotionalResilience !== undefined) {
    emo.push(`Resilience ${d(nsv.emotional.emotionalResilience, '/10')}`);
  }
  if (pathSet.has('emotional.stressLoad') && nsv.emotional.stressLoad !== null && nsv.emotional.stressLoad !== undefined) {
    emo.push(`Stress ${d(nsv.emotional.stressLoad, '/10')}`);
  }
  if (pathSet.has('emotional.moodTrend') && nsv.emotional.moodTrend) {
    emo.push(`Mood Trend: ${nsv.emotional.moodTrend}`);
  }
  if (pathSet.has('emotional.traumaMarkers') && Array.isArray(nsv.emotional.traumaMarkers) && nsv.emotional.traumaMarkers.length > 0) {
    emo.push(`Trauma Markers: [${nsv.emotional.traumaMarkers.join(', ')}]`);
  }

  const cog: string[] = [];
  if (pathSet.has('cognitive.energyBudget') && nsv.cognitive.energyBudget !== null && nsv.cognitive.energyBudget !== undefined) {
    cog.push(`Energy Budget ${d(nsv.cognitive.energyBudget, '/10')}`);
  }
  if (pathSet.has('cognitive.focusScore') && nsv.cognitive.focusScore !== null && nsv.cognitive.focusScore !== undefined) {
    cog.push(`Focus ${d(nsv.cognitive.focusScore, '/10')}`);
  }
  if (pathSet.has('cognitive.activeLoad') && nsv.cognitive.activeLoad !== null && nsv.cognitive.activeLoad !== undefined) {
    cog.push(`Active Load ${d(nsv.cognitive.activeLoad, '/10')}`);
  }
  if (pathSet.has('cognitive.researchLoad') && nsv.cognitive.researchLoad !== null && nsv.cognitive.researchLoad !== undefined) {
    cog.push(`Research Load ${d(nsv.cognitive.researchLoad, '/10')}`);
  }
  if (pathSet.has('cognitive.planningLoad') && nsv.cognitive.planningLoad !== null && nsv.cognitive.planningLoad !== undefined) {
    cog.push(`Planning Load ${d(nsv.cognitive.planningLoad, '/10')}`);
  }
  if (pathSet.has('cognitive.taskCompletionRate') && nsv.cognitive.taskCompletionRate !== null && nsv.cognitive.taskCompletionRate !== undefined) {
    cog.push(`Task Completion Rate ${d(nsv.cognitive.taskCompletionRate)}`);
  }
  if (pathSet.has('cognitive.interestDiversity') && nsv.cognitive.interestDiversity !== null && nsv.cognitive.interestDiversity !== undefined) {
    cog.push(`Interest Diversity ${d(nsv.cognitive.interestDiversity, '/10')}`);
  }

  const pln: string[] = [];
  if (pathSet.has('planning.streakHealth') && nsv.planning.streakHealth !== null && nsv.planning.streakHealth !== undefined) {
    pln.push(`Streak Health ${d(nsv.planning.streakHealth, '/10')}`);
  }
  if (pathSet.has('planning.deadlinePressure') && nsv.planning.deadlinePressure !== null && nsv.planning.deadlinePressure !== undefined) {
    pln.push(`Deadline Pressure ${d(nsv.planning.deadlinePressure, '/10')}`);
  }

  const res: string[] = [];
  if (pathSet.has('resource.financialFriction') && nsv.resource.financialFriction !== null && nsv.resource.financialFriction !== undefined) {
    res.push(`Financial Friction ${d(nsv.resource.financialFriction, '/10')}`);
  }
  if (pathSet.has('resource.resonanceROI') && nsv.resource.resonanceROI !== null && nsv.resource.resonanceROI !== undefined) {
    res.push(`Resonance ROI ${d(nsv.resource.resonanceROI)}`);
  }

  const sections: string[] = ['[NEURAL STATE]'];
  if (bio.length > 0) sections.push(`Biological: ${bio.join(', ')}`);
  if (emo.length > 0) sections.push(`Emotional: ${emo.join(', ')}`);
  if (cog.length > 0) sections.push(`Cognitive: ${cog.join(', ')}`);
  if (pln.length > 0) sections.push(`Planning: ${pln.join(', ')}`);
  if (res.length > 0) sections.push(`Resource: ${res.join(', ')}`);

  // Return empty string if no fields had data — avoids polluting prompt with empty section
  if (sections.length === 1) return '';

  return sections.join('\n');
}

/**
 * formatNSVForAtlasPlanner — enriched planning-optimised NSV context for Atlas.
 *
 * Goes beyond raw field display to derive:
 * - Maximum sustainable active load given current state
 * - Energy budget cap for task scheduling
 * - Active planning overrides (mandatory directives the LLM must follow)
 *
 * This replaces the standard formatNSVForModulePrompt for Atlas to give it
 * richer planning intelligence without requiring the LLM to compute thresholds itself.
 */
export function formatNSVForAtlasPlanner(nsv: NeuralStateVector): string {
  const d = (value: unknown, fallback = 'unknown') => {
    if (value === null || value === undefined || Number.isNaN(value)) return fallback;
    return String(value);
  };

  const cnsFatigue = nsv.biological.cnsFatigue ?? null;
  const sleep = nsv.biological.sleepQuality ?? null;
  const recovery = nsv.biological.recoveryScore ?? null;
  const resilience = nsv.emotional.emotionalResilience ?? null;
  const stress = nsv.emotional.stressLoad ?? null;
  const mood = nsv.emotional.moodTrend ?? null;
  const energy = nsv.cognitive.energyBudget ?? null;
  const focus = nsv.cognitive.focusScore ?? null;
  const active = nsv.cognitive.activeLoad ?? null;
  const research = nsv.cognitive.researchLoad ?? null;
  const planning = nsv.cognitive.planningLoad ?? null;
  const streak = nsv.planning.streakHealth ?? null;
  const deadline = nsv.planning.deadlinePressure ?? null;
  const reflectionStreak = nsv.planning.reflectionStreak ?? null;
  const goalAlignment = nsv.planning.goalAlignment ?? null;
  const habitMomentum = nsv.planning.habitMomentum ?? null;
  const friction = nsv.resource.financialFriction ?? null;

  // Derive active planning overrides
  const overrides: string[] = [];

  if (cnsFatigue !== null && cnsFatigue >= 9) {
    overrides.push('🚨 CRITICAL: cnsFatigue ≥ 9 — No new tasks. Defer everything except life-critical items. Emit FLATTEN_ENERGY_WAVE.');
  } else if (cnsFatigue !== null && cnsFatigue >= 8) {
    overrides.push('⚠ OVERRIDE: cnsFatigue ≥ 8 — Flatten schedule. Remove non-critical tasks. Add rest blocks.');
  }

  if (resilience !== null && resilience <= 2) {
    overrides.push('🚨 CRITICAL: emotionalResilience ≤ 2 — Defer all deep work and high-stakes tasks. Protect recovery time. Emit BURNOUT_WARNING via Agnes.');
  } else if (resilience !== null && resilience <= 3) {
    overrides.push('⚠ OVERRIDE: emotionalResilience ≤ 3 — Defer non-essential tasks. Insert emotional recovery buffer blocks.');
  }

  if (stress !== null && stress >= 9) {
    overrides.push('🚨 CRITICAL: stressLoad ≥ 9 — Flatten to minimum viable schedule. ONE priority task only. Emit FLATTEN_ENERGY_WAVE.');
  } else if (stress !== null && stress >= 8) {
    overrides.push('⚠ OVERRIDE: stressLoad ≥ 8 — Add 2× buffer blocks. Reduce activeLoad target by 2.');
  }

  if (active !== null && active >= 9) {
    overrides.push('🚨 CRITICAL: activeLoad ≥ 9 — Cognitive overload. Do NOT add tasks. Emit COGNITIVE_OVERLOAD. Identify deferrals first.');
  } else if (active !== null && active >= 8) {
    overrides.push('⚠ HALT: activeLoad ≥ 8 — No new task scheduling. Identify items to defer or delegate.');
  }

  if (sleep !== null && sleep <= 4) {
    overrides.push('⚠ SHIFT: sleepQuality ≤ 4 — No cognitively demanding work before 10am. Morning slots: admin/physical only.');
  }

  if (friction !== null && friction >= 7) {
    overrides.push('⚠ REDUCE TARGET: financialFriction ≥ 7 — Financial stress adds ~2pts hidden cognitive load. Reduce active load target accordingly.');
  }

  if (planning !== null && planning >= 7) {
    overrides.push('⚠ SIMPLIFY: planningLoad ≥ 7 — Overhead of planning is itself costly. Use 3-task priority list, not full schedule.');
  }

  if (deadline !== null && deadline >= 8) {
    overrides.push('🚨 DEADLINE CRUNCH: deadlinePressure ≥ 8 — Protect deadline tasks. Defer non-deadline items. Emit DEADLINE_CRUNCH.');
  } else if (deadline !== null && deadline >= 6) {
    overrides.push('⚠ DEADLINE ALERT: deadlinePressure ≥ 6 — Prioritise deadline-bound tasks over exploratory work.');
  }

  if (streak !== null && streak <= 3) {
    overrides.push('⚠ STREAK RISK: streakHealth ≤ 3 — Active habits are at risk. Surface easiest habit first to rebuild momentum.');
  }

  if (goalAlignment !== null && goalAlignment < 0.3) {
    overrides.push('⚠ GOAL DRIFT: goalAlignment < 0.3 — Less than 30% of active goals have linked tasks. Prompt user to connect tasks to goals or review goal relevance.');
  }

  if (habitMomentum !== null && habitMomentum < 0.25) {
    overrides.push('⚠ HABIT STALL: habitMomentum < 0.25 — Most active habits have no live streak. Suggest simplifying to 1-2 keystone habits.');
  }

  // Derive max sustainable active load
  let maxLoad = 8;
  if (cnsFatigue !== null && cnsFatigue >= 9) maxLoad = Math.min(maxLoad, 2);
  else if (cnsFatigue !== null && cnsFatigue >= 8) maxLoad = Math.min(maxLoad, 3);
  else if (cnsFatigue !== null && cnsFatigue >= 6) maxLoad = Math.min(maxLoad, 5);

  if (resilience !== null && resilience <= 2) maxLoad = Math.min(maxLoad, 3);
  else if (resilience !== null && resilience <= 4) maxLoad = Math.min(maxLoad, 5);

  if (stress !== null && stress >= 9) maxLoad = Math.min(maxLoad, 2);
  else if (stress !== null && stress >= 8) maxLoad = Math.min(maxLoad, 5);

  if (friction !== null && friction >= 7) maxLoad = Math.max(0, maxLoad - 2);

  // Derive energy budget cap (max total task energyCost schedulable)
  const budgetCap = energy !== null ? Math.round(energy * 1.2) : null;

  // Derive deep work window
  let deepWorkWindow = 'unknown — calibrate cnsFatigue and sleepQuality';
  if (cnsFatigue !== null && sleep !== null) {
    if (cnsFatigue >= 8) deepWorkWindow = 'none — CNS fatigue is critical';
    else if (sleep <= 4) deepWorkWindow = 'after 10am only (if needed)';
    else if (cnsFatigue <= 4 && sleep >= 7) deepWorkWindow = '9am–12pm (peak window)';
    else if (cnsFatigue <= 6) deepWorkWindow = '10am–12pm';
    else deepWorkWindow = 'afternoon only — moderate fatigue';
  }

  const lines = [
    '[ATLAS PLANNING STATE]',
    `Physical: CNS Fatigue ${d(cnsFatigue)}/10, Sleep ${d(sleep)}/10, Recovery ${d(recovery)}/10`,
    `Emotional: Resilience ${d(resilience)}/10, Stress ${d(stress)}/10, Mood: ${d(mood)}`,
    `Cognitive: Energy ${d(energy)}/10, Focus ${d(focus)}/10, Active Load ${d(active)}/10, Research Load ${d(research)}/10`,
    `Planning: Planning Load ${d(planning)}/10, Task Completion Rate ${d(nsv.cognitive.taskCompletionRate)}, Streak Health ${d(streak)}/10, Deadline Pressure ${d(deadline)}/10`,
    `Planning (engagement): Reflection Streak ${d(reflectionStreak)} days, Goal Alignment ${d(goalAlignment)}, Habit Momentum ${d(habitMomentum)}`,
    `Resource: Financial Friction ${d(friction)}/10`,
    '',
    `DERIVED MAX SUSTAINABLE LOAD: ${maxLoad}/10`,
    budgetCap !== null ? `ENERGY BUDGET CAP: Total task energyCost ≤ ${budgetCap}` : 'ENERGY BUDGET CAP: unknown',
    `DEEP WORK WINDOW: ${deepWorkWindow}`,
  ];

  if (overrides.length > 0) {
    lines.push('');
    lines.push('ACTIVE PLANNING OVERRIDES (MANDATORY):');
    overrides.forEach(o => lines.push(`  ${o}`));
  } else {
    lines.push('');
    lines.push('PLANNING STATUS: All clear — normal scheduling viable.');
  }

  return lines.join('\n');
}
