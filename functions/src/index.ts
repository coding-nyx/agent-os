import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, type FirestoreEvent, type QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { NotificationEngine, type NotificationPriority } from "./notification-engine";

// ---------------------------------------------------------------------------
// Notification allowlist — only user-facing events reach the inbox
// ---------------------------------------------------------------------------

/**
 * Explicit set of Spine event types that should be delivered to the user's
 * notification inbox. Internal routing/system signals (SOMATIC_SUPPORT_REQUESTED,
 * FLATTEN_ENERGY_WAVE, REDUCE_TRAINING_LOAD, ROUTINE_UPDATED, COMPOUND_STRESS,
 * RISK_DETECTED, NSV_CALIBRATION_REQUEST, SCHEMA_MIGRATED, etc.) are deliberately
 * excluded — they are consumed by other services and should never appear as
 * user-visible notifications.
 */
const NOTIFICATION_ALLOWLIST = new Set([
  // Reminders — always delivered (user-created schedules)
  "MODULE_REMINDER_DUE",
  // Health & body alerts
  "BURNOUT_WARNING",
  "BLOCK_HIGH_INTENSITY",
  "MEDICAL_ALERT",
  "BURNOUT_TRAJECTORY_WARNING",
  // Financial alerts
  "FINANCIAL_STRESS",
  "BUDGET_ALERT",
  "OVERSPEND_DETECTED",
  "EXPENSE_SPIKE",
  "CASHFLOW_NEGATIVE",
  // Cognitive & planning alerts
  "COGNITIVE_OVERLOAD",
  "PLANNING_OVERLOAD",
  "DEADLINE_CRUNCH",
  "DEADLINE_APPROACHING",
  // System-wide critical states
  "CRISIS_MODE",
  "CRISIS_DETECTED",
  "ATLAS_ENERGY_OVERLOAD",
  "ATLAS_OVERLOAD_DETECTED",
  "ATLAS_PREDICTIVE_ALERT",
  // Goal & habit alerts
  "STREAK_BROKEN",
  "COMMITMENT_MISSED",
  // AI & system errors the user should know about
  "AI_LINK_FAILURE",
]);

// ---------------------------------------------------------------------------
// Alert cooldown — prevent push spam for the same system alert type
// ---------------------------------------------------------------------------

/**
 * System alert event types that should be rate-limited per user.
 * Reminder-type events (MODULE_REMINDER_DUE) are excluded — they must always
 * fire because they represent user-created schedules.
 */
const RATE_LIMITED_ALERT_TYPES = new Set([
  "BURNOUT_WARNING",
  "BLOCK_HIGH_INTENSITY",
  "FINANCIAL_STRESS",
  "COGNITIVE_OVERLOAD",
  "CRISIS_MODE",
  "PLANNING_OVERLOAD",
  "STREAK_BROKEN",
  "MEDICAL_ALERT",
  "DEADLINE_CRUNCH",
  "CRISIS_DETECTED",
  "ATLAS_ENERGY_OVERLOAD",
  "ATLAS_OVERLOAD_DETECTED",
]);

/** Minimum milliseconds between push notifications for the same alert type per user. */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns true if a push notification for `eventType` can be sent to `uid`.
 * If allowed, atomically writes the new timestamp to prevent concurrent Function
 * invocations from both passing the check simultaneously.
 */
async function checkAndAcquireAlertCooldown(uid: string, eventType: string): Promise<boolean> {
  const db = getFirestore();
  const cooldownRef = db.doc(`notification_alert_cooldowns/${uid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(cooldownRef);
    const data = snap.exists ? (snap.data() as Record<string, number>) : {};
    const lastSentMs = data[eventType] ?? 0;
    const nowMs = Date.now();

    if (nowMs - lastSentMs < ALERT_COOLDOWN_MS) {
      logger.info("[bridgeSpineEvents] Alert suppressed by cooldown", {
        uid,
        eventType,
        lastSentMs,
        msSinceLast: nowMs - lastSentMs,
        cooldownMs: ALERT_COOLDOWN_MS,
      });
      return false;
    }

    tx.set(cooldownRef, { [eventType]: nowMs, updatedAt: nowMs }, { merge: true });
    return true;
  });
}

setGlobalOptions({ maxInstances: 10 });

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

export { webCrawler } from "./webCrawler";

// Map to provide rich contextual titles and bodies for system events, replacing the old client-side ALERT_RULES
function deriveNotificationContent(eventType: string, payloadData: any): { title: string, body: string } {
  // If the event explicitly provides a title and body/note, use them directly
  if (typeof payloadData?.title === "string" && payloadData.title) {
    const bodySource = typeof payloadData?.note === "string" ? payloadData.note
                     : typeof payloadData?.body === "string" ? payloadData.body
                     : typeof payloadData?.reason === "string" ? payloadData.reason
                     : typeof payloadData?.message === "string" ? payloadData.message
                     : "";
    return { title: payloadData.title, body: bodySource };
  }

  // Fallback to rich contextual defaults based on event type
  switch (eventType) {
    case 'BURNOUT_WARNING':
      return {
        title: 'Nexus Alert — Burnout Risk Detected',
        body: payloadData?.reason === 'high_fatigue_low_resilience'
          ? 'High CNS fatigue combined with low emotional resilience detected. Consider rest.'
          : 'Your system is showing signs of burnout. Take a break.'
      };
    case 'BLOCK_HIGH_INTENSITY':
      return {
        title: 'Nexus Alert — High-Intensity Training Blocked',
        body: payloadData?.reason === 'cns_fatigue_high' 
          ? 'CNS fatigue is too high for intense training today.'
          : String(payloadData?.reason || '').includes('clearance') 
            ? 'Medical clearance is required before high-intensity activity.'
            : 'High-intensity training has been blocked by Nexus.'
      };
    case 'FINANCIAL_STRESS':
      return {
        title: 'Nexus Alert — Financial Stress Detected',
        body: 'Resource friction is critically high. Ledger recommends reviewing your budget.'
      };
    case 'DEADLINE_APPROACHING':
      return {
        title: 'Nexus Alert — Deadline Approaching',
        body: payloadData?.label
          ? `Deadline "${payloadData.label}" is approaching soon.`
          : 'A tracked deadline is coming up. Check Atlas for details.'
      };
    case 'DEADLINE_CRUNCH':
      return {
        title: 'Nexus Alert — Deadline Pressure Critical',
        body: 'Deadline pressure is at critical levels. Atlas suggests re-prioritising tasks.'
      };
    case 'CRISIS_MODE':
      return {
        title: 'Nexus Alert — Crisis Mode Activated',
        body: 'Multiple domains are in critical state simultaneously. Immediate attention recommended.'
      };
    case 'MEDICAL_ALERT':
      return {
        title: 'Nexus Alert — Medical Alert',
        body: payloadData?.note ? String(payloadData.note) : 'A medical alert has been issued. Check Soma/Titan for details.'
      };
    case 'COGNITIVE_OVERLOAD':
      return {
        title: 'Nexus Alert — Cognitive Overload',
        body: 'Cognitive load is critically high. Consider deferring non-urgent decisions.'
      };
    case 'PLANNING_OVERLOAD':
      return {
        title: 'Nexus Alert — Planning Overload',
        body: 'Planning load is critically high. Atlas recommends simplifying your schedule.'
      };
    case 'STREAK_BROKEN':
      return {
        title: 'Nexus Alert — Habit Streak At Risk',
        body: 'Your habit streak health is critically low. Check Atlas to recover it.'
      };
    case 'MODULE_REMINDER_DUE':
      return {
        title: 'Nexus Reminder',
        body: payloadData?.note ? String(payloadData.note) : 'A scheduled reminder is due.'
      };
    case 'AI_LINK_FAILURE':
      return {
        title: 'Neural Link Interrupted',
        body: payloadData?.errorMessage 
          ? `The AI link encountered an error: ${payloadData.errorMessage}`
          : 'The neural tunnel encountered an interference packet and could not complete your request.'
      };
    default:
      // Generic fallback
      return {
        title: 'Nexus Alert',
        body: payloadData?.note || payloadData?.body || payloadData?.message || payloadData?.reason || 'A system event occurred.'
      };
  }
}

export const bridgeSpineEvents = onDocumentCreated(
  "spine_events/{uid}/events/{eventId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { uid: string; eventId: string }>) => {
    const uid = event.params.uid as string;
    const snapshot = event.data;
    if (!snapshot) return;

    const payload = snapshot.data();
    if (!payload) return;

    try {
      const eventPriority = (payload.priority as NotificationPriority) || "info";

      // Allowlist gate: only user-facing event types reach the inbox.
      // Internal routing signals (SOMATIC_SUPPORT_REQUESTED, FLATTEN_ENERGY_WAVE,
      // REDUCE_TRAINING_LOAD, ROUTINE_UPDATED, COMPOUND_STRESS, RISK_DETECTED, etc.)
      // are silently dropped here — they are consumed by other services.
      if (!NOTIFICATION_ALLOWLIST.has(payload.type)) {
        logger.info("[bridgeSpineEvents] Event not in notification allowlist, skipping", {
          uid,
          type: payload.type,
          priority: eventPriority,
        });
        return;
      }

      // Rate-limit system alerts so the same alert type cannot spam the user
      // more than once per hour. Reminder events are always delivered.
      if (RATE_LIMITED_ALERT_TYPES.has(payload.type)) {
        const allowed = await checkAndAcquireAlertCooldown(uid, payload.type);
        if (!allowed) return;
      }

      const { title: notificationTitle, body: bodySource } = deriveNotificationContent(payload.type, payload.data);

      const rawDeepLink = (payload.data as { deepLink?: unknown } | undefined)?.deepLink;
      let deepLink: any = undefined;
      if (typeof rawDeepLink === "string" && rawDeepLink.trim().length > 0) {
        try {
          deepLink = JSON.parse(rawDeepLink);
        } catch {
          deepLink = undefined;
        }
      } else if (rawDeepLink && typeof rawDeepLink === "object") {
        deepLink = rawDeepLink;
      }

      await NotificationEngine.getInstance().processNotification({
        uid,
        id: event.params.eventId,
        type: payload.type,
        source: payload.source || "bridge",
        priority: eventPriority,
        title: notificationTitle,
        body: bodySource,
        data: {
          ...payload.data,
          ...(deepLink ? { deepLink } : {}),
        }
      });

    } catch (error) {
      logger.error("Bridge spine event handler failed", {
        uid: event.params.uid,
        eventId: event.params.eventId,
        errorMessage: (error as any)?.message ?? String(error),
        errorCode: (error as any)?.code,
        errorStack: (error as any)?.stack,
      });
    }
  }
);

export { scheduleReminder, deliverReminder } from './reminder-tasks';
