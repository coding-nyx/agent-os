import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { AtlasTask, AtlasHabit, ScheduledTask } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// MonthPlanner — compact month calendar grid with task density indicators
// ---------------------------------------------------------------------------

interface MonthPlannerProps {
  tasks: AtlasTask[];
  scheduledTasks: ScheduledTask[];
  habits: AtlasHabit[];
  onDaySelect?: (date: string) => void;
  selectedDate?: string;
}

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Zero-padded ISO date string "YYYY-MM-DD" from a Date. */
function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Return true when the date portion of two ISO strings match. */
function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * Build the calendar grid for a given month.
 * The grid always starts on Monday (ISO week standard).
 * Leading cells for days before the 1st of the month are null.
 */
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // getDay() returns 0=Sun … 6=Sat; convert to 0=Mon … 6=Sun
  const startDow = (firstDay.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = lastDay.getDate();

  const cells: (Date | null)[] = [];

  // Prefix empty cells
  for (let i = 0; i < startDow; i++) {
    cells.push(null);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  return cells;
}

/** Determine dot colour based on task count. */
function taskDotClass(count: number): string {
  if (count >= 5) return 'bg-rose-400';
  if (count >= 3) return 'bg-amber-400';
  if (count >= 1) return 'bg-emerald-400';
  return '';
}

export function MonthPlanner({
  tasks,
  scheduledTasks,
  habits: _habits,
  onDaySelect,
  selectedDate,
}: MonthPlannerProps) {
  const [viewDate, setViewDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const todayKey = toDateKey(new Date());

  // --- Navigation helpers ---
  const goToPrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // --- Build grid cells ---
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // --- Count tasks per day ---
  const taskCountByDay = useMemo(() => {
    const map = new Map<string, number>();

    for (const st of scheduledTasks) {
      const key = st.scheduledAt.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    for (const t of tasks) {
      if (t.deadline) {
        const key = t.deadline.slice(0, 10);
        // Only count deadline tasks if no scheduled tasks exist for that day
        // (avoids double-counting when both exist)
        if (!map.has(key)) {
          map.set(key, 1);
        }
      }
    }

    return map;
  }, [scheduledTasks, tasks]);

  // --- Header label: "MARCH 2026" ---
  const monthLabel = viewDate
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  return (
    <section aria-label="Month planner" className="space-y-3">
      {/* Month navigation header */}
      <div className="flex items-center justify-between px-1">
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className="p-1.5 h-auto text-white/40 hover:text-white/80"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </NeuralButton>

        <span className="text-xs font-bold tracking-widest text-white/70 font-display">
          {monthLabel}
        </span>

        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          aria-label="Next month"
          className="p-1.5 h-auto text-white/40 hover:text-white/80"
        >
          <ChevronRight className="w-4 h-4" aria-hidden />
        </NeuralButton>
      </div>

      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 gap-1">
        {DOW_LABELS.map((label, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-bold uppercase tracking-wider text-white/30 py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar day cells */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Calendar for ${monthLabel}`}>
        {cells.map((date, idx) => {
          if (!date) {
            // Empty prefix cell
            return <div key={`empty-${idx}`} role="gridcell" aria-hidden="true" />;
          }

          const dateKey = toDateKey(date);
          const isToday = dateKey === todayKey;
          const isSelected = selectedDate ? sameDay(selectedDate, dateKey) : false;
          const taskCount = taskCountByDay.get(dateKey) ?? 0;
          const dotClass = taskDotClass(taskCount);

          return (
            <motion.button
              key={dateKey}
              onClick={() => onDaySelect?.(dateKey)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              role="gridcell"
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${taskCount > 0 ? `, ${taskCount} task${taskCount !== 1 ? 's' : ''}` : ''}${isToday ? ', today' : ''}`}
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'relative aspect-square flex flex-col items-center justify-center rounded-lg text-center transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
                isSelected
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : isToday
                    ? 'text-emerald-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80',
                isToday && !isSelected && 'ring-1 ring-emerald-500/40 rounded-lg',
              )}
            >
              {/* Day number */}
              <span className="text-[11px] sm:text-xs font-bold tabular-nums leading-none">
                {date.getDate()}
              </span>

              {/* Task density dot */}
              {dotClass && (
                <span
                  className={cn(
                    'mt-0.5 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full',
                    dotClass
                  )}
                  aria-hidden="true"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
