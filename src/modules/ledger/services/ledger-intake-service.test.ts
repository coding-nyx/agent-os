import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setAraDataLayer } from '@/lib/data-layer/provider';

vi.mock('@/lib/encryption', () => ({
  decryptWithKey: vi.fn(),
  encryptWithKey: vi.fn().mockResolvedValue({
    ciphertext: 'encrypted-ledger-profile',
    iv: 'ledger-iv',
  }),
}));

const { createEmptyLedgerProfile, saveLedgerProfile } = await import('./ledger-intake-service');

describe('ledger-intake-service alive entity wiring', () => {
  afterEach(() => {
    setAraDataLayer(new InMemoryDataProvider());
  });

  it('syncs financial goal and transaction alive entities when an authenticated profile is saved', async () => {
    const dataLayer = new InMemoryDataProvider();
    setAraDataLayer(dataLayer);

    const profile = createEmptyLedgerProfile();
    profile.financialGoals = [
      {
        id: 'fgoal-1',
        name: 'Emergency fund',
        type: 'savings',
        targetAmount: 10000,
        currentAmount: 2500,
        monthlyContribution: 400,
        priority: 'high',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];
    profile.transactions = [
      {
        id: 'tx-1',
        date: '2026-03-02',
        description: 'Rent',
        amount: 1800,
        type: 'expense',
        category: 'Housing',
        isRecurring: true,
      },
    ];

    await saveLedgerProfile(profile, {
      userId: 'user-1',
      encryptionKey: {} as CryptoKey,
    });

    const savedProfile = await dataLayer.getDocument('ledger_profiles', 'user-1');
    const aliveEntities = await dataLayer.listDocuments('users/user-1/alive_entities');

    expect(savedProfile).toMatchObject({
      encryptedData: 'encrypted-ledger-profile',
      iv: 'ledger-iv',
    });
    expect(aliveEntities.map((entity) => entity.id).sort()).toEqual([
      'alive.ledger.goal.fgoal-1',
      'alive.ledger.transaction.tx-1',
    ]);
    expect(aliveEntities.every((entity) => entity.sourceModule === 'ledger')).toBe(true);
  });
});
