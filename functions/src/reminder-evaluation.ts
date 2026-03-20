/**
 * Recurrence evaluation for the Cloud Functions runtime.
 *
 * Mirrors the type contract in src/lib/notifications/types.ts.
 * Keep these two files in sync — types must not diverge.
 *
 * The client-side equivalent lives in src/lib/notifications/reminder-evaluation.ts.
 */

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
      d.setHours(0, 0, 0, 0);
      while (d.getTime() <= endMs + dayMs) {
        if (rec.daysOfWeek.includes(d.getDay())) {
          const t = new Date(d).setHours(tod.h, tod.m, 0, 0);
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
      d.setHours(0, 0, 0, 0);
      while (d.getTime() <= endMs + dayMs) {
        const wStartMs = new Date(d).setHours(ws.h, ws.m, 0, 0);
        const wEndMs = new Date(d).setHours(we.h, we.m, 0, 0);
        let t = wStartMs;
        while (t <= wEndMs) {
          if (t >= startMs && t <= endMs) due.push(t);
          t += interval;
        }
        d = new Date(d.getTime() + dayMs);
      }
      return due;
    }

    default:
      return [];
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
