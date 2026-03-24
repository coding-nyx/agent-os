import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setNexusDataLayer } from '@/lib/data-layer/provider';

vi.mock('@/lib/encryption', () => ({
  decryptWithKey: vi.fn(),
  encryptWithKey: vi.fn().mockResolvedValue({
    ciphertext: 'encrypted-titan-profile',
    iv: 'titan-iv',
  }),
}));

const { createEmptyTitanProfile, saveTitanProfile } = await import('./titan-profile-service');

describe('titan-profile-service alive entity wiring', () => {
  afterEach(() => {
    setNexusDataLayer(new InMemoryDataProvider());
  });

  it('syncs workout and sleep alive entities when an authenticated profile is saved', async () => {
    const dataLayer = new InMemoryDataProvider();
    setNexusDataLayer(dataLayer);

    const profile = createEmptyTitanProfile();
    profile.workoutSessions = [
      {
        id: 'workout-1',
        routineId: 'routine-1',
        routineName: 'Push Day',
        date: '2026-03-02',
        startedAt: '2026-03-02T09:00:00.000Z',
        completedAt: '2026-03-02T10:00:00.000Z',
        exercises: [
          {
            exerciseName: 'Bench Press',
            plannedSets: 3,
            plannedReps: '5',
            sets: [
              { setNumber: 1, repsCompleted: 5, completed: true, weight: 80 },
              { setNumber: 2, repsCompleted: 5, completed: true, weight: 80 },
              { setNumber: 3, repsCompleted: 5, completed: true, weight: 80 },
            ],
          },
        ],
        totalVolume: 1200,
        status: 'completed',
      },
    ];
    profile.sleepLog = [
      {
        id: 'sleep-1',
        date: '2026-03-02',
        durationHours: 8,
        quality: 9,
        recordedAt: '2026-03-02T07:00:00.000Z',
      },
    ];

    await saveTitanProfile(profile, {
      userId: 'user-1',
      encryptionKey: {} as CryptoKey,
    });

    const savedProfile = await dataLayer.getDocument('titan_profiles', 'user-1');
    const aliveEntities = await dataLayer.listDocuments('users/user-1/alive_entities');

    expect(savedProfile).toMatchObject({
      encryptedData: 'encrypted-titan-profile',
      iv: 'titan-iv',
    });
    expect(aliveEntities.map((entity) => entity.id).sort()).toEqual([
      'alive.titan.sleep.sleep-1',
      'alive.titan.workout.workout-1',
    ]);
    expect(aliveEntities.every((entity) => entity.sourceModule === 'titan')).toBe(true);
  });
});
