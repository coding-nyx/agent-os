/**
 * Progressive Overload Engine — pure utility functions (no React, no UI imports).
 *
 * Science-based recommendations drawn from Renaissance Periodization (RP)
 * volume-landmark research and Gabbett's ACWR injury-risk model (2016).
 *
 * Complexity summary
 * ──────────────────
 *  weeksAgoMonday              O(1)         / O(1)
 *  getSessionsInLastNWeeks     O(m)         / O(m)
 *  muscleGroupsForExercise     O(n)≈O(1)    / O(1)
 *  computeWeeklyVolumeByMuscle O(m·e·s)≈O(n)/ O(|landmarks|)
 *  computeACWR                 O(m)         / O(1)
 *  generateProgressionRecs     O(p·m·e·s)≈O(n)/ O(p)
 *
 *  m=sessions, e=exercises/session, s=sets/exercise, p=PR exercises
 *  All arrays are bounded in practice (≤365 sessions, ≤20 exercises/session).
 */

import type { WorkoutSession, PersonalRecord } from '@/lib/types';
import { EXERCISE_LIBRARY } from '../data/exercise-library';

// ── Volume Landmarks per muscle group (sets/week) ──────────────────────────
// Science-based MEV/MAV/MRV from Renaissance Periodization research

export interface VolumeEntry {
  /** Minimum Effective Volume — below this threshold, little adaptation occurs. */
  mev: number;
  /** Maximum Adaptive Volume — optimal stimulus range for hypertrophy. */
  mav: number;
  /** Maximum Recoverable Volume — above this risks overtraining / injury. */
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<string, VolumeEntry> = {
  chest:      { mev: 8,  mav: 16, mrv: 22 },
  back:       { mev: 10, mav: 18, mrv: 25 },
  shoulders:  { mev: 8,  mav: 16, mrv: 22 },
  biceps:     { mev: 8,  mav: 14, mrv: 20 },
  triceps:    { mev: 6,  mav: 14, mrv: 20 },
  quads:      { mev: 8,  mav: 16, mrv: 20 },
  hamstrings: { mev: 6,  mav: 12, mrv: 16 },
  glutes:     { mev: 4,  mav: 12, mrv: 16 },
  calves:     { mev: 8,  mav: 16, mrv: 20 },
  core:       { mev: 6,  mav: 16, mrv: 20 },
  traps:      { mev: 4,  mav: 12, mrv: 16 },
  lats:       { mev: 8,  mav: 16, mrv: 20 },
  forearms:   { mev: 4,  mav: 10, mrv: 14 },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface MuscleVolumeWeek {
  muscleGroup: string;
  /** Completed sets accumulated this calendar week (Mon → today). */
  sets: number;
  status: 'below_mev' | 'in_mav' | 'above_mav' | 'above_mrv';
  landmarks: VolumeEntry;
}

export interface ExerciseProgressionRec {
  exerciseName: string;
  /** Current estimated 1-rep max (Epley formula). */
  currentE1RM: number;
  recommendation: 'add_weight' | 'add_reps' | 'maintain' | 'deload';
  /** Suggested working weight in kg — only present for 'add_weight'. */
  suggestedWeightKg?: number;
  /** Suggested rep range string — only present for 'add_reps'. */
  suggestedReps?: string;
  /** Human-readable rationale for the recommendation. */
  reasoning: string;
}

export interface ACWRResult {
  /** Acute:Chronic Workload Ratio rounded to 2 decimal places. */
  acwr: number;
  /** Rolling 7-day total volume (kg). */
  acuteLoad: number;
  /** Rolling 28-day total volume ÷ 4 (average weekly load, kg/week). */
  chronicLoad: number;
  status: 'undertrained' | 'optimal' | 'overreaching' | 'danger';
  recommendation: string;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Epley 1RM estimate: weight × (1 + reps / 30).
 * Returns weight unchanged for single-rep sets to avoid formula inflation.
 */
function calcE1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Compute total volume for a session, falling back to Σ(weight × repsCompleted)
 * across all completed sets when the pre-computed `totalVolume` field is absent.
 */
function sessionVolume(session: WorkoutSession): number {
  if (session.totalVolume != null) return session.totalVolume;
  let vol = 0;
  for (const log of session.exercises) {
    for (const set of log.sets) {
      if (set.completed && set.weight != null && set.repsCompleted > 0) {
        vol += set.weight * set.repsCompleted;
      }
    }
  }
  return vol;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Return the ISO date string (YYYY-MM-DD) for the Monday that begins the week
 * n weeks ago.  n = 0 → this week's Monday.
 *
 * JS getDay(): 0 = Sun, 1 = Mon, …, 6 = Sat.
 * Offset formula: (getDay() + 6) % 7  maps  Mon→0, Tue→1, …, Sun→6.
 *
 * Time: O(1). Space: O(1).
 */
export function weeksAgoMonday(n: number): string {
  const d = new Date();
  // Step backwards to this week's Monday.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  // Go back n additional full weeks.
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve muscle groups for an exercise name via the canonical EXERCISE_LIBRARY.
 *
 * Matching priority (first hit wins):
 *   1. Exact name match (case-insensitive)
 *   2. Exact alias match
 *   3. Name contains query substring
 *   4. Query contains name substring
 *
 * Exported so the component layer can reuse this lookup without re-importing
 * EXERCISE_LIBRARY directly.
 *
 * Time: O(n) where n = EXERCISE_LIBRARY.length (≈ 40) — effectively O(1).
 */
export function muscleGroupsForExercise(exerciseName: string): string[] {
  const q = exerciseName.toLowerCase().trim();
  const found =
    EXERCISE_LIBRARY.find(e => e.name.toLowerCase() === q) ??
    EXERCISE_LIBRARY.find(e => (e.aliases ?? []).some(a => a.toLowerCase() === q)) ??
    EXERCISE_LIBRARY.find(e => e.name.toLowerCase().includes(q)) ??
    EXERCISE_LIBRARY.find(e => q.includes(e.name.toLowerCase()));
  return found?.muscleGroups ?? [];
}

/**
 * Return all sessions whose date falls within the last n calendar weeks
 * (from the Monday of n weeks ago, inclusive, through today, inclusive).
 *
 * Time: O(m). Space: O(m).
 */
export function getSessionsInLastNWeeks(
  sessions: WorkoutSession[],
  weeks: number,
): WorkoutSession[] {
  const cutoff = weeksAgoMonday(weeks);
  const today = new Date().toISOString().slice(0, 10);
  return sessions.filter(s => s.date >= cutoff && s.date <= today);
}

/**
 * Compute weekly completed sets per muscle group for the current calendar week
 * (Monday → today), comparing against science-based MEV / MAV / MRV landmarks.
 *
 * When an exercise targets multiple muscle groups, completed sets are distributed
 * equally across each group to avoid double-counting compound lifts.
 *
 * Returns one entry per landmark muscle group (even if sets = 0 that week).
 *
 * Time: O(m·e·s). Space: O(|VOLUME_LANDMARKS|) = O(1).
 */
export function computeWeeklyVolumeByMuscle(
  sessions: WorkoutSession[],
): MuscleVolumeWeek[] {
  const weekMonday = weeksAgoMonday(0);
  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = sessions.filter(s => s.date >= weekMonday && s.date <= today);

  const setsPerMuscle: Record<string, number> = {};

  for (const session of thisWeek) {
    for (const log of session.exercises) {
      const groups = muscleGroupsForExercise(log.exerciseName);
      if (groups.length === 0) continue;

      const completedSets = log.sets.filter(s => s.completed).length;
      if (completedSets === 0) continue;

      // Distribute sets equally to avoid double-counting compound lifts.
      const setsPerGroup = completedSets / groups.length;
      for (const g of groups) {
        setsPerMuscle[g] = (setsPerMuscle[g] ?? 0) + setsPerGroup;
      }
    }
  }

  return Object.entries(VOLUME_LANDMARKS).map(([muscleGroup, landmarks]) => {
    const sets = setsPerMuscle[muscleGroup] ?? 0;
    let status: MuscleVolumeWeek['status'];
    if (sets >= landmarks.mrv) {
      status = 'above_mrv';
    } else if (sets >= landmarks.mav) {
      status = 'above_mav';
    } else if (sets >= landmarks.mev) {
      status = 'in_mav';
    } else {
      status = 'below_mev';
    }
    return { muscleGroup, sets, status, landmarks };
  });
}

/**
 * Compute the Acute:Chronic Workload Ratio (ACWR) from session history.
 *
 * - Acute load  : rolling 7-day total volume (kg).
 * - Chronic load: rolling 28-day total volume ÷ 4 weeks (average weekly load).
 * - ACWR        : acuteLoad / chronicLoad.
 *
 * When `totalVolume` is absent on a session, it is computed from set data.
 *
 * Interpretation (Gabbett, 2016):
 *   < 0.8       → undertrained — insufficient stimulus
 *   0.8 – 1.3   → optimal adaptation window ✓
 *   1.3 – 1.5   → overreaching — elevated injury risk
 *   > 1.5       → danger zone — high injury risk
 *
 * When chronicLoad = 0 (no 28-day history), ACWR is 0 and status is 'undertrained'.
 *
 * Time: O(m). Space: O(1).
 */
export function computeACWR(sessions: WorkoutSession[]): ACWRResult {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const d7 = new Date(today);
  d7.setDate(today.getDate() - 7);
  const sevenDaysAgoStr = d7.toISOString().slice(0, 10);

  const d28 = new Date(today);
  d28.setDate(today.getDate() - 28);
  const twentyEightDaysAgoStr = d28.toISOString().slice(0, 10);

  const acuteSessions = sessions.filter(
    s => s.date >= sevenDaysAgoStr && s.date <= todayStr,
  );
  const acuteLoad = acuteSessions.reduce((sum, s) => sum + sessionVolume(s), 0);

  const chronicSessions = sessions.filter(
    s => s.date >= twentyEightDaysAgoStr && s.date <= todayStr,
  );
  const chronicTotal = chronicSessions.reduce((sum, s) => sum + sessionVolume(s), 0);
  const chronicLoad = chronicTotal / 4; // average per week over 4 weeks

  const acwr =
    chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : 0;

  let status: ACWRResult['status'];
  let recommendation: string;

  if (chronicLoad === 0) {
    status = 'undertrained';
    recommendation =
      'No training load recorded in the last 28 days. Establish a baseline volume before ramping up intensity.';
  } else if (acwr > 1.5) {
    status = 'danger';
    recommendation =
      'Acute load far exceeds your chronic baseline — elevated injury risk. Take 2–3 full rest days and cut session intensity by ≥ 40%.';
  } else if (acwr > 1.3) {
    status = 'overreaching';
    recommendation =
      'Significant training spike detected. Reduce weekly volume by 20–30% or insert a deload session before continuing.';
  } else if (acwr < 0.8) {
    status = 'undertrained';
    recommendation =
      "This week's load sits below your 4-week baseline. Add a session or increase working volume to drive adaptation.";
  } else {
    status = 'optimal';
    recommendation =
      'Workload ratio is in the optimal adaptation window (0.8–1.3). Continue your progressive overload plan as scheduled.';
  }

  return { acwr, acuteLoad, chronicLoad, status, recommendation };
}

/**
 * Generate per-exercise progressive overload recommendations.
 *
 * Only exercises that appear in `personalRecords` AND have at least one
 * logged session with computable e1RM data are included.
 *
 * Decision priority (first matching rule wins):
 *  1. **Deload**      — last session RPE ≥ 8 AND any muscle group is at/above MAV
 *  2. **Maintain**    — e1RM improved in the most recent session vs. the prior one
 *  3. **Add weight**  — ≥ 3 logged sessions AND e1RM plateaued over the last 2
 *  4. **Add reps**    — default: accumulate reps towards the top of the planned range
 *
 * Time: O(p · m · e · s) ≈ O(n) for typical inputs. Space: O(p).
 */
export function generateProgressionRecommendations(
  sessions: WorkoutSession[],
  personalRecords: Record<string, PersonalRecord>,
): ExerciseProgressionRec[] {
  // Sort chronologically once — reused for every exercise.
  const sortedSessions = [...sessions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Pre-compute current week's muscle volume for the deload gate.
  const weeklyVolumeEntries = computeWeeklyVolumeByMuscle(sortedSessions);
  const weeklyVolumeMap = new Map<string, MuscleVolumeWeek>(
    weeklyVolumeEntries.map(v => [v.muscleGroup, v]),
  );

  const recommendations: ExerciseProgressionRec[] = [];

  for (const [exerciseKey, pr] of Object.entries(personalRecords)) {
    // exerciseKey is lowercase (canonical storage key in TitanProfile).
    const exerciseSessions = sortedSessions.filter(session =>
      session.exercises.some(
        log => log.exerciseName.toLowerCase().trim() === exerciseKey,
      ),
    );
    if (exerciseSessions.length === 0) continue;

    // Build chronological list of (date, bestE1RM, sessionRPE) per session.
    const sessionE1RMs = exerciseSessions
      .map(session => {
        const logs = session.exercises.filter(
          log => log.exerciseName.toLowerCase().trim() === exerciseKey,
        );
        let bestE1RM = 0;
        for (const log of logs) {
          for (const set of log.sets) {
            if (!set.completed || set.weight == null || set.repsCompleted <= 0) continue;
            const e1rm = calcE1RM(set.weight, set.repsCompleted);
            if (e1rm > bestE1RM) bestE1RM = e1rm;
          }
        }
        return { date: session.date, e1RM: bestE1RM, rpe: session.rpe };
      })
      .filter(s => s.e1RM > 0);

    if (sessionE1RMs.length === 0) continue;

    const currentE1RM = pr.e1RM;
    // Use proper-cased name from the PR record for display.
    const exerciseName = pr.exerciseName;
    const muscleGroups = muscleGroupsForExercise(exerciseName);

    // ── Rule 1: Deload ──────────────────────────────────────────────────────
    // Trigger when: last session RPE ≥ 8 AND any primary muscle is at/above MAV.
    const lastEntry = sessionE1RMs.at(-1);
    const isAboveMAV = muscleGroups.some(mg => {
      const entry = weeklyVolumeMap.get(mg);
      return entry != null && entry.sets >= entry.landmarks.mav;
    });

    if (lastEntry?.rpe != null && lastEntry.rpe >= 8 && isAboveMAV) {
      recommendations.push({
        exerciseName,
        currentE1RM,
        recommendation: 'deload',
        reasoning: `RPE ${lastEntry.rpe}/10 with volume at or above MAV signals accumulated fatigue. Reduce load by ~20% for one week to allow full supercompensation before the next progression block.`,
      });
      continue;
    }

    // ── Rule 2: Maintain ────────────────────────────────────────────────────
    // Trigger when: e1RM improved in the most recent session vs. the prior one.
    if (sessionE1RMs.length >= 2) {
      const prev = sessionE1RMs.at(-2)!;
      const curr = sessionE1RMs.at(-1)!;
      if (curr.e1RM > prev.e1RM) {
        const delta = Math.round((curr.e1RM - prev.e1RM) * 10) / 10;
        const pct = Math.round((delta / prev.e1RM) * 1000) / 10;
        recommendations.push({
          exerciseName,
          currentE1RM,
          recommendation: 'maintain',
          reasoning: `e1RM improved +${delta} kg (+${pct}%) last session. Consolidate at this weight for 1–2 sessions before adding further load.`,
        });
        continue;
      }
    }

    // ── Rule 3: Add weight ──────────────────────────────────────────────────
    // Trigger when: ≥ 3 logged sessions AND e1RM stalled over the last 2.
    if (sessionE1RMs.length >= 3) {
      const [prev, curr] = sessionE1RMs.slice(-2);
      if (curr.e1RM <= prev.e1RM) {
        const suggestedWeightKg = Math.round((pr.maxWeight + 2.5) * 10) / 10;
        recommendations.push({
          exerciseName,
          currentE1RM,
          recommendation: 'add_weight',
          suggestedWeightKg,
          reasoning: `e1RM has not improved over 2 consecutive sessions (${prev.e1RM} → ${curr.e1RM} kg). A 2.5 kg microload (→ ${suggestedWeightKg} kg) will create a fresh stimulus for adaptation.`,
        });
        continue;
      }
    }

    // ── Rule 4: Add reps (default) ──────────────────────────────────────────
    // Accumulate reps toward the top of the planned range before adding load.
    const lastLog = exerciseSessions
      .at(-1)
      ?.exercises.find(
        log => log.exerciseName.toLowerCase().trim() === exerciseKey,
      );
    const plannedReps = lastLog?.plannedReps ?? '8–12';
    const rangeMatch = plannedReps.match(/(\d+)\s*[-–]\s*(\d+)/);

    let suggestedReps: string;
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10);
      const hi = parseInt(rangeMatch[2], 10);
      suggestedReps = `${lo}–${Math.min(hi + 1, 25)}`;
    } else {
      suggestedReps = plannedReps;
    }

    recommendations.push({
      exerciseName,
      currentE1RM,
      recommendation: 'add_reps',
      suggestedReps,
      reasoning: `Drive progressive overload through rep accumulation — push to the top of your target range before adding plate weight.`,
    });
  }

  return recommendations;
}
