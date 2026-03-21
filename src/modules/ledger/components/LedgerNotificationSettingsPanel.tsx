import React, { useMemo } from 'react';
import { NotificationSettingsPanel, type NotificationSchedulePreset } from '@/lib/notifications/ui/NotificationSettingsPanel';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

export function LedgerNotificationSettingsPanel() {
  const presets = useMemo<NotificationSchedulePreset[]>(() => {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const build = (scheduleId: string, config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>): NotificationSchedulePreset => ({
      scheduleId,
      config: { ...config, createdAt: now, updatedAt: now }
    });

    return [
      build('ledger-spend-due', {
        enabled: true,
        moduleId: 'ledger',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '09:00', startAt: now, timezone },
        messageTemplate: { title: 'Log spend', body: 'Log today\'s spending so Ledger can update your financial picture.' },
        priority: 'alert'
      }),
      build('ledger-income-due', {
        enabled: true,
        moduleId: 'ledger',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '17:00', startAt: now, timezone },
        messageTemplate: { title: 'Log income', body: 'Capture income to keep cashflow calculations accurate.' },
        priority: 'info'
      }),
      build('ledger-investments-due', {
        enabled: false,
        moduleId: 'ledger',
        channelPrefs: { os: true, inApp: true },
        timezone,
        recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [5], timeOfDay: '18:00', startAt: now, timezone },
        messageTemplate: { title: 'Investment log', body: 'Log investment activity to maintain long-term ROI tracking.' },
        priority: 'info'
      })
    ];
  }, []);

  return <NotificationSettingsPanel moduleId="ledger" title="Reminders" presets={presets} manageAllHref="/notifications" />;
}
