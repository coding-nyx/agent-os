/**
 * Generic factory for Firestore-backed profile services that store their data
 * in an AES-GCM encrypted (or optional plaintext) document.
 *
 * ## Complexity
 * - `load` / `save`: O(1) Firestore round-trip + O(n) JSON parse where n = payload bytes
 * - `subscribe`: O(1) setup; each update O(n) JSON parse
 * - `syncGuestToUser`: O(1) read + O(1) write
 * - Guest helpers: O(1) localStorage access
 *
 * ## Design decisions
 * - All encryption/decryption is delegated to `@/lib/encryption` so this
 *   factory carries zero crypto knowledge.
 * - `buildDoc` / `readDoc` are pure inner functions (no `this`), so callers
 *   can safely `.bind()` every exported method without losing internal context.
 * - Vault-locked state (userId present but no encryptionKey) is handled by
 *   NOT calling `onUpdate` in `subscribe`, leaving callers free to show their
 *   own locked-state UI without receiving a spurious `null`.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import {
  LoadContext,
  ProfileDocument,
  isEncryptedDoc,
} from '@/lib/types/encrypted-document';

// Re-export so service files only need one import location.
export type { LoadContext };

const VAULT_SALT_MARKER = 'vault_salt_used';

// ---------------------------------------------------------------------------
// Public configuration contract
// ---------------------------------------------------------------------------

/**
 * Static configuration provided once when constructing a service via
 * `createEncryptedProfileService`.
 *
 * @template TProfile  The domain profile type (e.g. TitanProfile).
 * @template TMetadata Shape of the plaintext metadata projection written
 *                     alongside the ciphertext for server-side queries.
 *                     Defaults to `Record<string, unknown>`.
 */
export interface EncryptedProfileServiceConfig<
  TProfile,
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Firestore collection name (e.g. `'titan_profiles'`). */
  collection: string;
  /** localStorage key for the unauthenticated guest profile. */
  guestStorageKey: string;
  /** Factory for a zero-state profile (used when nothing exists yet). */
  createEmpty: () => TProfile;
  /**
   * Normalise/sanitise raw data coming from Firestore or localStorage.
   * Must be able to handle `unknown` input gracefully.
   */
  normalize: (raw: unknown) => TProfile;
  /**
   * Extract the fields that should be stored as plaintext metadata alongside
   * the ciphertext (e.g. `onboardingComplete`, `privacyLevel`).
   */
  metadataProjection: (profile: TProfile) => TMetadata;
}

// ---------------------------------------------------------------------------
// Public service contract
// ---------------------------------------------------------------------------

export interface EncryptedProfileService<TProfile> {
  /**
   * Load the profile for the given context.
   * - Authenticated + key present → decrypt from Firestore.
   * - Authenticated + no key (vault locked) → `null` (cannot decrypt).
   * - No userId → read from localStorage guest slot.
   */
  load(ctx: LoadContext): Promise<TProfile | null>;

  /**
   * Persist the profile for the given context.
   * - Authenticated + key present → encrypt and write to Firestore.
   * - Authenticated + no key → encrypt with no key (plaintext mode).
   * - No userId → write to localStorage guest slot.
   */
  save(profile: TProfile, ctx: LoadContext): Promise<void>;

  /**
   * Subscribe to real-time profile updates.
   * Returns an unsubscribe function.
   *
   * Vault-locked state (userId present but no encryptionKey): the returned
   * unsubscribe is a no-op and `onUpdate` is **never** called, letting the
   * caller render its own vault-locked UI.
   */
  subscribe(
    ctx: LoadContext,
    onUpdate: (profile: TProfile | null) => void,
  ): () => void;

  /**
   * Copy the guest profile into the authenticated user's Firestore slot if
   * no document already exists there.  Returns `true` when a migration
   * actually happened.
   */
  syncGuestToUser(ctx: LoadContext): Promise<boolean>;

  /** Read the guest profile from localStorage, or `null` if absent. */
  loadGuest(): TProfile | null;
  /** Write the guest profile to localStorage. */
  saveGuest(profile: TProfile): void;
  /** Remove the guest profile from localStorage. */
  clearGuest(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fully-typed, encryption-aware profile service for a single Firestore
 * collection.
 *
 * @example
 * ```typescript
 * const service = createEncryptedProfileService<TitanProfile>({
 *   collection: 'titan_profiles',
 *   guestStorageKey: 'nexus_titan_profile_guest',
 *   createEmpty: createEmptyTitanProfile,
 *   normalize: normalizeTitanProfile,
 *   metadataProjection: (p) => ({ onboardingComplete: p.onboardingComplete }),
 * });
 * ```
 */
export function createEncryptedProfileService<
  TProfile,
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
>(
  config: EncryptedProfileServiceConfig<TProfile, TMetadata>,
): EncryptedProfileService<TProfile> {
  const { collection, guestStorageKey, normalize, metadataProjection } = config;

  // -------------------------------------------------------------------------
  // Internal helpers (pure functions — no `this` dependency)
  // -------------------------------------------------------------------------

  /**
   * Decode a `ProfileDocument` into a `TProfile`.
   *
   * Returns `null` when:
   * - `doc` is `null`
   * - The document is encrypted but the key is absent (vault locked)
   * - Decryption or JSON parsing fails
   *
   * Time: O(n) where n = ciphertext/plaintext byte length.
   */
  async function readDoc(
    doc: ProfileDocument | null,
    encryptionKey: CryptoKey | null,
  ): Promise<TProfile | null> {
    if (!doc) return null;

    if (isEncryptedDoc(doc)) {
      // Safety check for runtime legacy documents that may lack these fields
      // even though the static type marks them as required.
      if (!doc.encryptedData || !doc.iv) return null;
      if (!encryptionKey) return null; // vault is locked — caller handles this state

      try {
        const decrypted = await decryptWithKey(
          { ciphertext: doc.encryptedData, iv: doc.iv },
          encryptionKey,
        );
        return normalize(JSON.parse(decrypted));
      } catch {
        // Decryption failures (wrong key, corrupted data) are silent — the
        // caller (hook/component) is responsible for surfacing the error state.
        return null;
      }
    }

    // Plaintext mode — used when the user has no vault (hasVault = false).
    try {
      return normalize(JSON.parse(doc.plaintextData));
    } catch {
      return null;
    }
  }

  /**
   * Serialize a `TProfile` into the Firestore document shape.
   *
   * When `encryptionKey` is provided the payload is AES-GCM encrypted.
   * When absent the profile is stored as plaintext JSON for keyless users.
   *
   * Time: O(n) where n = serialised profile byte length.
   */
  async function buildDoc(
    profile: TProfile,
    encryptionKey: CryptoKey | null,
  ): Promise<ProfileDocument> {
    const normalized = normalize({
      ...(profile as object),
      updatedAt: new Date().toISOString(),
    });
    const metadata: Record<string, unknown> = {
      ...metadataProjection(normalized),
      lastActive: new Date().toISOString(),
    };

    if (encryptionKey) {
      const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
      return {
        payloadMode: 'encrypted',
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata,
      };
    }

    return {
      payloadMode: 'plaintext',
      plaintextData: JSON.stringify(normalized),
      metadata,
    };
  }

  // -------------------------------------------------------------------------
  // Guest localStorage helpers
  // -------------------------------------------------------------------------

  function loadGuestInternal(): TProfile | null {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    const raw = localStorage.getItem(guestStorageKey);
    if (!raw) return null;
    try {
      return normalize(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function saveGuestInternal(profile: TProfile): void {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
      return;
    }
    localStorage.setItem(guestStorageKey, JSON.stringify(profile));
  }

  function clearGuestInternal(): void {
    if (typeof localStorage === 'undefined' || typeof localStorage.removeItem !== 'function') {
      return;
    }
    localStorage.removeItem(guestStorageKey);
  }

  // -------------------------------------------------------------------------
  // Service implementation
  // -------------------------------------------------------------------------

  return {
    async load({ userId, encryptionKey }) {
      if (userId) {
        const dataLayer = getNexusDataLayer();
        const record = await dataLayer.getDocument<ProfileDocument>(collection, userId);
        if (!record) return null;
        // NexusRecord<T> = T & { id }, so the record is structurally a ProfileDocument.
        return readDoc(record as ProfileDocument, encryptionKey ?? null);
      }
      return loadGuestInternal();
    },

    async save(profile, { userId, encryptionKey }) {
      if (userId) {
        const dataLayer = getNexusDataLayer();
        const doc = await buildDoc(profile, encryptionKey ?? null);
        try {
          await dataLayer.setDocument(collection, userId, doc);
        } catch (e) {
          console.error(`[EncryptedProfileService:${collection}] Save failed:`, e);
        }
        return;
      }
      saveGuestInternal(profile);
    },

    subscribe({ userId, encryptionKey }, onUpdate) {
      if (userId && encryptionKey) {
        const key = encryptionKey; // capture for the async listener closure
        const dataLayer = getNexusDataLayer();
        return dataLayer.subscribeToDocument<ProfileDocument>(
          collection,
          userId,
          (record) => {
            // The listener must be synchronous per NexusDocumentListener<T>, but we
            // need an async decryption step. Fire-and-forget the Promise; errors are
            // caught inside readDoc and surface as null to the caller.
            void readDoc(
              record as ProfileDocument | null,
              key,
            ).then(onUpdate);
          },
        );
      }

      if (userId && !encryptionKey) {
        // Vault is locked: userId is known but we cannot decrypt.
        // Do NOT push null/empty profile — let the caller's vault-locked
        // state handling decide what to render.
        return () => {};
      }

      // Unauthenticated guest session.
      onUpdate(loadGuestInternal());
      return () => {};
    },

    async syncGuestToUser({ userId, encryptionKey }) {
      if (!userId) return false;

      const guest = loadGuestInternal();
      if (!guest) return false;

      const dataLayer = getNexusDataLayer();
      const existing = await dataLayer.getDocument<ProfileDocument>(collection, userId);

      if (existing) {
        // Cast is safe: NexusRecord<ProfileDocument> = ProfileDocument & { id }
        const existingDoc = existing as ProfileDocument;
        const hasData = isEncryptedDoc(existingDoc)
          ? !!existingDoc.encryptedData
          : !!existingDoc.plaintextData;
        if (hasData) return false; // user already has a profile — do not overwrite
      }

      const doc = await buildDoc(guest, encryptionKey ?? null);
      try {
        await dataLayer.setDocument(collection, userId, doc);
      } catch (e) {
        console.error(
          `[EncryptedProfileService:${collection}] SyncGuestToUser failed:`,
          e,
        );
        return false;
      }

      clearGuestInternal();
      return true;
    },

    loadGuest: () => loadGuestInternal(),
    saveGuest: (profile) => saveGuestInternal(profile),
    clearGuest: () => clearGuestInternal(),
  };
}
