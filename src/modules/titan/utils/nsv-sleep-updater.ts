/**
 * Pure NSV patch computation for sleep entries.
 * Identical algorithm to the log_sleep ActionHub handler.
 * No side effects, no React imports, no Firebase imports.
 */

export interface SleepNSVInput {
  durationHours: number;  // actual sleep duration
  qualityRating: number;  // subjective quality 0–10 (maps to SleepEntry.quality)
}

export interface SleepNSVPatch {
  'biological.sleepQuality': number;
  /** Titan's physical contribution to cognitive energy availability (0–10). Blended estimate only. */
  'cognitive.energyBudget': number;
  /** Titan's physical contribution to cognitive focus readiness (0–10). Blended estimate only. */
  'cognitive.focusScore': number;
}

/**
 * Computes the composite sleepQuality NSV value.
 *
 * hoursScore algorithm (piecewise, matches log_sleep handler exactly):
 *  - If durationHours >= 7.5: score = 10 − |durationHours − 8.25|, clamped to [0, 10].
 *    Peak of 10 at 8.25 h; falls linearly on either side of that optimum.
 *  - If durationHours < 7.5: score = durationHours × (10 / 7.5), clamped to [0, 10].
 *    Linear ramp from 0 h → 0 to 7.5 h → 10.
 *
 * Final quality = average of hoursScore and subjective qualityRating,
 * clamped to [0, 10], rounded to 1 decimal place.
 *
 * Pure function — no side effects, no React imports, no Firebase imports.
 */
export function computeSleepQualityNSV(input: SleepNSVInput): SleepNSVPatch {
  const hoursScore = input.durationHours >= 7.5
    ? Math.min(10, Math.max(0, 10 - Math.abs(input.durationHours - 8.25)))
    : Math.min(10, Math.max(0, input.durationHours * (10 / 7.5)));

  const sleepQuality = Math.round(
    Math.max(0, Math.min(10, (hoursScore + input.qualityRating) / 2)) * 10,
  ) / 10;

  // ── Cognitive (physical contribution only) ──────────────────────────────
  const energyBudget = Math.round(Math.max(0, Math.min(10, sleepQuality * 0.9)) * 10) / 10;
  const focusScore   = Math.round(Math.max(0, Math.min(10, sleepQuality * 0.8)) * 10) / 10;

  return {
    'biological.sleepQuality': sleepQuality,
    'cognitive.energyBudget': energyBudget,
    'cognitive.focusScore': focusScore,
  };
}
