/**
 * AtlasNotificationScheduler
 *
 * Subscribes to Atlas state changes and schedules habit reminders and
 * deadline-approaching alerts via Spine events.
 *
 * Architecture: pure Spine event-driven — no Firebase Cloud Functions dependency.
 * Works in the browser by polling on a regular interval and checking thresholds.
 *
 * Deduplication: each habitId/taskId is only emitted once per scheduler session
 * (cleared on stop()). This prevents repeated HABIT_STREAK_BROKEN /
 * DEADLINE_APPROACHING events every polling interval.
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
  /** Called when an unhandled error occurs during a check cycle */
  onError?: (err: unknown) => void;
}

const SESSION_STORAGE_KEY = 'atlas_scheduler_emitted';

/** Maximum age of a sessionStorage emitted entry before it's considered stale and pruned. */
const EMITTED_ENTRY_MAX_AGE_MS = 28 * 60 * 60 * 1000; // 28 hours matches the habit check cap

function loadEmittedFromSession(): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw) as [string, number][];
    const cutoff = Date.now() - EMITTED_ENTRY_MAX_AGE_MS;
    return new Map(entries.filter(([, ts]) => ts > cutoff));
  } catch {
    return new Map();
  }
}

function saveEmittedToSession(emitted: Map<string, number>): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(Array.from(emitted.entries())));
  } catch {
    // Ignore — sessionStorage may be unavailable (e.g., private browsing with strict settings).
  }
}

export class AtlasNotificationScheduler {
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _config: Required<Omit<NotificationSchedulerConfig, 'onError'>> & { onError: NotificationSchedulerConfig['onError'] };
  private _getHabits: (() => AtlasHabit[]) | null = null;
  private _getTasks: (() => AtlasTask[]) | null = null;
  /**
   * Tracks which habit/task ids have already been emitted, with their emission
   * timestamp. Persisted to sessionStorage so remounts don't re-emit alerts.
   */
  private _emitted: Map<string, number> = new Map();

  constructor(config: NotificationSchedulerConfig = {}) {
    this._config = {
      deadlineWarningHours: config.deadlineWarningHours ?? 24,
      habitReminderHours: config.habitReminderHours ?? 20,
      checkIntervalMs: config.checkIntervalMs ?? 5 * 60 * 1000,
      onError: config.onError,
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

    // Restore emitted set from sessionStorage so remounts don't re-emit.
    this._emitted = loadEmittedFromSession();

    // Run immediately then on interval
    this._checkAndEmit();
    this._intervalId = setInterval(() => this._checkAndEmit(), this._config.checkIntervalMs);
  }

  stop(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._getHabits = null;
    this._getTasks = null;
    // Persist emitted state before stopping so it survives remounts.
    saveEmittedToSession(this._emitted);
  }

  /** Exposed for tests: clear the emitted set without stopping the scheduler. */
  clearEmitted(): void {
    this._emitted.clear();
    saveEmittedToSession(this._emitted);
  }

  private _checkAndEmit(): void {
    try {
      this._checkHabitReminders();
      this._checkDeadlines();
    } catch (err) {
      if (this._config.onError) {
        this._config.onError(err);
      }
    }
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

      if (hoursSinceLast >= this._config.habitReminderHours && hoursSinceLast < 28) {
        const key = `habit:${habit.id}`;
        if (this._emitted.has(key)) continue;
        this._emitted.set(key, nowMs);
        saveEmittedToSession(this._emitted);

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

      if (msUntil > 0 && msUntil <= thresholdMs) {
        const key = `task:${task.id}`;
        if (this._emitted.has(key)) continue;
        this._emitted.set(key, nowMs);
        saveEmittedToSession(this._emitted);

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

