import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type {
  AtlasTask,
  ScheduledTask,
  AtlasHabit,
} from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// WeekGrid — 7-day planning grid with energy load & habit dots
// ---------------------------------------------------------------------------

interface WeekGridProps {
  tasks: AtlasTask[];
  scheduledTasks: ScheduledTask[];
  habits: AtlasHabit[];
  onDaySelect: (date: string) => void;
  selectedDate?: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DAILY_ENERGY = 10;

/** Return the Monday of the week containing the given date. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

function getLoadColor(percent: number): {
  bar: string;
  text: string;
  border: string;
} {
  if (percent > 80)
    return {
      bar: 'bg-rose-400',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
    };
  if (percent > 60)
    return {
      bar: 'bg-amber-400',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
    };
  return {
    bar: 'bg-emerald-400',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  };
}

interface DayStats {
  taskCount: number;
  completedCount: number;
  energyUsed: number;
  hasRecovery: boolean;
}

export function WeekGrid({
  tasks,
  scheduledTasks,
  habits,
  onDaySelect,
  selectedDate,
}: WeekGridProps) {
  const reducedMotion = useReducedMotion();
  const todayKey = toDateKey(new Date());

  // Build the 7-day array starting at Monday
  const weekDays = useMemo(() => {
    const monday = getMonday(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const dateKey = toDateKey(d);
      return {
        date: dateKey,
        dayLabel: DAY_LABELS[i],
        dayOfMonth: d.getDate(),
        isToday: dateKey === todayKey,
      };
    });
  }, [todayKey]);

  // Aggregate stats per day
  const dayStats = useMemo(() => {
    const stats = new Map<string, DayStats>();

    for (const day of weekDays) {
      const dayScheduled = scheduledTasks.filter((st) =>
        isSameDay(st.scheduledAt, day.date)
      );
      const dayDeadline = tasks.filter(
        (t) => t.deadline && isSameDay(t.deadline, day.date)
      );

      const totalTasks = Math.max(dayScheduled.length, dayDeadline.length);
      const completed = dayScheduled.filter(
        (st) => st.status === 'done'
      ).length;
      const energy = dayScheduled.reduce((sum, st) => sum + st.energyCost, 0);
      const hasRecovery = dayScheduled.some(
        (st) => st.blockedBy === 'recovery'
      );

      stats.set(day.date, {
        taskCount: totalTasks,
        completedCount: completed,
        energyUsed: energy,
        hasRecovery,
      });
    }

    return stats;
  }, [weekDays, scheduledTasks, tasks]);

  // Map habit completions per day (based on lastCompleted timestamp)
  const habitCompletions = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const day of weekDays) {
      const completed: string[] = [];
      for (const habit of habits) {
        if (
          habit.lastCompleted &&
          isSameDay(habit.lastCompleted, day.date)
        ) {
          completed.push(habit.id);
        }
      }
      map.set(day.date, completed);
    }

    return map;
  }, [weekDays, habits]);

  const activeHabits = useMemo(
    () => habits.filter((h) => h.status === 'active').slice(0, 5),
    [habits]
  );

  return (
    <section aria-label="Week planning grid" className="space-y-3">
      {/* Responsive layout: horizontal scroll on mobile, 7-col grid on md+ */}
      <div
        className="flex md:grid md:grid-cols-7 gap-2 overflow-x-auto md:overflow-visible no-scrollbar snap-x snap-mandatory md:snap-none pb-2 md:pb-0"
        role="grid"
        aria-label="Weekly schedule"
      >
        {weekDays.map((day) => {
          const stats = dayStats.get(day.date);
          const loadPercent = stats
            ? Math.min(100, (stats.energyUsed / MAX_DAILY_ENERGY) * 100)
            : 0;
          const colors = getLoadColor(loadPercent);
          const isSelected = selectedDate === day.date;
          const habitsDone = habitCompletions.get(day.date) || [];

          return (
            <motion.button
              key={day.date}
              onClick={() => onDaySelect(day.date)}
              whileHover={reducedMotion ? undefined : { scale: 1.02 }}
              whileTap={reducedMotion ? undefined : { scale: 0.98 }}
              role="gridcell"
              aria-label={`${day.dayLabel} ${day.dayOfMonth}. ${stats?.taskCount ?? 0} tasks, ${Math.round(loadPercent)}% energy load${day.isToday ? ', today' : ''}`}
              aria-selected={isSelected}
              className={cn(
                // Fixed width on mobile for 3-visible-days, flexible on md+
                'min-w-[calc(33.333%-0.375rem)] md:min-w-0 flex-shrink-0 md:flex-shrink snap-start',
                'relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
                'bg-white/[0.03] backdrop-blur-sm',
                isSelected &&
                  'border-emerald-500/30 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20',
                !isSelected && 'border-white/5 hover:border-white/10'
              )}
            >
              {/* Day label */}
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider',
                  day.isToday ? 'text-emerald-400' : 'text-white/40'
                )}
              >
                {day.dayLabel}
              </span>

              {/* Day number */}
              <span
                className={cn(
                  'text-lg font-black tabular-nums',
                  day.isToday ? 'text-emerald-400' : 'text-white/80'
                )}
              >
                {day.dayOfMonth}
              </span>

              {/* Habit completion dots */}
              {activeHabits.length > 0 && (
                <div
                  className="flex items-center gap-0.5"
                  aria-label={`${habitsDone.length} of ${activeHabits.length} habits completed`}
                >
                  {activeHabits.map((habit) => (
                    <div
                      key={habit.id}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-colors',
                        habitsDone.includes(habit.id)
                          ? 'bg-emerald-400'
                          : 'bg-white/10'
                      )}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}

              {/* Day stats */}
              <div className="w-full space-y-1.5 mt-1">
                {/* Task count */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/30">Tasks</span>
                  <span className="text-white/60 font-bold tabular-nums">
                    {stats?.completedCount ?? 0}/{stats?.taskCount ?? 0}
                  </span>
                </div>

                {/* Energy load bar */}
                <div
                  className="h-1 w-full bg-white/5 rounded-full overflow-hidden"
                  role="meter"
                  aria-label={`Energy load: ${Math.round(loadPercent)}%`}
                  aria-valuenow={Math.round(loadPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className={cn('h-full rounded-full', colors.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${loadPercent}%` }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                    }
                  />
                </div>

                {/* Load percentage label */}
                <span
                  className={cn(
                    'text-[9px] font-bold tabular-nums block text-center',
                    colors.text
                  )}
                >
                  {Math.round(loadPercent)}%
                </span>
              </div>

              {/* Recovery indicator dot */}
              {stats?.hasRecovery && (
                <div
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400/60"
                  role="img"
                  aria-label="Recovery window scheduled"
                />
              )}

              {/* Today underline accent */}
              {day.isToday && (
                <div
                  className="absolute -bottom-px left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-400 rounded-full"
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
