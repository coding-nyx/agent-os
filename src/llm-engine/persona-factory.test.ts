import { describe, it, expect } from 'vitest';
import { PersonaFactory } from './persona-factory';
import type { CoreUserProfile, GlobalProjection } from '../lib/types';

function makeMockProfile(overrides: Partial<CoreUserProfile> = {}): CoreUserProfile {
  return {
    uid: 'u1',
    email: 'test@test.com',
    preferredName: 'Alex',
    pronouns: 'they/them',
    onboardingComplete: true,
    assignedSexAtBirth: 'male',
    agentPersonalityProvision: {
      orchestratorAlias: 'Nexus',
      moduleAliases: { therapy: 'Agnes', trainer: 'Titan', ledger: 'Ledger' },
      moduleGenderProfiles: { orchestrator: 'female', therapy: 'female', trainer: 'male', ledger: 'non-binary' },
      personaOverlays: {},
    },
    securityPreferences: { vaultLocks: {} },
    schemaVersion: 2,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

function makeMockSoul(overrides: Partial<GlobalProjection> = {}): GlobalProjection {
  return {
    lastSync: '2025-01-01',
    overallWellnessScore: 7,
    displayNames: { therapy: 'Agnes', trainer: 'Titan', orchestrator: 'Nexus' },
    agentGenders: { therapy: 'female', trainer: 'male', orchestrator: 'female' },
    crossFunctionalState: {} as any,
    compactedInsights: [],
    ...overrides,
  };
}

describe('PersonaFactory.generateSystemPrompt', () => {
  const baseRole = 'You are a helpful assistant.';

  it('returns bare baseRole when userProfile is null', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: null,
      globalSoul: makeMockSoul(),
    });
    expect(result).toBe(baseRole);
  });

  it('returns bare baseRole when globalSoul is null', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: null,
    });
    expect(result).toBe(baseRole);
  });

  it('injects identity context with alias and pronouns', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('[IDENTITY_SYNC]');
    expect(result).toContain('Your Name: Agnes');
    expect(result).toContain('Alex');
    expect(result).toContain('they/them');
  });

  it('applies feminine tone for female gender', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('warm, empathetic');
  });

  it('applies masculine tone for male gender', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'trainer',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('direct, stoic');
  });

  it('adds biological context only for assignedSexAtBirth=female', () => {
    const femaleProfile = makeMockProfile({ assignedSexAtBirth: 'female' });
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: femaleProfile,
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('[BIOLOGICAL_CONTEXT]');
    expect(result).toContain('Female');
  });

  it('omits biological context for assignedSexAtBirth=male', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'therapy',
      baseRole,
      userProfile: makeMockProfile({ assignedSexAtBirth: 'male' }),
      globalSoul: makeMockSoul(),
    });
    expect(result).not.toContain('[BIOLOGICAL_CONTEXT]');
  });

  it('falls back to orchestrator alias when module not in displayNames', () => {
    const soul = makeMockSoul({ displayNames: {} });
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'forge',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: soul,
    });
    expect(result).toContain('Your Name: Nexus');
  });
});
