import type { Recurrence } from './types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function recurrenceSummary(r: Recurrence): string {
  switch (r.kind) {
    case 'once':
      return `Once at ${new Date(r.dueAt).toLocaleString()}`;
    case 'every_n_days':
      return r.intervalDays === 1 ? 'Every day' : `Every ${r.intervalDays} days`;
    case 'hourly':
      return r.intervalHours === 1 ? 'Every hour' : `Every ${r.intervalHours} hours`;
    case 'weekly_by_days': {
      const days = r.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ');
      return `${days} at ${r.timeOfDay}`;
    }
    case 'daily_window':
      return `Daily ${r.windowStart}–${r.windowEnd}`;
    default:
      return 'Custom schedule';
  }
}
