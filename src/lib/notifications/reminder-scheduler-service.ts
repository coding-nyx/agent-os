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

  start(uid: string): void {
    if (this.started) return;
    this.started = true;

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
            } else if ("skipped" in data) {
              console.log(`[ReminderScheduler] Skipped ${scheduleId}: ${data.reason}`);
            }
          } catch (err) {
            // Non-fatal — user can still use the app without reminders
            console.warn(`[ReminderScheduler] Failed to schedule ${scheduleId}:`, err);
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
    this.started = false;
    console.log("[ReminderScheduler] Stopped.");
  }
}

export const ReminderScheduler = new ReminderSchedulerService();
