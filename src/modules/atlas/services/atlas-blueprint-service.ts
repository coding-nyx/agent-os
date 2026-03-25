import type {
  AtlasCapacityBlueprint,
  AtlasCapacityState,
  AtlasGoal,
  AtlasHabit,
  AtlasIngestionMode,
  AtlasProfile,
  AtlasProjectionSurface,
  AtlasReviewAction,
  AtlasReviewBlueprint,
  AtlasTask,
  GlobalProjection,
  ScheduledTask,
} from '@/lib/types';

type ReviewInput = {
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  now?: Date;
};

type CapacityProjection = {
  capacity: number;
  headroom: number;
  overflowTasks: number;
  summary: string;
};

const MIN_CAPACITY_PCT = 60;
const MAX_CAPACITY_PCT = 115;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function normalizeTenScale(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clamp(value / 10, 0, 1);
}

function normalizeRatio(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clamp(value, 0, 1);
}

function startOfWindow(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWindow(now: Date, days: number): Date {
  const end = startOfWindow(now);
  end.setDate(end.getDate() + days);
  return end;
}

function sumEnergyWave(profile: AtlasProfile | null): number {
  if (!profile?.energyWave?.length) return 0;
  return round1(profile.energyWave.reduce((sum, point) => sum + point.energy, 0));
}

function estimateHabitLoad(habits: AtlasHabit[]): number {
  const frequencyWeight: Record<AtlasHabit['frequency'], number> = {
    daily: 2.8,
    weekdays: 2.2,
    weekends: 1.1,
    weekly: 0.9,
    monthly: 0.3,
    custom: 1.2,
  };

  return round1(
    habits
      .filter((habit) => habit.status === 'active')
      .reduce((sum, habit) => sum + (habit.energyCost ?? 0) * (frequencyWeight[habit.frequency] ?? 1), 0) * 0.35,
  );
}

function estimateScheduledDemand(tasks: ScheduledTask[], now: Date): number {
  const windowEnd = endOfWindow(now, 7).getTime();
  const windowStart = startOfWindow(now).getTime();

  return round1(
    tasks
      .filter((task) => {
        const at = new Date(task.scheduledAt).getTime();
        return Number.isFinite(at) && at >= windowStart && at < windowEnd && task.status !== 'done';
      })
      .reduce((sum, task) => sum + (task.energyCost ?? 0), 0),
  );
}

function estimateTaskDemand(tasks: AtlasTask[], now: Date): number {
  const windowEnd = endOfWindow(now, 7).getTime();

  const ranked = tasks
    .filter((task) => task.status === 'queued' || task.status === 'active' || task.status === 'deferred')
    .map((task) => {
      const deadlineAt = task.deadline ? new Date(task.deadline).getTime() : null;
      const deadlineUrgency =
        deadlineAt !== null && Number.isFinite(deadlineAt) && deadlineAt <= windowEnd
          ? 1
          : deadlineAt !== null && Number.isFinite(deadlineAt)
            ? 0.6
            : 0.45;
      const priorityWeight = 1.2 - ((task.priority ?? 3) - 1) * 0.12;
      return {
        weightedCost: (task.energyCost ?? 0) * deadlineUrgency * priorityWeight,
      };
    })
    .sort((left, right) => right.weightedCost - left.weightedCost);

  return round1(ranked.slice(0, 10).reduce((sum, entry) => sum + entry.weightedCost, 0));
}

function findTopFocus(tasks: AtlasTask[], goals: AtlasGoal[], habits: AtlasHabit[]): string {
  const urgentGoal = goals
    .filter((goal) => goal.status === 'active')
    .sort((left, right) => {
      const leftAt = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const rightAt = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return leftAt - rightAt;
    })[0];

  if (urgentGoal) return `Advance goal: ${urgentGoal.title}`;

  const topTask = tasks
    .filter((task) => task.status !== 'done')
    .sort((left, right) => (left.priority ?? 3) - (right.priority ?? 3))[0];

  if (topTask) return `Protect task: ${topTask.title}`;

  const habit = habits.find((candidate) => candidate.status === 'active');
  if (habit) return `Keep habit stable: ${habit.title}`;

  return 'Hold a lighter planning week and protect recovery';
}

function buildPressurePoints(capacity: AtlasCapacityBlueprint): string[] {
  const points: string[] = [];
  if (capacity.headroom < 0) {
    points.push(`Demand is over safe capacity by ${round1(Math.abs(capacity.headroom))} energy points.`);
  }
  if (capacity.vectors.friction >= 6.5) {
    points.push('Friction is elevated across planning/deadline surfaces.');
  }
  if (capacity.vectors.resilience <= 4.5) {
    points.push('Resilience signals are low enough that recovery should be scheduled, not implied.');
  }
  if (capacity.vectors.specAlignment <= 5) {
    points.push('Current commitments are drifting away from goals and habit anchors.');
  }
  return points.slice(0, 3);
}

function buildActions(input: ReviewInput, capacity: AtlasCapacityBlueprint): AtlasReviewAction[] {
  const profile = input.profile;
  if (!profile) return [];

  const actions: AtlasReviewAction[] = [];
  const overdueGoals = profile.goals.filter((goal) => {
    if (goal.status !== 'active' || !goal.deadline) return false;
    return new Date(goal.deadline).getTime() < (input.now ?? new Date()).getTime() && goal.progressPercent < 100;
  });
  const atRiskHabits = profile.habits.filter((habit) => {
    if (habit.status !== 'active' || !habit.lastCompleted) return false;
    const elapsedHours = ((input.now ?? new Date()).getTime() - new Date(habit.lastCompleted).getTime()) / 36e5;
    return elapsedHours >= 20;
  });

  if (capacity.headroom < 0) {
    actions.push({
      id: 'protect-load',
      title: 'Protect next week’s load',
      detail: `Defer ${Math.max(1, Math.ceil(Math.abs(capacity.headroom) / 6))} high-energy task(s) or shrink their scope before Monday.`,
      emphasis: 'protect',
    });
  }

  if (capacity.vectors.resilience <= 4.5) {
    actions.push({
      id: 'schedule-recovery',
      title: 'Schedule explicit recovery',
      detail: 'Place one recovery window on the calendar now so compression is proactive instead of reactive.',
      emphasis: 'protect',
    });
  }

  if (overdueGoals.length > 0) {
    actions.push({
      id: 'goal-rescue',
      title: 'Rescue a slipping goal',
      detail: `Re-scope or re-sequence ${overdueGoals[0].title} so the next action is visible and schedulable.`,
      emphasis: 'focus',
    });
  }

  if (atRiskHabits.length > 0) {
    actions.push({
      id: 'habit-anchor',
      title: 'Stabilize an at-risk habit',
      detail: `Protect ${atRiskHabits[0].title} with a minimum viable version before end of day.`,
      emphasis: 'build',
    });
  }

  if (capacity.vectors.specAlignment <= 5) {
    actions.push({
      id: 'align-work',
      title: 'Re-align task demand to goals',
      detail: 'Link orphan tasks to an active goal or archive them so demand reflects what actually matters.',
      emphasis: 'focus',
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'hold-line',
      title: 'Hold the current blueprint',
      detail: 'Keep a steady load and preserve your highest-leverage focus block early in the week.',
      emphasis: 'focus',
    });
  }

  return actions.slice(0, 4);
}

function inferProjectionConfidence(input: ReviewInput): AtlasProjectionSurface['confidence'] {
  const profile = input.profile;
  const soul = input.soul;
  const signals = [
    profile?.energyWave?.length ? 1 : 0,
    profile?.tasks?.length ? 1 : 0,
    profile?.dailyCheckIns?.length ? 1 : 0,
    soul?.crossFunctionalState ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  if (signals >= 4) return 'high';
  if (signals >= 2) return 'medium';
  return 'low';
}

export function inferAtlasDocumentIngestionMode(confidence: number): AtlasIngestionMode {
  return confidence >= 0.7 ? 'structured' : 'unstructured';
}

export function projectAtlasCapacityBlueprint(
  blueprint: AtlasCapacityBlueprint,
  capacityPct: number,
): CapacityProjection {
  const projectedCapacity = round1(blueprint.baselineCapacity * clamp(capacityPct, MIN_CAPACITY_PCT, MAX_CAPACITY_PCT) / 100);
  const headroom = round1(projectedCapacity - blueprint.plannedDemand);
  const overflowTasks = headroom < 0 ? Math.max(0, Math.ceil(Math.abs(headroom) / 6)) : 0;

  const summary =
    headroom >= 3
      ? 'Projection leaves meaningful headroom for deep work and interruptions.'
      : headroom >= 0
        ? 'Projection is workable, but only if scope stays disciplined.'
        : `Projection still overloads the week. Defer about ${overflowTasks} high-energy task(s).`;

  return {
    capacity: projectedCapacity,
    headroom,
    overflowTasks,
    summary,
  };
}

export function computeAtlasReviewBlueprint(input: ReviewInput): AtlasReviewBlueprint {
  const now = input.now ?? new Date();
  const profile = input.profile;
  const nsv = input.soul?.crossFunctionalState;

  const vitality = average([
    normalizeTenScale(nsv?.cognitive?.energyBudget),
    normalizeTenScale(nsv?.cognitive?.focusScore),
    normalizeTenScale(nsv?.biological?.sleepQuality),
    normalizeTenScale(average(profile?.energyWave?.map((point) => point.energy) ?? [])),
    normalizeTenScale(average((profile?.dailyCheckIns ?? []).slice(-7).map((entry) => entry.energyLevel * 2))),
  ]);

  const friction = average([
    normalizeTenScale(nsv?.cognitive?.planningLoad),
    normalizeTenScale(nsv?.planning?.deadlinePressure),
    normalizeTenScale(nsv?.emotional?.stressLoad),
    normalizeTenScale(nsv?.resource?.financialFriction),
    normalizeTenScale(nsv?.cognitive?.activeLoad),
  ]);

  const resilience = average([
    normalizeTenScale(nsv?.emotional?.emotionalResilience),
    normalizeTenScale(nsv?.biological?.recoveryScore),
    normalizeTenScale(nsv?.planning?.streakHealth),
    normalizeTenScale(typeof nsv?.biological?.cnsFatigue === 'number' ? 10 - nsv.biological.cnsFatigue : null),
  ]);

  const activeGoals = profile?.goals.filter((goal) => goal.status === 'active') ?? [];
  const goalLinkedTasks = profile?.tasks.filter((task) => task.goalId).length ?? 0;
  const activeTasks = profile?.tasks.filter((task) => task.status !== 'done').length ?? 0;
  const activeHabits = profile?.habits.filter((habit) => habit.status === 'active') ?? [];
  const recentReviewDays =
    profile?.reviews?.length
      ? Math.max(
          0,
          14 - Math.round((now.getTime() - new Date(profile.reviews[profile.reviews.length - 1].createdAt).getTime()) / 86400000),
        ) / 14
      : 0;

  const specAlignment = average([
    normalizeRatio(nsv?.planning?.goalAlignment),
    normalizeRatio(nsv?.planning?.habitMomentum),
    activeGoals.length > 0 ? clamp(goalLinkedTasks / Math.max(activeGoals.length, 1), 0, 1) : null,
    activeHabits.length > 0
      ? clamp(activeHabits.filter((habit) => (habit.currentStreak ?? 0) > 0).length / activeHabits.length, 0, 1)
      : null,
    recentReviewDays,
    activeTasks > 0 ? clamp((profile?.tasks.filter((task) => task.goalId && task.status !== 'done').length ?? 0) / activeTasks, 0, 1) : null,
  ]);

  const vitalityScore = round1((vitality ?? 0.5) * 10);
  const frictionScore = round1((friction ?? 0.5) * 10);
  const resilienceScore = round1((resilience ?? 0.5) * 10);
  const specAlignmentScore = round1((specAlignment ?? 0.5) * 10);

  const baselineCapacity = sumEnergyWave(profile) || round1(((nsv?.cognitive?.energyBudget ?? 5) as number) * 4.5);
  const plannedDemand =
    estimateScheduledDemand(profile?.scheduledTasks ?? [], now) +
    estimateTaskDemand(profile?.tasks ?? [], now) +
    estimateHabitLoad(profile?.habits ?? []);

  const rawCapacityPct =
    72 +
    vitalityScore * 2.2 +
    resilienceScore * 1.8 +
    specAlignmentScore * 1.2 -
    frictionScore * 2.8;
  const recommendedCapacityPct = Math.round(clamp(rawCapacityPct, MIN_CAPACITY_PCT, MAX_CAPACITY_PCT));
  const safeCapacity = round1(baselineCapacity * recommendedCapacityPct / 100);
  const headroom = round1(safeCapacity - plannedDemand);
  const loadRatio = safeCapacity > 0 ? round1(plannedDemand / safeCapacity) : 0;

  const state: AtlasCapacityState =
    recommendedCapacityPct <= 72 || resilienceScore <= 4.2
      ? 'recover'
      : recommendedCapacityPct < 92 || frictionScore >= 6
        ? 'compress'
        : recommendedCapacityPct >= 108 && vitalityScore >= 7 && resilienceScore >= 6.5 && frictionScore <= 4.5
          ? 'expand'
          : 'hold';

  const capacity: AtlasCapacityBlueprint = {
    baselineCapacity,
    safeCapacity,
    plannedDemand: round1(plannedDemand),
    loadRatio,
    headroom,
    recommendedCapacityPct,
    state,
    vectors: {
      vitality: vitalityScore,
      friction: frictionScore,
      resilience: resilienceScore,
      specAlignment: specAlignmentScore,
    },
    pressurePoints: [],
  };

  capacity.pressurePoints = buildPressurePoints(capacity);

  const recommendedActions = buildActions(input, capacity);
  const projected = projectAtlasCapacityBlueprint(capacity, recommendedCapacityPct);

  const projection: AtlasProjectionSurface = {
    state,
    summary:
      state === 'recover'
        ? 'Atlas is projecting a recovery-first week. Protect bandwidth before adding commitments.'
        : state === 'compress'
          ? 'Atlas is projecting a compressed week. Keep scope tight and front-load the essentials.'
          : state === 'expand'
            ? 'Atlas is projecting surplus capacity. Use it intentionally, not by accident.'
            : 'Atlas is projecting a stable week. Preserve momentum without overshooting.',
    confidence: inferProjectionConfidence(input),
    projectedCapacity: projected.capacity,
    projectedDemand: capacity.plannedDemand,
    projectedHeadroom: projected.headroom,
    nextPeriodFocus: findTopFocus(profile?.tasks ?? [], profile?.goals ?? [], profile?.habits ?? []),
    recommendedActions,
  };

  return {
    generatedAt: now.toISOString(),
    period: 'weekly',
    capacity,
    projection,
  };
}

export const AtlasBlueprintService = {
  computeReviewBlueprint: computeAtlasReviewBlueprint,
  projectAtCapacityPct: projectAtlasCapacityBlueprint,
  inferDocumentIngestionMode: inferAtlasDocumentIngestionMode,
};

// ─── Deadline Pressure Score ──────────────────────────────────────────────────

/**
 * Compute a 0–10 deadline pressure score from active tasks and goals.
 * Factors in urgency, energy weight, priority, milestone velocity, and proximity.
 */
export function computeDeadlinePressureScore(
  tasks: AtlasTask[],
  goals: AtlasGoal[],
  taskCompletionRate?: number
): number {
  const now = Date.now();

  // ── Task scores ─────────────────────────────────────────────────────────────
  const taskScores: number[] = tasks
    .filter(t => t.status !== 'done' && t.deadline)
    .map(t => {
      const daysRemaining = (new Date(t.deadline!).getTime() - now) / (1000 * 60 * 60 * 24);
      const urgency =
        daysRemaining <= 0 ? 10 :
        daysRemaining <= 1 ? 9 :
        daysRemaining <= 3 ? 7 :
        daysRemaining <= 7 ? 5 : 2;
      const energyWeight = (t.energyCost ?? 5) / 10;
      const priorityMultiplier = (t.priority ?? 3) <= 2 ? 1.5 : 1.0;
      return urgency * energyWeight * priorityMultiplier;
    })
    .sort((a, b) => b - a);

  const top5Tasks = taskScores.slice(0, 5);
  const taskAvg = top5Tasks.length > 0
    ? top5Tasks.reduce((s, v) => s + v, 0) / top5Tasks.length
    : 0;

  // ── Goal scores ──────────────────────────────────────────────────────────────
  const goalScores: number[] = goals
    .filter(g => g.status === 'active' && g.deadline)
    .map(g => {
      const daysRemaining = (new Date(g.deadline!).getTime() - now) / (1000 * 60 * 60 * 24);

      const totalMilestones = g.milestones.length;
      const completedMilestones = g.milestones.filter(m => m.completed).length;

      const milestoneRatio = totalMilestones > 0
        ? completedMilestones / totalMilestones
        : (g.progressPercent ?? 0) / 100;

      const velocityNeeded = (1 - milestoneRatio) / Math.max(1, daysRemaining / 7);
      const velocityHave = taskCompletionRate ?? 0.5;
      const goalRisk = Math.max(0, velocityNeeded - velocityHave) * 10;

      const proximityMultiplier = daysRemaining <= 14 ? 1.5 : 1.0;
      return Math.min(10, goalRisk) * proximityMultiplier;
    })
    .sort((a, b) => b - a);

  const top3Goals = goalScores.slice(0, 3);
  const goalAvg = top3Goals.length > 0
    ? top3Goals.reduce((s, v) => s + v, 0) / top3Goals.length
    : 0;

  const rawScore = taskAvg * 0.6 + goalAvg * 0.4;
  return Math.round(Math.min(10, Math.max(0, rawScore)) * 10) / 10;
}
