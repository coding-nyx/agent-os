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

  it('computes due once occurrences', () => {
    const recurrence: Recurrence = {
      kind: 'once',
      dueAt: '2026-02-01T10:00:00.000Z',
      timezone: 'UTC',
    };
    const rangeStartMs = Date.parse('2026-02-01T09:59:00.000Z');
    const rangeEndMs = Date.parse('2026-02-01T10:01:00.000Z');
    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-02-01T10:00:00.000Z']);
  });

  describe('rrule', () => {
    it('computes weekly occurrences via RRULE string', () => {
      // Every Tuesday and Thursday at 09:00 UTC, starting 2026-01-01
      const dtStart = '2026-01-01T09:00:00.000Z'; // Thursday
      const recurrence: Recurrence = {
        kind: 'rrule',
        rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
        dtStart,
        timezone: 'UTC',
      };

      const rangeStartMs = Date.parse('2026-01-05T00:00:00.000Z'); // Monday 5 Jan
      const rangeEndMs = Date.parse('2026-01-10T23:59:59.000Z');   // Saturday 10 Jan

      const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
      const isos = due.map((ms) => new Date(ms).toISOString());
      expect(isos).toContain('2026-01-06T09:00:00.000Z'); // Tuesday
      expect(isos).toContain('2026-01-08T09:00:00.000Z'); // Thursday
      expect(isos).toHaveLength(2);
    });

    it('returns [] for invalid RRULE string', () => {
      const recurrence: Recurrence = {
        kind: 'rrule',
        rrule: 'NOT_VALID_RRULE!!!',
        dtStart: '2026-01-01T00:00:00.000Z',
      };
      const due = computeDueOccurrencesInRange(recurrence, Date.now(), Date.now() + 86400000);
      expect(due).toEqual([]);
    });

    it('returns [] when rrule string is empty', () => {
      const recurrence = { kind: 'rrule' as const, rrule: '', dtStart: '2026-01-01T00:00:00.000Z' };
      const due = computeDueOccurrencesInRange(recurrence, Date.now(), Date.now() + 86400000);
      expect(due).toEqual([]);
    });

    it('supports COUNT limit in RRULE', () => {
      // Fires daily for 3 days starting 2026-03-01
      const dtStart = '2026-03-01T08:00:00.000Z';
      const recurrence: Recurrence = {
        kind: 'rrule',
        rrule: 'FREQ=DAILY;COUNT=3',
        dtStart,
        timezone: 'UTC',
      };

      const rangeStartMs = Date.parse('2026-03-01T00:00:00.000Z');
      const rangeEndMs = Date.parse('2026-03-10T00:00:00.000Z');

      const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
      expect(due).toHaveLength(3);
      expect(new Date(due[0]).toISOString()).toBe('2026-03-01T08:00:00.000Z');
      expect(new Date(due[2]).toISOString()).toBe('2026-03-03T08:00:00.000Z');
    });
  });
});


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

  it('daily_window produces all intervalMinutes-spaced slots within the window (not just windowStart)', () => {
    // 09:00–12:00 UTC, every 30 minutes → 7 slots: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
    const startAt = '2026-01-05T00:00:00.000Z';
    const recurrence: Recurrence = {
      kind: 'daily_window',
      startAt,
      timezone: 'UTC',
      windowStart: '09:00',
      windowEnd: '12:00',
      intervalMinutes: 30,
    };

    const rangeStartMs = Date.parse('2026-01-05T08:59:00.000Z');
    const rangeEndMs   = Date.parse('2026-01-05T12:01:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    const isos = due.map((ms) => new Date(ms).toISOString());
    expect(isos).toEqual([
      '2026-01-05T09:00:00.000Z',
      '2026-01-05T09:30:00.000Z',
      '2026-01-05T10:00:00.000Z',
      '2026-01-05T10:30:00.000Z',
      '2026-01-05T11:00:00.000Z',
      '2026-01-05T11:30:00.000Z',
      '2026-01-05T12:00:00.000Z',
    ]);
  });

  it('weekly_by_days applies timezone offset for non-UTC schedules', () => {
    // User in America/Los_Angeles (UTC-8 in Jan) schedules Monday at 09:00 local.
    // Expected UTC delivery: Monday 17:00 UTC.
    const startAt = '2026-01-01T00:00:00.000Z'; // Thursday
    const recurrence: Recurrence = {
      kind: 'weekly_by_days',
      intervalWeeks: 1,
      daysOfWeek: [1], // Monday
      timeOfDay: '09:00',
      startAt,
      timezone: 'America/Los_Angeles',
    };

    // 2026-01-05 is Monday. 09:00 PT = 17:00 UTC (UTC-8 in January).
    const rangeStartMs = Date.parse('2026-01-05T16:59:00.000Z');
    const rangeEndMs   = Date.parse('2026-01-05T17:01:00.000Z');

    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due).toHaveLength(1);
    expect(new Date(due[0]).toISOString()).toBe('2026-01-05T17:00:00.000Z');
  });

  it('computes due once occurrences', () => {
    const recurrence: Recurrence = {
      kind: 'once',
      dueAt: '2026-02-01T10:00:00.000Z',
      timezone: 'UTC',
    };
    const rangeStartMs = Date.parse('2026-02-01T09:59:00.000Z');
    const rangeEndMs = Date.parse('2026-02-01T10:01:00.000Z');
    const due = computeDueOccurrencesInRange(recurrence, rangeStartMs, rangeEndMs);
    expect(due.map((ms) => new Date(ms).toISOString())).toEqual(['2026-02-01T10:00:00.000Z']);
  });
});
