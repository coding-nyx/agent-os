/**
 * Server-side recurrence evaluation engine (Cloud Functions runtime).
 *
 * Mirrors the type contract in src/lib/notifications/types.ts.
 * PARITY REQUIRED with src/lib/notifications/reminder-evaluation.ts (canonical client copy).
 * Verified by src/lib/notifications/__tests__/recurrence-parity.test.ts.
 */

import { RRule } from "rrule";

// ---------------------------------------------------------------------------
// Recurrence types (mirrors src/lib/notifications/types.ts)
// ---------------------------------------------------------------------------

export type Recurrence =
  | { kind: "once"; dueAt: string; timezone?: string }
  | { kind: "every_n_days"; intervalDays: number; dtStart: string; timezone?: string }
  | { kind: "hourly"; intervalHours: number; dtStart: string; timezone?: string }
  | { kind: "weekly_by_days"; intervalWeeks: number; daysOfWeek: number[]; timeOfDay: string; startAt: string; timezone?: string }
  | { kind: "daily_window"; startAt: string; timezone?: string; windowStart: string; windowEnd: string; intervalMinutes: number }
  | { kind: "rrule"; rrule: string; dtStart: string; timezone?: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseHHmm(value: unknown): { h: number; m: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function toMs(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeInRange(rec: Recurrence, startMs: number, endMs: number): number[] {
  switch (rec.kind) {
    case "once": {
      const dueAt = toMs(rec.dueAt);
      if (dueAt === null) return [];
      if (dueAt >= startMs && dueAt <= endMs) return [dueAt];
      return [];
    }
    case "every_n_days": {
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

    case "hourly": {
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

    case "weekly_by_days": {
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

    case "daily_window": {
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

    case "rrule": {
      if (typeof rec.rrule !== "string" || !rec.rrule) return [];
      const dtStartMs = toMs(rec.dtStart);
      if (dtStartMs === null) return [];
      try {
        const d = new Date(dtStartMs);
        const pad = (n: number) => String(n).padStart(2, "0");
        const dtStartStr =
          `${d.getUTCFullYear()}` +
          `${pad(d.getUTCMonth() + 1)}` +
          `${pad(d.getUTCDate())}` +
          `T${pad(d.getUTCHours())}` +
          `${pad(d.getUTCMinutes())}` +
          `${pad(d.getUTCSeconds())}Z`;
        const rruleStr = rec.rrule.startsWith("RRULE:") ? rec.rrule : `RRULE:${rec.rrule}`;
        const rule = RRule.fromString(`DTSTART:${dtStartStr}\n${rruleStr}`);
        return rule
          .between(new Date(startMs), new Date(endMs), true)
          .map((d) => d.getTime());
      } catch {
        return [];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the next due timestamp (ms) strictly after `afterMs`,
 * or null if the recurrence cannot be evaluated within 60 days.
 */
export function nextDue(recurrence: unknown, afterMs: number): number | null {
  const rec = recurrence as Recurrence | undefined;
  if (!rec || typeof rec !== "object" || !("kind" in rec)) return null;

  if (rec.kind === "once") {
    const dueAt = toMs(rec.dueAt);
    if (dueAt === null) return null;
    return dueAt > afterMs ? dueAt : null;
  }

  const windowMs = 60 * 1000;
  const maxMs = afterMs + 60 * 24 * 60 * 60 * 1000;

  let cursor = afterMs;
  while (cursor < maxMs) {
    const hits = computeInRange(rec, cursor, cursor + windowMs);
    const future = hits.filter((t) => t > afterMs);
    if (future.length > 0) return Math.min(...future);
    cursor += windowMs;
  }
  return null;
}
