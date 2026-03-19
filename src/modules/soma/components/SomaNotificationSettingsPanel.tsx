import React, { useMemo } from 'react';
import {
  NotificationSettingsPanel,
  type NotificationSchedulePreset,
} from '@/lib/notifications/ui/NotificationSettingsPanel';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

export function SomaNotificationSettingsPanel() {
  const presets = useMemo<NotificationSchedulePreset[]>(() => {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const build = (
      scheduleId: string,
      config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>,
    ): NotificationSchedulePreset => ({
      scheduleId,
      config: { ...config, createdAt: now, updatedAt: now },
    });

    return [
      build('soma-vitals-morning', {
        enabled: true,
        moduleId: 'soma',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: {
          kind: 'daily_window',
          startAt: now,
          timezone,
          windowStart: '07:00',
          windowEnd: '08:30',
          intervalMinutes: 1440,
        },
        messageTemplate: {
          title: 'Morning vitals',
          body: 'Log weight, blood pressure, and any symptoms so Soma can track trends.',
        },
        priority: 'alert',
      }),
      build('soma-labs-monthly', {
        enabled: false,
        moduleId: 'soma',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: {
          kind: 'every_n_days',
          intervalDays: 30,
          dtStart: now,
          timezone,
        },
        messageTemplate: {
          title: 'Lab results due',
          body: 'Upload any recent lab results to keep your medical profile current.',
        },
        priority: 'info',
      }),
    ];
  }, []);

  return <NotificationSettingsPanel moduleId="soma" title="Reminders" presets={presets} />;
}
