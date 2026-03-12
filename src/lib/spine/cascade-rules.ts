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
  }
];

export function registerLedgerCascadeRules(): void {
  Spine.registerCascadeRules(LEDGER_CASCADE_RULES);
}

/** Alias — core cascade rules used by App-level registration. */
export const CORE_CASCADE_RULES = LEDGER_CASCADE_RULES;

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
];

export function registerAtlasPlanningCascadeRules(): void {
  Spine.registerCascadeRules(ATLAS_PLANNING_CASCADE_RULES);
}
