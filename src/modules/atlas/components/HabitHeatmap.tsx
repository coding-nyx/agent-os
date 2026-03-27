/**
 * HabitHeatmap — Sprint B
 *
 * Renders a GitHub-style completion heatmap for a single Atlas habit.
 * Pure SVG/div grid — zero chart library dependencies.
 *
 * Grid layout: week-columns (left = oldest, right = newest),
 *              day-rows (top = Mon, bottom = Sun).
 *
 * Completion data sourced from (in priority order):
 *   1. habit.completionLog  — explicit ISO date strings
 *   2. habit.logs           — coerced to boolean per entry
 *   3. habit.lastCompleted  — marks the single most-recent day
 */

import React, { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { AtlasHabit } from '../services/atlas-profile-service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HabitHeatmapProps {
  habit: AtlasHabit;
}

interface CellData {
  /** YYYY-MM-DD */
  date: string;
  completed: boolean;
  /** Date is strictly after today — no data possible */
  isFuture: boolean;
}

interface MonthLabel {
  weekIndex: number;
  label: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CELL_PX = 10;
const GAP_PX = 2;
const STEP = CELL_PX + GAP_PX;

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Mon=0 … Sun=6 labels (single char shown for even-indexed rows) */
const DAY_INITIALS = ['M', '', 'W', '', 'F', '', 'S'] as const;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Normalise a Date to midnight-local then return YYYY-MM-DD. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build the set of completed YYYY-MM-DD dates from all habit data sources. */
function buildCompletedSet(habit: AtlasHabit): Set<string> {
  const s = new Set<string>();

  // 1. Explicit completion log
  habit.completionLog?.forEach((iso) => {
    if (iso) s.add(iso.slice(0, 10));
  });

  // 2. Generic logs: mark as complete when value is truthy / non-zero
  habit.logs?.forEach(({ date, value }) => {
    if (
      value !== 0 &&
      value !== '0' &&
      value !== ''
    ) {
      s.add(date.slice(0, 10));
    }
  });

  // 3. lastCompleted as a fallback single data-point
  if (habit.lastCompleted) {
    s.add(habit.lastCompleted.slice(0, 10));
  }

  return s;
}

/**
 * Count consecutive completed days going back from (and including) today.
 * Time complexity: O(streak length) — typically trivial.
 */
function calcCurrentStreak(completed: Set<string>): number {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;

  while (completed.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ─── Grid builder ────────────────────────────────────────────────────────────

interface GridData {
  cells: CellData[][];      // cells[weekCol][dayRow]
  monthLabels: MonthLabel[];
  streak: number;
}

/**
 * Builds the cell matrix for `weekCount` weeks.
 *
 * The grid always starts on the Monday of the oldest week and the rightmost
 * column is the Monday-Sunday week that contains today.
 *
 * Complexity: O(weekCount × 7) — O(n) on grid size.
 */
function buildGridData(habit: AtlasHabit, weekCount: number): GridData {
  const completed = buildCompletedSet(habit);
  const streak = calcCurrentStreak(completed);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  // Monday of the current week (ISO: Mon = day 1)
  const dow = today.getDay(); // 0=Sun … 6=Sat
  const daysFromMonday = (dow + 6) % 7; // 0=Mon … 6=Sun
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysFromMonday);

  // Oldest Monday in the grid
  const gridStart = new Date(currentMonday);
  gridStart.setDate(currentMonday.getDate() - (weekCount - 1) * 7);

  const cells: CellData[][] = [];
  const monthLabels: MonthLabel[] = [];
  let lastSeenMonth = -1;

  for (let w = 0; w < weekCount; w++) {
    const weekCells: CellData[] = [];

    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      const dateStr = toDateStr(date);
      const isFuture = dateStr > todayStr;

      weekCells.push({
        date: dateStr,
        completed: !isFuture && completed.has(dateStr),
        isFuture,
      });
    }
    cells.push(weekCells);

    // Emit a month label when we cross into a new month
    const weekStartDate = new Date(gridStart);
    weekStartDate.setDate(gridStart.getDate() + w * 7);
    const month = weekStartDate.getMonth();

    if (month !== lastSeenMonth) {
      monthLabels.push({ weekIndex: w, label: MONTH_ABBR[month] });
      lastSeenMonth = month;
    }
  }

  return { cells, monthLabels, streak };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HabitHeatmap({ habit }: HabitHeatmapProps) {
  const [showFullYear, setShowFullYear] = useState(false);
  const weekCount = showFullYear ? 52 : 12;

  const { cells, monthLabels, streak } = useMemo(
    () => buildGridData(habit, weekCount),
    [habit, weekCount],
  );

  // Total pixel width of the week columns (without the day-label gutter)
  const gridWidth = weekCount * STEP - GAP_PX;
  // Day-label gutter width
  const gutterWidth = 18;

  return (
    <div className="bg-white/[0.045] border border-white/10 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] truncate max-w-[180px]">
          {habit.title}
        </span>
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={() => setShowFullYear((v) => !v)}
          className="shrink-0 text-[11px] text-[var(--module-color-400)] hover:text-[var(--module-color-300)] font-bold transition-colors ml-2"
          aria-label={showFullYear ? 'Show 12 weeks' : 'Show full year'}
        >
          {showFullYear ? 'Show 12 weeks' : 'Show full year'}
        </NeuralButton>
      </div>

      {/* Scrollable heatmap area */}
      <div className="overflow-x-auto no-scrollbar">
        <div style={{ width: gutterWidth + gridWidth + 'px', minWidth: 'min-content' }}>
          {/* Month labels row */}
          <div className="flex mb-1">
            {/* Spacer aligns with the day-label gutter */}
            <div style={{ width: gutterWidth + 'px', flexShrink: 0 }} />
            <div className="relative" style={{ height: '14px', flex: '1 1 auto' }}>
              {monthLabels.map(({ weekIndex, label }) => (
                <span
                  key={`${label}-${weekIndex}`}
                  className="absolute text-[11px] text-white/40 font-medium leading-none"
                  style={{ left: weekIndex * STEP + 'px' }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Grid: day-label gutter + week columns */}
          <div className="flex" style={{ gap: '0px' }}>
            {/* Day-of-week labels */}
            <div
              className="flex flex-col shrink-0 mr-[2px]"
              style={{ gap: GAP_PX + 'px' }}
              aria-hidden="true"
            >
              {DAY_INITIALS.map((label, i) => (
                <div
                  key={i}
                  className="text-[11px] text-white/30 leading-none flex items-center"
                  style={{ width: gutterWidth - 2 + 'px', height: CELL_PX + 'px' }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div
              className="flex"
              style={{ gap: GAP_PX + 'px' }}
              role="grid"
              aria-label={`Habit completion heatmap for ${habit.title}`}
            >
              {cells.map((week, wIdx) => (
                <div
                  key={wIdx}
                  className="flex flex-col"
                  style={{ gap: GAP_PX + 'px' }}
                  role="row"
                >
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      role="gridcell"
                      title={
                        cell.isFuture
                          ? cell.date
                          : `${cell.date} — ${cell.completed ? 'Completed' : 'Missed'}`
                      }
                      style={{ width: CELL_PX + 'px', height: CELL_PX + 'px' }}
                      className={cn(
                        'rounded-sm',
                        cell.isFuture
                          ? 'bg-white/[0.045]'
                          : cell.completed
                            ? 'bg-[var(--module-color-500)]/80'
                            : 'bg-white/[0.045]',
                      )}
                      aria-label={
                        cell.isFuture
                          ? `${cell.date} (future)`
                          : `${cell.date}: ${cell.completed ? 'completed' : 'missed'}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Streak counter */}
      <div className="mt-3 flex items-center gap-1.5">
        <Flame
          className={cn(
            'w-3.5 h-3.5',
            streak > 0 ? 'text-orange-400' : 'text-white/20',
          )}
          aria-hidden="true"
        />
        <span className="text-xs text-white/60 font-medium">
          {streak > 0 ? `${streak} day streak` : 'No active streak'}
        </span>
      </div>
    </div>
  );
}
