import { getAraDataLayer } from '@/lib/data-layer/provider';
import type { ModuleId } from '@/lib/module-manifest';
import type {
  NotificationScheduleConfig,
  NotificationChannelPrefs,
  NotificationPriority,
  NotificationDeepLink,
  Recurrence,
} from '@/lib/notifications/types';
import { queueScheduleReminder } from './schedule-dispatch-service';

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

export async function createReminderSchedule(
  userId: string,
  draft: ReminderDraft,
  scheduleId?: string,
): Promise<string> {
  const dataLayer = getAraDataLayer();
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

  // Throws ReminderLifecycleError after retry exhaustion.
  await queueScheduleReminder(id);

  return id;
}
