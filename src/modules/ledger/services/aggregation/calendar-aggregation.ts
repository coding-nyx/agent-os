// Bridge: delegates to KMP CalendarAggregationJs.
// groupEventsByDate is not in KMP — it remains as a local TS helper.

import { CalendarAggregationJs } from '@cortex-logic';
import type { CalendarEvent, LedgerIntakeProfile } from '../ledger-intake-service';

const _calendarAgg = new CalendarAggregationJs();

/**
 * Builds CalendarEvent[] for the given month (year/month 1-based) by
 * aggregating recurring bills, subscriptions, and financial goal deadlines.
 */
export function buildCalendarEvents(
  profile: LedgerIntakeProfile,
  year: number,
  month: number,
): CalendarEvent[] {
  return JSON.parse(
    _calendarAgg.buildCalendarEvents(JSON.stringify(profile), year, month, Date.now()),
  ) as CalendarEvent[];
}

/** Groups CalendarEvents by ISO date string within a month. */
export function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = ev.date.split('T')[0];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  return grouped;
}
