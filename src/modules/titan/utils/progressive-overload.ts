/**
 * Progressive Overload Engine — thin KMP bridge.
 *
 * Computation (ACWR, progression recommendations, e1RM) delegates to
 * ProgressiveOverloadEngineJs (cortex-logic jsMain facade).
 *
 * Retained in TS (no KMP counterpart):
 *  - muscleGroupsForExercise   — depends on EXERCISE_LIBRARY lookup table
 *  - computeWeeklyVolumeByMuscle — aggregates muscle sets from session history
 *  - weeksAgoMonday / getSessionsInLastNWeeks — pure date utilities
 */

import type { WorkoutSession, PersonalRecord } from '@/lib/types';
import { EXERCISE_LIBRARY } from '../data/exercise-library';
import { ProgressiveOverloadEngineJs } from '@cortex-logic';

const _engine = new ProgressiveOverloadEngineJs();

// ── Volume Landmarks per muscle group (sets/week) ──────────────────────────
// Sourced from cortex-logic KMP (single source of truth for both platforms).

export interface VolumeEntry {
  /** Minimum Effective Volume — below this threshold, little adaptation occurs. */
  mev: number;
  /** Maximum Adaptive Volume — optimal stimulus range for hypertrophy. */
  mav: number;
  /** Maximum Recoverable Volume — above this risks overtraining / injury. */
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<string, VolumeEntry> = JSON.parse(_engine.getAllLandmarks());

// ── Types ─────────────────────────────────────────────────────────────────────

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
 * Time: O(1). Space: O(1).
 */
export function weeksAgoMonday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
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

// ── Risk zone → TS status / recommendation text ───────────────────────────────

const RISK_STATUS: Record<string, ACWRResult['status']> = {
  SAFE: 'optimal',
  CAUTION_LOW: 'undertrained',
  CAUTION_HIGH: 'overreaching',
  DANGER: 'danger',
};

const RISK_REC: Record<string, string> = {
  SAFE: 'Workload ratio is in the optimal adaptation window (0.8–1.3). Continue your progressive overload plan as scheduled.',
  CAUTION_LOW: "This week's load sits below your 4-week baseline. Add a session or increase working volume to drive adaptation.",
  CAUTION_HIGH: 'Significant training spike detected. Reduce weekly volume by 20–30% or insert a deload session before continuing.',
  DANGER: 'Acute load far exceeds your chronic baseline — elevated injury risk. Take 2–3 full rest days and cut session intensity by ≥ 40%.',
};

const NO_HISTORY_REC = 'No training load recorded in the last 28 days. Establish a baseline volume before ramping up intensity.';

/**
 * Compute the Acute:Chronic Workload Ratio (ACWR) from session history.
 * Delegates ratio computation to ProgressiveOverloadEngineJs.computeAcwr().
 *
 * Time: O(m). Space: O(m).
 */
export function computeACWR(sessions: WorkoutSession[]): ACWRResult {
  if (sessions.length === 0) {
    return { acwr: 0, acuteLoad: 0, chronicLoad: 0, status: 'undertrained', recommendation: NO_HISTORY_REC };
  }

  const loads = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(s => sessionVolume(s));

  const r = _engine.computeAcwr(JSON.stringify(loads));

  if (r.chronicLoad === 0) {
    return { acwr: 0, acuteLoad: r.acuteLoad, chronicLoad: 0, status: 'undertrained', recommendation: NO_HISTORY_REC };
  }

  return {
    acwr: Math.round(r.ratio * 100) / 100,
    acuteLoad: r.acuteLoad,
    chronicLoad: r.chronicLoad,
    status: RISK_STATUS[r.riskZone] ?? 'optimal',
    recommendation: RISK_REC[r.riskZone] ?? RISK_REC.SAFE,
  };
}

// ── Progression tier → TS recommendation ─────────────────────────────────────

const TIER_MAP: Record<string, ExerciseProgressionRec['recommendation']> = {
  DELOAD: 'deload',
  MAINTAIN: 'maintain',
  ADD_WEIGHT: 'add_weight',
  ADD_REPS: 'add_reps',
};

/**
 * Generate per-exercise progressive overload recommendations.
 * Delegates recommendation logic to ProgressiveOverloadEngineJs.recommend().
 *
 * Time: O(p · m · e · s) ≈ O(n) for typical inputs. Space: O(p).
 */
export function generateProgressionRecommendations(
  sessions: WorkoutSession[],
  personalRecords: Record<string, PersonalRecord>,
): ExerciseProgressionRec[] {
  const sortedSessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const acwrRatio = computeACWR(sortedSessions).acwr;
  const recommendations: ExerciseProgressionRec[] = [];

  for (const [exerciseKey, pr] of Object.entries(personalRecords)) {
    const exerciseSessions = sortedSessions.filter(session =>
      session.exercises.some(log => log.exerciseName.toLowerCase().trim() === exerciseKey),
    );
    if (exerciseSessions.length === 0) continue;

    // Build e1rm trend per session (chronological, most recent last).
    const e1rmTrend: number[] = exerciseSessions
      .map(session => {
        const logs = session.exercises.filter(
          log => log.exerciseName.toLowerCase().trim() === exerciseKey,
        );
        let best = 0;
        for (const log of logs) {
          for (const set of log.sets) {
            if (!set.completed || set.weight == null || set.repsCompleted <= 0) continue;
            const e1rm = _engine.epley(set.weight, set.repsCompleted);
            if (e1rm > best) best = e1rm;
          }
        }
        return best;
      })
      .filter(e => e > 0);

    if (e1rmTrend.length === 0) continue;

    // Extract last-session stats for the exercise.
    const lastSession = exerciseSessions.at(-1)!;
    const lastLog = lastSession.exercises.find(
      log => log.exerciseName.toLowerCase().trim() === exerciseKey,
    );
    if (!lastLog) continue;

    const completedSets = lastLog.sets.filter(s => s.completed).length;
    const targetSets = lastLog.plannedSets ?? completedSets;

    let currentWeight = 0;
    let currentReps = 0;
    for (const set of lastLog.sets) {
      if (set.completed && set.weight != null && set.weight > currentWeight && set.repsCompleted > 0) {
        currentWeight = set.weight;
        currentReps = set.repsCompleted;
      }
    }
    if (currentWeight === 0) continue;

    // Average RPE over last 2–3 sessions.
    const recentRpes = exerciseSessions
      .slice(-3)
      .map(s => s.rpe)
      .filter((r): r is number => r != null);
    const avgRpe = recentRpes.length > 0
      ? recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length
      : 7.0;

    const rec = _engine.recommend(
      avgRpe,
      JSON.stringify(e1rmTrend),
      completedSets,
      targetSets,
      currentWeight,
      currentReps,
      acwrRatio,
      'kg',
    );

    const result: ExerciseProgressionRec = {
      exerciseName: pr.exerciseName,
      currentE1RM: pr.e1RM,
      recommendation: TIER_MAP[rec.tier] ?? 'maintain',
      reasoning: rec.reason,
    };

    if (rec.tier === 'ADD_WEIGHT' && rec.suggestedWeight != null) {
      result.suggestedWeightKg = rec.suggestedWeight;
    }
    if (rec.tier === 'ADD_REPS' && rec.suggestedReps != null) {
      result.suggestedReps = String(rec.suggestedReps);
    }

    recommendations.push(result);
  }

  return recommendations;
}
