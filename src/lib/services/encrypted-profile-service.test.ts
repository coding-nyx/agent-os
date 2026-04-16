import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage stub (jsdom may not expose .clear in every test runner config)
// ---------------------------------------------------------------------------

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    key(index: number) { return Array.from(store.keys())[index] ?? null; },
    removeItem(key: string) { store.delete(key); },
    setItem(key: string, value: string) { store.set(key, value); },
  } as Storage;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the data layer provider
vi.mock('@/lib/data-layer/provider', () => {
  const documents = new Map<string, Map<string, unknown>>();

  function getDocKey(collection: string, id: string) {
    return `${collection}/${id}`;
  }

  const mockDataLayer = {
    getDocument: vi.fn(async <T>(collection: string, id: string) => {
      const key = getDocKey(collection, id);
      const coll = documents.get(key);
      return (coll as T | undefined) ?? null;
    }),
    setDocument: vi.fn(async (collection: string, id: string, data: unknown) => {
      const key = getDocKey(collection, id);
      documents.set(key, data as Map<string, unknown>);
    }),
    subscribeToDocument: vi.fn((_collection: string, _id: string, _listener: unknown) => {
      return () => {};
    }),
    _documents: documents,
    _reset: () => documents.clear(),
  };

  return {
    getAraDataLayer: () => mockDataLayer,
    __mockDataLayer: mockDataLayer,
  };
});

// Mock encryption
vi.mock('@/lib/encryption', () => ({
  encryptWithKey: vi.fn(async (plaintext: string, _key: CryptoKey) => ({
    ciphertext: `encrypted:${plaintext}`,
    iv: 'mock-iv',
  })),
  decryptWithKey: vi.fn(async (envelope: { ciphertext: string; iv: string }, _key: CryptoKey) => {
    const prefix = 'encrypted:';
    if (envelope.ciphertext.startsWith(prefix)) {
      return envelope.ciphertext.slice(prefix.length);
    }
    throw new Error('Decryption failed');
  }),
}));

import { createEncryptedProfileService } from './encrypted-profile-service';
import { getAraDataLayer } from '@/lib/data-layer/provider';

// ---------------------------------------------------------------------------
// Test profile type
// ---------------------------------------------------------------------------

interface TestProfile {
  name: string;
  score: number;
  updatedAt?: string;
}

function createEmpty(): TestProfile {
  return { name: '', score: 0 };
}

function normalize(raw: unknown): TestProfile {
  const obj = raw as Record<string, unknown>;
  return {
    name: String(obj?.name ?? ''),
    score: Number(obj?.score ?? 0),
    updatedAt: obj?.updatedAt as string | undefined,
  };
}

function metadataProjection(profile: TestProfile) {
  return { name: profile.name };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEncryptedProfileService', () => {
  let service: ReturnType<typeof createEncryptedProfileService<TestProfile>>;
  const mockKey = {} as CryptoKey;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    const dl = getAraDataLayer() as unknown as { _reset: () => void };
    dl._reset();
    vi.clearAllMocks();

    service = createEncryptedProfileService<TestProfile>({
      collection: 'test_profiles',
      guestStorageKey: 'ara_test_profile_guest',
      createEmpty,
      normalize,
      metadataProjection,
    });
  });

  // -------------------------------------------------------------------------
  // Guest localStorage
  // -------------------------------------------------------------------------

  describe('guest localStorage', () => {
    it('loadGuest returns null when empty', () => {
      expect(service.loadGuest()).toBeNull();
    });

    it('saveGuest + loadGuest round-trips', () => {
      service.saveGuest({ name: 'Alice', score: 42 });
      const loaded = service.loadGuest();
      expect(loaded).toEqual({ name: 'Alice', score: 42 });
    });

    it('clearGuest removes the profile', () => {
      service.saveGuest({ name: 'Bob', score: 10 });
      service.clearGuest();
      expect(service.loadGuest()).toBeNull();
    });

    it('load without userId reads from guest', async () => {
      service.saveGuest({ name: 'Guest', score: 5 });
      const profile = await service.load({});
      expect(profile).toEqual({ name: 'Guest', score: 5 });
    });

    it('save without userId writes to guest', async () => {
      await service.save({ name: 'SavedGuest', score: 77 }, {});
      expect(service.loadGuest()).toEqual({ name: 'SavedGuest', score: 77 });
    });
  });

  // -------------------------------------------------------------------------
  // Firestore encrypted mode
  // -------------------------------------------------------------------------

  describe('authenticated + encrypted', () => {
    it('save encrypts and persists to Firestore', async () => {
      const dl = getAraDataLayer();
      await service.save(
        { name: 'Encrypted', score: 99 },
        { userId: 'user-1', encryptionKey: mockKey },
      );

      expect(dl.setDocument).toHaveBeenCalledWith(
        'test_profiles',
        'user-1',
        expect.objectContaining({
          payloadMode: 'encrypted',
          encryptedData: expect.stringContaining('encrypted:'),
          iv: 'mock-iv',
          salt: 'vault_salt_used',
        }),
      );
    });

    it('load decrypts from Firestore', async () => {
      // First save so there's a document
      await service.save(
        { name: 'LoadMe', score: 42 },
        { userId: 'user-2', encryptionKey: mockKey },
      );

      const profile = await service.load({ userId: 'user-2', encryptionKey: mockKey });
      expect(profile).toBeDefined();
      expect(profile!.name).toBe('LoadMe');
      expect(profile!.score).toBe(42);
    });

    it('load returns null when vault is locked (no encryptionKey)', async () => {
      // Save an encrypted doc first
      await service.save(
        { name: 'Locked', score: 1 },
        { userId: 'user-3', encryptionKey: mockKey },
      );

      // Try to load without key
      const profile = await service.load({ userId: 'user-3', encryptionKey: null });
      expect(profile).toBeNull();
    });

    it('load returns null when no document exists', async () => {
      const profile = await service.load({ userId: 'nonexistent', encryptionKey: mockKey });
      expect(profile).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Firestore plaintext mode
  // -------------------------------------------------------------------------

  describe('authenticated + plaintext (no vault)', () => {
    it('save stores plaintext when no encryptionKey', async () => {
      const dl = getAraDataLayer();
      await service.save(
        { name: 'Plain', score: 55 },
        { userId: 'user-4', encryptionKey: null },
      );

      expect(dl.setDocument).toHaveBeenCalledWith(
        'test_profiles',
        'user-4',
        expect.objectContaining({
          payloadMode: 'plaintext',
          plaintextData: expect.any(String),
        }),
      );
    });

    it('load reads plaintext document', async () => {
      await service.save(
        { name: 'ReadPlain', score: 33 },
        { userId: 'user-5', encryptionKey: null },
      );

      const profile = await service.load({ userId: 'user-5', encryptionKey: null });
      expect(profile).toBeDefined();
      expect(profile!.name).toBe('ReadPlain');
    });
  });

  // -------------------------------------------------------------------------
  // syncGuestToUser
  // -------------------------------------------------------------------------

  describe('syncGuestToUser', () => {
    it('migrates guest profile to Firestore when no existing doc', async () => {
      service.saveGuest({ name: 'MigrateMe', score: 88 });
      const migrated = await service.syncGuestToUser({ userId: 'user-6', encryptionKey: mockKey });
      expect(migrated).toBe(true);

      // Guest should be cleared after migration
      expect(service.loadGuest()).toBeNull();
    });

    it('does NOT overwrite existing user document', async () => {
      // Pre-populate Firestore
      await service.save(
        { name: 'Existing', score: 100 },
        { userId: 'user-7', encryptionKey: mockKey },
      );

      service.saveGuest({ name: 'ShouldNotOverwrite', score: 1 });
      const migrated = await service.syncGuestToUser({ userId: 'user-7', encryptionKey: mockKey });
      expect(migrated).toBe(false);
    });

    it('returns false when no guest profile', async () => {
      const migrated = await service.syncGuestToUser({ userId: 'user-8', encryptionKey: mockKey });
      expect(migrated).toBe(false);
    });

    it('returns false when no userId', async () => {
      service.saveGuest({ name: 'NoUser', score: 5 });
      const migrated = await service.syncGuestToUser({});
      expect(migrated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // subscribe
  // -------------------------------------------------------------------------

  describe('subscribe', () => {
    it('returns unsubscribe function for authenticated + key', () => {
      const unsub = service.subscribe(
        { userId: 'user-9', encryptionKey: mockKey },
        () => {},
      );
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('returns no-op unsubscribe when vault locked (userId but no key)', () => {
      const onUpdate = vi.fn();
      const unsub = service.subscribe(
        { userId: 'user-10', encryptionKey: null },
        onUpdate,
      );
      expect(typeof unsub).toBe('function');
      // onUpdate should NOT be called when vault is locked
      expect(onUpdate).not.toHaveBeenCalled();
      unsub();
    });

    it('calls onUpdate with guest profile for unauthenticated', () => {
      service.saveGuest({ name: 'SubGuest', score: 11 });
      const onUpdate = vi.fn();
      const unsub = service.subscribe({}, onUpdate);
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'SubGuest', score: 11 }),
      );
      unsub();
    });

    it('calls onUpdate with null for unauthenticated with no guest', () => {
      const onUpdate = vi.fn();
      const unsub = service.subscribe({}, onUpdate);
      expect(onUpdate).toHaveBeenCalledWith(null);
      unsub();
    });
  });
});
