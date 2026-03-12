/**
 * HabitMomentumChart — 30-day rolling momentum visualisation
 *
 * Renders an area-sparkline per active habit showing 7-day rolling completion
 * rates across the last 30 days, plus a trend indicator and an accordion-style
 * detail drawer.
 *
 * Zero external chart dependencies — pure SVG.
 * Time complexity per habit: O(n) where n = habitRecords.length.
 */

import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AtlasHabit } from '../services/atlas-profile-service';
import type { HabitRecord } from '@/lib/types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HabitMomentumChartProps {
  habits: AtlasHabit[];
  habitRecords: HabitRecord[];
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function getMomentumColor(rate: number): string {
  if (rate >= 0.8) return '#34d399'; // emerald-400
  if (rate >= 0.5) return '#fbbf24'; // amber-400
  return '#f87171';                  // red-400
}

function getMomentumTextClass(rate: number): string {
  if (rate >= 0.8) return 'text-emerald-400';
  if (rate >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

/** Return a YYYY-MM-DD string for a Date. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the set of completed YYYY-MM-DD dates for a single habit,
 * merging all available data sources (same strategy as HabitHeatmap).
 */
function buildCompletedSet(habit: AtlasHabit, records: HabitRecord[]): Set<string> {
  const s = new Set<string>();

  // 1. Explicit completion log (Sprint-B primary source)
  habit.completionLog?.forEach((iso) => {
    if (iso) s.add(iso.slice(0, 10));
  });

  // 2. Generic log entries — truthy value = completed
  habit.logs?.forEach(({ date, value }) => {
    if (value !== 0 && value !== '0' && value !== '') {
      s.add(date.slice(0, 10));
    }
  });

  // 3. lastCompleted single-date fallback
  if (habit.lastCompleted) s.add(habit.lastCompleted.slice(0, 10));

  // 4. HabitRecord entries for this habit
  records
    .filter((r) => r.habitId === habit.id && r.completed)
    .forEach((r) => s.add(r.loggedAt.slice(0, 10)));

  return s;
}

/**
 * Returns the expected number of completions in `days` calendar days for
 * the given habit frequency.
 *
 * Uses whole-number rounding; minimum 1 to prevent division-by-zero.
 */
function getExpected(habit: AtlasHabit, days: number): number {
  let raw: number;
  switch (habit.frequency) {
    case 'daily':
      raw = days;
      break;
    case 'weekdays':
      raw = Math.round(days * 5 / 7);
      break;
    case 'weekends':
      raw = Math.round(days * 2 / 7);
      break;
    case 'weekly':
      raw = Math.max(1, Math.round(days / 7));
      break;
    case 'custom':
      raw = habit.customDays && habit.customDays.length > 0
        ? Math.round((habit.customDays.length / 7) * days)
        : Math.round(days / 2);
      break;
    default:
      raw = days;
  }
  return Math.max(1, raw);
}

/**
 * Generates an array of `DAYS` YYYY-MM-DD strings ending on today (inclusive).
 * Index 0 = oldest, index DAYS-1 = today.
 */
function buildDateRange(days: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(toDateStr(d));
  }
  return result;
}

/**
 * Computes the completion rate for a slice of `dates`.
 * Rate is capped at 1.0; returns 0.0 if expectedCompletions = 0.
 */
function rateForDates(
  dates: string[],
  completedSet: Set<string>,
  expected: number,
): number {
  if (expected === 0) return 0;
  const completed = dates.filter((d) => completedSet.has(d)).length;
  return Math.min(1.0, completed / expected);
}

/**
 * Computes a 7-day rolling average for each of the 30 positions.
 * Each value is the rate in the [max(0, i-6)…i] window.
 *
 * Time complexity: O(DAYS * windowSize) = O(30 * 7) = O(1) amortised.
 */
function computeSparklinePoints(
  dates: string[],
  completedSet: Set<string>,
  habit: AtlasHabit,
): number[] {
  return dates.map((_, i) => {
    const windowDates = dates.slice(Math.max(0, i - 6), i + 1);
    const windowExpected = getExpected(habit, windowDates.length);
    return rateForDates(windowDates, completedSet, windowExpected);
  });
}

// ─── SVG path builder ─────────────────────────────────────────────────────────

/**
 * Builds an SVG path string for 30 points on a 120×24 canvas.
 * x ∈ [0, 120], y ∈ [0, 24] (inverted: rate=1 → y≈1, rate=0 → y≈23).
 *
 * Uses plain `L` segments as specified (no Bézier curves).
 *
 * @param isArea - when true, closes the path at the bottom for the fill polygon.
 */
function buildPath(points: number[], isArea: boolean): string {
  if (points.length === 0) return '';

  const n = points.length;
  // Map indices to x ∈ [0,120]
  // Map rate (0..1) to y ∈ [1..23] (inverted, 1px top/bottom padding within 24px)
  const segments = points.map((val, i) => {
    const x = parseFloat(((i / (n - 1)) * 120).toFixed(2));
    const y = parseFloat((23 - val * 22).toFixed(2)); // 1 → 1, 0 → 23
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  });

  const path = segments.join(' ');

  if (isArea) {
    const lastX = parseFloat(((n - 1) / (n - 1) * 120).toFixed(2));
    return `${path} L ${lastX},24 L 0,24 Z`;
  }

  return path;
}

// ─── Streak helper ────────────────────────────────────────────────────────────

function calcStreak(completedSet: Set<string>): number {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;
  while (completedSet.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ─── Best / worst week helpers ────────────────────────────────────────────────

interface WeekStat {
  label: string; // e.g. "Jun 1–7"
  rate: number;
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function formatWeekRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
}

function computeWeekStats(
  dates: string[],
  completedSet: Set<string>,
  habit: AtlasHabit,
): { best: WeekStat; worst: WeekStat } {
  const weeks: WeekStat[] = [];
  for (let i = 0; i + 6 < dates.length; i += 7) {
    const window = dates.slice(i, i + 7);
    const exp = getExpected(habit, 7);
    const rate = rateForDates(window, completedSet, exp);
    weeks.push({
      label: formatWeekRange(window[0], window[6]),
      rate,
    });
  }
  // Handle partial last window if dates.length isn't divisible by 7
  const rem = dates.length % 7;
  if (rem > 0) {
    const window = dates.slice(dates.length - rem);
    const exp = getExpected(habit, rem);
    weeks.push({
      label: formatWeekRange(window[0], window[window.length - 1]),
      rate: rateForDates(window, completedSet, exp),
    });
  }

  if (weeks.length === 0) {
    return { best: { label: '—', rate: 0 }, worst: { label: '—', rate: 0 } };
  }

  const sorted = [...weeks].sort((a, b) => b.rate - a.rate);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

/** Count days missed (expected but not completed) in the current calendar month. */
function daysMissedThisMonth(
  completedSet: Set<string>,
  habit: AtlasHabit,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const monthDates: string[] = [];
  const cursor = new Date(firstOfMonth);
  while (cursor <= today) {
    monthDates.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const expected = getExpected(habit, monthDates.length);
  const completed = monthDates.filter((d) => completedSet.has(d)).length;
  return Math.max(0, expected - completed);
}

// ─── Per-habit data record ────────────────────────────────────────────────────

interface HabitMomentumEntry {
  habit: AtlasHabit;
  completedDays: number;
  expectedDays: number;
  rate: number;
  currentRate: number;
  previousRate: number;
  delta: number;
  sparklinePoints: number[];
  strokePath: string;
  fillPath: string;
  streak: number;
  best: WeekStat;
  worst: WeekStat;
  missedThisMonth: number;
  dates30: string[];
}

/**
 * Derives all chart data for a single habit.
 * Time complexity: O(R + 30) where R = habitRecords.length for this habit.
 */
function buildEntry(habit: AtlasHabit, records: HabitRecord[]): HabitMomentumEntry {
  const completedSet = buildCompletedSet(habit, records);
  const dates30 = buildDateRange(30);

  const completedDays = dates30.filter((d) => completedSet.has(d)).length;
  const expectedDays = getExpected(habit, 30);
  const rate = Math.min(1.0, completedDays / expectedDays);

  // Split into two 14-day windows: current [0..13] = last 14 days, previous [14..27]
  const datesLast14 = buildDateRange(14);
  const datesPrev14 = buildDateRange(28).slice(0, 14); // days 15–28 ago

  const currentRate = rateForDates(datesLast14, completedSet, getExpected(habit, 14));
  const previousRate = rateForDates(datesPrev14, completedSet, getExpected(habit, 14));
  const delta = (currentRate - previousRate) * 100;

  const sparklinePoints = computeSparklinePoints(dates30, completedSet, habit);
  const strokePath = buildPath(sparklinePoints, false);
  const fillPath = buildPath(sparklinePoints, true);

  const streak = calcStreak(completedSet);
  const { best, worst } = computeWeekStats(dates30, completedSet, habit);
  const missedThisMonth = daysMissedThisMonth(completedSet, habit);

  return {
    habit,
    completedDays,
    expectedDays,
    rate,
    currentRate,
    previousRate,
    delta,
    sparklinePoints,
    strokePath,
    fillPath,
    streak,
    best,
    worst,
    missedThisMonth,
    dates30,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SparklineProps {
  entry: HabitMomentumEntry;
}

function Sparkline({ entry }: SparklineProps) {
  const color = getMomentumColor(entry.rate);
  const gradientId = `fill-${entry.habit.id}`;

  return (
    <svg
      width="100%"
      height="24"
      viewBox="0 0 120 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={entry.fillPath}
        fill={`url(#${gradientId})`}
        stroke="none"
      />

      {/* Stroke line */}
      <path
        d={entry.strokePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TrendIconProps {
  delta: number;
}

function TrendIcon({ delta }: TrendIconProps) {
  if (delta > 5) {
    return <TrendingUp className="w-3 h-3 text-emerald-400" aria-label="Trending up" />;
  }
  if (delta < -5) {
    return <TrendingDown className="w-3 h-3 text-red-400" aria-label="Trending down" />;
  }
  return <Minus className="w-3 h-3 text-white/30" aria-label="Stable" />;
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/50">{label}</span>
      <span className="text-[10px] text-white/80 font-semibold">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HabitMomentumChart({ habits, habitRecords }: HabitMomentumChartProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Only process active habits — paused/archived don't need momentum display
  const activeHabits = useMemo(
    () => habits.filter((h) => h.status === 'active'),
    [habits],
  );

  const entries = useMemo(
    () => activeHabits.map((h) => buildEntry(h, habitRecords)),
    [activeHabits, habitRecords],
  );

  if (entries.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
          30-Day Momentum
        </span>
        <span className="text-[9px] text-white/20">rolling avg</span>
      </div>

      {entries.map((entry) => {
        const { habit, completedDays, expectedDays, rate, delta, streak, best, worst, missedThisMonth } = entry;
        const isExpanded = expandedId === habit.id;
        const hasNoData = completedDays === 0 && expectedDays > 0;
        const isLowData = completedDays > 0 && completedDays < 7;

        return (
          <div key={habit.id}>
            {/* ── Habit row ── */}
            <div
              role="button"
              aria-expanded={isExpanded}
              tabIndex={0}
              className="min-h-[40px] py-2 flex items-center gap-2 md:gap-3 cursor-pointer select-none rounded-lg px-1 hover:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
              onClick={() => setExpandedId(isExpanded ? null : habit.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedId(isExpanded ? null : habit.id);
                }
              }}
            >
              {/* Habit name */}
              <span className="text-xs font-medium text-white/70 truncate w-20 md:w-28 shrink-0">
                {habit.title}
              </span>

              {/* Sparkline or empty state skeleton */}
              {hasNoData ? (
                <div className="flex-1 h-6 rounded bg-white/[0.05] animate-pulse" />
              ) : (
                <div className="flex-1 min-w-0">
                  <Sparkline entry={entry} />
                </div>
              )}

              {/* Percentage + trend icon */}
              <div className="flex items-center justify-end gap-1 shrink-0 w-14 md:w-16">
                {hasNoData ? (
                  <span className="text-[10px] text-white/20 shrink-0 w-16 text-right">
                    No data
                  </span>
                ) : isLowData ? (
                  <span className="text-[10px] text-white/20 shrink-0 w-16 text-right italic">
                    {completedDays}d logged
                  </span>
                ) : (
                  <>
                    <span className={`text-[10px] font-semibold tabular-nums ${getMomentumTextClass(rate)}`}>
                      {Math.round(rate * 100)}%
                    </span>
                    <TrendIcon delta={delta} />
                  </>
                )}
              </div>
            </div>

            {/* ── Accordion detail drawer ── */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key={`detail-${habit.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="border-l border-white/10 ml-2 pl-2 space-y-1 pb-2">
                    <DetailRow
                      label="Best week"
                      value={`${best.label} · ${Math.round(best.rate * 100)}%`}
                    />
                    <DetailRow
                      label="Worst week"
                      value={`${worst.label} · ${Math.round(worst.rate * 100)}%`}
                    />
                    <DetailRow
                      label="Missed this month"
                      value={`${missedThisMonth}d`}
                    />
                    <DetailRow
                      label="Current streak"
                      value={`🔥 ${streak}`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
