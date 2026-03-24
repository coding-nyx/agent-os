import { afterEach, describe, expect, it } from 'vitest';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';

describe('AutonomyFeatureFlags', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('defaults new autonomy surfaces to enabled', () => {
    expect(AutonomyFeatureFlags.isEnabled('anticipatoryPlanning')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('parsedCommandRouting')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('parsedCommandPlanning')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('chatActorIdentity')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('reminderOutcomeFeedback')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('routineProposals')).toBe(true);
    expect(AutonomyFeatureFlags.isEnabled('scoutExternalSignalLoop')).toBe(true);
  });

  it('supports test overrides for hardening scenarios', () => {
    AutonomyFeatureFlags.setTestOverrides({
      routineProposals: false,
      parsedCommandRouting: false,
      chatActorIdentity: false,
    });
    expect(AutonomyFeatureFlags.isEnabled('routineProposals')).toBe(false);
    expect(AutonomyFeatureFlags.isEnabled('parsedCommandRouting')).toBe(false);
    expect(AutonomyFeatureFlags.isEnabled('chatActorIdentity')).toBe(false);
  });
});
