import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, type FirestoreEvent, type QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";

import { NotificationEngine, type NotificationPriority } from "./notification-engine";

setGlobalOptions({ maxInstances: 10 });

initializeApp();

export { webCrawler } from "./webCrawler";

// Map to provide rich contextual titles and bodies for system events, replacing the old client-side ALERT_RULES
function deriveNotificationContent(eventType: string, payloadData: any): { title: string, body: string } {
  // If the event explicitly provides a title and body/note, use them directly
  if (typeof payloadData?.title === "string" && payloadData.title) {
    const bodySource = typeof payloadData?.note === "string" ? payloadData.note
                     : typeof payloadData?.body === "string" ? payloadData.body
                     : typeof payloadData?.reason === "string" ? payloadData.reason
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
    default:
      // Generic fallback
      return {
        title: 'Nexus Alert',
        body: payloadData?.note || payloadData?.body || payloadData?.reason || 'A system event occurred.'
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
