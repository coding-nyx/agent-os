import type { ModuleId } from '@/lib/module-manifest';

export type NotificationChannel = 'os' | 'inApp';

export interface NotificationChannelPrefs {
  os: boolean;
  inApp: boolean;
}

export type NotificationPriority = 'info' | 'alert' | 'critical';

export interface NotificationDeepLink {
  /** Target route, e.g. `/agnes`, `/atlas`, `/ledger` */
  route: string;
  /**
   * Optional focus anchor used by the module to scroll/open the relevant
   * logging panel (platform agnostic).
   */
  focusId?: string;
}

export interface NotificationMessageTemplate {
  /**
   * Template support is intentionally string-based.
   * Scheduler will substitute a known set of variables (phase 2).
   */
  title: string;
  body: string;
}

export type NotificationActionType = 'NAVIGATE' | 'MARK_READ' | 'DISMISS' | 'CUSTOM_ACTION';

export interface NotificationAction {
  type: NotificationActionType;
  payload?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Recurrence representation (platform-agnostic)
// ---------------------------------------------------------------------------

export type Recurrence =
  | {
      /** One-off reminder at a specific timestamp. */
      kind: 'once';
      dueAt: string;
      timezone?: string;
    }
  | {
      kind: 'rrule';
      /**
       * RFC5545 RRULE string. We keep this for future full fidelity.
       * Backend recurrence evaluation can start with a subset.
       */
      rrule: string;
      /** Start timestamp (ISO8601) for the rule. */
      dtStart: string;
      /** IANA timezone, e.g. `America/Los_Angeles`. */
      timezone?: string;
    }
  | {
      /**
       * Every N days, anchored from `dtStart`.
       * Used for cases like: “every two days at time X”.
       */
      kind: 'every_n_days';
      intervalDays: number;
      dtStart: string;
      timezone?: string;
    }
  | {
      /** Hourly reminders anchored from `dtStart`. */
      kind: 'hourly';
      intervalHours: number;
      dtStart: string;
      timezone?: string;
    }
  | {
      /** Weekly reminders on specific days of week, at a fixed time. */
      kind: 'weekly_by_days';
      intervalWeeks: number;
      /**
       * JS day index: 0=Sun ... 6=Sat
       * Example: [1,3,5] for Mon/Wed/Fri.
       */
      daysOfWeek: number[];
      /**
       * Fixed HH:mm in the schedule timezone, e.g. `08:30`.
       */
      timeOfDay: string;
      /**
       * First week to consider (ISO date or ISO datetime).
       */
      startAt: string;
      timezone?: string;
    }
  | {
      /**
       * Window reminders within a day, used for “log sleep in the evening”
       * or “log workouts soon after today’s schedule”.
       */
      kind: 'daily_window';
      startAt: string;
      timezone?: string;
      /**
       * Window boundaries in HH:mm, inclusive/exclusive is backend-defined.
       */
      windowStart: string;
      windowEnd: string;
      /**
       * Emit at most once per interval inside the window.
       * Example: intervalMinutes=120 yields every 2 hours in the window.
       */
      intervalMinutes: number;
    };

// ---------------------------------------------------------------------------
// Schedule config (stored in Firestore)
// ---------------------------------------------------------------------------

export interface NotificationScheduleConfig {
  enabled: boolean;
  moduleId: ModuleId;
  channelPrefs: NotificationChannelPrefs;
  timezone: string;
  recurrence: Recurrence;
  messageTemplate: NotificationMessageTemplate;
  /**
   * Optional source metadata for linking reminders to module entities.
   */
  source?: {
    moduleId: ModuleId;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  /** Optional tags for intelligent routing or filtering. */
  tags?: string[];
  /** Who created the schedule (user vs agent). */
  createdBy?: 'user' | 'agent';
  /**
   * Deep link is auto-derived from moduleId by the scheduler.
   * Kept optional here for legacy records or explicit overrides.
   */
  deepLink?: NotificationDeepLink;
  priority: NotificationPriority;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationOccurrenceRecord {
  occurrenceId: string;
  scheduleId: string;
  moduleId: ModuleId;
  /**
   * When this reminder is due (ISO8601 timestamp).
   */
  dueAt: string;
  /**
   * De-dupe/status tracking.
   */
  status: 'pending' | 'delivered' | 'completed' | 'skipped';
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Reminder proposals (AI or user intent before confirmation)
// ---------------------------------------------------------------------------

export interface ReminderProposal {
  id: string;
  moduleId: ModuleId;
  title: string;
  note?: string;
  recurrence: Recurrence;
  timezone: string;
  channelPrefs: NotificationChannelPrefs;
  priority: NotificationPriority;
  deepLink?: NotificationDeepLink;
  source?: NotificationScheduleConfig['source'];
  tags?: string[];
  createdBy: 'agent';
}

// ---------------------------------------------------------------------------
// Firestore collections / document shapes
// ---------------------------------------------------------------------------

export const NOTIFICATION_COLLECTIONS = {
  schedules: 'notification_schedules',
  occurrences: 'notification_occurrences',
  proposals: 'notification_proposals',
} as const;

export type ReminderProposalStatus = 'pending' | 'confirmed' | 'dismissed';

export interface PersistedReminderProposal extends ReminderProposal {
  status: ReminderProposalStatus;
  scheduleId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Firestore paths:
 * - `users/{uid}/notification_schedules/{scheduleId}`: NotificationScheduleConfig (filters by `moduleId`)
 * - `users/{uid}/notification_occurrences/{occurrenceId}`: NotificationOccurrenceRecord
 */
export function notificationScheduleDocPath(userId: string, scheduleId: string): string {
  return `users/${userId}/${NOTIFICATION_COLLECTIONS.schedules}/${scheduleId}`;
}

export function notificationOccurrenceDocPath(userId: string, occurrenceId: string): string {
  return `users/${userId}/${NOTIFICATION_COLLECTIONS.occurrences}/${occurrenceId}`;
}
