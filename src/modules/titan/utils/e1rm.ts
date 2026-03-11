import type { PersonalRecord } from '../types';

/** Epley formula: weight × (1 + reps / 30).  Returns weight unchanged for 1-rep sets. */
export function calculateE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Returns the best (highest) e1RM for an exercise from an array of personal records */
export function getBestE1RM(records: PersonalRecord[], exerciseId: string): number | null {
  const relevant = records.filter(r => r.exerciseId === exerciseId);
  if (!relevant.length) return null;
  return Math.max(...relevant.map(r => r.e1RM));
}
