import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeReadinessScore,
  emitClearanceCoordinationEvents,
  getClearanceChangeAction,
  isRestrictiveClearanceStatus,
  type ComputeReadinessPayload,
  type ReadinessResult,
} from './soma-field-actions';
import { Spine } from '@/lib/spine/spine-event-bus';

// ============================================================================
// computeReadinessScore — pure function, no mocks needed
// ============================================================================

describe('computeReadinessScore', () => {
  // ── Null / missing inputs default to 50 ───────────────────────────────

  it('returns default score of 50 when all inputs are missing', () => {
    const result = computeReadinessScore({});
    // All four sub-scores default to 50
    // 50*0.4 + 50*0.3 + 50*0.2 + 50*0.1 = 50
    expect(result.score).toBe(50);
    expect(result.breakdown.vitals).toBe(50);
    expect(result.breakdown.sleep).toBe(50);
    expect(result.breakdown.energy).toBe(50);
    expect(result.breakdown.stress).toBe(50);
    expect(result.level).toBe('fair');
  });

  it('returns default score when all inputs are undefined', () => {
    const result = computeReadinessScore({
      restingHeartRate: undefined,
      sleepQuality: undefined,
      energyLevel: undefined,
      stressPhysical: undefined,
    });
    expect(result.score).toBe(50);
  });

  // ── Vitals sub-score ─────────────────────────────────────────────────

  it('scores 100 vitals when restingHeartRate equals ideal (60 bpm)', () => {
    const result = computeReadinessScore({ restingHeartRate: 60 });
    expect(result.breakdown.vitals).toBe(100);
  });

  it('penalises 2 points per bpm deviation from 60', () => {
    // 70 bpm → |70 - 60| * 2 = 20 penalty → 80 vitals
    const result = computeReadinessScore({ restingHeartRate: 70 });
    expect(result.breakdown.vitals).toBe(80);
  });

  it('clamps vitals sub-score to 0 for extreme HR (e.g. 120 bpm)', () => {
    // |120-60| * 2 = 120 → clamped to 0
    const result = computeReadinessScore({ restingHeartRate: 120 });
    expect(result.breakdown.vitals).toBe(0);
  });

  it('clamps vitals sub-score to 0 for very low HR (e.g. 10 bpm)', () => {
    // |10-60| * 2 = 100 → clamped to 0
    const result = computeReadinessScore({ restingHeartRate: 10 });
    expect(result.breakdown.vitals).toBe(0);
  });

  // ── Sleep sub-score ──────────────────────────────────────────────────

  it('scores sleep as sleepQuality * 10', () => {
    const result = computeReadinessScore({ sleepQuality: 8 });
    expect(result.breakdown.sleep).toBe(80);
  });

  it('clamps sleep sub-score to 100 for quality > 10', () => {
    const result = computeReadinessScore({ sleepQuality: 11 });
    expect(result.breakdown.sleep).toBe(100);
  });

  it('clamps sleep sub-score to 0 for negative quality', () => {
    const result = computeReadinessScore({ sleepQuality: -1 });
    expect(result.breakdown.sleep).toBe(0);
  });

  // ── Energy sub-score ─────────────────────────────────────────────────

  it('scores energy as energyLevel * 10', () => {
    const result = computeReadinessScore({ energyLevel: 7 });
    expect(result.breakdown.energy).toBe(70);
  });

  // ── Stress sub-score ─────────────────────────────────────────────────

  it('scores stress inversely: (10 - stressPhysical) * 10', () => {
    // stressPhysical = 3 → (10 - 3) * 10 = 70
    const result = computeReadinessScore({ stressPhysical: 3 });
    expect(result.breakdown.stress).toBe(70);
  });

  it('scores stress 0 when stressPhysical is 10 (maximum stress)', () => {
    const result = computeReadinessScore({ stressPhysical: 10 });
    expect(result.breakdown.stress).toBe(0);
  });

  it('scores stress 100 when stressPhysical is 0 (no stress)', () => {
    const result = computeReadinessScore({ stressPhysical: 0 });
    expect(result.breakdown.stress).toBe(100);
  });

  // ── Weighted composite and level boundaries ───────────────────────────

  it('classifies score >= 80 as optimal', () => {
    // All sub-scores = 100 → weighted = 100
    const result = computeReadinessScore({
      restingHeartRate: 60,
      sleepQuality: 10,
      energyLevel: 10,
      stressPhysical: 0,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('optimal');
  });

  it('classifies score in 60–79 as good', () => {
    // Craft inputs so score lands in [60, 79]
    // sleepQuality=6 → sleep=60, energyLevel=6 → energy=60, stressPhysical=4 → stress=60, restingHR=60 → vitals=100
    // 100*0.4 + 60*0.3 + 60*0.2 + 60*0.1 = 40 + 18 + 12 + 6 = 76
    const result = computeReadinessScore({
      restingHeartRate: 60,
      sleepQuality: 6,
      energyLevel: 6,
      stressPhysical: 4,
    });
    expect(result.score).toBe(76);
    expect(result.level).toBe('good');
  });

  it('classifies score in 40–59 as fair', () => {
    // Default score of 50 = fair
    const result = computeReadinessScore({});
    expect(result.level).toBe('fair');
  });

  it('classifies score < 40 as poor', () => {
    // HR=110 → vitals = max(0, 100 - 50*2) = 0, sleep=0, energy=0, stress=0
    // 0*0.4 + 0*0.3 + 0*0.2 + 0*0.1 = 0
    const result = computeReadinessScore({
      restingHeartRate: 110,
      sleepQuality: 0,
      energyLevel: 0,
      stressPhysical: 10,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('poor');
  });

  // ── Recommendations ──────────────────────────────────────────────────

  it('includes vitals recommendation when vitals sub-score < 60', () => {
    // restingHR=90 → vitals = 100 - 30*2 = 40 < 60
    const result = computeReadinessScore({ restingHeartRate: 90 });
    expect(result.recommendations.some(r => r.toLowerCase().includes('heart rate'))).toBe(true);
  });

  it('includes sleep recommendation when sleep sub-score < 60', () => {
    const result = computeReadinessScore({ sleepQuality: 4 });
    expect(result.recommendations.some(r => r.toLowerCase().includes('sleep'))).toBe(true);
  });

  it('includes energy recommendation when energy sub-score < 60', () => {
    const result = computeReadinessScore({ energyLevel: 4 });
    expect(result.recommendations.some(r => r.toLowerCase().includes('energy') || r.toLowerCase().includes('nutrition'))).toBe(true);
  });

  it('includes stress recommendation when stressPhysical >= 7', () => {
    const result = computeReadinessScore({ stressPhysical: 8 });
    expect(result.recommendations.some(r => r.toLowerCase().includes('stress') || r.toLowerCase().includes('recovery'))).toBe(true);
  });

  it('caps recommendations at 3 even with all 4 sub-scores failing', () => {
    const result = computeReadinessScore({
      restingHeartRate: 100,
      sleepQuality: 2,
      energyLevel: 2,
      stressPhysical: 9,
    });
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('returns empty recommendations when all sub-scores are healthy', () => {
    const result = computeReadinessScore({
      restingHeartRate: 60,
      sleepQuality: 9,
      energyLevel: 9,
      stressPhysical: 1,
    });
    expect(result.recommendations).toHaveLength(0);
  });

  // ── Overrides ─────────────────────────────────────────────────────────

  it('respects sub-score overrides', () => {
    const result = computeReadinessScore({
      restingHeartRate: 80, // would normally give vitals=60
      overrides: { vitals: 95 },
    });
    expect(result.breakdown.vitals).toBe(95);
  });

  // ── Score bounds ──────────────────────────────────────────────────────

  it('never returns a score above 100', () => {
    const result = computeReadinessScore({ overrides: { vitals: 200, sleep: 200, energy: 200, stress: 200 } });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never returns a score below 0', () => {
    const result = computeReadinessScore({ overrides: { vitals: -50, sleep: -50, energy: -50, stress: -50 } });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('clearance coordination surfaces', () => {
  const emitSpy = vi.spyOn(Spine, 'emit');

  beforeEach(() => {
    emitSpy.mockClear();
    emitSpy.mockImplementation((
      (payload: Parameters<typeof Spine.emit>[0]) => payload
    ) as typeof Spine.emit);
  });

  afterEach(() => {
    emitSpy.mockClear();
  });

  it('treats conditional and denied clearances as restrictive firewall states', () => {
    expect(isRestrictiveClearanceStatus('conditional')).toBe(true);
    expect(isRestrictiveClearanceStatus('denied')).toBe(true);
    expect(isRestrictiveClearanceStatus('granted')).toBe(false);
    expect(getClearanceChangeAction('conditional')).toBe('revoked');
    expect(getClearanceChangeAction('denied')).toBe('revoked');
    expect(getClearanceChangeAction('granted')).toBe('issued');
  });

  it('emits Titan-facing block signals for restrictive clearances', () => {
    emitClearanceCoordinationEvents({
      id: 'cl-denied',
      activity: 'high_intensity',
      status: 'conditional',
      reason: 'Recent recovery concern',
      issuedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CLEARANCE_DENIED',
      source: 'soma',
      target: 'titan',
      data: expect.objectContaining({
        activity: 'high_intensity',
        status: 'conditional',
      }),
    }));
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'soma',
      target: 'titan',
      data: expect.objectContaining({
        clearanceId: 'cl-denied',
      }),
    }));
    expect(emitSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECOVERY_AVAILABLE' }));
  });

  it('emits recovery-available coordination when clearance is granted', () => {
    emitClearanceCoordinationEvents({
      id: 'cl-granted',
      activity: 'tempo_run',
      status: 'granted',
      reason: 'No contraindications detected',
      issuedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CLEARANCE_GRANTED',
      source: 'soma',
      target: 'titan',
    }));
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RECOVERY_AVAILABLE',
      source: 'soma',
      target: 'titan',
      data: expect.objectContaining({
        trigger: 'clearance_granted',
        clearanceId: 'cl-granted',
      }),
    }));
  });
});
