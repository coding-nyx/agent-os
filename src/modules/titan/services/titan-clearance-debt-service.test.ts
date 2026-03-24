import { describe, expect, it } from 'vitest';
import { createEmptyTitanProfile } from './titan-profile-service';
import {
  getLatestTitanClearance,
  getTitanTrainingGateState,
  recordSomaVetoOverride,
  resolveSystemDebtsForGrantedClearance,
} from './titan-clearance-debt-service';
import type { ClearanceRecord, SomaProfile } from '@/lib/types';

function makeSomaProfile(clearances: ClearanceRecord[]): SomaProfile {
  const now = '2026-01-10T10:00:00.000Z';
  return {
    id: 'soma-1',
    userId: 'user-1',
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances,
    medicalImageAnalyses: [],
    medicalSummary: '',
    medicalOnboardingComplete: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe('titan-clearance-debt-service', () => {
  it('selects the latest clearance by issuedAt, not array order', () => {
    const older: ClearanceRecord = {
      id: 'older',
      activity: 'high_intensity',
      status: 'granted',
      reason: 'old',
      issuedAt: '2026-01-08T09:00:00.000Z',
    };
    const newer: ClearanceRecord = {
      id: 'newer',
      activity: 'high_intensity',
      status: 'conditional',
      reason: 'new',
      issuedAt: '2026-01-09T09:00:00.000Z',
    };

    expect(getLatestTitanClearance([older, newer])?.id).toBe('newer');
  });

  it('enforces recovery-first behavior when Soma clearance is restrictive', () => {
    const somaProfile = makeSomaProfile([
      {
        id: 'cl-1',
        activity: 'high_intensity',
        status: 'conditional',
        reason: 'Recent recovery concern',
        issuedAt: '2026-01-09T09:00:00.000Z',
      },
    ]);

    const gate = getTitanTrainingGateState({
      profile: createEmptyTitanProfile(),
      somaProfile,
      recoveryScore: 7,
      cnsFatigue: 3,
      isRecoveryActive: false,
    });

    expect(gate.clearanceStatus).toBe('conditional');
    expect(gate.shouldBlockFullTraining).toBe(true);
    expect(gate.shouldRequireExplicitOverride).toBe(true);
    expect(gate.presentationMode).toBe('recovery');
    expect(gate.enforcementReason).toContain('Conditional clearance');
  });

  it('records explicit Soma veto overrides as active system debt', () => {
    const profile = createEmptyTitanProfile();
    const outcome = recordSomaVetoOverride(profile, {
      clearance: {
        id: 'cl-override',
        activity: 'high_intensity',
        status: 'denied',
        reason: 'Acute pain flare',
        issuedAt: '2026-01-09T09:00:00.000Z',
      },
      now: '2026-01-10T10:00:00.000Z',
    });

    expect(outcome.profile.clearanceOverrides).toHaveLength(1);
    expect(outcome.profile.systemDebts).toHaveLength(1);
    expect(outcome.override.systemDebtId).toBe(outcome.debt.id);
    expect(outcome.debt.status).toBe('active');
    expect(outcome.debt.vectorImpact).toEqual({
      vitality: -0.18,
      output: -0.12,
      friction: 0.1,
    });
    expect(outcome.alertMessage).toContain('audit history');
  });

  it('resolves active override debt when Soma later grants clearance', () => {
    const base = createEmptyTitanProfile();
    const overrideOutcome = recordSomaVetoOverride(base, {
      clearance: {
        id: 'cl-denied',
        activity: 'high_intensity',
        status: 'denied',
        reason: 'Hold training',
        issuedAt: '2026-01-09T09:00:00.000Z',
      },
      now: '2026-01-10T10:00:00.000Z',
    });

    const resolution = resolveSystemDebtsForGrantedClearance(
      overrideOutcome.profile,
      {
        id: 'cl-granted',
        activity: 'high_intensity',
        status: 'granted',
        reason: 'Cleared again',
        issuedAt: '2026-01-11T08:00:00.000Z',
      },
      '2026-01-11T08:05:00.000Z',
    );

    expect(resolution.resolvedIds).toEqual([overrideOutcome.debt.id]);
    expect(resolution.profile.systemDebts?.[0]).toMatchObject({
      id: overrideOutcome.debt.id,
      status: 'resolved',
      resolvedAt: '2026-01-11T08:05:00.000Z',
    });
  });
});
