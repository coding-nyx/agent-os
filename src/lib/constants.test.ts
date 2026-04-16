import { describe, it, expect } from 'vitest';
import { requiresModuleOnboarding, MODULES_REQUIRING_ONBOARDING } from './constants';
import { MODULE_MANIFEST } from './module-manifest';

describe('requiresModuleOnboarding', () => {
  it('returns true for modules requiring onboarding', () => {
    expect(requiresModuleOnboarding('ara')).toBe(true);
    expect(requiresModuleOnboarding('agnes')).toBe(true);
    expect(requiresModuleOnboarding('titan')).toBe(true);
    expect(requiresModuleOnboarding('ledger')).toBe(true);
    expect(requiresModuleOnboarding('atlas')).toBe(true);
  });

  it('returns false for modules not requiring onboarding', () => {
    expect(requiresModuleOnboarding('scout')).toBe(false);
    expect(requiresModuleOnboarding('forge')).toBe(false);
    expect(requiresModuleOnboarding('soma')).toBe(false);
    expect(requiresModuleOnboarding('bridge')).toBe(false);
  });

  it('returns false for unknown module IDs', () => {
    expect(requiresModuleOnboarding('unknown')).toBe(false);
    expect(requiresModuleOnboarding('')).toBe(false);
  });

  it('MODULES_REQUIRING_ONBOARDING matches manifest non-optional routed modules', () => {
    const expected = Object.values(MODULE_MANIFEST)
      .filter((entry) => entry.hasPage && entry.onboarding.mode !== 'optional')
      .map((entry) => entry.id)
      .sort();
    expect([...MODULES_REQUIRING_ONBOARDING].sort()).toEqual(expected);
  });
});
