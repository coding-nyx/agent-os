import { ExerciseLibraryJs } from '@cortex-logic';
import type { Exercise } from '../types';

const _service = new ExerciseLibraryJs();

// Re-export the Exercise type so callers that import it from this module
// continue to compile without change.
export type { Exercise };

/**
 * EXERCISE_LIBRARY — the full exercise catalogue sourced directly from the KMP
 * ExerciseLibraryJs singleton. KMP is the single source of truth; the previous
 * hand-maintained TS literal has been removed to prevent drift.
 *
 * KMP's searchExercises('', n) returns the first n entries when the query is
 * empty — 1000 is a safe upper bound for the current catalogue (~41 entries).
 *
 * For search / lookup operations prefer findExercise / searchExercises below so
 * the KMP fuzzy-matching logic is applied.
 */
export const EXERCISE_LIBRARY: Exercise[] = JSON.parse(
  _service.searchExercises('', 1000)
) as Exercise[];

// ─── Bridge functions ─────────────────────────────────────────────────────────

/**
 * Find the first exercise whose name or aliases contain `query` (case-insensitive).
 * Returns `undefined` when no match is found.
 */
export function findExercise(query: string): Exercise | undefined {
  const result = _service.findExercise(query);
  return result === null || result === '' || result === 'null'
    ? undefined
    : (JSON.parse(result) as Exercise);
}

/**
 * Return up to `limit` exercises matching `query` by name or alias.
 * When `query` is empty, returns the first `limit` entries.
 */
export function searchExercises(query: string, limit = 5): Exercise[] {
  return JSON.parse(_service.searchExercises(query, limit)) as Exercise[];
}
