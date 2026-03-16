import type { PersonalRecord } from '../types';

/** Epley formula: weight × (1 + reps / 30).  Returns weight unchanged for 1-rep sets. */
export function calculateE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
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
  const updatedPRs = { ...existingPRs };
  const resultsMap = new Map<string, PRResult>();

  for (const set of sets) {
    const key = set.exerciseName.toLowerCase();
    const newE1RM = calculateE1RM(set.weightKg, set.reps);

    if (!resultsMap.has(key)) {
      resultsMap.set(key, {
        exerciseName: set.exerciseName,
        isNewPR: false,
        previousE1RM: existingPRs[key],
        newE1RM: 0
      });
    }

    const currentResult = resultsMap.get(key)!;
    if (newE1RM > currentResult.newE1RM) {
      currentResult.newE1RM = newE1RM;
    }
  }

  const results: PRResult[] = [];
  for (const [key, result] of resultsMap.entries()) {
    if (result.previousE1RM === undefined || result.newE1RM > result.previousE1RM) {
      result.isNewPR = true;
      updatedPRs[key] = result.newE1RM;
    }
    results.push(result);
  }

  return { updatedPRs, results };
}

/** Returns the best (highest) e1RM for an exercise from an array of personal records */
export function getBestE1RM(records: PersonalRecord[], exerciseId: string): number | null {
  const relevant = records.filter(r => r.exerciseId === exerciseId);
  if (!relevant.length) return null;
  return Math.max(...relevant.map(r => r.e1RM));
}
