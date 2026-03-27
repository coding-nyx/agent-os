import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
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

  const habitListRef = useRef<HTMLDivElement>(null);
  const habitVirtualizer = useVirtualizer({
    count: activeHabits.length,
    getScrollElement: () => habitListRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  // ---- Empty state ----
  if (habits.length === 0) {
    return (
      <EmptyState
        title="No habits yet"
        description="Create a habit to start tracking streaks"
        icon={Flame}
        size="sm"
      />
    );
  }

  return (
    <section className="space-y-3" aria-label="Habit tracker">
      {/* ── Active habits ── */}
      <div ref={habitListRef} className="overflow-y-auto max-h-[500px]">
        <div style={{ height: habitVirtualizer.getTotalSize(), position: 'relative' }}>
          {habitVirtualizer.getVirtualItems().map(vitem => {
            const habit = activeHabits[vitem.index];
            const atRisk = isStreakAtRisk(habit);
            const doneToday = isCompletedToday(habit);

            return (
              <div
                key={vitem.key}
                style={{ position: 'absolute', top: vitem.start, left: 0, right: 0, paddingBottom: 8 }}
              >
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { duration: 0.3, delay: 0 }
                  }
                  className={cn(
                    'group rounded-xl border p-3 transition-colors',
                    'bg-white/[0.045] backdrop-blur-sm',
                    atRisk && !doneToday && 'border-amber-500/20',
                    doneToday && 'border-emerald-500/15 bg-emerald-500/[0.03]',
                    !atRisk && !doneToday && 'border-white/[0.12]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Completion checkbox */}
                    <NeuralButton
                      onClick={() => !doneToday && onComplete(habit.id)}
                      disabled={doneToday}
                      aria-label={
                        doneToday
                          ? `${habit.title} completed today`
                          : `Complete ${habit.title} for today`
                      }
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'flex-shrink-0 w-6 h-6 min-w-0 !p-0 rounded-lg border-2 flex items-center justify-center transition-all min-h-[44px]',
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
                    </NeuralButton>

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
                        <span className="text-[11px] text-white/25 font-medium shrink-0">
                          {FREQUENCY_LABELS[habit.frequency] ?? habit.frequency}
                        </span>
                      </div>
                      {/* Energy cost */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <Zap
                          className="w-2.5 h-2.5 text-emerald-400/50"
                          aria-hidden="true"
                        />
                        <span className="text-[11px] text-white/25 tabular-nums">
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
                      <span className="text-[11px] text-amber-400/50 font-bold tabular-nums">
                        {habit.bestStreak}
                      </span>
                    </div>

                    {/* Pause button — appears on hover */}
                    <NeuralButton
                      onClick={() => onPause(habit.id)}
                      aria-label={`Pause ${habit.title}`}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0',
                        'w-7 h-7 min-w-0 !p-0 rounded-lg flex items-center justify-center min-h-[44px]',
                        'text-white/20 hover:text-white/40 hover:bg-white/[0.045] transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]'
                      )}
                    >
                      <Pause className="w-3 h-3" aria-hidden="true" />
                    </NeuralButton>
                  </div>

                  {/* At-risk warning text */}
                  {atRisk && !doneToday && (
                    <p
                      className="mt-2 ml-9 text-[11px] text-amber-300/60 font-medium"
                      role="alert"
                    >
                      Streak at risk — complete before it resets
                    </p>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Paused habits ── */}
      {pausedHabits.length > 0 && (
        <div className="space-y-2 pt-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/20 block">
            Paused
          </span>
          {pausedHabits.map((habit) => (
            <NeuralButton
              key={habit.id}
              onClick={() => onPause(habit.id)}
              variant="secondary"
              className="w-full !justify-start !p-3 opacity-50 hover:opacity-100 !h-auto group"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-6 h-6 flex items-center justify-center">
                  <Pause
                    className="w-3.5 h-3.5 text-white/40 group-hover:text-emerald-400 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <span className="text-sm text-white/30 font-medium truncate flex-1">
                  {habit.title}
                </span>
                <span className="text-[11px] text-emerald-400/40 font-black uppercase tracking-widest hidden group-hover:inline">
                   RESUME
                </span>
                <span className="text-[11px] text-white/15 shrink-0 group-hover:hidden">
                  {FREQUENCY_LABELS[habit.frequency] ?? habit.frequency}
                </span>
                <span className="text-[11px] text-white/15 tabular-nums shrink-0 group-hover:hidden">
                  Best: {habit.bestStreak}d
                </span>
              </div>
            </NeuralButton>
          ))}
        </div>
      )}
    </section>
  );
}
