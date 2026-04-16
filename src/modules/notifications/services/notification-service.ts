import type { InboxRecord } from '@/lib/notifications/NotificationContext';
import type { AraDataLayer } from '@/lib/data-layer';

// ─── Snooze ───────────────────────────────────────────────────────────────────

export type SnoozeOption = {
  label: string;
  value: string; // duration key
  durationMs: number;
};

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { label: '1 hour', value: '1h', durationMs: 60 * 60 * 1000 },
  { label: '3 hours', value: '3h', durationMs: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow', value: 'tomorrow', durationMs: 24 * 60 * 60 * 1000 },
  { label: 'In 2 days', value: '2d', durationMs: 2 * 24 * 60 * 60 * 1000 },
  { label: 'Next week', value: '1w', durationMs: 7 * 24 * 60 * 60 * 1000 },
];

export function computeSnoozedUntil(option: SnoozeOption): string {
  return new Date(Date.now() + option.durationMs).toISOString();
}

export function isSnoozed(snoozedUntil: string | undefined): boolean {
  if (!snoozedUntil) return false;
  return new Date(snoozedUntil).getTime() > Date.now();
}

export function snoozeCountdown(snoozedUntil: string): string {
  const ms = new Date(snoozedUntil).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Suggest a smart snooze based on notification priority and time of day.
 * Returns the recommended SnoozeOption label and rationale.
 */
export function suggestSnooze(item: InboxRecord): { option: SnoozeOption; reason: string } {
  const hour = new Date().getHours();
  const isWorkHours = hour >= 9 && hour < 18;

  if (item.priority === 'critical') {
    return { option: SNOOZE_OPTIONS[0], reason: 'Critical — snooze briefly, max 1h' };
  }
  if (item.priority === 'alert') {
    return { option: SNOOZE_OPTIONS[1], reason: 'Alert — 3h keeps it actionable today' };
  }
  if (!isWorkHours) {
    return { option: SNOOZE_OPTIONS[2], reason: 'Outside work hours — defer to tomorrow' };
  }
  return { option: SNOOZE_OPTIONS[1], reason: 'Low priority — 3h is a good buffer' };
}

// ─── Quiet Hours / DND ────────────────────────────────────────────────────────

export interface QuietHoursConfig {
  enabled: boolean;
  /** "HH:MM" 24-hour format */
  from: string;
  to: string;
  /** Module IDs exempt from quiet hours (still get delivered) */
  exemptModules: string[];
  updatedAt: string;
}

export function createDefaultQuietHours(): QuietHoursConfig {
  return {
    enabled: false,
    from: '22:00',
    to: '08:00',
    exemptModules: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Returns true if the current time falls inside the quiet hours window.
 * Handles overnight windows (e.g. 22:00 → 08:00).
 */
export function isInQuietHours(config: QuietHoursConfig): boolean {
  if (!config.enabled) return false;
  const now = new Date();
  const [fh, fm] = config.from.split(':').map(Number);
  const [th, tm] = config.to.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = fh * 60 + fm;
  const toMinutes = th * 60 + tm;

  if (fromMinutes <= toMinutes) {
    // Same-day window (e.g., 09:00–17:00)
    return nowMinutes >= fromMinutes && nowMinutes < toMinutes;
  } else {
    // Overnight window (e.g., 22:00–08:00)
    return nowMinutes >= fromMinutes || nowMinutes < toMinutes;
  }
}

export function shouldSuppressNotification(
  item: InboxRecord,
  config: QuietHoursConfig,
): boolean {
  if (!isInQuietHours(config)) return false;
  const source = item.source?.replace(/^cascade:/, '') ?? 'system';
  // Exempt modules always get through; critical always gets through
  if (item.priority === 'critical') return false;
  if (config.exemptModules.includes(source)) return false;
  return true;
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

export interface NotificationGroup {
  key: string;
  label: string;
  items: InboxRecord[];
}

export function groupBySource(items: InboxRecord[]): NotificationGroup[] {
  const map = new Map<string, InboxRecord[]>();
  for (const item of items) {
    const source = item.source?.replace(/^cascade:/, '') ?? 'system';
    if (!map.has(source)) map.set(source, []);
    map.get(source)!.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, groupItems]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      items: groupItems,
    }));
}

export function groupByDate(items: InboxRecord[]): NotificationGroup[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const buckets: Record<string, InboxRecord[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  for (const item of items) {
    const d = new Date(item.createdAt); d.setHours(0, 0, 0, 0);
    if (d >= today) buckets['Today'].push(item);
    else if (d >= yesterday) buckets['Yesterday'].push(item);
    else if (d >= weekAgo) buckets['This Week'].push(item);
    else buckets['Older'].push(item);
  }

  return Object.entries(buckets)
    .filter(([, groupItems]) => groupItems.length > 0)
    .map(([label, groupItems]) => ({ key: label.toLowerCase().replace(/ /g, '-'), label, items: groupItems }));
}

// ─── Bulk Actions ─────────────────────────────────────────────────────────────

export function filterSelected(ids: Set<string>, items: InboxRecord[]): InboxRecord[] {
  return items.filter(i => ids.has(i.id));
}

export function getUnreadSelectedIds(selected: Set<string>, items: InboxRecord[]): string[] {
  return items.filter(i => selected.has(i.id) && !i.read).map(i => i.id);
}

// ─── Summary for AI ───────────────────────────────────────────────────────────

export interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
  bySource: Record<string, number>;
  oldestUnread: string | null;
}

export function buildNotificationSummary(items: InboxRecord[]): NotificationSummary {
  const unread = items.filter(i => !i.read);
  const critical = items.filter(i => i.priority === 'critical' || i.priority === 'alert');
  const bySource: Record<string, number> = {};
  for (const item of items) {
    const src = item.source?.replace(/^cascade:/, '') ?? 'system';
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  const oldest = unread.length > 0
    ? unread.reduce((a, b) => a.createdAt < b.createdAt ? a : b).createdAt
    : null;
  return { total: items.length, unread: unread.length, critical: critical.length, bySource, oldestUnread: oldest };
}

// ─── Quiet Hours Persistence ──────────────────────────────────────────────────

const SETTINGS_COLLECTION = 'notification_settings';
const SETTINGS_DOC_ID = 'preferences';

function settingsPath(userId: string): string {
  return `users/${userId}/${SETTINGS_COLLECTION}`;
}

export async function loadQuietHoursConfig(
  dataLayer: AraDataLayer,
  userId: string,
): Promise<QuietHoursConfig> {
  try {
    const doc = await dataLayer.getDocument<{ quietHours: QuietHoursConfig }>(
      settingsPath(userId),
      SETTINGS_DOC_ID,
    );
    if (doc?.quietHours) return doc.quietHours;
  } catch {
    // First load or missing doc — use defaults
  }
  return createDefaultQuietHours();
}

export async function saveQuietHoursConfig(
  dataLayer: AraDataLayer,
  userId: string,
  config: QuietHoursConfig,
): Promise<void> {
  await dataLayer.setDocument(settingsPath(userId), SETTINGS_DOC_ID, {
    quietHours: config,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Snooze Persistence ──────────────────────────────────────────────────────

export async function persistSnooze(
  dataLayer: AraDataLayer,
  userId: string,
  notificationId: string,
  snoozedUntil: string,
): Promise<void> {
  const inboxPath = `users/${userId}/notification_inbox`;
  await dataLayer.updateDocument(inboxPath, notificationId, {
    snoozedUntil,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearSnooze(
  dataLayer: AraDataLayer,
  userId: string,
  notificationId: string,
): Promise<void> {
  const inboxPath = `users/${userId}/notification_inbox`;
  await dataLayer.updateDocument(inboxPath, notificationId, {
    snoozedUntil: null,
    updatedAt: new Date().toISOString(),
  });
}
