/**
 * Recovery Action Handlers for Titan
 *
 * These handlers enable AI-driven recovery management:
 * - start_recovery_plan: Create a new recovery plan (injury, overtraining, etc.)
 * - end_recovery_plan: Complete/cancel recovery and resume training
 * - log_recovery_checkin: Daily check-in during recovery
 *
 * Previously, recovery was UI-only (TitanContent.tsx callbacks).
 * These handlers allow the AI to initiate and manage recovery flows.
 */

import {
  loadProfile,
  persistProfile,
  Spine,
} from './shared';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import type { ActionHandler, TitanProfile } from './shared';
import type {
  TitanRecoveryPlan,
  TitanRecoveryCheckin,
  TitanRecoveryType,
  TitanRecoveryReason,
  TitanRecoveryBodyRegion,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_RECOVERY_TYPES: TitanRecoveryType[] = ['rest', 'active', 'rehab', 'deload'];
const VALID_RECOVERY_REASONS: TitanRecoveryReason[] = [
  'injury', 'stress', 'overtraining', 'illness', 'travel', 'deload', 'other'
];
const VALID_BODY_REGIONS: TitanRecoveryBodyRegion[] = [
  'knee', 'shoulder', 'back', 'hip', 'ankle', 'wrist', 'neck', 'other'
];

function parseRecoveryType(value: unknown): TitanRecoveryType {
  if (typeof value === 'string' && VALID_RECOVERY_TYPES.includes(value as TitanRecoveryType)) {
    return value as TitanRecoveryType;
  }
  return 'rest';
}

function parseRecoveryReasons(value: unknown): TitanRecoveryReason[] {
  if (!Array.isArray(value)) return ['other'];
  const valid = value.filter(
    (r): r is TitanRecoveryReason =>
      typeof r === 'string' && VALID_RECOVERY_REASONS.includes(r as TitanRecoveryReason)
  );
  return valid.length > 0 ? valid : ['other'];
}

function parseBodyRegion(value: unknown): TitanRecoveryBodyRegion | undefined {
  if (typeof value === 'string' && VALID_BODY_REGIONS.includes(value as TitanRecoveryBodyRegion)) {
    return value as TitanRecoveryBodyRegion;
  }
  return undefined;
}

function parseSeverity(value: unknown): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const recoveryHandlers: Record<string, ActionHandler> = {

  /**
   * start_recovery_plan — Create a recovery plan and notify downstream modules.
   *
   * Payload:
   *   - type: 'rest' | 'active' | 'rehab' | 'deload' (default: 'rest')
   *   - reasons: string[] (default: ['other'])
   *   - durationDays: number (default: 7)
   *   - severity: 'low' | 'medium' | 'high' (default: 'medium')
   *   - bodyRegion?: string (for injury-specific recovery)
   *   - aiSummary?: string (AI-generated context)
   *   - notes?: string (user notes)
   *
   * Emits: TITAN_RECOVERY_NEEDED spine event
   * Updates: NSV biological.recoveryScore and cnsFatigue
   */
  start_recovery_plan: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile to start recovery plan.');
      return;
    }

    // Check if already in recovery
    if (profile.recoveryPlan?.active) {
      pushAssistantMessage?.(
        '⚠️ You already have an active recovery plan. End it first before starting a new one.'
      );
      return;
    }

    const type = parseRecoveryType(payload?.type);
    const reasons = parseRecoveryReasons(payload?.reasons);
    const severity = parseSeverity(payload?.severity);
    const bodyRegion = parseBodyRegion(payload?.bodyRegion);
    const durationDays =
      typeof payload?.durationDays === 'number' && payload.durationDays >= 1 && payload.durationDays <= 90
        ? Math.round(payload.durationDays)
        : 7;

    const startDate = todayIso();
    const endDate = addDays(startDate, durationDays);

    const plan: TitanRecoveryPlan = {
      active: true,
      type,
      reasons,
      startDate,
      endDate,
      suggestedDurationDays: durationDays,
      severity,
      bodyRegion,
      aiSummary: typeof payload?.aiSummary === 'string' ? payload.aiSummary : undefined,
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
    };

    const next: TitanProfile = {
      ...profile,
      recoveryPlan: plan,
      updatedAt: new Date().toISOString(),
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Update NSV biological state — lower recovery score reflects impaired state
    if (userId) {
      const recoveryScoreOnStart =
        type === 'rehab' ? 2 : type === 'rest' ? 4 : type === 'active' ? 5 : 6;
      queueNSVUpdate(userId, { biological: { recoveryScore: recoveryScoreOnStart, cnsFatigue: 8 } }, 'start_recovery_plan');
    }

    // Emit spine event for cross-module awareness
    Spine.emit({
      type: 'TITAN_RECOVERY_NEEDED',
      source: 'titan',
      domain: 'B',
      data: {
        type: plan.type,
        reasons: plan.reasons,
        durationDays: plan.suggestedDurationDays,
        severity: plan.severity,
        bodyRegion: plan.bodyRegion,
        startDate: plan.startDate,
        endDate: plan.endDate,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    const reasonsStr = reasons.join(', ');
    pushAssistantMessage?.(
      `🛑 **Recovery plan started**\n` +
      `- Type: ${type}\n` +
      `- Reason: ${reasonsStr}\n` +
      `- Duration: ${durationDays} days (${startDate} → ${endDate})\n` +
      `- Severity: ${severity}\n\n` +
      `Training activities will be limited during this period. Remember to log daily check-ins.`
    );
  },

  /**
   * end_recovery_plan — Complete or cancel the active recovery plan.
   *
   * Payload:
   *   - reason?: 'completed' | 'cancelled' | 'early_return' (default: 'completed')
   *   - notes?: string
   *
   * Emits: RECOVERY_AVAILABLE spine event
   * Updates: NSV biological to baseline recovered values
   */
  end_recovery_plan: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile to end recovery plan.');
      return;
    }

    if (!profile.recoveryPlan?.active) {
      pushAssistantMessage?.('ℹ️ No active recovery plan to end.');
      return;
    }

    const previousPlan = profile.recoveryPlan;
    const reason =
      payload?.reason === 'completed' || payload?.reason === 'cancelled' || payload?.reason === 'early_return'
        ? payload.reason
        : 'completed';

    const next: TitanProfile = {
      ...profile,
      recoveryPlan: {
        ...previousPlan,
        active: false,
        notes: typeof payload?.notes === 'string'
          ? (previousPlan.notes ? `${previousPlan.notes}\n[End: ${reason}] ${payload.notes}` : `[End: ${reason}] ${payload.notes}`)
          : previousPlan.notes,
      },
      updatedAt: new Date().toISOString(),
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Restore NSV to baseline recovered state
    if (userId) {
      queueNSVUpdate(userId, { biological: { recoveryScore: 7, cnsFatigue: 2 } }, 'end_recovery_plan');
    }

    // Emit spine event for cross-module awareness
    Spine.emit({
      type: 'RECOVERY_AVAILABLE',
      source: 'titan',
      domain: 'B',
      data: {
        previousType: previousPlan.type,
        endReason: reason,
        daysInRecovery: Math.ceil(
          (Date.now() - new Date(previousPlan.startDate).getTime()) / (1000 * 60 * 60 * 24)
        ),
      },
      cascadeDepth: 0,
      priority: 'info',
    });

    pushAssistantMessage?.(
      `✅ **Recovery plan ended**\n` +
      `You're cleared to resume training. Start gradually and listen to your body.`
    );
  },

  /**
   * log_recovery_checkin — Record a daily recovery check-in.
   *
   * Payload:
   *   - pain: number (0-10, where 0 = no pain)
   *   - fatigue: number (0-10, where 0 = no fatigue)
   *   - sleepQuality: number (0-10, where 10 = excellent)
   *   - mood: number (0-10, where 10 = excellent)
   *   - notes?: string
   *   - date?: string (YYYY-MM-DD, default: today)
   *   - skipped?: boolean (mark as skipped if user can't check in)
   *
   * Updates: NSV biological.recoveryScore and sleepQuality
   * Emits: RECOVERY_AVAILABLE if recovery score >= 8
   */
  log_recovery_checkin: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile to log recovery check-in.');
      return;
    }

    const date =
      typeof payload?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : todayIso();

    const skipped = payload?.skipped === true;

    // Default values for skipped check-ins
    const pain = skipped
      ? 5
      : typeof payload?.pain === 'number'
        ? Math.min(10, Math.max(0, Math.round(payload.pain)))
        : 5;
    const fatigue = skipped
      ? 5
      : typeof payload?.fatigue === 'number'
        ? Math.min(10, Math.max(0, Math.round(payload.fatigue)))
        : 5;
    const sleepQuality = skipped
      ? 5
      : typeof payload?.sleepQuality === 'number'
        ? Math.min(10, Math.max(0, Math.round(payload.sleepQuality)))
        : 5;
    const mood = skipped
      ? 5
      : typeof payload?.mood === 'number'
        ? Math.min(10, Math.max(0, Math.round(payload.mood)))
        : 5;

    const checkin: TitanRecoveryCheckin = {
      date,
      pain,
      fatigue,
      sleepQuality,
      mood,
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
      skipped,
    };

    // Replace existing check-in for the same date, or add new
    const existingCheckins = profile.recoveryCheckins ?? [];
    const filtered = existingCheckins.filter((c) => c.date !== date);
    const nextCheckins = [checkin, ...filtered].slice(0, 180); // Cap at 180 entries

    const next: TitanProfile = {
      ...profile,
      recoveryCheckins: nextCheckins,
      updatedAt: new Date().toISOString(),
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Update NSV based on check-in values
    if (userId && !skipped) {
      // recoveryScore: weighted average where low pain/fatigue = higher score
      const recoveryScore = Math.min(10, Math.max(0, Math.round(
        (10 - pain) * 0.3 +
        (10 - fatigue) * 0.4 +
        sleepQuality * 0.3
      )));

      queueNSVUpdate(userId, {
        biological: {
          recoveryScore,
          sleepQuality,
        },
      }, 'log_recovery_checkin');

      // If recovery score is high, emit early recovery signal
      if (recoveryScore >= 8) {
        Spine.emit({
          type: 'RECOVERY_AVAILABLE',
          source: 'titan',
          domain: 'B',
          data: {
            recoveryScore,
            source: 'checkin',
            checkinDate: date,
          },
          cascadeDepth: 0,
          priority: 'info',
        });
      }
    }

    if (skipped) {
      pushAssistantMessage?.(`📋 Check-in marked as skipped for ${date}.`);
    } else {
      const recoveryScore = Math.min(10, Math.max(0, Math.round(
        (10 - pain) * 0.3 +
        (10 - fatigue) * 0.4 +
        sleepQuality * 0.3
      )));
      pushAssistantMessage?.(
        `📋 **Recovery check-in logged for ${date}**\n` +
        `- Pain: ${pain}/10\n` +
        `- Fatigue: ${fatigue}/10\n` +
        `- Sleep: ${sleepQuality}/10\n` +
        `- Mood: ${mood}/10\n` +
        `- Recovery Score: ${recoveryScore}/10`
      );
    }
  },

};
