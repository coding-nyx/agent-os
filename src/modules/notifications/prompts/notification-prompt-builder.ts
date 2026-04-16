import type { NotificationSummary } from '../services/notification-service';

/**
 * Builds the dynamic context block injected into the Ara Notify system prompt.
 * Summarises the current inbox state so the agent can give contextually relevant advice.
 */
export function serializeNotificationContext(summary: NotificationSummary, quietHoursEnabled: boolean): string {
  if (summary.total === 0) {
    return '[INBOX]\n  Empty — no notifications.';
  }

  const lines: string[] = [];

  lines.push(
    `[INBOX]\n  ${summary.total} total | ${summary.unread} unread | ${summary.critical} critical/alert`,
  );

  if (Object.keys(summary.bySource).length > 0) {
    const sourceLines = Object.entries(summary.bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => `  - ${src}: ${count}`)
      .join('\n');
    lines.push(`[BY SOURCE]\n${sourceLines}`);
  }

  if (summary.oldestUnread) {
    const age = Math.round((Date.now() - new Date(summary.oldestUnread).getTime()) / 86_400_000);
    lines.push(`[OLDEST UNREAD]\n  ${age === 0 ? 'Today' : `${age} day${age !== 1 ? 's' : ''} ago`}`);
  }

  lines.push(`[QUIET HOURS]\n  ${quietHoursEnabled ? '🌙 Active — notifications suppressed outside exempt modules' : 'Off'}`);

  return lines.join('\n\n');
}

/**
 * Returns the allowed action strings for the notifications agent scope.
 */
export const NOTIFICATION_SCOPE_ACTIONS: readonly string[] = [
  'mark_all_read',
  'bulk_delete',
  'snooze_notification',
  'snooze_all_from_source',
  'enable_quiet_hours',
  'disable_quiet_hours',
  'update_quiet_hours',
  'add_exempt_module',
  'create_reminder',
];
