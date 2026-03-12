/**
 * Pure NSV patch computation for completed workout sessions.
 * Identical algorithm to the log_workout_session ActionHub handler.
 * No side effects, no imports from React or Firebase.
 */

export interface WorkoutNSVInput {
  rpe: number;                    // 1–10
  totalVolumeKg: number;          // sum of weight × reps across all sets
  sessionTimestamp: number;       // Unix ms — last session's timestamp for decay calc
  existingCnsFatigue: number;     // current NSV value 0–10
  existingRecoveryScore: number;  // current NSV value 0–10
}

export interface WorkoutNSVPatch {
  'biological.cnsFatigue': number;
  'biological.recoveryScore': number;
  /** Titan's physical contribution to cognitive energy availability (0–10). Blended estimate only. */
  'cognitive.energyBudget': number;
  /** Titan's physical contribution to cognitive focus readiness (0–10). Blended estimate only. */
  'cognitive.focusScore': number;
}

/**
 * Computes the NSV biological patch after a completed workout session.
 *
 * CNS Fatigue algorithm (matches log_workout_session handler exactly):
 *  - rawFatigue = RPE × 0.6 + min(4, volumeKg / 5000)  [capped at 10]
 *  - Exponential decay of existing fatigue: halves every 48 h since last session.
 *  - Final value = max(decayedExisting, rawFatigue), rounded to 1 d.p.
 *
 * Recovery Score algorithm:
 *  - Delta: RPE ≥ 8 → −1.5 | RPE ≥ 6 → −0.5 | RPE < 6 → 0
 *  - Clamped to [0, 10], rounded to 1 d.p.
 *
 * Pure function — no side effects, no React imports, no Firebase imports.
 */
export function computeWorkoutNSVPatch(input: WorkoutNSVInput): WorkoutNSVPatch {
  // ── CNS Fatigue ──────────────────────────────────────────────────────────
  const hoursElapsed = (Date.now() - input.sessionTimestamp) / 3_600_000;
  const decayedFatigue = input.existingCnsFatigue * Math.pow(0.5, hoursElapsed / 48);
  const rawFatigue = Math.min(10, input.rpe * 0.6 + Math.min(4, input.totalVolumeKg / 5000));
  const cnsFatigue = Math.round(Math.max(decayedFatigue, rawFatigue) * 10) / 10;

  // ── Recovery Score ───────────────────────────────────────────────────────
  const recoveryDelta = input.rpe >= 8 ? -1.5 : input.rpe >= 6 ? -0.5 : 0;
  const recoveryScore = Math.round(Math.max(0, Math.min(10, input.existingRecoveryScore + recoveryDelta)) * 10) / 10;

  // ── Cognitive (physical contribution only) ──────────────────────────────
  const energyBudget = Math.round(Math.max(0, Math.min(10, 10 - cnsFatigue * 0.7 - (10 - recoveryScore) * 0.3)) * 10) / 10;
  const focusScore   = Math.round(Math.max(0, Math.min(10, 10 - cnsFatigue * 0.5)) * 10) / 10;

  return {
    'biological.cnsFatigue': cnsFatigue,
    'biological.recoveryScore': recoveryScore,
    'cognitive.energyBudget': energyBudget,
    'cognitive.focusScore': focusScore,
  };
}
