import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setAraDataLayer } from '@/lib/data-layer/provider';

const updateCrossFunctionalState = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/encryption', () => ({
  decryptWithKey: vi.fn(),
  encryptWithKey: vi.fn().mockResolvedValue({
    ciphertext: 'encrypted-atlas-profile',
    iv: 'atlas-iv',
  }),
}));

vi.mock('@/lib/services/global-projection-service', () => ({
  GlobalProjectionService: {
    updateCrossFunctionalState,
  },
}));

const { createEmptyAtlasProfile, saveAtlasProfile } = await import('./atlas-profile-service');

describe('atlas-profile-service alive entity wiring', () => {
  afterEach(() => {
    updateCrossFunctionalState.mockClear();
    setAraDataLayer(new InMemoryDataProvider());
  });

  it('syncs goal and habit alive entities when an authenticated profile is saved', async () => {
    const dataLayer = new InMemoryDataProvider();
    setAraDataLayer(dataLayer);

    const profile = createEmptyAtlasProfile();
    profile.goals = [
      {
        id: 'goal-1',
        title: 'Ship phase 0.1',
        description: 'Connect runtime wiring',
        deadline: '2026-03-31',
        milestones: [],
        associatedTaskIds: ['task-1'],
        successCriteria: 'Runtime slice shipped',
        progressPercent: 55,
        status: 'active',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ];
    profile.habits = [
      {
        id: 'habit-1',
        title: 'Morning review',
        frequency: 'daily',
        targetStreak: 30,
        currentStreak: 7,
        bestStreak: 10,
        energyCost: 2,
        minimumViableVersion: 'Review top priorities',
        status: 'active',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ];

    await saveAtlasProfile(profile, {
      userId: 'user-1',
      encryptionKey: {} as CryptoKey,
    });

    const savedProfile = await dataLayer.getDocument('atlas_profiles', 'user-1');
    const aliveEntities = await dataLayer.listDocuments('users/user-1/alive_entities');

    expect(savedProfile).toMatchObject({
      encryptedData: 'encrypted-atlas-profile',
      iv: 'atlas-iv',
    });
    expect(aliveEntities.map((entity) => entity.id).sort()).toEqual([
      'alive.goal.goal-1',
      'alive.habit.habit-1',
    ]);
    expect(aliveEntities.every((entity) => entity.sourceModule === 'atlas')).toBe(true);
    expect(updateCrossFunctionalState).toHaveBeenCalledWith(
      'user-1',
      { cognitive: { activeLoad: profile.taskGraph.length } },
    );
  });
});
