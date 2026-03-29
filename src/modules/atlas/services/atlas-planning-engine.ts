/**
 * Atlas Planning Engine — Pure computation layer for intelligent planning.
 *
 * All functions are pure (no side effects, no persistence, no Spine events).
 * Input: AtlasProfile + optional NeuralStateVector
 * Output: Computed intelligence structures for AI context injection and action logic.
 */

import type {
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
  AtlasProfile,
  AtlasProject,
  EnergyWavePoint,
  NeuralStateVector,
  ScheduledTask,
} from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DependencyGraph {
  /** taskId → IDs this task depends on */
  adjacency: Map<string, string[]>;
  /** taskId → IDs that are blocked by this task */
  reverseAdj: Map<string, string[]>;
  /** Ordered task IDs on the longest weighted path (by energyCost) */
  criticalPath: string[];
  /** Chains where a root task is blocked and everything downstream waits */
  blockedChains: { root: string; chain: string[] }[];
  /** Tasks with no goal, no project, and no dependencies */
  orphanTasks: string[];
  /** True if a cycle was detected in the dependency graph */
  cycleDetected: boolean;
  /** Topological order of task IDs (empty if cycle detected) */
  topologicalOrder: string[];
}

export interface GoalVelocity {
  goalId: string;
  title: string;
  completedMilestones: number;
  totalMilestones: number;
  daysElapsed: number;
  daysRemaining: number | null;
  actualVelocity: number;
  requiredVelocity: number | null;
  onPace: boolean;
  linkedTaskCount: number;
  linkedTasksDone: number;
  riskLevel: 'on-track' | 'at-risk' | 'behind' | 'stalled';
}

export interface DailyLoadForecast {
  date: string;
  scheduledEnergy: number;
  taskEnergy: number;
  habitEnergy: number;
  routineEnergy: number;
  totalDemand: number;
  estimatedCapacity: number;
  headroom: number;
  overloaded: boolean;
}

export interface ConflictReport {
  deadlineConvergence: { date: string; taskIds: string[]; count: number }[];
  habitScheduleGaps: { habitTitle: string; habitFrequency: string }[];
  recoveryViolations: { taskTitle: string; windowTitle: string }[];
}

export interface TaskBreakdownSuggestion {
  subtasks: {
    title: string;
    estimatedEnergyCost: number;
    suggestedOrder: number;
    rationale: string;
  }[];
  totalEstimatedEnergy: number;
  decompositionStrategy: string;
}

export interface HistoricalPatterns {
  completionRate7d: number;
  completionRate30d: number;
  avgEnergyAccuracy: number | null;
  commonDeferDays: string[];
  peakProductivityHour: number | null;
  reviewConsistency: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// ─── 2A: Dependency Graph Analysis ───────────────────────────────────────────

export function buildDependencyGraph(tasks: AtlasTask[]): DependencyGraph {
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const taskMap = new Map(activeTasks.map(t => [t.id, t]));
  const adjacency = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();

  for (const task of activeTasks) {
    adjacency.set(task.id, [...(task.dependencies ?? [])]);
    if (!reverseAdj.has(task.id)) reverseAdj.set(task.id, []);
    for (const depId of task.dependencies ?? []) {
      const arr = reverseAdj.get(depId) ?? [];
      arr.push(task.id);
      reverseAdj.set(depId, arr);
    }
  }

  // Kahn's algorithm for topological sort + cycle detection
  const inDegree = new Map<string, number>();
  for (const task of activeTasks) {
    inDegree.set(task.id, 0);
  }
  for (const task of activeTasks) {
    for (const depId of task.dependencies ?? []) {
      if (inDegree.has(depId)) {
        // depId blocks task, so task's in-degree increases
      }
      // Actually: adjacency[task] = deps means task depends on dep.
      // In Kahn's we need in-degree based on "who blocks whom".
      // If task depends on dep, there's an edge dep→task. So task's in-degree++.
    }
  }
  // Rebuild in-degree correctly: edge from dep → task for each dependency
  for (const task of activeTasks) {
    let deg = 0;
    for (const depId of task.dependencies ?? []) {
      if (taskMap.has(depId)) deg++;
    }
    inDegree.set(task.id, deg);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topologicalOrder: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    topologicalOrder.push(id);
    visited.add(id);
    // For each task that depends on `id`, reduce in-degree
    for (const dependentId of reverseAdj.get(id) ?? []) {
      if (!inDegree.has(dependentId)) continue;
      const newDeg = (inDegree.get(dependentId) ?? 1) - 1;
      inDegree.set(dependentId, newDeg);
      if (newDeg === 0) queue.push(dependentId);
    }
  }

  const cycleDetected = topologicalOrder.length < activeTasks.length;

  // Critical path: longest weighted path using DP on topological order
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const id of topologicalOrder) {
    dist.set(id, taskMap.get(id)?.energyCost ?? 0);
    prev.set(id, null);
  }

  for (const id of topologicalOrder) {
    const currentDist = dist.get(id) ?? 0;
    for (const dependentId of reverseAdj.get(id) ?? []) {
      if (!dist.has(dependentId)) continue;
      const dependentTask = taskMap.get(dependentId);
      const newDist = currentDist + (dependentTask?.energyCost ?? 0);
      if (newDist > (dist.get(dependentId) ?? 0)) {
        dist.set(dependentId, newDist);
        prev.set(dependentId, id);
      }
    }
  }

  // Find the end of critical path (node with max distance)
  let maxDist = 0;
  let maxNode: string | null = null;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      maxNode = id;
    }
  }

  const criticalPath: string[] = [];
  if (maxNode) {
    let current: string | null = maxNode;
    while (current) {
      criticalPath.unshift(current);
      current = prev.get(current) ?? null;
    }
  }

  // Blocked chains: BFS from each blocked task following reverseAdj
  const blockedChains: { root: string; chain: string[] }[] = [];
  const blockedRoots = activeTasks.filter(t => t.status === 'blocked');
  for (const root of blockedRoots) {
    const chain: string[] = [];
    const bfsQueue = [root.id];
    const seen = new Set<string>([root.id]);
    while (bfsQueue.length > 0) {
      const nodeId = bfsQueue.shift()!;
      for (const downstream of reverseAdj.get(nodeId) ?? []) {
        if (!seen.has(downstream)) {
          seen.add(downstream);
          chain.push(downstream);
          bfsQueue.push(downstream);
        }
      }
    }
    if (chain.length > 0) {
      blockedChains.push({ root: root.id, chain });
    }
  }

  // Orphan tasks: no goal, no project, no dependencies, not depended upon
  const orphanTasks = activeTasks
    .filter(t =>
      !t.goalId &&
      !t.projectId &&
      (t.dependencies ?? []).length === 0 &&
      (reverseAdj.get(t.id) ?? []).length === 0
    )
    .map(t => t.id);

  return {
    adjacency,
    reverseAdj,
    criticalPath,
    blockedChains,
    orphanTasks,
    cycleDetected,
    topologicalOrder,
  };
}

// ─── 2B: Goal Velocity Tracker ───────────────────────────────────────────────

export function computeGoalVelocities(
  goals: AtlasGoal[],
  tasks: AtlasTask[],
  now: Date = new Date(),
): GoalVelocity[] {
  return goals
    .filter(g => g.status === 'active')
    .map(goal => {
      const completedMilestones = goal.milestones.filter(m => m.completed).length;
      const totalMilestones = goal.milestones.length;
      const remaining = totalMilestones - completedMilestones;

      const createdAt = new Date(goal.createdAt);
      const daysElapsed = Math.max(1, (now.getTime() - createdAt.getTime()) / DAY_MS);
      const weeksElapsed = daysElapsed / 7;

      const daysRemaining = goal.deadline
        ? Math.max(0, (new Date(goal.deadline).getTime() - now.getTime()) / DAY_MS)
        : null;
      const weeksRemaining = daysRemaining !== null ? daysRemaining / 7 : null;

      const actualVelocity = totalMilestones > 0
        ? round1(completedMilestones / Math.max(1, weeksElapsed))
        : 0;

      const requiredVelocity = weeksRemaining !== null && weeksRemaining > 0 && totalMilestones > 0
        ? round1(remaining / weeksRemaining)
        : null;

      const linkedTasks = tasks.filter(t => t.goalId === goal.id);
      const linkedTaskCount = linkedTasks.length;
      const linkedTasksDone = linkedTasks.filter(t => t.status === 'done').length;

      let riskLevel: GoalVelocity['riskLevel'];
      if (completedMilestones === 0 && daysElapsed > 14 && totalMilestones > 0) {
        riskLevel = 'stalled';
      } else if (requiredVelocity !== null && actualVelocity > 0 && requiredVelocity > actualVelocity * 1.5) {
        riskLevel = 'behind';
      } else if (requiredVelocity !== null && actualVelocity > 0 && requiredVelocity > actualVelocity) {
        riskLevel = 'at-risk';
      } else if (requiredVelocity !== null && actualVelocity === 0 && remaining > 0) {
        riskLevel = daysRemaining !== null && daysRemaining < 14 ? 'behind' : 'stalled';
      } else {
        riskLevel = 'on-track';
      }

      const onPace = riskLevel === 'on-track';

      return {
        goalId: goal.id,
        title: goal.title,
        completedMilestones,
        totalMilestones,
        daysElapsed: Math.round(daysElapsed),
        daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null,
        actualVelocity,
        requiredVelocity,
        onPace,
        linkedTaskCount,
        linkedTasksDone,
        riskLevel,
      };
    });
}

// ─── 2C: Load Forecaster ─────────────────────────────────────────────────────

const HABIT_DAILY_WEIGHT: Record<AtlasHabit['frequency'], number> = {
  daily: 1,
  weekdays: 5 / 7,
  weekends: 2 / 7,
  weekly: 1 / 7,
  monthly: 1 / 30,
  custom: 1 / 7,
};

function estimateDailyHabitEnergy(habits: AtlasHabit[], dayOfWeek: number): number {
  return habits
    .filter(h => h.status === 'active')
    .reduce((sum, h) => {
      const freq = h.frequency;
      if (freq === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) return sum;
      if (freq === 'weekends' && dayOfWeek >= 1 && dayOfWeek <= 5) return sum;
      if (freq === 'custom' && h.customDays && !h.customDays.includes(dayOfWeek)) return sum;
      return sum + (h.energyCost ?? 0) * (HABIT_DAILY_WEIGHT[freq] ?? 0.14);
    }, 0);
}

function estimateDailyRoutineEnergy(profile: AtlasProfile, dayOfWeek: number): number {
  if (!profile.routine?.isActive) return 0;
  return (profile.routine.blocks ?? [])
    .filter(b => b.daysOfWeek.includes(dayOfWeek))
    .reduce((sum, b) => sum + (b.energyCost ?? 0), 0);
}

function estimateBaseCapacity(
  profile: AtlasProfile,
  nsv: NeuralStateVector | null,
): number {
  if (!profile.energyWave?.length) {
    const budget = nsv?.cognitive?.energyBudget;
    return typeof budget === 'number' ? budget * 4.5 : 40;
  }
  const waveSum = profile.energyWave.reduce((s, p) => s + p.energy, 0);
  let capacity = waveSum || 40;

  const sleepQuality = nsv?.biological?.sleepQuality;
  if (typeof sleepQuality === 'number' && sleepQuality < 4) capacity *= 0.8;
  const cnsFatigue = nsv?.biological?.cnsFatigue;
  if (typeof cnsFatigue === 'number' && cnsFatigue > 7) capacity = Math.min(capacity, 20);
  const stressLoad = nsv?.emotional?.stressLoad;
  if (typeof stressLoad === 'number' && stressLoad > 7) capacity *= 0.9;

  return Math.max(0, capacity);
}

export function forecastLoad(
  profile: AtlasProfile,
  nsv: NeuralStateVector | null,
  days: number = 7,
  now: Date = new Date(),
): DailyLoadForecast[] {
  const baseCapacity = estimateBaseCapacity(profile, nsv);
  const forecasts: DailyLoadForecast[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getDay();

    // Scheduled tasks for this day
    const scheduledEnergy = (profile.scheduledTasks ?? [])
      .filter(st => st.scheduledAt.startsWith(dateStr) && st.status !== 'done')
      .reduce((sum, st) => sum + (st.energyCost ?? 0), 0);

    // Tasks with deadlines or scheduledSlots on this day
    const taskEnergy = (profile.tasks ?? [])
      .filter(t => {
        if (t.status === 'done' || t.status === 'deferred') return false;
        if (t.scheduledSlot === dateStr) return true;
        if (t.deadline && t.deadline.slice(0, 10) === dateStr) return true;
        return false;
      })
      .reduce((sum, t) => sum + (t.energyCost ?? 0), 0);

    const habitEnergy = round1(estimateDailyHabitEnergy(profile.habits ?? [], dayOfWeek));
    const routineEnergy = estimateDailyRoutineEnergy(profile, dayOfWeek);
    const totalDemand = round1(scheduledEnergy + taskEnergy + habitEnergy + routineEnergy);
    const estimatedCapacity = round1(baseCapacity);
    const headroom = round1(estimatedCapacity - totalDemand);

    forecasts.push({
      date: dateStr,
      scheduledEnergy: round1(scheduledEnergy),
      taskEnergy: round1(taskEnergy),
      habitEnergy,
      routineEnergy: round1(routineEnergy),
      totalDemand,
      estimatedCapacity,
      headroom,
      overloaded: headroom < 0,
    });
  }

  return forecasts;
}

// ─── 2D: Conflict Detector ───────────────────────────────────────────────────

export function detectConflicts(
  profile: AtlasProfile,
  forecastDays: number = 7,
  now: Date = new Date(),
): ConflictReport {
  // Deadline convergence: group active tasks by deadline date
  const deadlineGroups = new Map<string, string[]>();
  for (const task of profile.tasks ?? []) {
    if (task.status === 'done' || !task.deadline) continue;
    const deadlineDate = task.deadline.slice(0, 10);
    const deadlineMs = new Date(deadlineDate).getTime();
    const windowEnd = now.getTime() + forecastDays * DAY_MS;
    if (deadlineMs > windowEnd) continue;

    const arr = deadlineGroups.get(deadlineDate) ?? [];
    arr.push(task.id);
    deadlineGroups.set(deadlineDate, arr);
  }

  const deadlineConvergence = [...deadlineGroups.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([date, taskIds]) => ({ date, taskIds, count: taskIds.length }))
    .sort((a, b) => b.count - a.count);

  // Habit-schedule gaps: daily/weekday habits without routine blocks matching their category
  const habitScheduleGaps: { habitTitle: string; habitFrequency: string }[] = [];
  const routineBlockCategories = new Set(
    (profile.routine?.isActive ? profile.routine.blocks : [])?.map(b => b.title.toLowerCase()) ?? []
  );

  for (const habit of profile.habits ?? []) {
    if (habit.status !== 'active') continue;
    if (habit.frequency !== 'daily' && habit.frequency !== 'weekdays') continue;
    // Check if any routine block title loosely matches the habit title
    const habitWords = habit.title.toLowerCase().split(/\s+/);
    const hasMatchingBlock = [...routineBlockCategories].some(blockTitle =>
      habitWords.some(word => word.length > 3 && blockTitle.includes(word))
    );
    if (!hasMatchingBlock) {
      habitScheduleGaps.push({ habitTitle: habit.title, habitFrequency: habit.frequency });
    }
  }

  // Recovery violations: scheduled tasks overlapping recovery windows
  const recoveryViolations: { taskTitle: string; windowTitle: string }[] = [];
  for (const window of profile.recoveryWindows ?? []) {
    if (window.status === 'completed') continue;
    const wStart = new Date(window.start).getTime();
    const wEnd = new Date(window.end).getTime();
    for (const st of profile.scheduledTasks ?? []) {
      if (st.status === 'done') continue;
      const stStart = new Date(st.scheduledAt).getTime();
      const stEnd = stStart + st.duration * 60 * 1000;
      if (stStart < wEnd && stEnd > wStart) {
        recoveryViolations.push({ taskTitle: st.title, windowTitle: window.title });
      }
    }
  }

  return { deadlineConvergence, habitScheduleGaps, recoveryViolations };
}

// ─── 2E: Smart Task Decomposition ───────────────────────────────────────────

const DOMAIN_PHASES: Record<string, { phases: string[]; weights: number[] }> = {
  dev: {
    phases: ['Spike & research', 'Design approach', 'Implement', 'Test & review'],
    weights: [0.15, 0.15, 0.5, 0.2],
  },
  writing: {
    phases: ['Research & outline', 'Draft', 'Edit & refine'],
    weights: [0.25, 0.5, 0.25],
  },
  design: {
    phases: ['Explore references', 'Create draft', 'Iterate & polish'],
    weights: [0.2, 0.5, 0.3],
  },
  generic_large: {
    phases: ['Research & plan', 'Design approach', 'Execute', 'Review & verify'],
    weights: [0.15, 0.15, 0.5, 0.2],
  },
  generic_medium: {
    phases: ['Prepare', 'Execute', 'Verify'],
    weights: [0.2, 0.55, 0.25],
  },
  generic_small: {
    phases: ['Do', 'Verify'],
    weights: [0.7, 0.3],
  },
};

function inferDomain(task: AtlasTask): string {
  const tags = (task.tags ?? []).map(t => t.toLowerCase());
  const titleLower = task.title.toLowerCase();
  const descLower = (task.description ?? '').toLowerCase();
  const combined = `${titleLower} ${descLower} ${tags.join(' ')}`;

  if (/\b(code|dev|implement|api|bug|refactor|deploy|test)\b/.test(combined)) return 'dev';
  if (/\b(write|draft|blog|article|essay|document|copy)\b/.test(combined)) return 'writing';
  if (/\b(design|figma|ui|ux|mockup|wireframe|layout)\b/.test(combined)) return 'design';
  return 'generic';
}

export function suggestTaskBreakdown(
  task: AtlasTask,
  profile: AtlasProfile,
): TaskBreakdownSuggestion {
  const domain = inferDomain(task);
  const energy = task.energyCost ?? 4;

  // Select phase template based on domain + energy
  let templateKey: string;
  if (domain !== 'generic') {
    templateKey = domain;
  } else if (energy >= 7) {
    templateKey = 'generic_large';
  } else if (energy >= 4) {
    templateKey = 'generic_medium';
  } else {
    templateKey = 'generic_small';
  }

  const template = DOMAIN_PHASES[templateKey] ?? DOMAIN_PHASES.generic_medium;
  const phases = [...template.phases];
  const weights = [...template.weights];

  // If task has unmet dependencies, prepend a verification step
  const unmetDeps = (task.dependencies ?? []).filter(depId => {
    const dep = (profile.tasks ?? []).find(t => t.id === depId);
    return dep && dep.status !== 'done';
  });
  if (unmetDeps.length > 0) {
    phases.unshift('Verify dependencies are complete');
    // Redistribute weights: give dependency check 10% and scale rest
    const scaleFactor = 0.9;
    weights.unshift(0.1);
    for (let i = 1; i < weights.length; i++) {
      weights[i] *= scaleFactor;
    }
  }

  // If task has a goalId, enrich the first phase with goal context
  if (task.goalId) {
    const goal = (profile.goals ?? []).find(g => g.id === task.goalId);
    if (goal) {
      const nextMilestone = goal.milestones.find(m => !m.completed);
      if (nextMilestone) {
        const firstActionIdx = unmetDeps.length > 0 ? 1 : 0;
        phases[firstActionIdx] = `${phases[firstActionIdx]} (toward: "${nextMilestone.title.slice(0, 50)}")`;
      }
    }
  }

  const subtasks = phases.map((title, i) => ({
    title: `${task.title}: ${title}`,
    estimatedEnergyCost: Math.max(1, Math.round(energy * weights[i])),
    suggestedOrder: i + 1,
    rationale: i === 0 && unmetDeps.length > 0
      ? `${unmetDeps.length} dependency(ies) must complete first`
      : `Phase ${i + 1} of ${phases.length}`,
  }));

  const totalEstimatedEnergy = subtasks.reduce((sum, s) => sum + s.estimatedEnergyCost, 0);

  return {
    subtasks,
    totalEstimatedEnergy,
    decompositionStrategy: domain !== 'generic'
      ? `${domain}-specific phases`
      : energy >= 7 ? 'sequential-phases' : energy >= 4 ? 'prepare-execute-verify' : 'do-and-verify',
  };
}

// ─── 2F: Historical Patterns ─────────────────────────────────────────────────

export function computeHistoricalPatterns(
  profile: AtlasProfile,
  now: Date = new Date(),
): HistoricalPatterns {
  const tasks = profile.tasks ?? [];
  const nowMs = now.getTime();

  // Completion rates
  const completedTasks = tasks.filter(t => t.status === 'done' && t.completedAt);

  const tasksCompleted7d = completedTasks.filter(t =>
    nowMs - new Date(t.completedAt!).getTime() <= 7 * DAY_MS
  ).length;
  const tasksActive7d = tasks.filter(t => {
    const created = new Date(t.createdAt).getTime();
    return nowMs - created <= 7 * DAY_MS && t.status !== 'done';
  }).length;
  const total7d = tasksCompleted7d + tasksActive7d;
  const completionRate7d = total7d > 0 ? round1(tasksCompleted7d / total7d) : 0;

  const tasksCompleted30d = completedTasks.filter(t =>
    nowMs - new Date(t.completedAt!).getTime() <= 30 * DAY_MS
  ).length;
  const tasksActive30d = tasks.filter(t => {
    const created = new Date(t.createdAt).getTime();
    return nowMs - created <= 30 * DAY_MS && t.status !== 'done';
  }).length;
  const total30d = tasksCompleted30d + tasksActive30d;
  const completionRate30d = total30d > 0 ? round1(tasksCompleted30d / total30d) : 0;

  // Energy accuracy: actual vs estimated for completed tasks
  const withActualEnergy = completedTasks.filter(
    t => typeof t.actualEnergyCost === 'number' && t.energyCost > 0
  );
  const avgEnergyAccuracy = withActualEnergy.length > 0
    ? round1(
        withActualEnergy.reduce((sum, t) => sum + t.actualEnergyCost! / t.energyCost, 0) /
        withActualEnergy.length
      )
    : null;

  // Common deferral days: check scheduledTasks with deferredFrom
  const deferDayCounts = new Map<number, number>();
  for (const st of profile.scheduledTasks ?? []) {
    if (st.deferredFrom) {
      const day = new Date(st.deferredFrom).getDay();
      deferDayCounts.set(day, (deferDayCounts.get(day) ?? 0) + 1);
    }
  }
  const sortedDeferDays = [...deferDayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => DAY_NAMES[day]);

  // Peak productivity hour: most common completion hour
  const hourCounts = new Map<number, number>();
  for (const t of completedTasks) {
    if (t.completedAt) {
      const hour = new Date(t.completedAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
  }
  let peakProductivityHour: number | null = null;
  let maxCount = 0;
  for (const [hour, count] of hourCounts) {
    if (count > maxCount) {
      maxCount = count;
      peakProductivityHour = hour;
    }
  }

  // Review consistency: weeks with reviews / total weeks tracked
  const reviews = profile.reviews ?? [];
  const weeklyReviews = reviews.filter(r => r.scope === 'weekly');
  const firstTaskDate = tasks.length > 0
    ? Math.min(...tasks.map(t => new Date(t.createdAt).getTime()))
    : nowMs;
  const totalWeeksTracked = Math.max(1, Math.ceil((nowMs - firstTaskDate) / WEEK_MS));
  const reviewConsistency = round1(Math.min(1, weeklyReviews.length / totalWeeksTracked));

  return {
    completionRate7d,
    completionRate30d,
    avgEnergyAccuracy,
    commonDeferDays: sortedDeferDays,
    peakProductivityHour,
    reviewConsistency,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const AtlasPlanningEngine = {
  buildDependencyGraph,
  computeGoalVelocities,
  forecastLoad,
  detectConflicts,
  suggestTaskBreakdown,
  computeHistoricalPatterns,
};
