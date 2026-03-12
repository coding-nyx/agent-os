import { describe, it, expect } from 'vitest';
import { computeSleepQualityNSV } from './nsv-sleep-updater';

// ─── computeSleepQualityNSV ───────────────────────────────────────────────────
//
// Formula (piecewise, exact match to log_sleep handler):
//   if durationHours >= 7.5 : hoursScore = min(10, max(0, 10 - |durationHours - 8.25|))
//   else                     : hoursScore = min(10, max(0, durationHours × (10/7.5)))
//   sleepQuality = round(max(0, min(10, (hoursScore + qualityRating) / 2)) × 10) / 10
//
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSleepQualityNSV', () => {
  // ── Output shape ────────────────────────────────────────────────────────────

  it('returns an object with exactly the keys "biological.sleepQuality", "cognitive.energyBudget", "cognitive.focusScore"', () => {
    const result = computeSleepQualityNSV({ durationHours: 8, qualityRating: 7 });
    expect(Object.keys(result)).toHaveLength(3);
    expect(result).toHaveProperty('biological.sleepQuality');
    expect(result).toHaveProperty('cognitive.energyBudget');
    expect(result).toHaveProperty('cognitive.focusScore');
  });

  it('is a pure function — calling twice with the same input yields identical results', () => {
    const input = { durationHours: 7.5, qualityRating: 6 };
    expect(computeSleepQualityNSV(input)).toEqual(computeSleepQualityNSV(input));
  });

  // ── Optimal sleep ───────────────────────────────────────────────────────────

  it('optimal sleep (8.25h, quality 10) → sleepQuality = 10', () => {
    // hoursScore = min(10, max(0, 10 - |8.25 - 8.25|)) = 10
    // sleepQuality = (10 + 10) / 2 = 10
    const result = computeSleepQualityNSV({ durationHours: 8.25, qualityRating: 10 });
    expect(result['biological.sleepQuality']).toBe(10);
  });

  // ── hoursScore floors at 0 (< 7.5h branch) ─────────────────────────────────

  it('zero duration (0h, quality 5) → hoursScore = 0, sleepQuality = 2.5', () => {
    // hoursScore = min(10, max(0, 0 × (10/7.5))) = 0
    // sleepQuality = (0 + 5) / 2 = 2.5
    const result = computeSleepQualityNSV({ durationHours: 0, qualityRating: 5 });
    expect(result['biological.sleepQuality']).toBe(2.5);
  });

  // ── Short sleep (< 7.5h, linear ramp) ──────────────────────────────────────

  it('short sleep (4h, quality 5) → hoursScore ≈ 5.3, sleepQuality = 5.2', () => {
    // hoursScore = min(10, max(0, 4 × (10/7.5))) = 5.333...
    // sleepQuality = round((5.333... + 5) / 2 × 10) / 10
    //              = round(51.666...) / 10 = 52 / 10 = 5.2
    const result = computeSleepQualityNSV({ durationHours: 4, qualityRating: 5 });
    expect(result['biological.sleepQuality']).toBe(5.2);
  });

  it('below-optimal short sleep (3h, quality 5) → hoursScore = 4.0, sleepQuality = 4.5', () => {
    // hoursScore = min(10, max(0, 3 × (10/7.5))) = min(10, 4.0) = 4.0
    // sleepQuality = round((4.0 + 5) / 2 × 10) / 10 = round(45) / 10 = 4.5
    const result = computeSleepQualityNSV({ durationHours: 3, qualityRating: 5 });
    expect(result['biological.sleepQuality']).toBe(4.5);
  });

  // ── Long sleep (>= 7.5h, falls away from 8.25h peak) ──────────────────────

  it('long sleep (10h, quality 8) → hoursScore = 8.25, sleepQuality = 8.1', () => {
    // hoursScore = min(10, max(0, 10 - |10 - 8.25|)) = min(10, 8.25) = 8.25
    // sleepQuality = round((8.25 + 8) / 2 × 10) / 10 = round(81.25) / 10 = 81 / 10 = 8.1
    const result = computeSleepQualityNSV({ durationHours: 10, qualityRating: 8 });
    expect(result['biological.sleepQuality']).toBe(8.1);
  });

  // ── hoursScore dominates when qualityRating = 0 ────────────────────────────

  it('zero quality rating (8h, quality 0) → hoursScore dominates, sleepQuality = 4.9', () => {
    // hoursScore = min(10, max(0, 10 - |8 - 8.25|)) = min(10, 9.75) = 9.75
    // sleepQuality = round((9.75 + 0) / 2 × 10) / 10 = round(48.75) / 10 = 49 / 10 = 4.9
    const result = computeSleepQualityNSV({ durationHours: 8, qualityRating: 0 });
    expect(result['biological.sleepQuality']).toBe(4.9);
  });

  // ── Rounding ────────────────────────────────────────────────────────────────

  it('rounds result to exactly 1 decimal place (7.5h, quality 9 → 9.1)', () => {
    // hoursScore = min(10, max(0, 10 - |7.5 - 8.25|)) = min(10, 9.25) = 9.25
    // sleepQuality = round((9.25 + 9) / 2 × 10) / 10 = round(91.25) / 10 = 91 / 10 = 9.1
    const result = computeSleepQualityNSV({ durationHours: 7.5, qualityRating: 9 });
    const val = result['biological.sleepQuality'];
    expect(val).toBe(9.1);
    // Confirm at most 1 decimal place
    expect(String(val).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
  });

  // ── Clamp boundaries ────────────────────────────────────────────────────────

  it('result is clamped to minimum 0 (0h, quality 0) → sleepQuality = 0', () => {
    // hoursScore = 0, qualityRating = 0 → sleepQuality = 0
    const result = computeSleepQualityNSV({ durationHours: 0, qualityRating: 0 });
    expect(result['biological.sleepQuality']).toBe(0);
  });

  it('result is clamped to maximum 10 (8.25h, quality 10) → sleepQuality = 10', () => {
    const result = computeSleepQualityNSV({ durationHours: 8.25, qualityRating: 10 });
    expect(result['biological.sleepQuality']).toBeLessThanOrEqual(10);
    expect(result['biological.sleepQuality']).toBe(10);
  });

  it('does not produce NaN or Infinity for boundary inputs', () => {
    const cases: Array<{ durationHours: number; qualityRating: number }> = [
      { durationHours: 0, qualityRating: 0 },
      { durationHours: 8.25, qualityRating: 10 },
      { durationHours: 24, qualityRating: 0 },
    ];
    for (const input of cases) {
      const val = computeSleepQualityNSV(input)['biological.sleepQuality'];
      expect(Number.isFinite(val)).toBe(true);
    }
  });

  // ── Cognitive fields ────────────────────────────────────────────────────────

  it('optimal sleep (sleepQuality=10) → energyBudget=9.0, focusScore=8.0', () => {
    // durationHours=8.25, qualityRating=10 → sleepQuality=10
    // energyBudget = max(0, min(10, 10*0.9)) = 9.0
    // focusScore   = max(0, min(10, 10*0.8)) = 8.0
    const result = computeSleepQualityNSV({ durationHours: 8.25, qualityRating: 10 });
    expect(result['cognitive.energyBudget']).toBe(9.0);
    expect(result['cognitive.focusScore']).toBe(8.0);
  });

  it('poor sleep (sleepQuality=2) → energyBudget=1.8, focusScore=1.6', () => {
    // durationHours=1.5, qualityRating=2:
    //   hoursScore = 1.5 * (10/7.5) = 2.0
    //   sleepQuality = round((2.0 + 2) / 2 * 10) / 10 = 2.0
    // energyBudget = max(0, min(10, 2.0*0.9)) = 1.8
    // focusScore   = max(0, min(10, 2.0*0.8)) = 1.6
    const result = computeSleepQualityNSV({ durationHours: 1.5, qualityRating: 2 });
    expect(result['biological.sleepQuality']).toBe(2.0);
    expect(result['cognitive.energyBudget']).toBe(1.8);
    expect(result['cognitive.focusScore']).toBe(1.6);
  });

  it('zero sleep quality → cognitive.energyBudget=0, cognitive.focusScore=0', () => {
    // durationHours=0, qualityRating=0 → sleepQuality=0
    // energyBudget = max(0, min(10, 0*0.9)) = 0
    // focusScore   = max(0, min(10, 0*0.8)) = 0
    const result = computeSleepQualityNSV({ durationHours: 0, qualityRating: 0 });
    expect(result['cognitive.energyBudget']).toBe(0);
    expect(result['cognitive.focusScore']).toBe(0);
  });

  it('cognitive fields output keys are exactly "cognitive.energyBudget" and "cognitive.focusScore"', () => {
    const result = computeSleepQualityNSV({ durationHours: 7, qualityRating: 6 });
    expect(Object.keys(result)).toContain('cognitive.energyBudget');
    expect(Object.keys(result)).toContain('cognitive.focusScore');
    expect(typeof result['cognitive.energyBudget']).toBe('number');
    expect(typeof result['cognitive.focusScore']).toBe('number');
  });

  it('cognitive fields are rounded to 1 decimal place', () => {
    // durationHours=5, qualityRating=7:
    //   hoursScore = 5 * (10/7.5) = 6.666...
    //   sleepQuality = round((6.666 + 7) / 2 * 10) / 10 = round(68.33) / 10 = 6.8
    //   energyBudget = round(6.8*0.9*10)/10 = round(61.2)/10 = 6.1 (rounds to nearest → 61.2 → 61 → 6.1)
    //   focusScore   = round(6.8*0.8*10)/10 = round(54.4)/10 = 54/10 = 5.4
    const result = computeSleepQualityNSV({ durationHours: 5, qualityRating: 7 });
    const eb = result['cognitive.energyBudget'];
    const fs = result['cognitive.focusScore'];
    expect(Number.isFinite(eb)).toBe(true);
    expect(Number.isFinite(fs)).toBe(true);
    expect(String(eb).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
    expect(String(fs).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(1);
  });
});
