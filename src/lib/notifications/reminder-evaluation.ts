import type { Recurrence } from './types';

function parseHHmm(value: unknown): { h: number; m: number } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function toDateMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// Deterministic, pure-JS hash for stable occurrence ids (no crypto dependencies).
// (FNV-1a 32-bit)
export function hashOccurrenceId(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function computeDueEveryNDays(rec: Extract<Recurrence, { kind: 'every_n_days' }>, rangeStartMs: number, rangeEndMs: number): number[] {
  const dtStartMs = toDateMs(rec.dtStart);
  if (dtStartMs === null) return [];
  const intervalMs = rec.intervalDays * 86400 * 1000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const startK = Math.floor((rangeStartMs - dtStartMs) / intervalMs) - 2;
  const endK = Math.ceil((rangeEndMs - dtStartMs) / intervalMs) + 2;

  const due: number[] = [];
  for (let k = startK; k <= endK; k++) {
    const dueAtMs = dtStartMs + k * intervalMs;
    if (dueAtMs < 0) continue;
    if (dueAtMs >= rangeStartMs && dueAtMs <= rangeEndMs) due.push(dueAtMs);
  }
  return due;
}

function computeDueHourly(rec: Extract<Recurrence, { kind: 'hourly' }>, rangeStartMs: number, rangeEndMs: number): number[] {
  const dtStartMs = toDateMs(rec.dtStart);
  if (dtStartMs === null) return [];
  const intervalMs = rec.intervalHours * 3600000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const startK = Math.floor((rangeStartMs - dtStartMs) / intervalMs) - 2;
  const endK = Math.ceil((rangeEndMs - dtStartMs) / intervalMs) + 2;

  const due: number[] = [];
  for (let k = startK; k <= endK; k++) {
    const dueAtMs = dtStartMs + k * intervalMs;
    if (dueAtMs < 0) continue;
    if (dueAtMs >= rangeStartMs && dueAtMs <= rangeEndMs) due.push(dueAtMs);
  }
  return due;
}

function computeDueWeeklyByDays(
  rec: Extract<Recurrence, { kind: 'weekly_by_days' }>,
  rangeStartMs: number,
  rangeEndMs: number,
): number[] {
  const startAtMs = toDateMs(rec.startAt);
  if (startAtMs === null) return [];
  const time = parseHHmm(rec.timeOfDay);
  if (!time) return [];
  if (!Array.isArray(rec.daysOfWeek) || rec.daysOfWeek.length === 0) return [];

  const days = rec.daysOfWeek.filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
  if (days.length === 0) return [];

  const anchorDate = new Date(startAtMs);
  const anchorWeekIndex = Math.floor(anchorDate.getTime() / (7 * 86400 * 1000));

  const due: number[] = [];
  const startDay = new Date(rangeStartMs);
  const endDay = new Date(rangeEndMs);
  startDay.setUTCDate(startDay.getUTCDate() - 7);
  endDay.setUTCDate(endDay.getUTCDate() + 7);

  const startUTC = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate());
  const endUTC = Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate());

  for (let t = startUTC; t <= endUTC; t += 86400 * 1000) {
    const date = new Date(t);
    const dayIdx = date.getUTCDay();
    if (!days.includes(dayIdx)) continue;

    const candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.h, time.m, 0, 0);
    if (candidate < startAtMs) continue;
    if (candidate < rangeStartMs || candidate > rangeEndMs) continue;

    if (rec.intervalWeeks && rec.intervalWeeks > 1) {
      const weekIndex = Math.floor(candidate / (7 * 86400 * 1000));
      if ((weekIndex - anchorWeekIndex) % rec.intervalWeeks !== 0) continue;
    }

    due.push(candidate);
  }

  return due;
}

function computeDueDailyWindow(rec: Extract<Recurrence, { kind: 'daily_window' }>, rangeStartMs: number, rangeEndMs: number): number[] {
  const startAtMs = toDateMs(rec.startAt);
  if (startAtMs === null) return [];
  const startTime = parseHHmm(rec.windowStart);
  const endTime = parseHHmm(rec.windowEnd);
  if (!startTime || !endTime) return [];
  if (!rec.intervalMinutes || rec.intervalMinutes <= 0) return [];

  const due: number[] = [];

  const startDay = new Date(rangeStartMs);
  const endDay = new Date(rangeEndMs);
  startDay.setUTCDate(startDay.getUTCDate() - 2);
  endDay.setUTCDate(endDay.getUTCDate() + 2);

  const startUTC = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate());
  const endUTC = Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate());

  for (let t = startUTC; t <= endUTC; t += 86400 * 1000) {
    const date = new Date(t);
    const candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startTime.h, startTime.m, 0, 0);
    if (candidate < startAtMs) continue;
    if (candidate < rangeStartMs || candidate > rangeEndMs) continue;

    const candidateEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), endTime.h, endTime.m, 0, 0);
    if (candidate <= candidateEnd) due.push(candidate);
  }

  return due;
}

export function computeDueOccurrencesInRange(
  recurrence: unknown,
  rangeStartMs: number,
  rangeEndMs: number,
): number[] {
  const rec = recurrence as Recurrence | undefined;
  if (!rec || typeof rec !== 'object' || !('kind' in rec)) return [];

  if (rec.kind === 'every_n_days') return computeDueEveryNDays(rec, rangeStartMs, rangeEndMs);
  if (rec.kind === 'hourly') return computeDueHourly(rec, rangeStartMs, rangeEndMs);
  if (rec.kind === 'weekly_by_days') return computeDueWeeklyByDays(rec, rangeStartMs, rangeEndMs);
  if (rec.kind === 'daily_window') return computeDueDailyWindow(rec, rangeStartMs, rangeEndMs);
  // Phase 1: RRULE parsing is a later phase.
  return [];
}

