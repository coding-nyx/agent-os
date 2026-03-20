/**
 * Client-side reminder scheduling service.
 *
 * Listens to relevant Spine events (data logged by the user) and calls the
 * `scheduleReminder` Cloud Function to enqueue a Cloud Task for precise
 * background delivery via FCM.
 *
 * This replaces the polling scheduler — reminders are only (re)scheduled
 * when the user actually interacts with a module.
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

type ScheduleResult =
  | { scheduled: true; dueAt: string }
  | { skipped: true; reason: string; dueAt?: string };

class ReminderSchedulerService {
  private unsubscribers: Array<() => void> = [];
  private started = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private userId: string | null = null;
  private fallbackActive = false;
  private debugListeners = new Set<(active: boolean) => void>();

  start(uid: string): void {
    if (this.started) return;
    this.started = true;
    this.userId = uid;
    this.fallbackActive = false;

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
          await this.scheduleReminderWithFallback(scheduleReminder, scheduleId);
        }
      });

      this.unsubscribers.push(unsub);
    }

    console.log("[ReminderScheduler] Started — listening to", Object.keys(EVENT_SCHEDULE_MAP).length, "event types.");
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.started = false;
    this.userId = null;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.setFallbackActive(false);
    console.log("[ReminderScheduler] Stopped.");
  }

  async scheduleLocal(scheduleId: string): Promise<void> {
    if (!import.meta.env.DEV) return;
    this.setFallbackActive(true);
    if (!this.userId) return;
    const dataLayer = getNexusDataLayer();
    const config = await dataLayer.getDocument<NotificationScheduleConfig>(
      `users/${this.userId}/notification_schedules`,
      scheduleId,
    );
    if (!config || !config.enabled) return;

    const now = Date.now();
    const windowEnd = now + 1000 * 60 * 60 * 24 * 31;
    const due = computeDueOccurrencesInRange(config.recurrence, now, windowEnd)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];

    if (!due) return;

    this.armLocalTimer(scheduleId, config, due);
  }

  private async scheduleReminderWithFallback(
    scheduleReminder: (data: { scheduleId: string }) => Promise<{ data: ScheduleResult }>,
    scheduleId: string,
  ): Promise<void> {
    try {
      const result = await scheduleReminder({ scheduleId });
      const data = result.data;
      if ("scheduled" in data && data.scheduled) {
        console.log(`[ReminderScheduler] Scheduled ${scheduleId} → ${data.dueAt}`);
      } else if ("skipped" in data) {
        console.log(`[ReminderScheduler] Skipped ${scheduleId}: ${data.reason}`);
      }
    } catch (err) {
      // Non-fatal — user can still use the app without reminders
      if (import.meta.env.DEV) {
        console.warn(`[ReminderScheduler] Failed to schedule ${scheduleId}; using DEV fallback.`, err);
        this.setFallbackActive(true);
        await this.scheduleLocal(scheduleId);
      } else {
        console.warn(`[ReminderScheduler] Failed to schedule ${scheduleId}.`, err);
      }
    }
  }

  private armLocalTimer(
    scheduleId: string,
    config: NotificationScheduleConfig,
    dueAtMs: number,
  ): void {
    const existing = this.timers.get(scheduleId);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, dueAtMs - Date.now());
    const timer = setTimeout(async () => {
      this.timers.delete(scheduleId);
      await this.fireLocalReminder(scheduleId, config, dueAtMs);
      if (this.started) {
        await this.scheduleLocal(scheduleId);
      }
    }, delay);

    this.timers.set(scheduleId, timer);
  }

  private async fireLocalReminder(
    scheduleId: string,
    config: NotificationScheduleConfig,
    dueAtMs: number,
  ): Promise<void> {
    if (!this.userId) return;
    const dataLayer = getNexusDataLayer();
    const dueAt = new Date(dueAtMs).toISOString();
    const occurrenceId = hashOccurrenceId(`${scheduleId}:${dueAt}`);
    const moduleId = config.moduleId;
    const title = config.messageTemplate?.title ?? 'Reminder due';
    const body = config.messageTemplate?.body ?? '';
    const deepLink = config.deepLink ?? { route: `/${moduleId}` };

    await dataLayer.setDocument(`users/${this.userId}/notification_inbox`, occurrenceId, {
      type: 'MODULE_REMINDER_DUE',
      source: moduleId,
      priority: config.priority,
      data: {
        title,
        note: body,
        deepLink,
        moduleId,
        scheduleId,
        dueAt,
      },
      scheduleId,
      occurrenceId,
      read: false,
      createdAt: new Date().toISOString(),
    });

    Spine.publish({
      type: 'MODULE_REMINDER_DUE',
      source: moduleId,
      domain: 'system',
      priority: config.priority,
      data: {
        title,
        body,
        moduleId,
        scheduleId,
        dueAt,
        occurrenceId,
      },
    });

    BridgeService.showInAppReminderToast({ title, body, moduleId });
  }

  subscribeDebug(listener: (active: boolean) => void): () => void {
    this.debugListeners.add(listener);
    listener(this.fallbackActive);
    return () => this.debugListeners.delete(listener);
  }

  private setFallbackActive(active: boolean): void {
    if (this.fallbackActive === active) return;
    this.fallbackActive = active;
    this.debugListeners.forEach((listener) => listener(active));
  }
}

export const ReminderScheduler = new ReminderSchedulerService();
