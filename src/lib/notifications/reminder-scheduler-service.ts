/**
 * Client-side reminder scheduling service.
 *
 * Two delivery paths:
 * 1. Server-driven: Listens to Spine events and calls the `scheduleReminder` Cloud Function
 *    to enqueue a Cloud Task for precise background delivery via FCM.
 * 2. Client-side fallback: `scheduleLocal` registers a browser setTimeout that fires a
 *    browser Notification and writes to `notification_inbox` when the CF path is unavailable.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebase } from "@/lib/firebase";
import { Spine } from "@/lib/spine/spine-event-bus";
import type { SpineEventType } from "@/lib/types";
import { getNexusDataLayer } from "@/lib/data-layer/provider";
import type { NotificationScheduleConfig } from "@/lib/notifications/types";
import { computeDueOccurrencesInRange, hashOccurrenceId } from "@/lib/notifications/reminder-evaluation";
import { BridgeService } from "@/lib/services/bridge-service";

// Map of Spine event types → which notification scheduleIds to (re)schedule.
// When these events fire, we re-compute and enqueue the next reminder.
const EVENT_SCHEDULE_MAP: Partial<Record<SpineEventType, string[]>> = {
  // Agnes — therapy session logged
  VITAL_UPDATED: ["agnes-therapy-every-2-days"],

  // Titan — workout or sleep logged
  WORKOUT_COMPLETED: ["titan-workout-window", "titan-sleep-log-evening"],

  // Atlas — tasks, journal, review
  TASK_COMPLETED: ["atlas-hourly-task-reminder", "atlas-weekly-review"],
  JOURNAL_ENTRY_CREATED: ["atlas-evening-journal"],
  JOURNAL_ENTRY_UPDATED: ["atlas-evening-journal"],

  // Ledger — financial entries
  SPENDING_DETECTED: ["ledger-spend-due"],
  INCOME_CHANGE: ["ledger-income-due"],
};

// Max delay for client-side timers: 24 hours. Reminders beyond this won't have
// a client-side timer (they rely entirely on the server CF path).
const MAX_CLIENT_TIMER_MS = 24 * 60 * 60 * 1000;

type ScheduleResult =
  | { scheduled: true; dueAt: string }
  | { skipped: true; reason: string; dueAt?: string };

class ReminderSchedulerService {
  private unsubscribers: Array<() => void> = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private started = false;
  private userId: string | null = null;

  start(uid: string): void {
    if (this.started) return;
    this.started = true;
    this.userId = uid;

    const { app } = getFirebase();
    if (!app) {
      console.warn("[ReminderScheduler] Firebase not available — skipping.");
      return;
    }

    const functions = getFunctions(app);
    const scheduleReminder = httpsCallable<{ scheduleId: string }, ScheduleResult>(
      functions,
      "scheduleReminder"
    );

    for (const [eventType, scheduleIds] of Object.entries(EVENT_SCHEDULE_MAP) as [SpineEventType, string[]][]) {
      const unsub = Spine.subscribe(eventType, async (_event) => {
        for (const scheduleId of scheduleIds) {
          try {
            const result = await scheduleReminder({ scheduleId });
            const data = result.data;
            if ("scheduled" in data && data.scheduled) {
              console.log(`[ReminderScheduler] Scheduled ${scheduleId} → ${data.dueAt}`);
            }
          } catch (err) {
            console.warn(`[ReminderScheduler] Failed to schedule ${scheduleId}.`, err);
          }
        }
      });

      this.unsubscribers.push(unsub);
    }

    console.log("[ReminderScheduler] Started — listening to", Object.keys(EVENT_SCHEDULE_MAP).length, "event types.");
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.started = false;
    this.userId = null;
    console.log("[ReminderScheduler] Stopped.");
  }

  /**
   * Client-side fallback scheduler. Registers a browser setTimeout so the reminder
   * fires even when the Cloud Function / FCM path is unavailable.
   * Only schedules reminders with dueAt within the next 24 hours.
   */
  scheduleLocal(userId: string, scheduleId: string, config: NotificationScheduleConfig): void {
    console.log(`[ReminderScheduler] scheduleLocal called: ${scheduleId}`, { config });

    const recurrence = config.recurrence;
    if (!recurrence) {
      console.log(`[ReminderScheduler] No recurrence config - cannot schedule`);
      return;
    }

    const dueAt = recurrence.kind === 'once' ? recurrence.dueAt
      : recurrence.kind === 'every_n_days' ? recurrence.dtStart
      : recurrence.kind === 'rrule' ? recurrence.dtStart
      : undefined;

    if (!dueAt) {
      console.log(`[ReminderScheduler] No dueAt found in recurrence`);
      return;
    }

    const dueMs = new Date(dueAt).getTime();
    const now = Date.now();
    const delay = dueMs - now;

    console.log(`[ReminderScheduler] ${scheduleId}: dueAt=${dueAt}, now=${new Date(now).toISOString()}, delay=${delay}ms`);

    if (delay <= 0) {
      // Already past — fire immediately
      console.log(`[ReminderScheduler] ${scheduleId} is in the past - firing immediately`);
      this._fireLocalNotification(userId, scheduleId, config);
      return;
    }

    if (delay > MAX_CLIENT_TIMER_MS) {
      console.log(`[ReminderScheduler] ${scheduleId} is > 24h away (${Math.round(delay / 3600000)}h) — skipping client timer.`);
      return;
    }

    // Cancel any existing timer for this schedule
    const existing = this.timers.get(scheduleId);
    if (existing) {
      clearTimeout(existing);
      console.log(`[ReminderScheduler] Cleared existing timer for ${scheduleId}`);
    }

    const timer = setTimeout(() => {
      this.timers.delete(scheduleId);
      this._fireLocalNotification(userId, scheduleId, config);
    }, delay);

    this.timers.set(scheduleId, timer);
    console.log(`[ReminderScheduler] Timer set: ${scheduleId} will fire in ${Math.round(delay / 1000)}s`);
  }

  private async _fireLocalNotification(
    userId: string,
    scheduleId: string,
    config: NotificationScheduleConfig
  ): Promise<void> {
    console.log(`[ReminderScheduler] _fireLocalNotification fired for ${scheduleId}`);

    const title = config.messageTemplate?.title ?? 'Reminder';
    const body = config.messageTemplate?.body ?? '';
    const channelPrefs = config.channelPrefs ?? { os: true, inApp: true };

    // 1. OS browser notification (with fallback to request permission)
    if (channelPrefs.os !== false && typeof Notification !== 'undefined') {
      const perm = Notification.permission;
      console.log(`[ReminderScheduler] Notification permission: ${perm}`);

      // Only show browser notification if granted
      if (perm === 'granted') {
        try {
          new Notification(title, { body, tag: scheduleId, icon: '/icons/nexus-192.png' });
          console.log(`[ReminderScheduler] Browser notification shown`);
        } catch (e) {
          console.warn('[ReminderScheduler] Browser Notification throw:', e);
        }
      } else if (perm === 'default') {
        // Only request permission once per session to avoid spamming the user
        const alreadyRequested = sessionStorage.getItem('notification_permission_requested');
        if (!alreadyRequested) {
          sessionStorage.setItem('notification_permission_requested', 'true');
          try {
            const newPerm = await Notification.requestPermission();
            console.log(`[ReminderScheduler] Permission request result: ${newPerm}`);
            if (newPerm === 'granted') {
              new Notification(title, { body, tag: scheduleId, icon: '/icons/nexus-192.png' });
            }
          } catch (e) {
            console.warn('[ReminderScheduler] Permission request failed:', e);
          }
        } else {
          console.log(`[ReminderScheduler] Permission already requested this session - skipping`);
        }
      } else {
        console.log(`[ReminderScheduler] Notification permission denied - user must enable in browser settings`);
      }
    } else {
      console.log(`[ReminderScheduler] OS notifications disabled in channelPrefs`);
    }

    // 2. In-app inbox entry (always write - this triggers the in-app toast)
    if (channelPrefs.inApp !== false) {
      try {
        const dataLayer = getNexusDataLayer();
        const now = new Date().toISOString();
        const inboxId = `${scheduleId}-${Date.now()}`;
        await dataLayer.setDocument(
          `users/${userId}/notification_inbox`,
          inboxId,
          {
            id: inboxId,
            type: 'reminder',
            source: config.moduleId ?? 'nexus',
            priority: config.priority ?? 'info',
            title,
            note: body,
            data: { scheduleId, deepLink: config.deepLink },
            action: config.deepLink ? { type: 'NAVIGATE', route: config.deepLink.route } : undefined,
            read: false,
            createdAt: now,
            updatedAt: now,
          },
        );
        console.log(`[ReminderScheduler] Inbox entry written: ${inboxId}`);
      } catch (e) {
        console.warn('[ReminderScheduler] Failed to write notification_inbox:', e);
      }
    } else {
      console.log(`[ReminderScheduler] In-app notifications disabled in channelPrefs`);
    }
  }

  /** Legacy support for debug/status listeners */
  subscribeDebug(listener: (active: boolean) => void): () => void {
    listener(false);
    return () => {};
  }
}

export const ReminderScheduler = new ReminderSchedulerService();
