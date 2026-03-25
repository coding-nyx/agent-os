import { describe, it, expect } from 'vitest';
import { matchExerciseName, getExercisesByMuscle, getExercisesByEquipment } from './titan-exercise-service';

describe('matchExerciseName', () => {
  // ── Edge cases: degenerate inputs ─────────────────────────────────────────

  it('returns null for empty string', () => {
    expect(matchExerciseName('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(matchExerciseName('   ')).toBeNull();
  });

  it('returns null for a single character that has no trigrams', () => {
    // Single character → 0 trigrams → similarity = 0, below threshold
    expect(matchExerciseName('x')).toBeNull();
  });

  it('returns null for a two-character input with no library match', () => {
    expect(matchExerciseName('zz')).toBeNull();
  });

  // ── Below-threshold inputs ────────────────────────────────────────────────

  it('returns null for a completely unrelated long string', () => {
    expect(matchExerciseName('aaaaaabbbbbbccccccdddddd')).toBeNull();
  });

  it('returns null for a random word with no fitness relation', () => {
    expect(matchExerciseName('photosynthesis')).toBeNull();
  });

  // ── Exact name matches ────────────────────────────────────────────────────

  it('matches exact canonical name "Squat" (case-insensitive)', () => {
    const result = matchExerciseName('squat');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('compound');
  });

  it('matches exact canonical name "Bench Press"', () => {
    const result = matchExerciseName('bench press');
    expect(result).not.toBeNull();
    expect(result!.movementPattern).toBe('push');
  });

  it('matches exact canonical name "Deadlift"', () => {
    const result = matchExerciseName('deadlift');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('compound');
  });

  // ── Alias matches ─────────────────────────────────────────────────────────

  it('matches alias "rdl" for Romanian Deadlift', () => {
    const result = matchExerciseName('rdl');
    // rdl alias should have very high trigram overlap
    expect(result).not.toBeNull();
  });

  it('matches alias "ohp" for Overhead Press', () => {
    const result = matchExerciseName('ohp');
    expect(result).not.toBeNull();
  });

  // ── Fuzzy / approximate matches ───────────────────────────────────────────

  it('matches "barbell squat" to a squat entry', () => {
    const result = matchExerciseName('barbell squat');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('compound');
  });

  it('matches "pull ups" (plural) to pull-up entry', () => {
    const result = matchExerciseName('pull ups');
    expect(result).not.toBeNull();
  });

  // ── Threshold boundary ────────────────────────────────────────────────────

  it('returns the best match (not null) for a close-enough name', () => {
    // "bench" alone is a common enough substring to exceed 0.3 threshold
    const result = matchExerciseName('bench');
    expect(result).not.toBeNull();
  });

  // ── Very long input ───────────────────────────────────────────────────────

  it('handles a very long input string without throwing', () => {
    const longInput = 'a'.repeat(500);
    expect(() => matchExerciseName(longInput)).not.toThrow();
    // Very long random string should not match anything meaningful
    expect(matchExerciseName(longInput)).toBeNull();
  });
});

describe('getExercisesByMuscle', () => {
  it('returns exercises for "quadriceps"', () => {
    const results = getExercisesByMuscle('quadriceps');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e =>
      e.primaryMuscles.some(m => m.toLowerCase().includes('quadriceps')) ||
      e.secondaryMuscles.some(m => m.toLowerCase().includes('quadriceps'))
    )).toBe(true);
  });

  it('returns empty array for unrecognised muscle', () => {
    expect(getExercisesByMuscle('xyznonexistent')).toHaveLength(0);
  });

  it('matches case-insensitively', () => {
    const lower = getExercisesByMuscle('chest');
    const upper = getExercisesByMuscle('CHEST');
    expect(lower).toHaveLength(upper.length);
  });

  it('supports partial muscle name "quadri" matching "quadriceps"', () => {
    const results = getExercisesByMuscle('quadri');
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('getExercisesByEquipment', () => {
  it('returns exercises for "barbell"', () => {
    const results = getExercisesByEquipment('barbell');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e =>
      e.equipment.some(eq => eq.toLowerCase().includes('barbell'))
    )).toBe(true);
  });

  it('returns empty array for unrecognised equipment', () => {
    expect(getExercisesByEquipment('hoverboard')).toHaveLength(0);
  });

  it('supports partial equipment name "bar" matching "barbell"', () => {
    const results = getExercisesByEquipment('bar');
    expect(results.length).toBeGreaterThan(0);
  });
});
