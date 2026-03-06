import { describe, it, expect } from 'vitest';
import { requiresModuleOnboarding, MODULES_REQUIRING_ONBOARDING } from './constants';

describe('requiresModuleOnboarding', () => {
  it('returns true for modules requiring onboarding', () => {
    expect(requiresModuleOnboarding('therapy')).toBe(true);
    expect(requiresModuleOnboarding('trainer')).toBe(true);
    expect(requiresModuleOnboarding('soma')).toBe(true);
    expect(requiresModuleOnboarding('ledger')).toBe(true);
  });

  it('returns false for modules not requiring onboarding', () => {
    expect(requiresModuleOnboarding('orchestrator')).toBe(false);
    expect(requiresModuleOnboarding('atlas')).toBe(false);
    expect(requiresModuleOnboarding('scout')).toBe(false);
    expect(requiresModuleOnboarding('forge')).toBe(false);
    expect(requiresModuleOnboarding('pulse')).toBe(false);
    expect(requiresModuleOnboarding('bridge')).toBe(false);
  });

  it('returns false for unknown module IDs', () => {
    expect(requiresModuleOnboarding('unknown')).toBe(false);
    expect(requiresModuleOnboarding('')).toBe(false);
  });

  it('MODULES_REQUIRING_ONBOARDING set contains exactly 4 modules', () => {
    expect(MODULES_REQUIRING_ONBOARDING.size).toBe(4);
  });
});
