import type { NotificationScheduleConfig } from './types';

export interface NotificationSchedulePreset {
  scheduleId: string;
  config: NotificationScheduleConfig;
}

function buildPreset(
  scheduleId: string,
  config: Omit<NotificationScheduleConfig, 'createdAt' | 'updatedAt'>,
  now: string,
): NotificationSchedulePreset {
  return { scheduleId, config: { ...config, createdAt: now, updatedAt: now } };
}

export function buildAllPresets(): NotificationSchedulePreset[] {
  const now = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ch = { os: true, inApp: true };

  return [
    // Agnes
    buildPreset('agnes-therapy-every-2-days', {
      enabled: true,
      moduleId: 'agnes',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'every_n_days', intervalDays: 2, dtStart: now, timezone },
      messageTemplate: { title: 'Therapy session due', body: 'Log your therapy session and complete the scheduled grounding.' },
      priority: 'alert',
    }, now),

    // Titan
    buildPreset('titan-workout-window', {
      enabled: true,
      moduleId: 'titan',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '07:00', startAt: now, timezone },
      messageTemplate: { title: 'Workout time', body: 'Log your workout session so Titan can update readiness and recovery.' },
      priority: 'alert',
    }, now),
    buildPreset('titan-sleep-log-evening', {
      enabled: true,
      moduleId: 'titan',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '21:30', startAt: now, timezone },
      messageTemplate: { title: 'Sleep log due', body: "Log tonight's sleep to keep recovery calculations accurate." },
      priority: 'alert',
    }, now),

    // Ledger
    buildPreset('ledger-spend-due', {
      enabled: true,
      moduleId: 'ledger',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '09:00', startAt: now, timezone },
      messageTemplate: { title: 'Log spend', body: "Log today's spending so Ledger can update your financial picture." },
      priority: 'alert',
    }, now),
    buildPreset('ledger-income-due', {
      enabled: true,
      moduleId: 'ledger',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: '17:00', startAt: now, timezone },
      messageTemplate: { title: 'Log income', body: 'Capture income to keep cashflow calculations accurate.' },
      priority: 'info',
    }, now),
    buildPreset('ledger-investments-due', {
      enabled: false,
      moduleId: 'ledger',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [5], timeOfDay: '18:00', startAt: now, timezone },
      messageTemplate: { title: 'Investment log', body: 'Log investment activity to maintain long-term ROI tracking.' },
      priority: 'info',
    }, now),

    // Soma
    buildPreset('soma-vitals-morning', {
      enabled: true,
      moduleId: 'soma',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '07:30', startAt: now, timezone },
      messageTemplate: { title: 'Morning vitals', body: 'Log weight, blood pressure, and any symptoms so Soma can track trends.' },
      priority: 'alert',
    }, now),
    buildPreset('soma-labs-monthly', {
      enabled: false,
      moduleId: 'soma',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'every_n_days', intervalDays: 30, dtStart: now, timezone },
      messageTemplate: { title: 'Lab results due', body: 'Upload any recent lab results to keep your medical profile current.' },
      priority: 'info',
    }, now),

    // Atlas
    buildPreset('atlas-hourly-task-reminder', {
      enabled: true,
      moduleId: 'atlas',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '09:00', startAt: now, timezone },
      messageTemplate: { title: 'Task check-in', body: 'Log the next task progress or mark it as handled for today.' },
      priority: 'alert',
    }, now),
    buildPreset('atlas-evening-journal', {
      enabled: true,
      moduleId: 'atlas',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '21:00', startAt: now, timezone },
      messageTemplate: { title: 'Journal time', body: 'Capture what changed today — wins, friction, and next focus.' },
      priority: 'alert',
    }, now),
    buildPreset('atlas-weekly-review', {
      enabled: true,
      moduleId: 'atlas',
      channelPrefs: ch,
      timezone,
      recurrence: { kind: 'weekly_by_days', intervalWeeks: 1, daysOfWeek: [0], timeOfDay: '10:00', startAt: now, timezone },
      messageTemplate: { title: 'Weekly review due', body: "Reflect, compress the plan, and set next week's focus." },
      priority: 'alert',
    }, now),
  ];
}
