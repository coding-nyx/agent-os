/**
 * Pure NSV patch computation for sleep entries.
 * Thin bridge over cortex-logic's TitanNsvUpdaterJs — algorithm lives in
 * KMP commonMain so both Agnes and nexus-android produce identical values.
 */

import { TitanNsvUpdaterJs } from '@cortex-logic';

const updater = new TitanNsvUpdaterJs();

export interface SleepNSVInput {
  durationHours: number;  // actual sleep duration
  qualityRating: number;  // subjective quality 0–10
}

export interface SleepNSVPatch {
  'biological.sleepQuality': number;
  'cognitive.energyBudget': number;
  'cognitive.focusScore': number;
}

export function computeSleepQualityNSV(input: SleepNSVInput): SleepNSVPatch {
  const p = updater.computeSleepPatch(input.durationHours, input.qualityRating);
  return {
    'biological.sleepQuality': p.sleepQuality,
    'cognitive.energyBudget': p.energyBudget,
    'cognitive.focusScore': p.focusScore,
  };
}
