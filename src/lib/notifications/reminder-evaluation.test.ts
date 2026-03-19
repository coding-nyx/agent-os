import { describe, expect, it } from 'vitest';
import { computeDueOccurrencesInRange, hashOccurrenceId } from './reminder-evaluation';
import type { Recurrence } from './types';

describe('reminder-evaluation', () => {
  it('hashOccurrenceId is deterministic', () => {
    const a = hashOccurrenceId('agnes:schedule1:2026-01-01T00:00:00.000Z');
    const b = hashOccurrenceId('agnes:schedule1:2026-01-01T00:00:00.000Z');
    const c = hashOccurrenceId('agnes:schedule1:2026-01-01T01:00:00.000Z');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('computes due every_n_days occurrences inside the window', () => {
    const dtStart = '2026-01-01T00:00:00.000Z';
    const recurrence: Recurrence = { kind: 'every_n_days', intervalDays: 2, dtStart, timezone: 'UTC' };

    const rangeStartMs = Date.parse('2026-01-03T00:00:00.000Z');
    const rangeEndMs = Date.parse('2026-01-04T01:00:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-01-03T00:00:00.000Z']);
  });

  it('computes due hourly occurrences inside the window', () => {
    const dtStart = '2026-01-01T00:00:00.000Z';
    const recurrence: Recurrence = { kind: 'hourly', intervalHours: 1, dtStart, timezone: 'UTC' };

    const rangeStartMs = Date.parse('2026-01-01T00:30:00.000Z');
    const rangeEndMs = Date.parse('2026-01-01T01:30:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-01-01T01:00:00.000Z']);
  });

  it('computes due weekly_by_days occurrences inside the window', () => {
    // 2026-01-01T00:00Z is a Thursday; we schedule Monday at 10:00Z.
    const startAt = '2026-01-01T00:00:00.000Z';
    const recurrence: Recurrence = {
      kind: 'weekly_by_days',
      intervalWeeks: 1,
      daysOfWeek: [1], // Monday
      timeOfDay: '10:00',
      startAt,
      timezone: 'UTC',
    };

    const rangeStartMs = Date.parse('2026-01-05T09:59:00.000Z'); // Monday 10:00
    const rangeEndMs = Date.parse('2026-01-05T10:01:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-01-05T10:00:00.000Z']);
  });

  it('computes due daily_window occurrences at windowStart inside the window', () => {
    const startAt = '2026-01-01T00:00:00.000Z';
    const recurrence: Recurrence = {
      kind: 'daily_window',
      startAt,
      timezone: 'UTC',
      windowStart: '20:00',
      windowEnd: '23:59',
      intervalMinutes: 1440,
    };

    const rangeStartMs = Date.parse('2026-01-01T19:59:00.000Z');
    const rangeEndMs = Date.parse('2026-01-01T20:01:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-01-01T20:00:00.000Z']);
  });
});

