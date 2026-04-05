/**
 * e1RM & PR calculations — thin bridge over cortex-logic's E1rmServiceJs.
 * Algorithm lives in KMP commonMain so both Agnes and nexus-android produce
 * identical values.
 */

import type { PersonalRecord } from '../types';
import { E1rmServiceJs } from '@cortex-logic';

const service = new E1rmServiceJs();

/** Epley formula: weight × (1 + reps / 30).  Returns weight unchanged for 1-rep sets. */
export function calculateE1RM(weight: number, reps: number): number {
  return service.calculateE1RM(weight, reps);
}

export interface PRSet {
  exerciseName: string;
  weightKg: number;
  reps: number;
}

export interface PRResult {
  exerciseName: string;
  isNewPR: boolean;
  previousE1RM?: number;
  newE1RM: number;
}

export function computeSessionPRs(
  sets: PRSet[],
  existingPRs: Record<string, number>
): { updatedPRs: Record<string, number>; results: PRResult[] } {
  const raw = service.computeSessionPRs(
    JSON.stringify(sets),
    JSON.stringify(existingPRs),
  );
  return JSON.parse(raw);
}

/** Returns the best (highest) e1RM for an exercise from an array of personal records */
export function getBestE1RM(records: PersonalRecord[], exerciseId: string): number | null {
  const simplified = records.map(r => ({ exerciseId: r.exerciseId, e1RM: r.e1RM }));
  const result = service.getBestE1RM(JSON.stringify(simplified), exerciseId);
  return result === -1.0 ? null : result;
}
