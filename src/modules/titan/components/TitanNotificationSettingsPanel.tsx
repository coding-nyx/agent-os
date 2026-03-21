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
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '07:00', startAt: now, timezone },
        messageTemplate: { title: 'Workout time', body: 'Log your workout session so Titan can update readiness and recovery.' },
        priority: 'alert'
      }),
      build('titan-sleep-log-evening', {
        enabled: true,
        moduleId: 'titan',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '21:30', startAt: now, timezone },
        messageTemplate: { title: 'Sleep log due', body: 'Log tonight\'s sleep to keep recovery calculations accurate.' },
        priority: 'alert'
      })
    ];
  }, []);

  return <NotificationSettingsPanel moduleId="titan" title="Reminders" presets={presets} manageAllHref="/notifications" />;
}
