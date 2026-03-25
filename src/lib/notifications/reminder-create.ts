import { getFirebase } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { ModuleId } from '@/lib/module-manifest';
import type {
  NotificationScheduleConfig,
  NotificationChannelPrefs,
  NotificationPriority,
  NotificationDeepLink,
  Recurrence,
} from '@/lib/notifications/types';
import { ReminderLifecycleError } from './errors';

export interface ReminderDraft {
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
  createdBy: 'user' | 'agent';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callScheduleReminder(scheduleId: string, maxAttempts = 3): Promise<void> {
  const { app } = getFirebase();
  if (!app) return;
  const functions = getFunctions(app);
  const scheduleReminder = httpsCallable<{ scheduleId: string }, unknown>(
    functions,
    'scheduleReminder',
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await scheduleReminder({ scheduleId });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
      }
    }
  }

  throw new ReminderLifecycleError(
    'schedule_failed',
    `scheduleReminder Cloud Function failed after ${maxAttempts} attempts for schedule ${scheduleId}`,
    lastError,
  );
}

export async function createReminderSchedule(
  userId: string,
  draft: ReminderDraft,
  scheduleId?: string,
): Promise<string> {
  const dataLayer = getNexusDataLayer();
  const now = new Date().toISOString();
  const fallbackId = `reminder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackId;
  const id = scheduleId ?? `reminder-${randomId}`;

  const payload: NotificationScheduleConfig = {
    enabled: true,
    moduleId: draft.moduleId,
    channelPrefs: draft.channelPrefs,
    timezone: draft.timezone,
    recurrence: draft.recurrence,
    messageTemplate: {
      title: draft.title,
      body: draft.note ?? '',
    },
    deepLink: draft.deepLink ?? { route: `/${draft.moduleId}` },
    priority: draft.priority,
    source: draft.source,
    tags: draft.tags,
    createdBy: draft.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await dataLayer.setDocument<NotificationScheduleConfig>(
    `users/${userId}/notification_schedules`,
    id,
    payload,
  );

  // Throws ReminderLifecycleError after 3 attempts — caller is responsible for error handling.
  await callScheduleReminder(id);

  return id;
}
