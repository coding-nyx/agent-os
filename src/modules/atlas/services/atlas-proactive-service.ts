/**
 * Atlas Proactive Intelligence Service
 *
 * Aggregates computed intelligence from the planning engine into a compact
 * PlanningDigest suitable for AI context injection. Pure functions, no side effects.
 */

import type { AtlasProfile, NeuralStateVector } from '@/lib/types';
import {
  buildDependencyGraph,
  computeGoalVelocities,
  forecastLoad,
  detectConflicts,
  computeHistoricalPatterns,
  type GoalVelocity,
  type DailyLoadForecast,
} from './atlas-planning-engine';
import { computeQuickCapacitySnapshot } from './atlas-blueprint-service';
import type { GlobalProjection } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanningAlert {
  id: string;
  category: 'deadline' | 'capacity' | 'habit' | 'goal' | 'coherence';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  actionHint?: string;
}

export interface PlanningDigest {
  alerts: PlanningAlert[];
  capacitySummary: string;
  topRisk: string | null;
  generatedAt: string;
}

// ─── Severity ordering ───────────────────────────────────────────────────────

const SEVERITY_RANK: Record<PlanningAlert['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

// ─── Alert generators ────────────────────────────────────────────────────────

function deadlineAlerts(
  profile: AtlasProfile,
  now: Date,
): PlanningAlert[] {
  const conflicts = detectConflicts(profile, 7, now);
  const alerts: PlanningAlert[] = [];

  for (const convergence of conflicts.deadlineConvergence) {
    const taskTitles = convergence.taskIds
      .slice(0, 3)
      .map(id => {
        const task = profile.tasks?.find(t => t.id === id);
        return task ? `"${task.title.slice(0, 30)}"` : id.slice(0, 12);
      })
      .join(', ');
    const extra = convergence.count > 3 ? ` +${convergence.count - 3} more` : '';

    alerts.push({
      id: `deadline-${convergence.date}`,
      category: 'deadline',
      severity: convergence.count >= 3 ? 'critical' : 'warning',
      title: `${convergence.count} deadlines converge on ${convergence.date}`,
      detail: `Tasks: ${taskTitles}${extra}`,
      actionHint: 'Defer or reschedule lower-priority tasks to spread the load.',
    });
  }

  for (const violation of conflicts.recoveryViolations.slice(0, 2)) {
    alerts.push({
      id: `recovery-violation-${violation.taskTitle.slice(0, 20)}`,
      category: 'deadline',
      severity: 'warning',
      title: `"${violation.taskTitle.slice(0, 30)}" overlaps recovery window`,
      detail: `Conflicts with "${violation.windowTitle}". Recovery windows are inviolable.`,
      actionHint: 'Reschedule the task outside the recovery window.',
    });
  }

  return alerts;
}

function capacityAlerts(
  profile: AtlasProfile,
  nsv: NeuralStateVector | null,
  now: Date,
): PlanningAlert[] {
  const forecast = forecastLoad(profile, nsv, 3, now);
  const alerts: PlanningAlert[] = [];

  const overloadedDays = forecast.filter(f => f.overloaded);
  const consecutiveOverloaded = forecast.reduce((max, f, i) => {
    if (!f.overloaded) return max;
    let streak = 1;
    for (let j = i + 1; j < forecast.length && forecast[j].overloaded; j++) streak++;
    return Math.max(max, streak);
  }, 0);

  if (consecutiveOverloaded >= 2) {
    const worstDay = overloadedDays.sort((a, b) => a.headroom - b.headroom)[0];
    alerts.push({
      id: 'capacity-consecutive-overload',
      category: 'capacity',
      severity: 'critical',
      title: `${consecutiveOverloaded} consecutive days overloaded`,
      detail: `Worst: ${worstDay.date} (demand ${worstDay.totalDemand} vs capacity ${worstDay.estimatedCapacity})`,
      actionHint: 'Defer non-essential tasks or flatten the schedule.',
    });
  } else if (overloadedDays.length > 0) {
    const day = overloadedDays[0];
    alerts.push({
      id: `capacity-overload-${day.date}`,
      category: 'capacity',
      severity: 'warning',
      title: `Capacity overload predicted for ${day.date}`,
      detail: `Demand: ${day.totalDemand} vs capacity: ${day.estimatedCapacity} (headroom: ${day.headroom})`,
      actionHint: 'Consider deferring the highest-energy task.',
    });
  }

  return alerts;
}

function habitAlerts(
  profile: AtlasProfile,
  nsv: NeuralStateVector | null,
  now: Date,
): PlanningAlert[] {
  const alerts: PlanningAlert[] = [];
  const forecast = forecastLoad(profile, nsv, 1, now);
  const todayOverloaded = forecast.length > 0 && forecast[0].overloaded;

  for (const habit of profile.habits ?? []) {
    if (habit.status !== 'active' || !habit.lastCompleted) continue;
    if (habit.currentStreak === 0) continue;

    const hoursSinceLastCompleted =
      (now.getTime() - new Date(habit.lastCompleted).getTime()) / (1000 * 60 * 60);

    const thresholdHours =
      habit.frequency === 'daily' || habit.frequency === 'weekdays' ? 20
      : habit.frequency === 'weekly' ? 144
      : 20;

    if (hoursSinceLastCompleted >= thresholdHours) {
      const isUrgent = todayOverloaded || hoursSinceLastCompleted > thresholdHours * 1.2;
      alerts.push({
        id: `habit-risk-${habit.id}`,
        category: 'habit',
        severity: isUrgent ? 'warning' : 'info',
        title: `"${habit.title.slice(0, 30)}" streak at risk`,
        detail: `${Math.round(hoursSinceLastCompleted)}hrs since last completion (streak: ${habit.currentStreak})${todayOverloaded ? ' — high load today' : ''}`,
        actionHint: habit.minimumViableVersion
          ? `Try the minimum viable version: "${habit.minimumViableVersion.slice(0, 50)}"`
          : 'Complete before end of day to preserve streak.',
      });
    }
  }

  return alerts;
}

function goalAlerts(
  profile: AtlasProfile,
  now: Date,
): PlanningAlert[] {
  const alerts: PlanningAlert[] = [];
  const velocities = computeGoalVelocities(profile.goals ?? [], profile.tasks ?? [], now);

  for (const v of velocities) {
    if (v.riskLevel === 'stalled') {
      alerts.push({
        id: `goal-stalled-${v.goalId}`,
        category: 'goal',
        severity: 'critical',
        title: `Goal "${v.title.slice(0, 30)}" is stalled`,
        detail: `${v.completedMilestones}/${v.totalMilestones} milestones in ${v.daysElapsed} days. ${v.linkedTaskCount} linked tasks (${v.linkedTasksDone} done).`,
        actionHint: 'Create a concrete next-action task or re-scope the goal.',
      });
    } else if (v.riskLevel === 'behind') {
      alerts.push({
        id: `goal-behind-${v.goalId}`,
        category: 'goal',
        severity: 'warning',
        title: `Goal "${v.title.slice(0, 30)}" is falling behind`,
        detail: `Velocity: ${v.actualVelocity} ms/week vs ${v.requiredVelocity} required. ${v.daysRemaining ?? '?'} days remaining.`,
        actionHint: 'Accelerate by breaking the next milestone into smaller tasks.',
      });
    }
  }

  return alerts;
}

function coherenceAlerts(
  profile: AtlasProfile,
): PlanningAlert[] {
  const alerts: PlanningAlert[] = [];
  const graph = buildDependencyGraph(profile.tasks ?? []);
  const activeTasks = (profile.tasks ?? []).filter(t => t.status !== 'done');

  // Orphan task drift
  if (activeTasks.length > 0) {
    const orphanRatio = graph.orphanTasks.length / activeTasks.length;
    if (orphanRatio > 0.3 && graph.orphanTasks.length >= 3) {
      alerts.push({
        id: 'coherence-orphan-drift',
        category: 'coherence',
        severity: 'warning',
        title: `${graph.orphanTasks.length} tasks not linked to any goal`,
        detail: `${Math.round(orphanRatio * 100)}% of active tasks are orphaned — work may be drifting from goals.`,
        actionHint: 'Link orphan tasks to active goals or archive them.',
      });
    }
  }

  // Cycle detection
  if (graph.cycleDetected) {
    alerts.push({
      id: 'coherence-cycle',
      category: 'coherence',
      severity: 'critical',
      title: 'Dependency cycle detected',
      detail: 'Circular dependency in task graph — some tasks can never unblock.',
      actionHint: 'Review and break the dependency cycle.',
    });
  }

  // Stale goals: active goals with 0 active linked tasks
  for (const goal of profile.goals ?? []) {
    if (goal.status !== 'active') continue;
    const linkedActive = activeTasks.filter(t => t.goalId === goal.id);
    if (linkedActive.length === 0 && goal.progressPercent < 100) {
      alerts.push({
        id: `coherence-stale-goal-${goal.id}`,
        category: 'coherence',
        severity: 'info',
        title: `Goal "${goal.title.slice(0, 30)}" has no active tasks`,
        detail: `${goal.progressPercent}% complete but no tasks driving it forward.`,
        actionHint: 'Create a next-action task for this goal.',
      });
    }
  }

  return alerts;
}

// ─── Capacity summary builder ────────────────────────────────────────────────

function buildCapacitySummary(
  profile: AtlasProfile,
  soul: GlobalProjection | null,
): string {
  const snapshot = computeQuickCapacitySnapshot(profile, soul);
  if (!snapshot) return 'Capacity data unavailable.';

  const stateLabel = snapshot.state.toUpperCase();
  const headroomSign = snapshot.headroom >= 0 ? '+' : '';
  return `State: ${stateLabel} | Safe capacity: ${snapshot.safeCapacity} | Demand: ${snapshot.plannedDemand} | Headroom: ${headroomSign}${snapshot.headroom} | Load ratio: ${snapshot.loadRatio}`;
}

// ─── Main digest generator ───────────────────────────────────────────────────

export function generatePlanningDigest(
  profile: AtlasProfile,
  soul: GlobalProjection | null,
  now: Date = new Date(),
): PlanningDigest {
  const nsv = soul?.crossFunctionalState ?? null;

  // Collect all alerts
  const allAlerts: PlanningAlert[] = [
    ...deadlineAlerts(profile, now),
    ...capacityAlerts(profile, nsv, now),
    ...habitAlerts(profile, nsv, now),
    ...goalAlerts(profile, now),
    ...coherenceAlerts(profile),
  ];

  // Sort by severity (critical first), cap at 5
  allAlerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const alerts = allAlerts.slice(0, 5);

  const capacitySummary = buildCapacitySummary(profile, soul);
  const topRisk = alerts.length > 0 ? alerts[0].title : null;

  return {
    alerts,
    capacitySummary,
    topRisk,
    generatedAt: now.toISOString(),
  };
}

export const AtlasProactiveService = {
  generatePlanningDigest,
};
