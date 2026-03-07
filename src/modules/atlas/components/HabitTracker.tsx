import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Flame,
  Pause,
  AlertTriangle,
  Trophy,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasHabit } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// HabitTracker — Habit list with streak visualization & at-risk detection
// ---------------------------------------------------------------------------

interface HabitTrackerProps {
  habits: AtlasHabit[];
  onComplete: (habitId: string) => void;
  onPause: (habitId: string) => void;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  weekly: 'Weekly',
  custom: 'Custom',
};

/**
 * Determine whether a habit streak is at risk of breaking based on
 * the elapsed time since last completion relative to the expected interval.
 */
function isStreakAtRisk(habit: AtlasHabit): boolean {
  if (habit.status !== 'active' || !habit.lastCompleted) return false;

  const hoursElapsed =
    (Date.now() - new Date(habit.lastCompleted).getTime()) / (1000 * 60 * 60);

  switch (habit.frequency) {
    case 'daily':
    case 'weekdays':
      return hoursElapsed > 20; // warn ~4h before 24h mark
    case 'weekends':
      return hoursElapsed > 44; // warn ~4h before 48h mark
    case 'weekly':
      return hoursElapsed > 144; // warn ~24h before 168h mark
    default:
      return hoursElapsed > 20;
  }
}

/** Check if the habit was already completed today. */
function isCompletedToday(habit: AtlasHabit): boolean {
  if (!habit.lastCompleted) return false;
  return (
    new Date(habit.lastCompleted).toDateString() === new Date().toDateString()
  );
}

export function HabitTracker({
  habits,
  onComplete,
  onPause,
}: HabitTrackerProps) {
  const reducedMotion = useReducedMotion();

  const { activeHabits, pausedHabits } = useMemo(() => {
    const active = habits.filter((h) => h.status === 'active');
    const paused = habits.filter((h) => h.status === 'paused');
    return { activeHabits: active, pausedHabits: paused };
  }, [habits]);

  // ---- Empty state ----
  if (habits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
        <Flame
          className="w-8 h-8 text-white/15 mx-auto mb-2"
          aria-hidden="true"
        />
        <p className="text-sm text-white/40">No habits yet</p>
        <p className="text-xs text-white/20 mt-1">
          Create a habit to start tracking streaks
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="Habit tracker">
      {/* ── Active habits ── */}
      {activeHabits.map((habit, index) => {
        const atRisk = isStreakAtRisk(habit);
        const doneToday = isCompletedToday(habit);

        return (
          <motion.div
            key={habit.id}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.3, delay: index * 0.05 }
            }
            className={cn(
              'group rounded-xl border p-3 transition-colors',
              'bg-white/[0.03] backdrop-blur-sm',
              atRisk && !doneToday && 'border-amber-500/20',
              doneToday && 'border-emerald-500/15 bg-emerald-500/[0.03]',
              !atRisk && !doneToday && 'border-white/10'
            )}
          >
            <div className="flex items-center gap-3">
              {/* Completion checkbox */}
              <button
                onClick={() => !doneToday && onComplete(habit.id)}
                disabled={doneToday}
                aria-label={
                  doneToday
                    ? `${habit.title} completed today`
                    : `Complete ${habit.title} for today`
                }
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
                  doneToday
                    ? 'bg-emerald-500 border-emerald-500 cursor-default'
                    : 'border-white/20 hover:border-emerald-400/50 cursor-pointer'
                )}
              >
                {doneToday && (
                  <Check
                    className="w-3.5 h-3.5 text-white"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Habit title & meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-semibold truncate',
                      doneToday ? 'text-white/50' : 'text-white/85'
                    )}
                  >
                    {habit.title}
                  </span>
                  <span className="text-[10px] text-white/25 font-medium shrink-0">
                    {FREQUENCY_LABELS[habit.frequency] ?? habit.frequency}
                  </span>
                </div>
                {/* Energy cost */}
                <div className="flex items-center gap-1 mt-0.5">
                  <Zap
                    className="w-2.5 h-2.5 text-emerald-400/50"
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-white/25 tabular-nums">
                    {habit.energyCost} energy
                  </span>
                </div>
              </div>

              {/* Streak count with fire icon */}
              <div
                className="flex items-center gap-1.5 shrink-0"
                role="status"
                aria-label={`${habit.currentStreak} day streak${atRisk && !doneToday ? ', at risk' : ''}`}
              >
                {atRisk && !doneToday && (
                  <AlertTriangle
                    className="w-3.5 h-3.5 text-amber-400"
                    aria-hidden="true"
                  />
                )}
                <Flame
                  className={cn(
                    'w-4 h-4',
                    habit.currentStreak > 0 ? 'text-orange-400' : 'text-white/15'
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-sm font-black tabular-nums',
                    habit.currentStreak > 0 ? 'text-orange-300' : 'text-white/20'
                  )}
                >
                  {habit.currentStreak}
                </span>
              </div>

              {/* Best streak — visible on hover or focus-within */}
              <div
                className="hidden group-hover:flex group-focus-within:flex items-center gap-1 shrink-0 ml-1"
                role="status"
                aria-label={`Best streak: ${habit.bestStreak} days`}
              >
                <Trophy
                  className="w-3 h-3 text-amber-400/50"
                  aria-hidden="true"
                />
                <span className="text-[10px] text-amber-400/50 font-bold tabular-nums">
                  {habit.bestStreak}
                </span>
              </div>

              {/* Pause button — appears on hover */}
              <button
                onClick={() => onPause(habit.id)}
                aria-label={`Pause ${habit.title}`}
                className={cn(
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0',
                  'w-7 h-7 rounded-lg flex items-center justify-center',
                  'text-white/20 hover:text-white/40 hover:bg-white/5 transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50'
                )}
              >
                <Pause className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            {/* At-risk warning text */}
            {atRisk && !doneToday && (
              <p
                className="mt-2 ml-9 text-[10px] text-amber-300/60 font-medium"
                role="alert"
              >
                Streak at risk — complete before it resets
              </p>
            )}
          </motion.div>
        );
      })}

      {/* ── Paused habits ── */}
      {pausedHabits.length > 0 && (
        <div className="space-y-2 pt-2">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block">
            Paused
          </span>
          {pausedHabits.map((habit) => (
            <div
              key={habit.id}
              className="rounded-xl border border-white/5 bg-white/[0.01] p-3 opacity-50"
            >
              <div className="flex items-center gap-3">
                <Pause
                  className="w-4 h-4 text-white/20 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm text-white/30 font-medium truncate flex-1">
                  {habit.title}
                </span>
                <span className="text-[10px] text-white/15 shrink-0">
                  {FREQUENCY_LABELS[habit.frequency] ?? habit.frequency}
                </span>
                <span className="text-[10px] text-white/15 tabular-nums shrink-0">
                  Best: {habit.bestStreak}d
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
