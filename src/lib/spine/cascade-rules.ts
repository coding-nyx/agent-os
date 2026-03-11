import { SpineEvent, SpineEventType } from '@/lib/types';
import { LedgerSpineEventType } from '@/modules/ledger/actions/ledger-field-actions';

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
  const spine = (window as any).Spine;
  if (spine && spine.registerCascadeRules) {
    spine.registerCascadeRules(LEDGER_CASCADE_RULES);

  }
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

export function registerAtlasCascadeRules(): void {
  const spine = (window as Window & typeof globalThis & { Spine?: { registerCascadeRules?: (rules: CascadeRule[]) => void } }).Spine;
  if (spine?.registerCascadeRules) {
    spine.registerCascadeRules(ATLAS_CASCADE_RULES);

  }
}
