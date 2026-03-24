import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setNexusDataLayer } from '@/lib/data-layer/provider';

vi.mock('@/lib/encryption', () => ({
  decryptWithKey: vi.fn(),
  encryptWithKey: vi.fn().mockResolvedValue({
    ciphertext: 'encrypted-soma-profile',
    iv: 'soma-iv',
  }),
}));

const { createEmptySomaProfile, saveSomaProfile } = await import('./soma-profile-service');

describe('soma-profile-service alive entity wiring', () => {
  afterEach(() => {
    setNexusDataLayer(new InMemoryDataProvider());
  });

  it('syncs vital and physical assessment alive entities when an authenticated profile is saved', async () => {
    const dataLayer = new InMemoryDataProvider();
    setNexusDataLayer(dataLayer);

    const profile = createEmptySomaProfile('user-1');
    profile.vitalReadings = [
      {
        timestamp: Date.parse('2026-03-02T08:00:00.000Z'),
        heartRate: 58,
      },
    ];
    profile.physicalAssessments = [
      {
        timestamp: Date.parse('2026-03-02T09:00:00.000Z'),
        weight: 77.5,
        vo2Max: 46,
      },
    ];

    await saveSomaProfile(profile, {
      userId: 'user-1',
      encryptionKey: {} as CryptoKey,
    });

    const savedProfile = await dataLayer.getDocument('soma_profiles', 'user-1');
    const aliveEntities = await dataLayer.listDocuments('users/user-1/alive_entities');

    expect(savedProfile).toMatchObject({
      encryptedData: 'encrypted-soma-profile',
      iv: 'soma-iv',
    });
    expect(aliveEntities.map((entity) => entity.id).sort()).toEqual([
      `alive.assessment.${Date.parse('2026-03-02T09:00:00.000Z')}`,
      `alive.vital.${Date.parse('2026-03-02T08:00:00.000Z')}`,
    ]);
    expect(aliveEntities.every((entity) => entity.sourceModule === 'soma')).toBe(true);
  });
});
