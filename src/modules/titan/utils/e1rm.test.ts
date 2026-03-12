/**
 * e1rm.test.ts — Unit tests for calculateE1RM and computeSessionPRs
 *
 * Covers the acceptance criteria from S21-013:
 *  - New PR on first set
 *  - Tie (no update to existing record)
 *  - Regression (no update when new e1RM is lower)
 *  - Multi-exercise session
 *  - Best-set selection within a single exercise across multiple sets
 */

import { describe, it, expect } from 'vitest';
import { calculateE1RM, computeSessionPRs } from './e1rm';
import type { PRSet } from './e1rm';

// ─── calculateE1RM ────────────────────────────────────────────────────────────

describe('calculateE1RM', () => {
  it('returns weight unchanged for 1-rep sets', () => {
    expect(calculateE1RM(100, 1)).toBe(100);
    expect(calculateE1RM(200, 1)).toBe(200);
  });

  it('computes Epley formula with 1-decimal precision for multi-rep sets', () => {
    // 100kg × (1 + 5/30) = 100 × 1.1667 = 116.7
    expect(calculateE1RM(100, 5)).toBe(116.7);
    // 80kg × (1 + 8/30) = 80 × 1.2667 = 101.3
    expect(calculateE1RM(80, 8)).toBe(101.3);
    // 120kg × (1 + 3/30) = 120 × 1.1 = 132
    expect(calculateE1RM(120, 3)).toBe(132);
  });

  it('handles 0 reps without throwing (edge case — callers should guard)', () => {
    // reps=0 would return a negative e1RM — callers must guard; utility is not
    // responsible for input validation, but it must not throw.
    expect(() => calculateE1RM(100, 0)).not.toThrow();
  });
});

// ─── computeSessionPRs ───────────────────────────────────────────────────────

describe('computeSessionPRs', () => {
  // ── Empty inputs ──────────────────────────────────────────────────────────

  it('returns empty results and unchanged PRs for empty sets array', () => {
    const { updatedPRs, results } = computeSessionPRs([], { squat: 100 });
    expect(results).toHaveLength(0);
    expect(updatedPRs).toEqual({ squat: 100 });
  });

  it('returns empty results and empty PRs when both inputs are empty', () => {
    const { updatedPRs, results } = computeSessionPRs([], {});
    expect(results).toHaveLength(0);
    expect(updatedPRs).toEqual({});
  });

  // ── New PR on first-ever set (no prior record) ────────────────────────────

  it('marks isNewPR=true and stores e1RM when no prior record exists', () => {
    const sets: PRSet[] = [{ exerciseName: 'Bench Press', weightKg: 100, reps: 5 }];
    const { updatedPRs, results } = computeSessionPRs(sets, {});

    expect(results).toHaveLength(1);
    expect(results[0].isNewPR).toBe(true);
    expect(results[0].previousE1RM).toBeUndefined();
    expect(results[0].newE1RM).toBe(calculateE1RM(100, 5));
    expect(results[0].exerciseName).toBe('Bench Press');

    const key = 'bench press';
    expect(updatedPRs[key]).toBe(calculateE1RM(100, 5));
  });

  // ── Strict improvement ────────────────────────────────────────────────────

  it('marks isNewPR=true and updates the map when new e1RM > existing', () => {
    const existingE1RM = calculateE1RM(90, 5); // previous best
    const sets: PRSet[] = [{ exerciseName: 'Squat', weightKg: 100, reps: 5 }];
    const { updatedPRs, results } = computeSessionPRs(sets, { squat: existingE1RM });

    const newE1RM = calculateE1RM(100, 5);
    expect(newE1RM).toBeGreaterThan(existingE1RM);
    expect(results[0].isNewPR).toBe(true);
    expect(results[0].previousE1RM).toBe(existingE1RM);
    expect(results[0].newE1RM).toBe(newE1RM);
    expect(updatedPRs['squat']).toBe(newE1RM);
  });

  // ── Tie — no update ───────────────────────────────────────────────────────

  it('marks isNewPR=false and does NOT update the map when e1RM equals existing', () => {
    const e1RM = calculateE1RM(100, 5);
    const sets: PRSet[] = [{ exerciseName: 'Deadlift', weightKg: 100, reps: 5 }];
    const { updatedPRs, results } = computeSessionPRs(sets, { deadlift: e1RM });

    expect(results[0].isNewPR).toBe(false);
    // Value in map must remain unchanged (exact same reference value)
    expect(updatedPRs['deadlift']).toBe(e1RM);
  });

  // ── Regression — no update ────────────────────────────────────────────────

  it('marks isNewPR=false and does NOT update the map when new e1RM < existing', () => {
    const previousBest = calculateE1RM(120, 5); // 139.9
    const sets: PRSet[] = [{ exerciseName: 'Squat', weightKg: 100, reps: 5 }];
    const { updatedPRs, results } = computeSessionPRs(sets, { squat: previousBest });

    const newE1RM = calculateE1RM(100, 5);
    expect(newE1RM).toBeLessThan(previousBest);
    expect(results[0].isNewPR).toBe(false);
    expect(results[0].previousE1RM).toBe(previousBest);
    expect(updatedPRs['squat']).toBe(previousBest); // unchanged
  });

  // ── Multi-exercise session ────────────────────────────────────────────────

  it('handles a multi-exercise session independently for each exercise', () => {
    const sets: PRSet[] = [
      { exerciseName: 'Bench Press', weightKg: 100, reps: 5 },
      { exerciseName: 'Squat', weightKg: 130, reps: 3 },
      { exerciseName: 'Deadlift', weightKg: 150, reps: 1 },
    ];
    const existing = {
      'bench press': calculateE1RM(90, 5),  // will be beaten
      squat: calculateE1RM(130, 3),         // tie — no update
      // deadlift: absent — first-ever
    };

    const { updatedPRs, results } = computeSessionPRs(sets, existing);

    expect(results).toHaveLength(3);

    const benchResult = results.find(r => r.exerciseName === 'Bench Press')!;
    expect(benchResult.isNewPR).toBe(true);
    expect(updatedPRs['bench press']).toBe(calculateE1RM(100, 5));

    const squatResult = results.find(r => r.exerciseName === 'Squat')!;
    expect(squatResult.isNewPR).toBe(false);
    expect(updatedPRs['squat']).toBe(existing['squat']); // unchanged

    const deadliftResult = results.find(r => r.exerciseName === 'Deadlift')!;
    expect(deadliftResult.isNewPR).toBe(true);
    expect(deadliftResult.previousE1RM).toBeUndefined();
    expect(updatedPRs['deadlift']).toBe(150); // 1-rep set → e1RM = weight
  });

  // ── Best-set selection within one exercise ───────────────────────────────

  it('uses the best (highest) e1RM across multiple sets for one exercise', () => {
    const sets: PRSet[] = [
      { exerciseName: 'OHP', weightKg: 60, reps: 10 }, // e1RM = 60*(1+10/30) = 80
      { exerciseName: 'OHP', weightKg: 70, reps: 5 },  // e1RM = 70*(1+5/30)  = 81.7
      { exerciseName: 'OHP', weightKg: 65, reps: 8 },  // e1RM = 65*(1+8/30)  = 82.3  ← best
    ];
    const { updatedPRs, results } = computeSessionPRs(sets, {});

    expect(results).toHaveLength(1); // one exercise → one result
    expect(results[0].exerciseName).toBe('OHP');
    expect(results[0].isNewPR).toBe(true);
    expect(results[0].newE1RM).toBe(calculateE1RM(65, 8)); // best set wins
    expect(updatedPRs['ohp']).toBe(calculateE1RM(65, 8));
  });

  // ── Key normalisation ─────────────────────────────────────────────────────

  it('matches exercise names case-insensitively against the existing PR map key', () => {
    // Existing PR key is lowercase; incoming exerciseName is mixed-case
    const existing = { 'bench press': calculateE1RM(90, 5) };
    const sets: PRSet[] = [{ exerciseName: 'Bench Press', weightKg: 80, reps: 5 }];

    const { updatedPRs, results } = computeSessionPRs(sets, existing);

    // 80kg < 90kg so no PR
    expect(results[0].isNewPR).toBe(false);
    expect(updatedPRs['bench press']).toBe(existing['bench press']); // not replaced
  });

  // ── Pure function — input not mutated ─────────────────────────────────────

  it('does not mutate the existingPRs input object', () => {
    const existingPRs = { squat: 100 };
    const frozen = Object.freeze({ ...existingPRs });
    const sets: PRSet[] = [{ exerciseName: 'Squat', weightKg: 120, reps: 5 }];

    expect(() => computeSessionPRs(sets, frozen as Record<string, number>)).not.toThrow();
  });
});
