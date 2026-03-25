/**
 * AtlasNotificationScheduler
 *
 * Subscribes to Atlas state changes and schedules habit reminders and
 * deadline-approaching alerts via Spine events.
 *
 * Architecture: pure Spine event-driven — no Firebase Cloud Functions dependency.
 * Works in the browser by polling on a regular interval and checking thresholds.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import type { AtlasHabit, AtlasTask } from '@/lib/types';

export interface NotificationSchedulerConfig {
  /** Hours before deadline to emit DEADLINE_APPROACHING (default: 24) */
  deadlineWarningHours?: number;
  /** Hours since last habit completion before emitting HABIT_REMINDER (default: 20) */
  habitReminderHours?: number;
  /** Check interval in ms (default: 5 minutes = 300_000) */
  checkIntervalMs?: number;
}

export class AtlasNotificationScheduler {
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _config: Required<NotificationSchedulerConfig>;
  private _getHabits: (() => AtlasHabit[]) | null = null;
  private _getTasks: (() => AtlasTask[]) | null = null;

  constructor(config: NotificationSchedulerConfig = {}) {
    this._config = {
      deadlineWarningHours: config.deadlineWarningHours ?? 24,
      habitReminderHours: config.habitReminderHours ?? 20,
      checkIntervalMs: config.checkIntervalMs ?? 5 * 60 * 1000,
    };
  }

  /**
   * Start the scheduler. Pass getter functions so it always reads fresh data.
   */
  start(
    getHabits: () => AtlasHabit[],
    getTasks: () => AtlasTask[],
  ): void {
    this._getHabits = getHabits;
    this._getTasks = getTasks;

    // Run immediately then on interval
    this._check();
    this._intervalId = setInterval(() => this._check(), this._config.checkIntervalMs);
  }

  stop(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._getHabits = null;
    this._getTasks = null;
  }

  private _check(): void {
    this._checkHabitReminders();
    this._checkDeadlines();
  }

  private _checkHabitReminders(): void {
    const habits = this._getHabits?.() ?? [];
    const nowMs = Date.now();

    for (const habit of habits) {
      if (habit.status !== 'active') continue;

      const lastCompletedMs = habit.lastCompleted
        ? new Date(habit.lastCompleted).getTime()
        : 0;

      const hoursSinceLast = (nowMs - lastCompletedMs) / (1000 * 60 * 60);

      // Only remind if it's been more than the threshold but less than 28h
      // (avoid spamming if user is asleep or has already been reminded)
      if (hoursSinceLast >= this._config.habitReminderHours && hoursSinceLast < 28) {
        Spine.emit({
          type: 'HABIT_STREAK_BROKEN',
          source: 'atlas-notification-scheduler',
          domain: 'C',
          priority: 'info',
          target: 'atlas',
          data: {
            habitId: habit.id,
            habitTitle: habit.title,
            currentStreak: habit.currentStreak,
            hoursSinceLast: Math.round(hoursSinceLast),
            reminderType: 'habit_due',
          },
        });
      }
    }
  }

  private _checkDeadlines(): void {
    const tasks = this._getTasks?.() ?? [];
    const nowMs = Date.now();
    const thresholdMs = this._config.deadlineWarningHours * 60 * 60 * 1000;

    for (const task of tasks) {
      if (task.status === 'done' || task.status === 'deferred') continue;
      if (!task.deadline) continue;

      const deadlineMs = new Date(task.deadline).getTime();
      const msUntil = deadlineMs - nowMs;

      // Emit when within warning window but not already past
      if (msUntil > 0 && msUntil <= thresholdMs) {
        Spine.emit({
          type: 'DEADLINE_APPROACHING',
          source: 'atlas-notification-scheduler',
          domain: 'C',
          priority: msUntil < 4 * 60 * 60 * 1000 ? 'alert' : 'info',
          target: 'atlas',
          data: {
            taskId: task.id,
            taskTitle: task.title,
            deadline: task.deadline,
            hoursRemaining: Math.round(msUntil / (1000 * 60 * 60)),
            priority: task.priority,
          },
        });
      }
    }
  }
}

// Singleton for use in React (initialised by AtlasPage)
export const atlasNotificationScheduler = new AtlasNotificationScheduler();
