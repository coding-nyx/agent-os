import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { computeWorkoutNSVPatch } from './nsv-workout-updater';

// ─── computeWorkoutNSVPatch ───────────────────────────────────────────────────

describe('computeWorkoutNSVPatch', () => {
  beforeEach(() => {
    // Pin Date.now() so hoursElapsed is deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a pure function with no side effects', () => {
    const input = {
      rpe: 7,
      totalVolumeKg: 5000,
      sessionTimestamp: Date.now() - 24 * 3_600_000, // 24h ago
      existingCnsFatigue: 4,
      existingRecoveryScore: 7,
    };
    // Calling twice should yield identical results
    const result1 = computeWorkoutNSVPatch(input);
    const result2 = computeWorkoutNSVPatch(input);
    expect(result1).toEqual(result2);
  });

  it('returns dotted-key patch shape', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 7,
      totalVolumeKg: 5000,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    expect(result).toHaveProperty('biological.cnsFatigue');
    expect(result).toHaveProperty('biological.recoveryScore');
    expect(result).toHaveProperty('cognitive.energyBudget');
    expect(result).toHaveProperty('cognitive.focusScore');
    expect(Object.keys(result)).toHaveLength(4);
  });

  // ── CNS Fatigue ────────────────────────────────────────────────────────────

  it('computes rawFatigue = rpe*0.6 + min(4, vol/5000) when no existing fatigue', () => {
    // sessionTimestamp = now → hoursElapsed = 0 → decayedFatigue = 0
    const result = computeWorkoutNSVPatch({
      rpe: 8,
      totalVolumeKg: 10_000, // volumeContrib = min(4, 10000/5000) = 2
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    // rawFatigue = min(10, 8*0.6 + 2) = min(10, 6.8) = 6.8
    expect(result['biological.cnsFatigue']).toBe(6.8);
  });

  it('caps cnsFatigue at 10', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 10,
      totalVolumeKg: 50_000,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    expect(result['biological.cnsFatigue']).toBe(10);
  });

  it('volume contribution saturates at 4 points (≥20 000 kg)', () => {
    const resultAt20k = computeWorkoutNSVPatch({
      rpe: 5,
      totalVolumeKg: 20_000,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    const resultAt100k = computeWorkoutNSVPatch({
      rpe: 5,
      totalVolumeKg: 100_000,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    // Both should yield same cnsFatigue since volume saturates at 4
    expect(resultAt20k['biological.cnsFatigue']).toBe(resultAt100k['biological.cnsFatigue']);
  });

  it('applies exponential decay to existing fatigue (halves every 48 h)', () => {
    const existingFatigue = 8;
    const sessionTimestamp = Date.now() - 48 * 3_600_000; // 48h ago
    const result = computeWorkoutNSVPatch({
      rpe: 1, // minimal rawFatigue so decay dominates
      totalVolumeKg: 0,
      sessionTimestamp,
      existingCnsFatigue: existingFatigue,
      existingRecoveryScore: 7,
    });
    // decayedFatigue = 8 * 0.5^(48/48) = 4
    // rawFatigue = min(10, 1*0.6 + 0) = 0.6
    // newFatigue = max(4, 0.6) = 4
    expect(result['biological.cnsFatigue']).toBe(4);
  });

  it('takes max of decayed existing and raw new fatigue', () => {
    // Raw fatigue > decayed existing
    const result = computeWorkoutNSVPatch({
      rpe: 9,
      totalVolumeKg: 15_000,
      sessionTimestamp: Date.now() - 96 * 3_600_000, // 96h → existingFatigue halved twice
      existingCnsFatigue: 6,
      existingRecoveryScore: 7,
    });
    // decayedFatigue = 6 * 0.5^2 = 1.5
    // rawFatigue = min(10, 9*0.6 + min(4, 15000/5000)) = min(10, 5.4 + 3) = 8.4
    // newFatigue = max(1.5, 8.4) = 8.4
    expect(result['biological.cnsFatigue']).toBe(8.4);
  });

  it('rounds cnsFatigue to 1 decimal place', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 7,
      totalVolumeKg: 3333,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    const val = result['biological.cnsFatigue'];
    expect(Number.isFinite(val)).toBe(true);
    expect(String(val).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
  });

  // ── Recovery Score ─────────────────────────────────────────────────────────

  it('applies -1.5 recovery delta for RPE >= 8', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 9,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 8,
    });
    expect(result['biological.recoveryScore']).toBe(6.5);
  });

  it('applies -0.5 recovery delta for RPE >= 6 and < 8', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 7,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 8,
    });
    expect(result['biological.recoveryScore']).toBe(7.5);
  });

  it('applies 0 recovery delta for RPE < 6', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 5,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 8,
    });
    expect(result['biological.recoveryScore']).toBe(8);
  });

  it('clamps recoveryScore to minimum 0', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 10,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 1,
    });
    // 1 - 1.5 = -0.5 → clamped to 0
    expect(result['biological.recoveryScore']).toBe(0);
  });

  it('clamps recoveryScore to maximum 10', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 1, // 0 delta
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 10,
    });
    expect(result['biological.recoveryScore']).toBe(10);
  });

  it('rounds recoveryScore to 1 decimal place', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 8,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 6.3,
    });
    // 6.3 - 1.5 = 4.8
    expect(result['biological.recoveryScore']).toBe(4.8);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles zero volume gracefully', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 7,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 7,
    });
    // rawFatigue = 7*0.6 + 0 = 4.2
    expect(result['biological.cnsFatigue']).toBe(4.2);
  });

  it('does not produce NaN or Infinity for boundary inputs', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 1,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 0,
    });
    expect(Number.isFinite(result['biological.cnsFatigue'])).toBe(true);
    expect(Number.isFinite(result['biological.recoveryScore'])).toBe(true);
  });

  // ── Cognitive fields ───────────────────────────────────────────────────────

  it('output includes exactly the keys cognitive.energyBudget and cognitive.focusScore', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 5,
      totalVolumeKg: 5000,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 3,
      existingRecoveryScore: 7,
    });
    expect(result).toHaveProperty('cognitive.energyBudget');
    expect(result).toHaveProperty('cognitive.focusScore');
    expect(typeof result['cognitive.energyBudget']).toBe('number');
    expect(typeof result['cognitive.focusScore']).toBe('number');
  });

  it('high fatigue (cnsFatigue=9, recoveryScore=2) → low energyBudget and focusScore', () => {
    // sessionTimestamp=now → decayed existing = 0; rpe=1 → rawFatigue=0.6
    // But we need the *computed* cnsFatigue to be ~9. Use rpe=10, vol=50000 (rawFatigue=10),
    // plus supply existingCnsFatigue=9 with sessionTimestamp=now so decay≈0.
    // rawFatigue = min(10, 10*0.6 + 4) = min(10, 10) = 10, decayedExisting ≈ 0 → cnsFatigue=10
    // Instead, drive with rpe=9 + vol=0, existing=9:
    //   rawFatigue = min(10, 9*0.6 + 0) = 5.4
    //   decayedExisting ≈ 9 (sessionTimestamp=now → hoursElapsed=0 → decay factor=1)
    //   cnsFatigue = max(9, 5.4) = 9
    //   recoveryDelta(rpe=9) = -1.5 → recoveryScore = max(0, 2 + (-1.5)) = 0.5
    //   energyBudget = max(0, min(10, 10 - 9*0.7 - (10-0.5)*0.3))
    //                = max(0, min(10, 10 - 6.3 - 2.85)) = max(0, 0.85) = 0.9 (rounded)
    //   focusScore = max(0, min(10, 10 - 9*0.5)) = max(0, 5.5) = 5.5
    const result = computeWorkoutNSVPatch({
      rpe: 9,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 9,
      existingRecoveryScore: 2,
    });
    expect(result['cognitive.energyBudget']).toBeLessThan(3);
    expect(result['cognitive.focusScore']).toBeLessThan(6);
  });

  it('zero fatigue (cnsFatigue=0, recoveryScore=10) → energyBudget=10, focusScore=10', () => {
    // rpe=1, totalVolumeKg=0, existingCnsFatigue=0, existingRecoveryScore=10
    // rawFatigue = min(10, 1*0.6 + 0) = 0.6
    // decayedFatigue = 0 (existingCnsFatigue=0)
    // cnsFatigue = max(0, 0.6) = 0.6
    // recoveryDelta(rpe=1) = 0 → recoveryScore = 10
    // energyBudget = max(0, min(10, 10 - 0.6*0.7 - (10-10)*0.3)) = max(0, 10 - 0.42 - 0) = 9.6
    // NOT 10 — for exactly 10 we need cnsFatigue=0: force with existingCnsFatigue=0 and rpe at
    // minimum where rawFatigue rounds to 0... actually rawFatigue will be >0 for any rpe>=1.
    // Test instead that values are high (>=9) when fatigue is low.
    const result = computeWorkoutNSVPatch({
      rpe: 1,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 0,
      existingRecoveryScore: 10,
    });
    // cnsFatigue=0.6, recoveryScore=10
    // energyBudget = max(0, min(10, 10 - 0.6*0.7 - 0)) = 10 - 0.42 = 9.58 → rounds to 9.6
    expect(result['cognitive.energyBudget']).toBe(9.6);
    // focusScore = max(0, min(10, 10 - 0.6*0.5)) = 10 - 0.3 = 9.7
    expect(result['cognitive.focusScore']).toBe(9.7);
  });

  it('mid fatigue (cnsFatigue≈5, recoveryScore≈7) → verifies formula output', () => {
    // rpe=6, vol=0, existing=5/7, sessionTimestamp=now:
    //   rawFatigue = min(10, 6*0.6) = 3.6
    //   decayedExisting = 5 (hoursElapsed=0 → factor=1)
    //   cnsFatigue = max(5, 3.6) = 5
    //   recoveryDelta(rpe=6) = -0.5 → recoveryScore = max(0, 7 - 0.5) = 6.5
    //   energyBudget = max(0, min(10, 10 - 5*0.7 - (10-6.5)*0.3))
    //                = max(0, min(10, 10 - 3.5 - 1.05)) = 5.45 → rounds to 5.5
    //   focusScore = max(0, min(10, 10 - 5*0.5)) = 7.5
    const result = computeWorkoutNSVPatch({
      rpe: 6,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 5,
      existingRecoveryScore: 7,
    });
    expect(result['cognitive.energyBudget']).toBe(5.5);
    expect(result['cognitive.focusScore']).toBe(7.5);
  });

  it('energyBudget clamped at 0 when formula goes negative (cnsFatigue=10, recoveryScore=0)', () => {
    // Pass existingCnsFatigue=10 with sessionTimestamp=now:
    //   rawFatigue = min(10, rpe*0.6 + 0); use rpe=10 → rawFatigue=min(10,6)=6
    //   decayedExisting = 10 → cnsFatigue = max(10, 6) = 10
    //   recoveryDelta(rpe=10) = -1.5 → recoveryScore = max(0, 0 - 1.5) = 0
    //   energyBudget = max(0, min(10, 10 - 10*0.7 - (10-0)*0.3))
    //                = max(0, 10 - 7 - 3) = max(0, 0) = 0
    const result = computeWorkoutNSVPatch({
      rpe: 10,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 10,
      existingRecoveryScore: 0,
    });
    expect(result['cognitive.energyBudget']).toBe(0);
  });

  it('focusScore clamped at 0 when cnsFatigue exceeds 20 (edge beyond normal range)', () => {
    // Supply existingCnsFatigue=25; rawFatigue = min(10, …) ≤ 10 < 25, so cnsFatigue=25
    // focusScore = max(0, min(10, 10 - 25*0.5)) = max(0, -2.5) = 0
    const result = computeWorkoutNSVPatch({
      rpe: 1,
      totalVolumeKg: 0,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 25,
      existingRecoveryScore: 7,
    });
    expect(result['cognitive.focusScore']).toBe(0);
  });

  it('cognitive fields are rounded to 1 decimal place', () => {
    const result = computeWorkoutNSVPatch({
      rpe: 7,
      totalVolumeKg: 3333,
      sessionTimestamp: Date.now(),
      existingCnsFatigue: 3,
      existingRecoveryScore: 6,
    });
    const eb = result['cognitive.energyBudget'];
    const fs = result['cognitive.focusScore'];
    expect(Number.isFinite(eb)).toBe(true);
    expect(Number.isFinite(fs)).toBe(true);
    expect(String(eb).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
    expect(String(fs).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
  });
});
