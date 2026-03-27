/**
 * ProgressTab — Personal Records, weekly volume trends, and session history.
 *
 * All data is derived purely from `TitanProfile.workoutSessions` and
 * `TitanProfile.personalRecords`; no charting libraries are used.
 *
 * Complexity notes:
 *   - PR computation:  O(S × E × R)  where S = sessions, E = exercises/session, R = sets/exercise
 *   - Volume grouping: O(S × E × R)  single-pass with a hash map keyed by ISO week
 *   - Session sort:    O(S log S)     standard sort on a shallow copy
 */

import React, { useMemo, useState } from 'react';
import { Trophy, TrendingUp, History, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TitanProfile, WorkoutSession, PersonalRecord, Routine } from '@/lib/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

interface ProgressTabProps {
  profile: TitanProfile | null;
  /** Reserved for future encrypted-field decryption; unused by pure-display logic. */
  encryptionKey: CryptoKey | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Epley estimated one-rep-max formula.
 * Returns `weight` unchanged for single-rep sets to avoid division artefacts.
 * Time: O(1).
 */
function calcE1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Returns the ISO date of the Monday that begins the week containing `date`. */
function isoWeekMonday(date: Date): string {
  const d = new Date(date);
  // getDay() → 0=Sun … 6=Sat; shift so Mon=0
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// PersonalRecordsPanel
// ---------------------------------------------------------------------------

interface ComputedPR {
  maxWeight: number;
  repsAtMax: number;
  e1RM: number;
  date: string;
}

function PersonalRecordsPanel({
  sessions,
  storedPRs,
}: {
  sessions: WorkoutSession[];
  storedPRs: Record<string, PersonalRecord>;
}) {
  /**
   * Merge computed PRs (derived live from sessions) with any stored PRs already
   * persisted on the profile, preferring whichever has the higher e1RM.
   */
  const merged = useMemo<Record<string, ComputedPR>>(() => {
    // Seed from stored PRs first
    const best: Record<string, ComputedPR> = {};

    for (const [key, pr] of Object.entries(storedPRs)) {
      best[key] = {
        maxWeight: pr.maxWeight,
        repsAtMax: pr.repsAtMax,
        e1RM: pr.e1RM,
        date: pr.achievedDate,
      };
    }

    // Walk session history and supersede stored entries where live data is better
    for (const session of sessions) {
      for (const log of session.exercises) {
        const key = log.exerciseName.toLowerCase();
        for (const set of log.sets) {
          if (!set.completed) continue;
          const w = set.weight ?? 0;
          const r = set.repsCompleted;
          if (w <= 0 || r <= 0) continue;
          const e1rm = calcE1RM(w, r);
          const current = best[key];
          if (!current || e1rm > current.e1RM) {
            best[key] = { maxWeight: w, repsAtMax: r, e1RM: e1rm, date: session.date };
          }
        }
      }
    }

    return best;
  }, [sessions, storedPRs]);

  const entries = Object.entries(merged);
  if (entries.length === 0) return null;

  // Sort descending by e1RM so the most impressive lifts appear first
  const sorted = entries.sort(([, a], [, b]) => b.e1RM - a.e1RM).slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-[var(--module-color-400)]" />
        <h3 className="text-sm font-black text-white/80 uppercase tracking-wider">Personal Records</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sorted.map(([exercise, pr]) => (
          <div
            key={exercise}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.045] border border-white/[0.12]"
          >
            <div>
              {/* Capitalise first letter of each word for display */}
              <p className="text-xs font-bold text-white/80">
                {exercise.replace(/\b\w/g, c => c.toUpperCase())}
              </p>
              <p className="text-[11px] text-white/40">
                {new Date(pr.date).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-[var(--module-color-400)]">{pr.e1RM} kg e1RM</p>
              <p className="text-[11px] text-white/50">
                {pr.maxWeight}×{pr.repsAtMax}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VolumeChart  (pure CSS bars — no charting library)
// ---------------------------------------------------------------------------

function VolumeChart({ sessions }: { sessions: WorkoutSession[] }) {
  const weeklyVolume = useMemo<Array<[string, number]>>(() => {
    const weeks: Record<string, number> = {};

    for (const session of sessions) {
      const weekKey = isoWeekMonday(new Date(session.date));
      let vol = 0;

      for (const log of session.exercises) {
        for (const set of log.sets) {
          if (!set.completed) continue;
          vol += (set.weight ?? 0) * set.repsCompleted;
        }
      }

      weeks[weekKey] = (weeks[weekKey] ?? 0) + vol;
    }

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8); // last 8 weeks
  }, [sessions]);

  if (weeklyVolume.length === 0) return null;

  const maxVol = Math.max(...weeklyVolume.map(([, v]) => v), 1); // guard divide-by-zero

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[var(--module-color-400)]" />
        <h3 className="text-sm font-black text-white/80 uppercase tracking-wider">Weekly Volume</h3>
      </div>

      {/* Bar chart container — fixed height keeps bars anchored to the baseline */}
      <div className="flex items-end gap-1.5 h-24">
        {weeklyVolume.map(([week, vol]) => {
          const barHeight = Math.max((vol / maxVol) * 80, 2); // px; min 2 px for zero weeks
          return (
            <div key={week} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-[var(--module-accent-border)] transition-all hover:bg-[var(--module-accent)]"
                style={{ height: `${barHeight}px` }}
                title={`Week of ${week}: ${Math.round(vol).toLocaleString()} kg`}
              />
              {/* MM-DD label rotated to avoid overflow in narrow columns */}
              <span className="text-[11px] text-white/30 rotate-[-45deg] origin-top-left whitespace-nowrap">
                {week.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionHistoryList
// ---------------------------------------------------------------------------

function SessionHistoryList({
  sessions,
  routines,
}: {
  sessions: WorkoutSession[];
  /** Passed through for potential future use; `routineName` on the session is preferred. */
  routines: Routine[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** Most-recent first, capped at 30 to keep the list responsive. */
  const sorted = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 30),
    [sessions],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-[var(--module-color-400)]" />
        <h3 className="text-sm font-black text-white/80 uppercase tracking-wider">Session History</h3>
      </div>

      <div className="space-y-2">
        {sorted.map(session => {
          // routineName is stored on the session; fall back to routines lookup if absent
          const displayName =
            session.routineName ||
            routines.find(r => r.id === session.routineId)?.name ||
            'Unknown Routine';

          const totalSets = session.exercises.reduce(
            (sum, log) => sum + log.sets.filter(s => s.completed).length,
            0,
          );

          const isExpanded = expandedId === session.id;

          return (
            <div
              key={session.id}
              className="rounded-xl border border-white/[0.12] bg-white/[0.045] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.045] transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-white/80">{displayName}</p>
                  <p className="text-[11px] text-white/40">
                    {new Date(session.date).toLocaleDateString()} · {totalSets} sets completed
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-white/30" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-white/30" />
                )}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-1.5 border-t border-white/[0.09]">
                      {session.exercises.map(log => {
                        const completed = log.sets.filter(s => s.completed);
                        if (completed.length === 0) return null;
                        return (
                          <div key={log.exerciseName} className="flex items-center justify-between">
                            <span className="text-[11px] text-white/60">{log.exerciseName}</span>
                            <span className="text-[11px] text-white/40">
                              {completed
                                .map(s => `${s.weight ?? '—'}×${s.repsCompleted}`)
                                .join(', ')}
                            </span>
                          </div>
                        );
                      })}
                      {session.notes && (
                        <p className="text-[11px] text-white/30 italic mt-2">{session.notes}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

import { EmptyState } from '@/core/components/EmptyState';

export function ProgressTab({ profile }: ProgressTabProps) {
  const sessions = profile?.workoutSessions ?? [];

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No sessions yet"
        description="Log your first workout session from the Training tab to start tracking progress."
      />
    );
  }

  return (
    <div className={cn('space-y-6')}>
      <PersonalRecordsPanel
        sessions={sessions}
        storedPRs={profile?.personalRecords ?? {}}
      />
      <VolumeChart sessions={sessions} />
      <SessionHistoryList sessions={sessions} routines={profile?.routines ?? []} />
    </div>
  );
}
