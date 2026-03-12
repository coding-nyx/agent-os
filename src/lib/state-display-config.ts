import type { SpineEventType } from '@/lib/types';
import type { StatusTone } from '@/modules/hub/constants';
import type { NSVMetricPath } from '@/lib/services/nsv-ownership';
import {
  Heart,
  Brain,
  Sparkles,
  Waves
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Domain Pillar Configuration
// Centralizes the mapping from NSV domains to user-facing pillar language.
// ---------------------------------------------------------------------------

export interface DomainPillarConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;       // Tailwind color name (e.g. 'emerald')
  metrics: NSVMetricPath[];
  words: Record<StatusTone, string>;
  owners: string[];           // Module IDs that own metrics in this domain
  /** Some metrics are inverse (high = bad), list them here */
  invertedMetrics: NSVMetricPath[];
}

export const DOMAIN_PILLARS: Record<string, DomainPillarConfig> = {
  biological: {
    label: 'Body',
    icon: Heart,
    accentColor: 'emerald',
    metrics: ['biological.recoveryScore', 'biological.sleepQuality', 'biological.cnsFatigue'],
    words: { good: 'Strong', warn: 'Tired', bad: 'Drained', neutral: '—' },
    owners: ['titan'],
    invertedMetrics: ['biological.cnsFatigue']
  },
  cognitive: {
    label: 'Mind',
    icon: Brain,
    accentColor: 'sky',
    metrics: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad'],
    words: { good: 'Sharp', warn: 'Foggy', bad: 'Overloaded', neutral: '—' },
    owners: ['atlas'],
    invertedMetrics: ['cognitive.activeLoad']
  },
  emotional: {
    label: 'Heart',
    icon: Sparkles,
    accentColor: 'indigo',
    metrics: ['emotional.emotionalResilience', 'emotional.stressLoad'],
    words: { good: 'Resilient', warn: 'Tender', bad: 'Low', neutral: '—' },
    owners: ['agnes'],
    invertedMetrics: ['emotional.stressLoad']
  },
  resource: {
    label: 'Flow',
    icon: Waves,
    accentColor: 'cyan',
    metrics: ['resource.financialFriction', 'resource.resonanceROI'],
    words: { good: 'Aligned', warn: 'Friction', bad: 'Stressed', neutral: '—' },
    owners: ['ledger'],
    invertedMetrics: ['resource.financialFriction']
  }
} as const;

export const DOMAIN_ORDER = ['biological', 'cognitive', 'emotional', 'resource'] as const;

// ---------------------------------------------------------------------------
// Spine Event Display Names
// Translate technical event types into user-facing language.
// ---------------------------------------------------------------------------

export const EVENT_DISPLAY_NAMES: Record<SpineEventType, string> = {
  VITAL_UPDATED: 'Vitals synced',
  REDUCE_TRAINING_LOAD: 'Training load reduced',
  BLOCK_HIGH_INTENSITY: 'High intensity blocked',
  FLATTEN_ENERGY_WAVE: 'Schedule lightened',
  RECOVERY_AVAILABLE: 'Recovery window opened',
  BURNOUT_WARNING: 'Burnout risk detected',
  CLEARANCE_DENIED: 'Activity clearance denied',
  CLEARANCE_GRANTED: 'Activity cleared',
  COGNITIVE_OVERLOAD: 'Cognitive overload detected',
  SECURITY_POLICY_UPDATED: 'Security settings updated',
  FINANCIAL_STRESS: 'Financial stress flagged',
  MEDICAL_ALERT: 'Medical alert',
  CRISIS_DETECTED: 'Crisis Detected',
  DRAFT_PROPOSED: 'Suggestion proposed',
  DRAFT_APPROVED: 'Suggestion approved',
  DRAFT_DISMISSED: 'Suggestion dismissed',
  SESSION_STARTED: 'Session started',
  SESSION_ENDED: 'Session ended',
  MODULE_DELEGATED: 'Handed off to another module',
  PLANNING_OVERLOAD: 'Planning capacity exceeded',
  DEADLINE_CRUNCH: 'Approaching deadlines',
  COMPOUND_STRESS: 'Cross-domain stress detected',
  CRISIS_MODE: 'High-intensity recovery active',
  EXECUTION_COLLAPSE: 'System execution halted',
  STREAK_BROKEN: 'Habit streak broken',
  TASK_COMPLETED: 'Task completed',
  DEADLINE_APPROACHING: 'Deadline approaching',
  HABIT_STREAK_BROKEN: 'Habit streak lost',
  HABIT_STREAK_MILESTONE: 'Habit streak milestone reached',
  TEMPORAL_REVIEW_COMPLETE: 'Temporal review completed',
  DELEGATION_REQUEST: 'Module delegation requested',
  NSV_CALIBRATION_REQUEST: 'NSV calibration requested',
  SCHEMA_EXTENDED: 'Schema extended',
  SCHEMA_MODIFIED: 'Schema modified',
  SCHEMA_MIGRATED: 'Schema migrated',
  FIELD_CREATED: 'Custom field created',
  FIELD_DELETED: 'Custom field deleted',
  FIELD_VALUE_UPDATED: 'Custom field value updated',
  // Ledger Spine Events
  BUDGET_UPDATED: 'Budget updated',
  GOAL_PROGRESS: 'Goal progress updated',
  FINANCIAL_FRICTION_CHANGED: 'Financial friction changed',
  RESONANCE_ROI_UPDATED: 'Resonance ROI updated',
  FINANCIAL_PLAN_CREATED: 'Financial plan created',
  DOCUMENT_ANALYZED: 'Financial document analyzed',
  // Soma Spine Events
  SOMA_BIOMARKER_COMMITTED: 'Soma biomarker committed',
  SOMA_READINESS_UPDATED: 'Soma readiness updated',
  SOMA_CLEARANCE_CHANGED: 'Soma clearance changed',
  SOMA_FIELD_CREATED: 'Soma field created',
  SOMA_FIELD_UPDATED: 'Soma field updated',
  SOMA_FIELD_DELETED: 'Soma field deleted',
  SOMA_VITAL_LOGGED: 'Soma vital logged',
  SOMA_LAB_REPORT_PARSED: 'Soma lab report parsed',
  SOMA_PROFILE_UPDATED: 'Soma profile updated',
  // Soma Cascade Derived Events
  HEALTH_CONTEXT_STALE: 'Health context refreshing',
  ai_validation_suggestion: 'AI validation suggestion',
  ai_contextual_validation: 'AI contextual validation',
  ai_error_explanation: 'AI error explanation',
  // Atlas Spine Events
  ATLAS_TASK_COMPLETED: 'Atlas task completed',
  ATLAS_HABIT_LOGGED: 'Atlas habit logged',
  ATLAS_GOAL_MILESTONE: 'Atlas goal milestone',
  ATLAS_ENERGY_UPDATED: 'Atlas energy updated',
  ATLAS_FIELD_CREATED: 'Atlas field created',
  ATLAS_FIELD_DELETED: 'Atlas field deleted',
  ATLAS_FIELD_VALUE_UPDATED: 'Atlas field value updated',
  // Atlas Journal Events (J-entries — alphabetical)
  JOURNAL_ENTRY_CREATED: 'Journal entry created',
  JOURNAL_ENTRY_UPDATED: 'Journal entry updated',
  // Titan Cycle Events
  CYCLE_STARTED: 'Cycle started',
  CYCLE_COMPLETED: 'Cycle completed',
  // Ledger Transaction / Budget / Goal / Risk Events
  TRANSACTION_CREATED: 'Transaction created',
  TRANSACTION_UPDATED: 'Transaction updated',
  TRANSACTION_DELETED: 'Transaction deleted',
  BUDGET_CREATED: 'Budget created',
  BUDGET_MODIFIED: 'Budget modified',
  GOAL_CREATED: 'Goal created',
  GOAL_COMPLETED: 'Goal achieved',
  FINANCIAL_HEALTH_CHECK: 'Financial health checked',
  RISK_DETECTED: 'Financial risk detected',
  // Titan Workout Events
  WORKOUT_COMPLETED: 'Workout session logged',
  SPENDING_DETECTED: 'Spending detected',
  CONFLICT_DETECTED: 'Conflict detected',
  CONFLICT_RESOLVED: 'Conflict resolved',
  ATLAS_RECOVERY_SCHEDULED: 'Recovery scheduled',
  ATLAS_PREDICTIVE_ALERT: 'Predictive alert',
  ATLAS_STATE_CHANGED: 'System state changed',
  ATLAS_OVERLOAD_DETECTED: 'Atlas overload detected',
  ATLAS_GOAL_UPDATED: 'Goal updated',
  ATLAS_GOAL_COMPLETED: 'Goal completed',
  DEADLINE_PRESSURE_CHANGED: 'Deadline pressure changed',
  PLANNING_STATE_UPDATED: 'Planning state updated',
  ATLAS_ENERGY_OVERLOAD: 'Atlas energy overload',
  ATLAS_RECOVERY_WINDOW_CREATED: 'Recovery window created',
  ATLAS_TASK_CREATED: 'Task created',
  ATLAS_TASK_BLOCKED: 'Task blocked',
  ATLAS_TASK_UNBLOCKED: 'Task unblocked',
  ATLAS_HABIT_MILESTONE: 'Habit milestone',
  MORNING_BRIEF: 'Morning brief',
  GOAL_MISSING_PROGRESS: 'Goal stalled',
  // Ledger Cross-Verification / Cashflow Events (S2-L-004)
  FINANCIAL_FRICTION_UPDATED: 'Financial friction updated',
  BUDGET_ALERT: 'Budget alert',
  OVERSPEND_DETECTED: 'Overspend detected',
  DEBT_MILESTONE: 'Debt milestone',
  SAVINGS_MILESTONE: 'Savings milestone',
  INCOME_CHANGE: 'Income changed',
  EXPENSE_SPIKE: 'Expense spike',
  CASHFLOW_POSITIVE: 'Cashflow positive',
  CASHFLOW_NEGATIVE: 'Cashflow negative',
  // Soul Write Protocol Events (S10-002)
  SOUL_WRITE_REQUESTED: 'Soul write requested',
  SOUL_WRITE_APPROVED: 'Soul write approved',
  SOUL_WRITE_REJECTED: 'Soul write rejected',
  // Contextual Inference Engine Events (S10-008)
  CONTEXT_HINT_DETECTED: 'Cross-module hint detected',
  CONTEXT_HINT_CONFIRMED: 'Data sync confirmed',
  CONTEXT_HINT_DISMISSED: 'Sync hint dismissed',
  // Atlas Weekly Review (S9-005)
  WEEKLY_REVIEW_DUE: 'Weekly review due',
  // Atlas Schedule Events (S9-002)
  ROUTINE_UPDATED: 'Daily schedule updated',
  // Agnes Somatic Support (S14-006)
  SOMATIC_SUPPORT_REQUESTED: 'Somatic support triggered',
  // Atlas Morning/Evening Intelligence Cadence (S9-007)
  MORNING_BRIEF_DUE: 'Morning brief ready',
  EVENING_CHECKIN_DUE: 'Evening check-in ready',
  COMMITMENT_MISSED: 'Commitment Missed',
  SOMATIC_SESSION_COMPLETE: 'Somatic session complete',
};

// ---------------------------------------------------------------------------
// Composite Score Helpers
// ---------------------------------------------------------------------------

import { getMetricValue } from '@/lib/services/nsv-ownership';
import type { NeuralStateVector } from '@/lib/types';
import type { TrendDirection } from '@/core/components/TrendArrow';

/**
 * Computes a composite word-state and tone for a given domain pillar.
 * Inverted metrics (where high = bad) are flipped before averaging.
 */
export function computePillarState(
  nsv: NeuralStateVector | null | undefined,
  domain: string
): { word: string; tone: StatusTone; average: number | null } {
  const pillar = DOMAIN_PILLARS[domain];
  if (!pillar || !nsv) {
    return { word: pillar?.words.neutral ?? '—', tone: 'neutral', average: null };
  }

  const values: number[] = [];

  for (const metricPath of pillar.metrics) {
    const raw = getMetricValue(nsv, metricPath);
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;

    const isInverted = pillar.invertedMetrics.includes(metricPath);
    values.push(isInverted ? 10 - raw : raw);
  }

  if (values.length === 0) {
    return { word: pillar.words.neutral, tone: 'neutral', average: null };
  }

  const average = values.reduce((a, b) => a + b, 0) / values.length;

  let tone: StatusTone;
  if (average >= 7) tone = 'good';
  else if (average >= 4) tone = 'warn';
  else tone = 'bad';

  return { word: pillar.words[tone], tone, average };
}

// ---------------------------------------------------------------------------
// Brief Sentence Templates
// ---------------------------------------------------------------------------

interface BriefContext {
  name: string;
  pillars: Record<string, { tone: StatusTone; trend: TrendDirection }>;
  moduleNames: Record<string, string>;
}

export function generateBriefSentence(ctx: BriefContext): string {
  const { name, pillars, moduleNames } = ctx;
  const agnesName = moduleNames.agnes || 'Agnes';
  const atlasName = moduleNames.atlas || 'Atlas';
  const titanName = moduleNames.titan || 'Titan';

  const bodyTone = pillars.biological?.tone ?? 'neutral';
  const heartTone = pillars.emotional?.tone ?? 'neutral';
  const mindTone = pillars.cognitive?.tone ?? 'neutral';

  // All calibrated
  const allNeutral = Object.values(pillars).every(p => p.tone === 'neutral');
  if (allNeutral) {
    return `Some of your vitals haven't been calibrated yet. Chat with your modules to sync up.`;
  }

  // Burnout risk
  if (bodyTone === 'bad' && heartTone === 'bad') {
    return `Fatigue is high and resilience is low. Your modules have coordinated to protect your energy. Please rest, ${name}.`;
  }

  // Body good, heart struggling
  if (bodyTone === 'good' && heartTone === 'bad') {
    return `Your body is recovering well, but emotional resilience dipped. ${agnesName} noticed — she's here if you want to talk.`;
  }

  // Body bad
  if (bodyTone === 'bad') {
    return `You're in recovery mode. ${titanName} is monitoring your bounce-back. Go easy today.`;
  }

  // Mind overloaded
  if (mindTone === 'bad') {
    return `Energy is running low today. ${atlasName} has prioritized only your essential tasks.`;
  }

  // All good
  if (bodyTone === 'good' && heartTone === 'good' && mindTone === 'good') {
    return `Everything is looking good today, ${name}. All systems are stable.`;
  }

  // Mild caution
  return `You're holding steady, ${name}. Keep an eye on anything flagged below.`;
}
