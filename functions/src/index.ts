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
  // Scout research updates
  "SCOUT_KNOWLEDGE_ENRICHED",
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
  "BURNOUT_TRAJECTORY_WARNING",
  "ATLAS_PREDICTIVE_ALERT",
  "COMMITMENT_MISSED",
  "BUDGET_ALERT",
  "OVERSPEND_DETECTED",
  "EXPENSE_SPIKE",
  "CASHFLOW_NEGATIVE",
  "DEADLINE_APPROACHING",
  "AI_LINK_FAILURE",
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

// Map to provide rich contextual titles and bodies for system events, replacing the old client-side ALERT_RULES.
// This function is a degraded fallback for events persisted before the KMP NotificationContentResolver
// was deployed. New events should arrive with pre-resolved _notificationTitle/_notificationBody in data.
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
    // --- Health & Body ---
    case 'BURNOUT_WARNING':
      return {
        title: 'Nexus Alert \u2014 Burnout Risk Detected',
        body: payloadData?.reason === 'high_fatigue_low_resilience'
          ? 'High CNS fatigue combined with low emotional resilience detected. Consider rest.'
          : 'Your system is showing signs of burnout. Take a break.'
      };
    case 'BURNOUT_TRAJECTORY_WARNING':
      return {
        title: 'Nexus Alert \u2014 Burnout Trajectory Rising',
        body: payloadData?.note ?? 'Rising burnout trajectory detected. Proactive intervention recommended.'
      };
    case 'BLOCK_HIGH_INTENSITY':
      return {
        title: 'Nexus Alert \u2014 High-Intensity Training Blocked',
        body: String(payloadData?.reason || '').includes('cns')
          ? 'CNS fatigue is too high for intense training today.'
          : String(payloadData?.reason || '').includes('clearance')
            ? 'Medical clearance is required before high-intensity activity.'
            : payloadData?.activity
              ? `High-intensity training has been blocked for ${payloadData.activity}.`
              : 'High-intensity training has been blocked by Nexus.'
      };
    case 'MEDICAL_ALERT':
      return {
        title: 'Nexus Alert \u2014 Medical Alert',
        body: payloadData?.note ? String(payloadData.note)
          : payloadData?.alertCount ? `${payloadData.alertCount} severe biomarker flag(s) detected. Check Soma for details.`
          : 'A medical alert has been issued. Check Soma/Titan for details.'
      };
    case 'WELLNESS_ALERT':
      return {
        title: 'Nexus Alert \u2014 Wellness Alert',
        body: payloadData?.reason === 'high_fatigue_low_resilience'
          ? 'High CNS fatigue combined with low emotional resilience detected. Consider rest.'
          : 'Your system is showing signs of burnout. Take a break.'
      };

    // --- Financial ---
    case 'FINANCIAL_STRESS':
      return {
        title: 'Nexus Alert \u2014 Financial Stress Detected',
        body: 'Resource friction is critically high. Ledger recommends reviewing your budget.'
      };
    case 'BUDGET_ALERT':
      return {
        title: 'Nexus Alert \u2014 Budget Warning',
        body: payloadData?.category && payloadData?.percentUsed
          ? `Budget category '${payloadData.category}' is at ${Math.round(payloadData.percentUsed)}% usage.`
          : payloadData?.overspendRatio
            ? `Overall spending exceeds income by ${payloadData.overspendRatio}x.`
            : 'A budget threshold has been exceeded. Review Ledger for details.'
      };
    case 'OVERSPEND_DETECTED':
      return {
        title: 'Nexus Alert \u2014 Overspend Detected',
        body: payloadData?.categoryName && payloadData?.overspendPercent
          ? `Category '${payloadData.categoryName}' is ${Math.round(payloadData.overspendPercent)}% over budget.`
          : 'Spending has exceeded budget allocation. Check Ledger.'
      };
    case 'EXPENSE_SPIKE':
      return {
        title: 'Nexus Alert \u2014 Expense Spike',
        body: payloadData?.percentChange
          ? `Expenses increased by ${Math.round(payloadData.percentChange)}% compared to the previous period.`
          : 'An unusual spike in expenses has been detected.'
      };
    case 'CASHFLOW_NEGATIVE':
      return {
        title: 'Nexus Alert \u2014 Negative Cash Flow',
        body: payloadData?.deficit
          ? `Cash flow is negative with a deficit of ${payloadData.deficit}.`
          : 'Cash flow has turned negative. Review your income and expenses.'
      };

    // --- Cognitive & Planning ---
    case 'COGNITIVE_OVERLOAD':
      return {
        title: 'Nexus Alert \u2014 Cognitive Overload',
        body: payloadData?.activeLoad
          ? `Active cognitive load is at ${Math.round(payloadData.activeLoad)}. Consider deferring non-urgent decisions.`
          : 'Cognitive load is critically high. Consider deferring non-urgent decisions.'
      };
    case 'PLANNING_OVERLOAD':
      return {
        title: 'Nexus Alert \u2014 Planning Overload',
        body: payloadData?.planningLoad && payloadData?.deadlinePressure
          ? `Planning load (${Math.round(payloadData.planningLoad)}) and deadline pressure (${Math.round(payloadData.deadlinePressure)}) are critically high.`
          : 'Planning load is critically high. Atlas recommends simplifying your schedule.'
      };
    case 'DEADLINE_APPROACHING':
      return {
        title: 'Nexus Alert \u2014 Deadline Approaching',
        body: payloadData?.label
          ? `Deadline "${payloadData.label}" is approaching soon.`
          : payloadData?.hoursRemaining
            ? `A tracked deadline is due in ~${Math.round(payloadData.hoursRemaining)} hours.`
            : 'A tracked deadline is coming up. Check Atlas for details.'
      };
    case 'DEADLINE_CRUNCH':
      return {
        title: 'Nexus Alert \u2014 Deadline Pressure Critical',
        body: payloadData?.deadlinePressure
          ? `Deadline pressure is at ${Math.round(payloadData.deadlinePressure)}. Atlas suggests re-prioritising tasks.`
          : 'Deadline pressure is at critical levels. Atlas suggests re-prioritising tasks.'
      };

    // --- System-wide Critical ---
    case 'CRISIS_MODE':
      return {
        title: 'Nexus Alert \u2014 Crisis Mode Activated',
        body: payloadData?.note ? String(payloadData.note)
          : payloadData?.reason ? `Crisis mode activated: ${payloadData.reason}.`
          : 'Multiple domains are in critical state simultaneously. Immediate attention recommended.'
      };
    case 'CRISIS_DETECTED':
      return {
        title: 'Nexus Alert \u2014 Crisis Detected',
        body: payloadData?.trigger && payloadData?.severity
          ? `A ${payloadData.severity} crisis has been flagged (trigger: ${payloadData.trigger}).`
          : 'A crisis-level event has been detected. Immediate review recommended.'
      };

    // --- Atlas Overload ---
    case 'ATLAS_ENERGY_OVERLOAD':
      return {
        title: 'Nexus Alert \u2014 Energy Overload',
        body: payloadData?.activeLoad
          ? `Active load is at ${Math.round(payloadData.activeLoad)}. Consider reducing scheduled intensity.`
          : payloadData?.loadPct
            ? `Energy load is at ${Math.round(payloadData.loadPct)}%. Consider reducing scheduled intensity.`
            : 'Energy load is critically high. Consider reducing commitments.'
      };
    case 'ATLAS_OVERLOAD_DETECTED':
      return {
        title: 'Nexus Alert \u2014 System Overload',
        body: payloadData?.state
          ? `Atlas has entered ${payloadData.state} state. Recovery measures recommended.`
          : 'Atlas has detected system overload. Recovery measures recommended.'
      };
    case 'ATLAS_PREDICTIVE_ALERT':
      return {
        title: 'Nexus Alert \u2014 Predictive Risk Alert',
        body: payloadData?.note ? String(payloadData.note)
          : payloadData?.reason ? `Predictive alert: ${payloadData.reason}.`
          : payloadData?.riskScore ? `Risk score is at ${payloadData.riskScore}. Proactive adjustment recommended.`
          : 'Atlas has detected a predictive risk signal.'
      };

    // --- Goals & Habits ---
    case 'STREAK_BROKEN':
      return {
        title: 'Nexus Alert \u2014 Habit Streak At Risk',
        body: 'Your habit streak health is critically low. Check Atlas to recover it.'
      };
    case 'COMMITMENT_MISSED':
      return {
        title: 'Nexus Alert \u2014 Commitments Missed',
        body: payloadData?.overdueCount
          ? `${Math.round(payloadData.overdueCount)} task(s) are overdue. Review Atlas to get back on track.`
          : 'Tracked commitments have been missed. Check Atlas.'
      };

    // --- Other ---
    case 'SCOUT_KNOWLEDGE_ENRICHED':
      return {
        title: 'Nexus Knowledge Enriched',
        body: payloadData?.claim
          ? `Auto-indexed discovery: "${String(payloadData.claim).slice(0, 60)}..."`
          : 'Scout has auto-indexed new research into your library.'
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
          ? `The AI link encountered an error: ${payloadData.errorMessage}.`
          : 'The neural link could not complete your request.'
      };
    default:
      // Generic fallback — should rarely be reached now that all allowlisted types are handled.
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

      // Prefer pre-resolved notification content from the KMP NotificationContentResolver
      // (attached by the web SpineEventBus before Firestore persistence). Fall back to the
      // local deriveNotificationContent() for events persisted before the resolver was deployed.
      const preTitle = typeof payload.data?._notificationTitle === "string" ? payload.data._notificationTitle : null;
      const preBody = typeof payload.data?._notificationBody === "string" ? payload.data._notificationBody : null;
      const { title: notificationTitle, body: bodySource } = (preTitle && preBody)
        ? { title: preTitle, body: preBody }
        : deriveNotificationContent(payload.type, payload.data);

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
