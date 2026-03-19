import { SpineEvent, SpineEventType } from '@/lib/types';
import { LedgerSpineEventType } from '@/modules/ledger/actions/ledger-field-actions';
import { Spine } from '@/lib/spine/spine-event-bus';

export interface CascadeRule {
  id: string;
  trigger: SpineEventType;
  condition: (event: SpineEvent) => boolean;
  transform: (event: SpineEvent) => any;
}

export const LEDGER_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'ledger-transaction-to-budget',
    trigger: 'TRANSACTION_CREATED' as SpineEventType,
    condition: (event) => event.type === 'TRANSACTION_CREATED' && event.domain === 'R',
    transform: (event) => ({
      type: 'BUDGET_UPDATED' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        transactionAmount: event.data.amount,
        transactionType: event.data.type,
        netCashflow: event.data.netCashflow
      }
    })
  },
  {
    id: 'ledger-goal-progress-to-health',
    trigger: 'GOAL_PROGRESS' as SpineEventType,
    condition: (event) => event.type === 'GOAL_PROGRESS' && event.domain === 'R',
    transform: (event) => ({
      type: 'FINANCIAL_HEALTH_CHECK' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        goalProgress: event.data.percentComplete,
        goalName: event.data.goalName,
        healthScore: (event.data.percentComplete as number) / 10
      }
    })
  },
  {
    id: 'ledger-risk-to-alert',
    trigger: 'RISK_DETECTED' as SpineEventType,
    condition: (event) => event.type === 'RISK_DETECTED' && event.domain === 'R',
    transform: (event) => ({
      type: 'FINANCIAL_FRICTION_CHANGED' as LedgerSpineEventType,
      domain: 'R' as const,
      source: event.source,
      data: {
        newScore: 8.5,
        analysis: `Risk detected: ${event.data.riskType}`,
        tier: 'elevated' as const
      }
    })
  },

  // ── Cross-module rules: high financial friction → somatic support ──────────
  {
    id: 'ledger-high-friction-to-somatic-support',
    trigger: 'FINANCIAL_FRICTION_CHANGED' as SpineEventType,
    condition: (event) => {
      const score = (event.data as Record<string, unknown>)?.newScore;
      return typeof score === 'number' && score >= 7;
    },
    transform: (event) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade:ledger',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'FINANCIAL_FRICTION_CHANGED',
        context: 'financial_stress',
        frictionScore: event.data.newScore,
        analysis: event.data.analysis,
        message: 'High financial friction detected — money stress may be impacting wellbeing.',
        timestamp: new Date().toISOString(),
      },
    }),
  },

  // ── Cross-module rules: soma high stress → prompt financial review ─────────
  {
    id: 'ledger-soma-stress-to-financial-review',
    trigger: 'STRESS_SPIKE' as SpineEventType,
    condition: (event) => {
      const stressLoad = (event.data as Record<string, unknown>)?.stressLoad;
      return typeof stressLoad === 'number' && stressLoad >= 8;
    },
    transform: (event) => ({
      type: 'FINANCIAL_HEALTH_CHECK' as LedgerSpineEventType,
      domain: 'R' as const,
      source: 'spine-cascade:soma',
      priority: 'info' as const,
      data: {
        triggeredBy: 'STRESS_SPIKE',
        context: 'cross_module_stress_check',
        stressLoad: event.data.stressLoad,
        message: 'High stress detected — checking if financial friction is a contributing factor.',
        timestamp: new Date().toISOString(),
      },
    }),
  },

  // ── Cross-module rules: goal completed → notify nexus of milestone ─────────
  {
    id: 'ledger-goal-completed-to-vital-update',
    trigger: 'GOAL_COMPLETED' as SpineEventType,
    condition: (event) => event.domain === 'R',
    transform: (event) => ({
      type: 'VITAL_UPDATED' as SpineEventType,
      domain: 'R' as const,
      source: 'spine-cascade:ledger',
      priority: 'info' as const,
      data: {
        triggeredBy: 'GOAL_COMPLETED',
        metric: 'financial_goal',
        goalId: event.data.goalId,
        goalName: event.data.goalName,
        achievement: event.data.achievement,
        timestamp: new Date().toISOString(),
      },
    }),
  },

  // ── Cross-module rules: burnout warning → reduce financial commitments ──────
  {
    id: 'ledger-burnout-to-financial-friction-check',
    trigger: 'BURNOUT_WARNING' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'RISK_DETECTED' as LedgerSpineEventType,
      domain: 'R' as const,
      source: 'spine-cascade:agnes',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'BURNOUT_WARNING',
        riskType: 'financial_overcommitment',
        riskDescription: 'Burnout warning active — review and reduce financial commitments to ease recovery.',
        cnsFatigue: event.data.cnsFatigue,
        timestamp: new Date().toISOString(),
      },
    }),
  },
];

export function registerLedgerCascadeRules(): void {
  Spine.registerCascadeRules(LEDGER_CASCADE_RULES);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Cascade Rules v2
// (Burnout + energy-flatten wave logic is validated by `cascade-rules.test.ts`.)
// ─────────────────────────────────────────────────────────────────────────────

const CORE_ENERGY_WAVE_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'burnout-warning',
    trigger: 'VITAL_UPDATED' as SpineEventType,
    condition: (event) => {
      const data = event.data as Record<string, unknown>;
      const cnsFatigue = data?.cnsFatigue;
      const emotionalResilience = data?.emotionalResilience;
      // Hot path: high fatigue + low resilience
      return (
        typeof cnsFatigue === 'number' &&
        typeof emotionalResilience === 'number' &&
        cnsFatigue >= 8 &&
        emotionalResilience <= 3
      );
    },
    transform: (event) => ({
      type: 'BURNOUT_WARNING' as SpineEventType,
      domain: 'system' as const,
      source: 'spine-cascade:core',
      priority: 'critical' as const,
      target: 'orchestrator',
      data: {
        reason: 'high_fatigue_low_resilience',
        cnsFatigue: (event.data as Record<string, unknown>)?.cnsFatigue,
        emotionalResilience: (event.data as Record<string, unknown>)?.emotionalResilience
      },
    }),
  },
  {
    id: 'burnout-flatten-wave',
    trigger: 'BURNOUT_WARNING' as SpineEventType,
    condition: () => true,
    transform: () => ({
      type: 'FLATTEN_ENERGY_WAVE' as SpineEventType,
      domain: 'system' as const,
      source: 'spine-cascade:core',
      priority: 'alert' as const,
      target: 'atlas',
      data: { reason: 'burnout_warning' },
    }),
  },
  {
    id: 'intensity-flatten-wave',
    trigger: 'BLOCK_HIGH_INTENSITY' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE' as SpineEventType,
      domain: 'system' as const,
      source: 'spine-cascade:core',
      priority: 'alert' as const,
      target: 'atlas',
      data: { reason: typeof (event.data as any)?.reason === 'string' ? (event.data as any).reason : undefined },
    }),
  },
];

/** Core cascade rules used by App-level registration. */
export const CORE_CASCADE_RULES: CascadeRule[] = [
  ...CORE_ENERGY_WAVE_CASCADE_RULES,
  ...LEDGER_CASCADE_RULES,
];

// ---------------------------------------------------------------------------
// Atlas Weekly Review Cascade Rule (S9-005)
// ---------------------------------------------------------------------------

/** Key used to persist the last weekly-review timestamp in localStorage. */
const ATLAS_LAST_WEEKLY_REVIEW_KEY = 'atlas_last_weekly_review';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true when:
 *   (a) It is Sunday between 18:00–21:59, OR
 *   (b) No weekly review has been recorded in the last 7 days (fallback).
 */
function isWeeklyReviewDue(): boolean {
  const now = new Date();
  const isSundayEvening = now.getDay() === 0 && now.getHours() >= 18 && now.getHours() <= 21;
  if (isSundayEvening) return true;

  const lastReview = localStorage.getItem(ATLAS_LAST_WEEKLY_REVIEW_KEY);
  if (!lastReview) return true;

  const lastReviewTime = new Date(lastReview).getTime();
  return Number.isNaN(lastReviewTime) ? true : Date.now() - lastReviewTime > SEVEN_DAYS_MS;
}

export const ATLAS_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'atlas-weekly-review-due-session',
    trigger: 'SESSION_STARTED' as SpineEventType,
    condition: () => isWeeklyReviewDue(),
    transform: (event) => ({
      type: 'WEEKLY_REVIEW_DUE' as SpineEventType,
      domain: 'C' as const,
      source: event.source,
      priority: 'info' as const,
      data: { triggeredBy: 'SESSION_STARTED', timestamp: new Date().toISOString() }
    })
  },
  {
    id: 'atlas-weekly-review-due-state',
    trigger: 'ATLAS_STATE_CHANGED' as SpineEventType,
    condition: () => isWeeklyReviewDue(),
    transform: (event) => ({
      type: 'WEEKLY_REVIEW_DUE' as SpineEventType,
      domain: 'C' as const,
      source: event.source,
      priority: 'info' as const,
      data: { triggeredBy: 'ATLAS_STATE_CHANGED', timestamp: new Date().toISOString() }
    })
  }
];

// ---------------------------------------------------------------------------
// Agnes Somatic Support Cascade Rule (S14-006)
// ---------------------------------------------------------------------------

export const AGNES_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'agnes-burnout-to-somatic-support',
    trigger: 'BURNOUT_WARNING' as SpineEventType,
    condition: (event) => event.type === 'BURNOUT_WARNING' && event.domain === 'B',
    transform: (event) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'BURNOUT_WARNING',
        cnsFatigue: event.data.cnsFatigue,
        timestamp: new Date().toISOString()
      }
    })
  }
];

export function registerAgnesCascadeRules(): void {
  Spine.registerCascadeRules(AGNES_CASCADE_RULES);
}

// ---------------------------------------------------------------------------
// Atlas Morning / Evening Intelligence Cadence (S9-007)
// ---------------------------------------------------------------------------

/** localStorage key for the last morning brief acknowledgement. */
const MORNING_BRIEF_KEY = 'atlas_last_morning_brief';

/**
 * Returns true when a morning brief should be shown.
 * Conditions (both must hold):
 *   1. Local hour is ≥ 5 and < 11  (05:00 – 11:00 window).
 *   2. The brief has not yet been shown today (localStorage gate).
 */
function isMorningBriefDue(): boolean {
  try {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 5 || hour >= 11) return false;
    const last = localStorage.getItem(MORNING_BRIEF_KEY);
    if (!last) return true;
    return new Date(last).toDateString() !== now.toDateString();
  } catch {
    return false;
  }
}

/**
 * Returns true when the evening check-in should be offered.
 * Conditions: local hour is between 19:00 (inclusive) and 22:00 (exclusive),
 * and the check-in has not already been shown today.
 */
function isEveningCheckinDue(): boolean {
  try {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 19 || hour >= 22) return false;
    const key = 'atlas_last_evening_checkin';
    const last = localStorage.getItem(key);
    if (!last) return true;
    return new Date(last).toDateString() !== now.toDateString();
  } catch {
    return false;
  }
}

export const ATLAS_MORNING_RULES: CascadeRule[] = [
  {
    id: 'atlas-morning-brief-session',
    trigger: 'SESSION_STARTED' as SpineEventType,
    condition: () => isMorningBriefDue(),
    transform: (event) => ({
      type: 'MORNING_BRIEF_DUE' as SpineEventType,
      domain: 'C' as const,
      source: event.source,
      priority: 'info' as const,
      data: { triggeredBy: 'SESSION_STARTED', timestamp: new Date().toISOString() }
    })
  },
  {
    id: 'atlas-evening-checkin-session',
    trigger: 'SESSION_STARTED' as SpineEventType,
    condition: () => isEveningCheckinDue(),
    transform: (event) => ({
      type: 'EVENING_CHECKIN_DUE' as SpineEventType,
      domain: 'C' as const,
      source: event.source,
      priority: 'info' as const,
      data: { triggeredBy: 'SESSION_STARTED', timestamp: new Date().toISOString() }
    })
  }
];

// ---------------------------------------------------------------------------
// Atlas Journal Cascade Rules — reflection-streak milestone (Atlas journaling)
// ---------------------------------------------------------------------------

/**
 * When a journal entry is created AND the user's reflection streak has reached
 * 7 or more consecutive days, emit a HABIT_STREAK_MILESTONE event so the rest
 * of the Spine ecosystem (badges, Agnes acknowledgements, etc.) can react.
 */
export const ATLAS_JOURNAL_RULES: CascadeRule[] = [
  {
    id: 'atlas-journal-reflection-streak-milestone',
    trigger: 'JOURNAL_ENTRY_CREATED' as SpineEventType,
    condition: (event) => {
      const streak = (event.data as Record<string, unknown>)?.reflectionStreak;
      return typeof streak === 'number' && streak >= 7;
    },
    transform: (event) => ({
      type: 'HABIT_STREAK_MILESTONE' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        source: 'atlas',
        habitName: 'Daily Reflection',
        streak: event.data.reflectionStreak,
      },
    }),
  },
];

export function registerAtlasCascadeRules(): void {
  Spine.registerCascadeRules(ATLAS_CASCADE_RULES);
  Spine.registerCascadeRules(ATLAS_MORNING_RULES);
  Spine.registerCascadeRules(ATLAS_JOURNAL_RULES);
  // Planning intelligence rules are registered separately via registerAtlasPlanningCascadeRules()
  // to avoid forward-reference issues (ATLAS_PLANNING_CASCADE_RULES is defined after this function).
}

// ---------------------------------------------------------------------------
// Atlas Failure Notification Loop (S9-008)
// ---------------------------------------------------------------------------

/**
 * Cascade rules fired when Atlas detects missed commitments or broken habit
 * streaks, routing proactive check-in signals to Agnes and the somatic layer.
 */
export const ATLAS_FAILURE_RULES: CascadeRule[] = [
  {
    id: 'atlas-commitment-missed-to-routine-disrupted',
    trigger: 'COMMITMENT_MISSED' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'ROUTINE_UPDATED' as SpineEventType,
      domain: 'C' as const,
      source: event.source,
      priority: 'alert' as const,
      data: {
        triggeredBy: 'COMMITMENT_MISSED',
        overdueCount: event.data.overdueCount,
        taskIds: event.data.taskIds,
      },
    }),
  },
  {
    id: 'atlas-habit-streak-broken-to-somatic-support',
    trigger: 'HABIT_STREAK_BROKEN' as SpineEventType,
    // Only escalate when the broken streak was meaningful (≥ 3 days).
    condition: (event) => {
      const days = (event.data as Record<string, unknown>)?.streakDays;
      return typeof days === 'number' && days >= 3;
    },
    transform: (event) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'HABIT_STREAK_BROKEN',
        streakDays: event.data.streakDays,
        timestamp: new Date().toISOString(),
      },
    }),
  },
];

export function registerAtlasFailureRules(): void {
  Spine.registerCascadeRules(ATLAS_FAILURE_RULES);
}

// ---------------------------------------------------------------------------
// Atlas Planning Intelligence Cascade Rules (Atlas Audit)
// ---------------------------------------------------------------------------

/**
 * When an Atlas goal is updated (created / progress / completed / deleted):
 *   - Emit ATLAS_STATE_CHANGED so the predictive service can re-evaluate risk.
 *   - If goal is completed, emit ATLAS_GOAL_MILESTONE for badges/acknowledgements.
 * When deadline pressure is high (≥8), escalate to DEADLINE_CRUNCH.
 * When planning state changes, propagate as VITAL_UPDATED for consumer modules.
 */
export const ATLAS_PLANNING_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'atlas-goal-updated-to-state-changed',
    trigger: 'ATLAS_GOAL_UPDATED' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'ATLAS_STATE_CHANGED' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'ATLAS_GOAL_UPDATED',
        goalId: event.data.goalId,
        action: event.data.action,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  {
    id: 'atlas-goal-completed-to-milestone',
    trigger: 'ATLAS_GOAL_UPDATED' as SpineEventType,
    condition: (event) => event.data?.action === 'completed',
    transform: (event) => ({
      type: 'ATLAS_GOAL_MILESTONE' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'ATLAS_GOAL_UPDATED',
        goalId: event.data.goalId,
        title: event.data.title,
        progressPercent: 100,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  {
    id: 'atlas-deadline-pressure-high-to-crunch',
    trigger: 'DEADLINE_PRESSURE_CHANGED' as SpineEventType,
    condition: (event) => {
      const pressure = (event.data as Record<string, unknown>)?.deadlinePressure;
      return typeof pressure === 'number' && pressure >= 8;
    },
    transform: (event) => ({
      type: 'DEADLINE_CRUNCH' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'DEADLINE_PRESSURE_CHANGED',
        deadlinePressure: event.data.deadlinePressure,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  {
    id: 'atlas-planning-state-updated-to-vital',
    trigger: 'PLANNING_STATE_UPDATED' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'VITAL_UPDATED' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'PLANNING_STATE_UPDATED',
        changedFields: event.data.changedFields,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  // ── ATLAS_TASK_COMPLETED → VITAL_UPDATED ─────────────────────────────────
  // Task completion changes taskCompletionRate which feeds the predictive
  // service. Without this cascade, AtlasPredictiveService (which only
  // subscribes to VITAL_UPDATED) never re-evaluates on task completion.
  {
    id: 'atlas-task-completed-to-vital',
    trigger: 'ATLAS_TASK_COMPLETED' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'VITAL_UPDATED' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'ATLAS_TASK_COMPLETED',
        taskId: event.data.taskId,
        energyCost: event.data.energyCost,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  // ── ATLAS_PREDICTIVE_ALERT (high risk) → FLATTEN_ENERGY_WAVE ─────────────
  // When the predictive service detects rapid load increase (risk ≥ 0.6),
  // proactively flatten the wave rather than waiting for Overloaded state.
  {
    id: 'atlas-predictive-alert-to-flatten',
    trigger: 'ATLAS_PREDICTIVE_ALERT' as SpineEventType,
    condition: (event) => {
      const risk = (event.data as Record<string, unknown>)?.riskScore;
      return typeof risk === 'number' && risk >= 0.6;
    },
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE' as SpineEventType,
      domain: 'C' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'ATLAS_PREDICTIVE_ALERT',
        reason: 'proactive_velocity_risk',
        riskScore: event.data.riskScore,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  // ── ATLAS_GOAL_MILESTONE → Agnes acknowledgement ──────────────────────────
  // When a goal completes, notify Agnes so she can offer emotional
  // acknowledgement. Uses SOMATIC_SUPPORT_REQUESTED (domain E) as the
  // cross-module signal Agnes already subscribes to.
  {
    id: 'atlas-goal-milestone-to-agnes',
    trigger: 'ATLAS_GOAL_MILESTONE' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'ATLAS_GOAL_MILESTONE',
        context: 'goal_completed',
        goalId: event.data.goalId,
        title: event.data.title,
        timestamp: new Date().toISOString(),
      },
    }),
  },
  // ── ATLAS_RECOVERY_SCHEDULED → REDUCE_TRAINING_LOAD ──────────────────────
  // When the user schedules a recovery day via the weekly review modal,
  // signal Titan/Soma to respect the recovery window.
  {
    id: 'atlas-recovery-scheduled-to-reduce-load',
    trigger: 'ATLAS_RECOVERY_SCHEDULED' as SpineEventType,
    condition: () => true,
    transform: (event) => ({
      type: 'REDUCE_TRAINING_LOAD' as SpineEventType,
      domain: 'B' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'ATLAS_RECOVERY_SCHEDULED',
        reason: 'atlas_recovery_day',
        capacityPercent: event.data.capacityPercent ?? 40,
        timestamp: new Date().toISOString(),
      },
    }),
  },
];

export function registerAtlasPlanningCascadeRules(): void {
  Spine.registerCascadeRules(ATLAS_PLANNING_CASCADE_RULES);
}

// ============================================================================
// Soma Cascade Rules
// ============================================================================

export const SOMA_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'soma-poor-readiness-to-compound-stress',
    trigger: 'SOMA_READINESS_UPDATED' as SpineEventType,
    condition: (event: SpineEvent) =>
      event.type === 'SOMA_READINESS_UPDATED' &&
      typeof event.data.score === 'number' &&
      (event.data.score as number) <= 30,
    transform: (event: SpineEvent) => ({
      type: 'COMPOUND_STRESS' as SpineEventType,
      domain: 'B' as const,
      source: event.source,
      data: {
        trigger: 'soma_poor_readiness',
        readinessScore: event.data.score,
        message: 'Physical readiness critically low — high-intensity training not recommended.',
      },
    }),
  },
  {
    id: 'soma-clearance-revoked-to-vital-alert',
    trigger: 'SOMA_CLEARANCE_CHANGED' as SpineEventType,
    condition: (event: SpineEvent) =>
      event.type === 'SOMA_CLEARANCE_CHANGED' && event.data.action === 'revoked',
    transform: (event: SpineEvent) => ({
      type: 'VITAL_UPDATED' as SpineEventType,
      domain: 'B' as const,
      source: event.source,
      data: {
        trigger: 'clearance_revoked',
        clearanceId: event.data.clearanceId,
        clearanceType: event.data.clearanceType,
        message: 'Medical clearance revoked — review training load.',
      },
    }),
  },
  {
    id: 'soma-optimal-readiness-to-vital-update',
    trigger: 'SOMA_READINESS_UPDATED' as SpineEventType,
    condition: (event: SpineEvent) =>
      event.type === 'SOMA_READINESS_UPDATED' &&
      typeof event.data.score === 'number' &&
      (event.data.score as number) >= 80,
    transform: (event: SpineEvent) => ({
      type: 'VITAL_UPDATED' as SpineEventType,
      domain: 'B' as const,
      source: event.source,
      data: {
        trigger: 'soma_optimal_readiness',
        readinessScore: event.data.score,
        message: 'Physical readiness optimal.',
      },
    }),
  },
];

export function registerSomaCascadeRules(): void {
  Spine.registerCascadeRules(SOMA_CASCADE_RULES);
}

// ============================================================================
// Titan Cascade Rules
// ============================================================================

/**
 * WORKOUT_COMPLETED (rpe ≥ 9) → REDUCE_TRAINING_LOAD
 * Hard session detected — tell Titan to deload next session.
 */
export const TITAN_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'titan-high-rpe-to-reduce-load',
    trigger: 'WORKOUT_COMPLETED' as SpineEventType,
    condition: (event: SpineEvent) => {
      const rpe = (event.data as Record<string, unknown>)?.rpe;
      return typeof rpe === 'number' && rpe >= 9;
    },
    transform: (event: SpineEvent) => ({
      type: 'REDUCE_TRAINING_LOAD' as SpineEventType,
      domain: 'B' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'WORKOUT_COMPLETED',
        reason: 'high_rpe_session',
        sessionRpe: event.data.rpe,
        date: event.data.date,
        capacityPercent: 60,
        timestamp: new Date().toISOString(),
      },
    }),
  },

  /**
   * TITAN_RECOVERY_NEEDED → SOMATIC_SUPPORT_REQUESTED
   * Accumulated fatigue is critical — Agnes offers somatic support.
   */
  {
    id: 'titan-recovery-needed-to-somatic-support',
    trigger: 'TITAN_RECOVERY_NEEDED' as SpineEventType,
    condition: () => true,
    transform: (event: SpineEvent) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade',
      priority: event.priority ?? ('alert' as const),
      data: {
        triggeredBy: 'TITAN_RECOVERY_NEEDED',
        context: 'physical_fatigue',
        cnsFatigue: event.data.projectedCnsFatigue,
        sessionRpe: event.data.sessionRpe,
        timestamp: new Date().toISOString(),
      },
    }),
  },

  /**
   * TITAN_BODY_WEIGHT_LOGGED (aggressiveCut) → COMPOUND_STRESS
   * Losing > 1.2 kg/week is a physiological stressor — flagged to Agnes.
   */
  {
    id: 'titan-aggressive-cut-to-compound-stress',
    trigger: 'TITAN_BODY_WEIGHT_LOGGED' as SpineEventType,
    condition: (event: SpineEvent) => event.data?.aggressiveCut === true,
    transform: (event: SpineEvent) => ({
      type: 'COMPOUND_STRESS' as SpineEventType,
      domain: 'B' as const,
      source: 'spine-cascade',
      priority: 'alert' as const,
      data: {
        triggeredBy: 'TITAN_BODY_WEIGHT_LOGGED',
        reason: 'aggressive_caloric_deficit',
        weeklyDeltaKg: event.data.weeklyDeltaKg,
        message: 'Weight is dropping faster than 1.2 kg/week — check caloric intake.',
        timestamp: new Date().toISOString(),
      },
    }),
  },

  /**
   * TITAN_TRAINING_STREAK → SOMATIC_SUPPORT_REQUESTED (positive context)
   * Milestone streak — Agnes can celebrate and reinforce the habit.
   */
  {
    id: 'titan-training-streak-to-agnes',
    trigger: 'TITAN_TRAINING_STREAK' as SpineEventType,
    condition: () => true,
    transform: (event: SpineEvent) => ({
      type: 'SOMATIC_SUPPORT_REQUESTED' as SpineEventType,
      domain: 'E' as const,
      source: 'spine-cascade',
      priority: 'info' as const,
      data: {
        triggeredBy: 'TITAN_TRAINING_STREAK',
        context: 'training_milestone',
        streakDays: event.data.streakDays,
        timestamp: new Date().toISOString(),
      },
    }),
  },
];

export function registerTitanCascadeRules(): void {
  Spine.registerCascadeRules(TITAN_CASCADE_RULES);
}
