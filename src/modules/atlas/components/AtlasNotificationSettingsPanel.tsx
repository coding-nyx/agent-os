import React, { useMemo } from 'react';
import { NotificationSettingsPanel, type NotificationSchedulePreset } from '@/lib/notifications/ui/NotificationSettingsPanel';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

export function AtlasNotificationSettingsPanel() {
  const presets = useMemo<NotificationSchedulePreset[]>(() => {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const build = (scheduleId: string, config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>): NotificationSchedulePreset => ({
      scheduleId,
      config: { ...config, createdAt: now, updatedAt: now }
    });

    return [
      build('atlas-hourly-task-reminder', {
        enabled: true,
        moduleId: 'atlas',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '09:00', startAt: now, timezone },
        messageTemplate: { title: 'Task check-in', body: 'Log the next task progress or mark it as handled for today.' },
        priority: 'alert'
      }),
      build('atlas-evening-journal', {
        enabled: true,
        moduleId: 'atlas',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '21:00', startAt: now, timezone },
        messageTemplate: { title: 'Journal time', body: 'Capture what changed today — wins, friction, and next focus.' },
        priority: 'alert'
      }),
      build('atlas-weekly-review', {
        enabled: true,
        moduleId: 'atlas',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0], timeOfDay: '10:00', startAt: now, timezone },
        messageTemplate: { title: 'Weekly review due', body: 'Reflect, compress the plan, and set next week\'s focus.' },
        priority: 'alert'
      })
    ];
  }, []);

  return <NotificationSettingsPanel moduleId="atlas" title="Reminders" presets={presets} manageAllHref="/notifications" />;
}
