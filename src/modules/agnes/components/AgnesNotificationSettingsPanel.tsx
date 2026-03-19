import React, { useMemo } from 'react';
import { NotificationSettingsPanel, type NotificationSchedulePreset } from '@/lib/notifications/ui/NotificationSettingsPanel';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

export function AgnesNotificationSettingsPanel() {
  const presets = useMemo<NotificationSchedulePreset[]>(() => {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const build = (scheduleId: string, config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>): NotificationSchedulePreset => ({
      scheduleId,
      config: { ...config, createdAt: now, updatedAt: now }
    });

    return [
      build('agnes-therapy-every-2-days', {
        enabled: true,
        moduleId: 'agnes',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'every_n_days', intervalDays: 2, dtStart: now, timezone },
        messageTemplate: { title: 'Therapy session due', body: 'Log your therapy session and complete the scheduled grounding.' },
        priority: 'alert'
      })
    ];
  }, []);

  return (
    <NotificationSettingsPanel moduleId="agnes" title="Reminders" presets={presets} />
  );
}
