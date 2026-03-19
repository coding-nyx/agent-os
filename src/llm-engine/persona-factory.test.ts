import { describe, it, expect } from 'vitest';
import { PersonaFactory } from './persona-factory';
import type { PersonaUserProfile, PersonaGlobalProjection } from './types';

function makeMockProfile(overrides: Partial<PersonaUserProfile> = {}): PersonaUserProfile {
  return {
    preferredName: 'Alex',
    pronouns: 'they/them',
    assignedSexAtBirth: 'male',
    agentPersonalityProvision: {
      orchestratorAlias: 'Nexus',
      agentGenders: { orchestrator: 'female', agnes: 'female', titan: 'non-binary', ledger: 'non-binary' },
    },
    ...overrides,
  };
}

function makeMockSoul(overrides: Partial<PersonaGlobalProjection> = {}): PersonaGlobalProjection {
  return {
    displayNames: { agnes: 'Agnes', titan: 'Titan', nexus: 'Nexus' },
    agentGenders: { agnes: 'female', titan: 'non-binary', nexus: 'female' },
    ...overrides,
  };
}

describe('PersonaFactory.generateSystemPrompt', () => {
  const baseRole = 'You are a helpful assistant.';

  it('returns bare baseRole when userProfile is null', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'agnes',
      baseRole,
      userProfile: null,
      globalSoul: makeMockSoul(),
    });
    expect(result).toBe(baseRole);
  });

  it('returns bare baseRole when globalSoul is null', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'agnes',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: null,
    });
    expect(result).toBe(baseRole);
  });

  it('injects identity context with alias and pronouns', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'agnes',
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
      moduleId: 'agnes',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('warm, empathetic');
  });

  it('applies neutral tone for non-binary gender', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'titan',
      baseRole,
      userProfile: makeMockProfile(),
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('balanced, inclusive');
  });

  it('adds biological context only for assignedSexAtBirth=female', () => {
    const femaleProfile = makeMockProfile({ assignedSexAtBirth: 'female' });
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'agnes',
      baseRole,
      userProfile: femaleProfile,
      globalSoul: makeMockSoul(),
    });
    expect(result).toContain('[BIOLOGICAL_CONTEXT]');
    expect(result).toContain('Female');
  });

  it('omits biological context for assignedSexAtBirth=male', () => {
    const result = PersonaFactory.generateSystemPrompt({
      moduleId: 'agnes',
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
