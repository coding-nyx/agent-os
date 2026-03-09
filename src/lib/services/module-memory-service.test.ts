import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModuleMemoryService } from './module-memory-service';
import { EmbeddingService } from './embedding-service';
import { encryptWithKey, decryptWithKey } from '../encryption';
import { readDocOnce } from './firestore-once';

const firestoreSpies = vi.hoisted(() => ({
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  arrayUnion: (...values: unknown[]) => ({ arrayUnion: values }),
  onSnapshot: vi.fn()
}));

vi.mock('firebase/firestore', () => firestoreSpies);

vi.mock('../firebase', () => ({
  getFirebase: vi.fn(() => ({ db: {} }))
}));

vi.mock('./firestore-once', () => ({
  readDocOnce: vi.fn()
}));

vi.mock('./embedding-service', () => ({
  EmbeddingService: {
    embed: vi.fn(async () => [0.1, 0.2, 0.3])
  }
}));

vi.mock('../encryption', () => ({
  encryptWithKey: vi.fn(async (text: string) => ({ ciphertext: `enc:${text}`, iv: 'iv' })),
  decryptWithKey: vi.fn(async () => JSON.stringify({ latestSnapshot: 'decrypted', eventHistory: [] }))
}));

const encryptionKey = {} as CryptoKey;

describe('ModuleMemoryService', () => {
  beforeEach(() => {
    firestoreSpies.setDoc.mockReset();
    firestoreSpies.deleteDoc.mockReset();
    firestoreSpies.doc.mockClear();
    (readDocOnce as unknown as vi.Mock).mockReset();
    (EmbeddingService.embed as unknown as vi.Mock).mockClear();
    (encryptWithKey as unknown as vi.Mock).mockClear();
    (decryptWithKey as unknown as vi.Mock).mockClear();
  });

  it('skips commit when vault is required but no encryption key is present', async () => {
    (readDocOnce as unknown as vi.Mock).mockResolvedValue({ exists: () => false });

    await ModuleMemoryService.commitSession(
      'user1',
      'agnes',
      {
        id: 'evt',
        timestamp: new Date().toISOString(),
        summary: 's',
        keyInsights: [],
        sentiment: 0,
        tokenUsage: 0
      },
      'snapshot'
    );

    expect(firestoreSpies.setDoc).not.toHaveBeenCalled();
    expect(EmbeddingService.embed).not.toHaveBeenCalled();
  });

  it('encrypts payload and stamps vault metadata when a key is provided', async () => {
    (readDocOnce as unknown as vi.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        eventHistory: [{
          id: 'prev',
          timestamp: '2023-01-01',
          summary: 'old',
          keyInsights: [],
          sentiment: 0,
          tokenUsage: 0
        }],
        metadata: { foo: 'bar' }
      })
    });

    await ModuleMemoryService.commitSession(
      'user1',
      'agnes',
      {
        id: 'evt',
        timestamp: new Date().toISOString(),
        summary: 'new session',
        keyInsights: ['a'],
        sentiment: 1,
        tokenUsage: 10
      },
      'snapshot-text',
      { encryptionKey }
    );

    expect(encryptWithKey).toHaveBeenCalled();
    expect(firestoreSpies.setDoc).toHaveBeenCalledTimes(1);
    const [, payload] = firestoreSpies.setDoc.mock.calls[0];

    expect(payload.encryptedPayload).toEqual({ ciphertext: expect.stringContaining('enc:'), iv: 'iv' });
    expect(payload.latestSnapshot).toBe('');
    expect(payload.eventHistory).toEqual([]);
    expect(payload.metadata.vault.encrypted).toBe(true);
    expect(payload.metadata.vault.eventCount).toBe(2);
    expect(payload.metadata.foo).toBe('bar');
  });

  it('returns vaultLocked envelope when encrypted but no key is available', async () => {
    (readDocOnce as unknown as vi.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        encryptedPayload: { ciphertext: 'enc', iv: 'iv' },
        lastActive: '2024-01-01',
        metadata: { foo: 'bar' }
      })
    });

    const envelope = await ModuleMemoryService.getEnvelope('user1', 'agnes', null);
    expect(envelope?.eventHistory).toEqual([]);
    expect(envelope?.metadata.vaultLocked).toBe(true);
  });

  it('decrypts envelope when a key is supplied', async () => {
    (decryptWithKey as unknown as vi.Mock).mockResolvedValue(
      JSON.stringify({
        latestSnapshot: 'secret snapshot',
        eventHistory: [{
          id: 'evt1',
          timestamp: '2024-01-01',
          summary: 'hello',
          keyInsights: [],
          sentiment: 0,
          tokenUsage: 0
        }]
      })
    );

    (readDocOnce as unknown as vi.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        encryptedPayload: { ciphertext: 'enc', iv: 'iv' },
        lastActive: '2024-02-02',
        metadata: { foo: 'bar' }
      })
    });

    const envelope = await ModuleMemoryService.getEnvelope('user1', 'agnes', encryptionKey);
    expect(envelope?.latestSnapshot).toBe('secret snapshot');
    expect(envelope?.eventHistory[0].id).toBe('evt1');
    expect(envelope?.metadata.foo).toBe('bar');
  });
});
