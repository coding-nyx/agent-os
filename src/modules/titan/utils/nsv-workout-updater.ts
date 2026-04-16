/**
 * Pure NSV patch computation for completed workout sessions.
 * Thin bridge over cortex-logic's TitanNsvUpdaterJs — algorithm lives in
 * KMP commonMain so both Agnes and ara-android produce identical values.
 */

import { TitanNsvUpdaterJs } from '@cortex-logic';

const updater = new TitanNsvUpdaterJs();

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
  'cognitive.energyBudget': number;
  'cognitive.focusScore': number;
}

export function computeWorkoutNSVPatch(input: WorkoutNSVInput): WorkoutNSVPatch {
  const hoursElapsed = (Date.now() - input.sessionTimestamp) / 3_600_000;
  const p = updater.computeWorkoutPatch(
    input.rpe,
    input.totalVolumeKg,
    hoursElapsed,
    input.existingCnsFatigue,
    input.existingRecoveryScore,
  );
  return {
    'biological.cnsFatigue': p.cnsFatigue,
    'biological.recoveryScore': p.recoveryScore,
    'cognitive.energyBudget': p.energyBudget,
    'cognitive.focusScore': p.focusScore,
  };
}
