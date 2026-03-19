import React, { useMemo } from 'react';
import { NotificationSettingsPanel, type NotificationSchedulePreset } from '@/lib/notifications/ui/NotificationSettingsPanel';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

export function TitanNotificationSettingsPanel() {
  const presets = useMemo<NotificationSchedulePreset[]>(() => {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const build = (scheduleId: string, config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>): NotificationSchedulePreset => ({
      scheduleId,
      config: { ...config, createdAt: now, updatedAt: now }
    });

    return [
      build('titan-workout-window', {
        enabled: true,
        moduleId: 'titan',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'daily_window', startAt: now, timezone, windowStart: '06:00', windowEnd: '10:00', intervalMinutes: 1440 },
        messageTemplate: { title: 'Workout time', body: 'Log your workout session so Titan can update readiness and recovery.' },
        priority: 'alert'
      }),
      build('titan-sleep-log-evening', {
        enabled: true,
        moduleId: 'titan',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'daily_window', startAt: now, timezone, windowStart: '21:00', windowEnd: '23:00', intervalMinutes: 1440 },
        messageTemplate: { title: 'Sleep log due', body: 'Log tonight\'s sleep to keep recovery calculations accurate.' },
        priority: 'alert'
      })
    ];
  }, []);

  return <NotificationSettingsPanel moduleId="titan" title="Reminders" presets={presets} />;
}
