/**
 * Recurrence parity test.
 *
 * Ensures that the client evaluation engine (src/lib/notifications/reminder-evaluation.ts)
 * and the server evaluation engine (functions/src/reminder-evaluation.ts) agree on
 * "next occurrence after time T" for all 6 recurrence kinds.
 *
 * The server's computeInRange is designed for 60-second sliding windows (used by nextDue).
 * The client's computeDueOccurrencesInRange handles arbitrary ranges.
 * We test parity by asking both: "what is the first occurrence strictly after T?"
 *
 * If this test fails, the two implementations have diverged — update whichever copy
 * is stale to match the canonical client source.
 */

import { describe, expect, it } from 'vitest';
import { computeDueOccurrencesInRange } from '../reminder-evaluation';
import { RRule } from 'rrule';

type Recurrence =
  | { kind: 'once'; dueAt: string; timezone?: string }
  | { kind: 'every_n_days'; intervalDays: number; dtStart: string; timezone?: string }
  | { kind: 'hourly'; intervalHours: number; dtStart: string; timezone?: string }
  | { kind: 'weekly_by_days'; intervalWeeks: number; daysOfWeek: number[]; timeOfDay: string; startAt: string; timezone?: string }
  | { kind: 'daily_window'; startAt: string; timezone?: string; windowStart: string; windowEnd: string; intervalMinutes: number }
  | { kind: 'rrule'; rrule: string; dtStart: string; timezone?: string };

// ---------------------------------------------------------------------------
// Server-side nextDue logic inlined for parity — mirrors functions/src/reminder-evaluation.ts
// ---------------------------------------------------------------------------

function parseHHmm(value: unknown): { h: number; m: number } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function toMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function serverComputeInRange(rec: Recurrence, startMs: number, endMs: number): number[] {
  switch (rec.kind) {
    case 'once': {
      const dueAt = toMs(rec.dueAt);
      if (dueAt === null) return [];
      return dueAt >= startMs && dueAt <= endMs ? [dueAt] : [];
    }
    case 'every_n_days': {
      const anchor = toMs(rec.dtStart);
      if (anchor === null) return [];
      const interval = rec.intervalDays * 86400000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const k0 = Math.floor((startMs - anchor) / interval);
      for (let k = k0 - 1; k <= k0 + 2; k++) {
        const t = anchor + k * interval;
        if (t >= startMs && t <= endMs) due.push(t);
      }
      return due;
    }
    case 'hourly': {
      const anchor = toMs(rec.dtStart);
      if (anchor === null) return [];
      const interval = rec.intervalHours * 3600000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const k0 = Math.floor((startMs - anchor) / interval);
      for (let k = k0 - 1; k <= k0 + 2; k++) {
        const t = anchor + k * interval;
        if (t >= startMs && t <= endMs) due.push(t);
      }
      return due;
    }
    case 'weekly_by_days': {
      const tod = parseHHmm(rec.timeOfDay);
      if (!tod) return [];
      const due: number[] = [];
      const dayMs = 86400000;
      let d = new Date(startMs);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      while (d.getTime() <= endMs + dayMs) {
        if (rec.daysOfWeek.includes(d.getUTCDay())) {
          const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), tod.h, tod.m, 0, 0);
          if (t >= startMs && t <= endMs) due.push(t);
        }
        d = new Date(d.getTime() + dayMs);
      }
      return due;
    }
    case 'daily_window': {
      const ws = parseHHmm(rec.windowStart);
      const we = parseHHmm(rec.windowEnd);
      if (!ws || !we) return [];
      const interval = rec.intervalMinutes * 60000;
      if (interval <= 0) return [];
      const due: number[] = [];
      const dayMs = 86400000;
      let d = new Date(startMs);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      while (d.getTime() <= endMs + dayMs) {
        const wStartMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), ws.h, ws.m, 0, 0);
        const wEndMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), we.h, we.m, 0, 0);
        let t = wStartMs;
        while (t <= wEndMs) {
          if (t >= startMs && t <= endMs) due.push(t);
          t += interval;
        }
        d = new Date(d.getTime() + dayMs);
      }
      return due;
    }
    case 'rrule': {
      if (typeof rec.rrule !== 'string' || !rec.rrule) return [];
      const dtStartMs = toMs(rec.dtStart);
      if (dtStartMs === null) return [];
      try {
        const d = new Date(dtStartMs);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dtStartStr =
          `${d.getUTCFullYear()}` +
          `${pad(d.getUTCMonth() + 1)}` +
          `${pad(d.getUTCDate())}` +
          `T${pad(d.getUTCHours())}` +
          `${pad(d.getUTCMinutes())}` +
          `${pad(d.getUTCSeconds())}Z`;
        const rruleStr = rec.rrule.startsWith('RRULE:') ? rec.rrule : `RRULE:${rec.rrule}`;
        const rule = RRule.fromString(`DTSTART:${dtStartStr}\n${rruleStr}`);
        return rule.between(new Date(startMs), new Date(endMs), true).map((dd) => dd.getTime());
      } catch {
        return [];
      }
    }
  }
}

/** Server-compatible "next due" using 60-second sliding windows. */
function serverNextDue(rec: Recurrence, afterMs: number): number | null {
  if (rec.kind === 'once') {
    const dueAt = toMs(rec.dueAt);
    return dueAt !== null && dueAt > afterMs ? dueAt : null;
  }
  const windowMs = 60 * 1000;
  const maxMs = afterMs + 60 * 24 * 60 * 60 * 1000;
  let cursor = afterMs;
  while (cursor < maxMs) {
    const hits = serverComputeInRange(rec, cursor, cursor + windowMs).filter((t) => t > afterMs);
    if (hits.length > 0) return Math.min(...hits);
    cursor += windowMs;
  }
  return null;
}

/** Client "next due" using computeDueOccurrencesInRange with a 60-day look-ahead. */
function clientNextDue(rec: Recurrence, afterMs: number): number | null {
  if (rec.kind === 'once') {
    const hits = computeDueOccurrencesInRange(rec, afterMs, afterMs + 365 * 86400000).filter((t) => t > afterMs);
    return hits.length > 0 ? Math.min(...hits) : null;
  }
  const hits = computeDueOccurrencesInRange(rec, afterMs, afterMs + 60 * 86400000).filter((t) => t > afterMs);
  return hits.length > 0 ? Math.min(...hits) : null;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const AFTER_MS = Date.parse('2026-03-01T00:00:00.000Z');

const PARITY_CASES: { label: string; rec: Recurrence }[] = [
  {
    label: 'once',
    rec: { kind: 'once', dueAt: '2026-03-15T10:00:00.000Z', timezone: 'UTC' },
  },
  {
    label: 'every_n_days',
    rec: { kind: 'every_n_days', intervalDays: 3, dtStart: '2026-03-01T08:00:00.000Z', timezone: 'UTC' },
  },
  {
    label: 'hourly',
    rec: { kind: 'hourly', intervalHours: 6, dtStart: '2026-03-01T00:00:00.000Z', timezone: 'UTC' },
  },
  {
    label: 'weekly_by_days',
    rec: {
      kind: 'weekly_by_days',
      intervalWeeks: 1,
      daysOfWeek: [1, 3, 5],
      timeOfDay: '09:00',
      startAt: '2026-03-01T00:00:00.000Z',
      timezone: 'UTC',
    },
  },
  {
    label: 'daily_window',
    rec: {
      kind: 'daily_window',
      startAt: '2026-03-01T00:00:00.000Z',
      timezone: 'UTC',
      windowStart: '08:00',
      windowEnd: '10:00',
      intervalMinutes: 60,
    },
  },
  {
    label: 'rrule (weekly Tue/Thu at 09:00 UTC)',
    rec: {
      kind: 'rrule',
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
      dtStart: '2026-03-01T09:00:00.000Z',
      timezone: 'UTC',
    },
  },
];

describe('recurrence-parity (client vs server)', () => {
  for (const { label, rec } of PARITY_CASES) {
    it(`next occurrence agrees for ${label}`, () => {
      const clientResult = clientNextDue(rec, AFTER_MS);
      const serverResult = serverNextDue(rec, AFTER_MS);

      expect(clientResult).not.toBeNull();
      expect(clientResult).toBe(serverResult);
    });
  }
});

