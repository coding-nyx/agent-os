import { describe, expect, it } from 'vitest';
import {
  getModuleOnboardingMode,
  getRoutedModulesByOnboardingMode,
  isModuleFastTrackEnabled,
  shouldGateModuleOnboarding
} from './onboarding-policy';

describe('onboarding-policy', () => {
  it('resolves known onboarding modes', () => {
    expect(getModuleOnboardingMode('agnes')).toBe('required');
    expect(getModuleOnboardingMode('titan')).toBe('hybrid');
    expect(getModuleOnboardingMode('forge')).toBe('optional');
  });

  it('gates onboarding for required/hybrid modules when profile is incomplete', () => {
    expect(shouldGateModuleOnboarding('agnes', null)).toBe(true);
    expect(shouldGateModuleOnboarding('titan', { onboardingComplete: false })).toBe(true);
  });

  it('does not gate optional modules', () => {
    expect(shouldGateModuleOnboarding('atlas', null)).toBe(false);
    expect(shouldGateModuleOnboarding('scout', { onboardingComplete: false })).toBe(false);
    expect(shouldGateModuleOnboarding('forge', { onboardingComplete: false })).toBe(false);
  });

  it('returns routed modules grouped by mode', () => {
    const grouped = getRoutedModulesByOnboardingMode();
    expect(grouped.required).toContain('agnes');
    expect(grouped.hybrid).toContain('titan');
    expect(grouped.optional).toContain('atlas');
    expect(grouped.optional).toContain('forge');
  });

  it('exposes fast-track capability flags', () => {
    expect(isModuleFastTrackEnabled('agnes')).toBe(true);
    expect(isModuleFastTrackEnabled('ledger')).toBe(true);
    expect(isModuleFastTrackEnabled('forge')).toBe(false);
  });
});
