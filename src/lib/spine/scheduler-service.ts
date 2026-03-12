/**
 * Spine Scheduler Service
 *
 * Platform-level service allowing any module to register time-based triggers.
 * On each scheduled tick it emits a typed Spine event so that module listeners
 * (or the Orchestrator) can respond according to user preferences and NSV state.
 *
 * Architecture:
 *   SchedulerService.register(schedule)
 *     → on tick at scheduled time
 *       → Spine.publish(def.spineEventType, { scheduleId, scheduledType })
 *         → module listeners receive and act
 *
 * Re-scheduling strategy:
 *   - Daily   (HH:MM)      – schedules for the next wall-clock occurrence.
 *                            If the time has already passed today, defers to tomorrow.
 *   - Weekly  (DDD HH:MM)  – schedules for the next occurrence of that weekday+time.
 *                            If the slot falls later today it fires today; if today's
 *                            slot has already passed it defers 7 days.
 *   - Always uses setTimeout (never setInterval) and re-schedules after each fire
 *     to prevent drift.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEventType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScheduleDefinition {
  /** Unique identifier, e.g. 'atlas.evening_checkin'. */
  id: string;
  /** Owning module identifier, e.g. 'atlas'. Used as Spine event source. */
  moduleId: string;
  /**
   * Semantic type of this schedule, e.g. 'evening_checkin'.
   * Included in the emitted event's data payload.
   */
  type: string;
  /**
   * Wall-clock time for this trigger.
   *  - Daily  format: 'HH:MM'       e.g. '09:00'
   *  - Weekly format: 'DDD HH:MM'   e.g. 'Sun 19:00'
   *
   * Uses 24-hour notation. Day abbreviations: Sun Mon Tue Wed Thu Fri Sat.
   */
  time: string;
  /** Spine event type to emit when the schedule fires. */
  spineEventType: SpineEventType;
  /** Whether this schedule is enabled by default (informational; the service always fires). */
  defaultEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DAY_ABBREVIATIONS: ReadonlyArray<string> = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
];

/**
 * Parse 'HH:MM' into { hours, minutes }.
 * Throws if the format is not recognised.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    throw new Error(`SchedulerService: invalid time string "${timeStr}". Expected HH:MM.`);
  }
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (
    Number.isNaN(hours) || Number.isNaN(minutes) ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59
  ) {
    throw new Error(`SchedulerService: out-of-range time "${timeStr}". Expected HH:MM in 24h format.`);
  }
  return { hours, minutes };
}

/**
 * Compute milliseconds from now until the next daily occurrence of HH:MM.
 *
 * Complexity: O(1)
 */
function msUntilDailyTime(hours: number, minutes: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // If the target is in the past (or exactly now) defer to tomorrow.
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

/**
 * Compute milliseconds from now until the next occurrence of a specific
 * weekday + time combination.
 *
 * If the weekday matches today and the time is still in the future, the
 * trigger fires today.  Otherwise it fires on the next occurrence of that
 * weekday (up to 7 days ahead).
 *
 * Complexity: O(1)
 */
function msUntilWeeklyTime(
  targetDow: number,
  hours: number,
  minutes: number,
): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  const currentDow = now.getDay();
  let daysUntil = (targetDow - currentDow + 7) % 7;

  // daysUntil === 0 means the target weekday is today.
  // If the clock time has already passed, move to next week.
  if (daysUntil === 0 && target.getTime() <= now.getTime()) {
    daysUntil = 7;
  }

  target.setDate(target.getDate() + daysUntil);
  return target.getTime() - now.getTime();
}

/**
 * Compute milliseconds until the next scheduled occurrence for the given
 * ScheduleDefinition time string.
 *
 * Supports:
 *   - 'HH:MM'       → daily
 *   - 'DDD HH:MM'   → weekly (specific weekday)
 *
 * Complexity: O(1)
 */
function msUntilNextOccurrence(time: string): number {
  const tokens = time.trim().split(' ');

  if (tokens.length === 1) {
    // Daily: 'HH:MM'
    const { hours, minutes } = parseTime(tokens[0]);
    return msUntilDailyTime(hours, minutes);
  }

  if (tokens.length === 2) {
    // Weekly: 'DDD HH:MM'
    const [dayAbbr, timeStr] = tokens;
    const targetDow = DAY_ABBREVIATIONS.indexOf(dayAbbr);
    if (targetDow === -1) {
      throw new Error(
        `SchedulerService: unrecognised day abbreviation "${dayAbbr}". ` +
        `Expected one of: ${DAY_ABBREVIATIONS.join(', ')}.`,
      );
    }
    const { hours, minutes } = parseTime(timeStr);
    return msUntilWeeklyTime(targetDow, hours, minutes);
  }

  throw new Error(
    `SchedulerService: invalid time format "${time}". ` +
    `Expected 'HH:MM' or 'DDD HH:MM'.`,
  );
}

// ---------------------------------------------------------------------------
// SchedulerServiceClass
// ---------------------------------------------------------------------------

class SchedulerServiceClass {
  private readonly registry = new Map<string, ScheduleDefinition>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private isStarted = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a schedule definition.
   *
   * If the service has already been started, the timer is armed immediately.
   * Idempotent: re-registering the same id replaces the previous definition.
   */
  register(def: ScheduleDefinition): void {
    // If there is an existing timer for this id, clear it before replacing.
    this.clearTimer(def.id);
    this.registry.set(def.id, def);

    if (this.isStarted) {
      this.arm(def);
    }
  }

  /**
   * Unregister a schedule by id, cancelling its pending timer.
   * Safe to call even if the id is not registered.
   */
  unregister(id: string): void {
    this.clearTimer(id);
    this.registry.delete(id);
  }

  /**
   * Start the scheduler.
   * Arms timers for all currently registered definitions.
   * Should be called exactly once during app initialisation.
   */
  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    for (const def of this.registry.values()) {
      this.arm(def);
    }
  }

  /**
   * Stop the scheduler and cancel all pending timers.
   * Intended for cleanup (e.g. in tests or hot-reload scenarios).
   * Does not remove registered definitions — a subsequent `start()` will
   * re-arm them.
   */
  stop(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.isStarted = false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Arm a single timeout for the given definition.
   * On fire: emit the Spine event, then re-arm for the next occurrence.
   */
  private arm(def: ScheduleDefinition): void {
    const delay = msUntilNextOccurrence(def.time);

    const timerId = setTimeout(() => {
      // Remove the spent timer reference before re-arming.
      this.timers.delete(def.id);

      // Only fire if the definition is still registered (guard against
      // unregister racing with a tick).
      if (!this.registry.has(def.id)) return;

      this.fire(def);

      // Re-arm for the next occurrence (daily or weekly).
      if (this.isStarted) {
        this.arm(def);
      }
    }, delay);

    this.timers.set(def.id, timerId);
  }

  /**
   * Emit the Spine event for a fired schedule.
   */
  private fire(def: ScheduleDefinition): void {
    Spine.publish({
      type: def.spineEventType,
      source: def.moduleId,
      domain: 'C',
      priority: 'info',
      data: {
        scheduleId: def.id,
        scheduledType: def.type,
      },
    });
  }

  /**
   * Cancel and remove the timer for the given schedule id, if one exists.
   */
  private clearTimer(id: string): void {
    const existing = this.timers.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.timers.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * Platform-level singleton scheduler.
 *
 * Usage:
 *   // App init (main.tsx / App.tsx):
 *   SchedulerService.start();
 *
 *   // Module mount (useEffect):
 *   SchedulerService.register({ id: 'atlas.morning_brief', ... });
 *   return () => SchedulerService.unregister('atlas.morning_brief');
 */
export const SchedulerService = new SchedulerServiceClass();
