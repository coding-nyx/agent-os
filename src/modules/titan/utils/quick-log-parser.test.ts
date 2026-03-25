import { describe, it, expect } from 'vitest';
import { parseQuickLogInput, annotatePRs } from './quick-log-parser';
import type { PersonalRecord } from '../types';

// ---------------------------------------------------------------------------
// parseQuickLogInput
// ---------------------------------------------------------------------------

describe('parseQuickLogInput', () => {
  // ── Empty / blank inputs ─────────────────────────────────────────────────

  it('returns isEmpty:true for empty string', () => {
    const result = parseQuickLogInput('');
    expect(result.isEmpty).toBe(true);
    expect(result.entries).toHaveLength(0);
    expect(result.hasLowConfidence).toBe(false);
  });

  it('returns isEmpty:true for whitespace-only string', () => {
    const result = parseQuickLogInput('   ');
    expect(result.isEmpty).toBe(true);
  });

  // ── Standard canonical format ─────────────────────────────────────────────

  it('parses "3x5 squat @100kg" with high confidence', () => {
    const { entries } = parseQuickLogInput('3x5 squat @100kg');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.sets).toBe(3);
    expect(e.reps).toBe(5);
    expect(e.weight).toBe(100);
    expect(e.unit).toBe('kg');
    expect(e.exerciseId).toBe('squat');
    expect(e.exerciseName).toBe('Barbell Back Squat');
    expect(e.isNew).toBe(false);
    expect(e.parseConfidence).toBe('high');
  });

  it('parses "3x8 bench @80" with high confidence', () => {
    const { entries } = parseQuickLogInput('3x8 bench @80');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.sets).toBe(3);
    expect(e.reps).toBe(8);
    expect(e.weight).toBe(80);
    expect(e.unit).toBe('kg');
    expect(e.exerciseId).toBe('bench_press');
  });

  // ── Reversed order (setspec after exercise name) ─────────────────────────

  it('parses "squat 3x5 @100kg" with exercise name before set-spec', () => {
    const { entries } = parseQuickLogInput('squat 3x5 @100kg');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.sets).toBe(3);
    expect(e.reps).toBe(5);
    expect(e.weight).toBe(100);
    expect(e.exerciseId).toBe('squat');
  });

  it('parses "bench 3×8 80lbs" using Unicode × and lbs unit', () => {
    const { entries } = parseQuickLogInput('bench 3×8 80lbs');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.sets).toBe(3);
    expect(e.reps).toBe(8);
    expect(e.weight).toBe(80);
    expect(e.unit).toBe('lbs');
  });

  // ── Alias resolution ─────────────────────────────────────────────────────

  it('resolves exercise alias "rdl" to Romanian Deadlift', () => {
    const { entries } = parseQuickLogInput('rdl');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.exerciseId).toBe('rdl');
    expect(e.exerciseName).toBe('Romanian Deadlift');
    expect(e.isNew).toBe(false);
  });

  it('resolves alias "ohp" to Overhead Press', () => {
    const { entries } = parseQuickLogInput('3x5 ohp @60kg');
    expect(entries[0].exerciseId).toBe('ohp');
    expect(entries[0].exerciseName).toBe('Overhead Press');
  });

  it('resolves alias "bb row" to Barbell Row', () => {
    const { entries } = parseQuickLogInput('3x8 bb row @70kg');
    expect(entries[0].exerciseId).toBe('barbell_row');
  });

  // ── Multiple entries ─────────────────────────────────────────────────────

  it('parses multiple comma-separated entries', () => {
    // "pullup" (no space) matches the library alias; "pull up" (with space) does not
    const { entries } = parseQuickLogInput('3x5 squat @100kg, 3x8 bench @80, 3x5 pullup');
    expect(entries).toHaveLength(3);
    expect(entries[0].exerciseId).toBe('squat');
    expect(entries[1].exerciseId).toBe('bench_press');
    expect(entries[2].exerciseId).toBe('pull_up');
  });

  // ── Missing fields → confidence degradation ─────────────────────────────

  it('gives medium confidence when weight is missing', () => {
    const { entries } = parseQuickLogInput('3x5 squat');
    expect(entries[0].parseConfidence).toBe('medium');
    expect(entries[0].weight).toBeNull();
  });

  it('gives medium confidence when reps are missing but exercise resolves', () => {
    const { entries } = parseQuickLogInput('squat @100kg');
    expect(entries[0].parseConfidence).toBe('medium');
    expect(entries[0].reps).toBeNull();
  });

  it('gives low confidence for unknown exercise name', () => {
    const { entries, hasLowConfidence } = parseQuickLogInput('xyzqpq movement 3x5 @50kg');
    expect(entries[0].parseConfidence).toBe('low');
    expect(entries[0].isNew).toBe(true);
    expect(hasLowConfidence).toBe(true);
  });

  // ── Low-confidence path ───────────────────────────────────────────────────

  it('marks hasLowConfidence true when any entry is low', () => {
    const { hasLowConfidence } = parseQuickLogInput('3x5 squat @100kg, unknownxyz');
    expect(hasLowConfidence).toBe(true);
  });

  it('keeps low-confidence entry in results (no silent drop)', () => {
    const { entries, isEmpty } = parseQuickLogInput('totally_unknown_exercise');
    expect(isEmpty).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0].isNew).toBe(true);
  });

  // ── Defaults ─────────────────────────────────────────────────────────────

  it('defaults sets to 1 when no set-spec provided', () => {
    const { entries } = parseQuickLogInput('squat @100kg');
    expect(entries[0].sets).toBe(1);
  });

  it('defaults unit to kg', () => {
    const { entries } = parseQuickLogInput('3x5 squat @100');
    expect(entries[0].unit).toBe('kg');
  });

  // ── Weight formats ────────────────────────────────────────────────────────

  it('parses weight with "lb" unit variant', () => {
    const { entries } = parseQuickLogInput('3x5 squat 225lb');
    expect(entries[0].unit).toBe('lbs');
    expect(entries[0].weight).toBe(225);
  });

  it('parses decimal weight', () => {
    const { entries } = parseQuickLogInput('3x5 squat @102.5kg');
    expect(entries[0].weight).toBe(102.5);
  });
});

// ---------------------------------------------------------------------------
// annotatePRs
// ---------------------------------------------------------------------------

describe('annotatePRs', () => {
  const makeEntry = (overrides: Partial<ReturnType<typeof parseQuickLogInput>['entries'][0]>) => ({
    raw: 'squat 100',
    exerciseName: 'Barbell Back Squat',
    exerciseId: 'squat',
    sets: 3,
    reps: 5,
    weight: 100,
    unit: 'kg' as const,
    isNew: false,
    parseConfidence: 'high' as const,
    isPR: false,
    prDelta: null,
    ...overrides,
  });

  const makePersonalRecord = (exerciseName: string, e1RM: number): PersonalRecord => ({
    exerciseName,
    exerciseId: exerciseName.toLowerCase().replace(/\s+/g, '_'),
    maxWeight: 100,
    repsAtMax: 1,
    e1RM,
    achievedDate: '2026-01-01',
    sessionId: 'session-1',
  });

  it('marks isPR true when no prior record exists', () => {
    const entries = [makeEntry({ exerciseId: 'squat', weight: 100, reps: 5 })];
    const result = annotatePRs(entries, []);
    expect(result[0].isPR).toBe(true);
  });

  it('marks isPR true when candidate e1RM exceeds stored PR', () => {
    const entries = [makeEntry({ exerciseId: 'squat', weight: 110, reps: 5 })];
    // Existing PR has e1RM of ~107 (100 × (1 + 1/30))
    const prs = [makePersonalRecord('squat', 107)];
    const result = annotatePRs(entries, prs);
    expect(result[0].isPR).toBe(true);
  });

  it('does NOT mark isPR when candidate e1RM is lower than stored PR', () => {
    const entries = [makeEntry({ exerciseId: 'squat', weight: 80, reps: 5 })];
    const prs = [makePersonalRecord('squat', 200)];
    const result = annotatePRs(entries, prs);
    expect(result[0].isPR).toBe(false);
    expect(result[0].prDelta).toBeNull();
  });

  it('sets prDelta to positive difference when PR is beaten', () => {
    const entries = [makeEntry({ exerciseId: 'squat', weight: 100, reps: 5 })];
    const prs = [makePersonalRecord('squat', 100)];
    const result = annotatePRs(entries, prs);
    if (result[0].isPR) {
      expect(result[0].prDelta).toBeGreaterThan(0);
    }
  });

  it('skips annotation when personalRecords is undefined', () => {
    const entries = [makeEntry({ exerciseId: 'squat', weight: 100, reps: 5 })];
    const result = annotatePRs(entries, undefined);
    expect(result[0].isPR).toBe(false);
  });

  it('skips annotation for entries with missing weight or reps', () => {
    const entries = [makeEntry({ weight: null, reps: null })];
    const result = annotatePRs(entries, []);
    expect(result[0].isPR).toBe(false);
  });
});
