import { beforeEach, describe, expect, it } from 'vitest';
import type { CoreUserProfile } from '../types';
import { InMemoryDataLayer } from '../data-layer/in-memory-data-layer';
import { CoreProfileService } from './core-profile-service';

describe('CoreProfileService orchestration preferences', () => {
  let dataLayer: InMemoryDataLayer;

  beforeEach(() => {
    dataLayer = new InMemoryDataLayer();
  });

  it('normalizes missing orchestration preferences for older profiles', async () => {
    const legacyProfile: CoreUserProfile = {
      uid: 'user-1',
      email: 'user@example.com',
      preferredName: 'Legacy User',
      pronouns: 'they/them',
      onboardingComplete: true,
      agentPersonalityProvision: {
        orchestratorAlias: 'Nexus',
        moduleAliases: { agnes: 'Agnes', titan: 'Titan', ledger: 'Ledger' },
        agentGenders: {
          orchestrator: 'female',
          agnes: 'female',
          titan: 'non-binary',
          ledger: 'female',
        },
        personaOverlays: {},
      },
      securityPreferences: {
        vaultLocks: {},
      },
      schemaVersion: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    await dataLayer.setDocument('users', legacyProfile.uid, legacyProfile);

    const profile = await CoreProfileService.getProfile(legacyProfile.uid, dataLayer);

    expect(profile?.orchestrationPreferences).toEqual({
      autopilotLevel: 2,
      historyMode: 'standard',
    });
  });

  it('initializes profiles with default orchestration preferences', async () => {
    const profile = await CoreProfileService.initializeProfile('user-2', 'new@example.com', dataLayer);

    expect(profile.orchestrationPreferences).toEqual({
      autopilotLevel: 2,
      historyMode: 'standard',
    });
  });

  it('persists autopilot updates and derives silent history for ghost mode', async () => {
    await CoreProfileService.initializeProfile('user-3', 'ghost@example.com', dataLayer);

    await CoreProfileService.updateOrchestrationPreferences(
      'user-3',
      { autopilotLevel: 5 },
      dataLayer,
    );

    const saved = await CoreProfileService.getProfile('user-3', dataLayer);

    expect(saved?.orchestrationPreferences).toEqual({
      autopilotLevel: 5,
      historyMode: 'silent',
    });
  });
});
