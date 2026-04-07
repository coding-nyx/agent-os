/**
 * Credential Store Bridge — wires KMP CredentialStoreJs to Agnes encrypted storage.
 *
 * API keys are stored encrypted in Firestore under `/users/{uid}/credentials/api_keys`.
 * Each key is individually encrypted with the user's vault CryptoKey (AES-GCM).
 *
 * When no vault key is available (guest, vault locked), keys fall back to
 * localStorage (existing behavior) — this preserves backwards compatibility
 * while the migration is in progress.
 *
 * Once cortex-logic becomes a server, these callbacks are replaced with
 * server-side encrypted storage.
 */
import { CredentialStoreJs } from '@cortex-logic';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import { NexusLogger } from '@/lib/nexus-logger';

const CREDENTIAL_COLLECTION = 'credentials';
const CREDENTIAL_DOC_ID = 'api_keys';

// Legacy localStorage key names (for migration/fallback).
const LEGACY_KEYS: Record<string, string[]> = {
  nexus_credential_openrouter: [
    'VITE_OPENROUTER_API_KEY',
    'openrouter_api_key',
    'OPENROUTER_API_KEY',
  ],
  nexus_credential_gemini: ['VITE_GOOGLE_API_KEY'],
  nexus_credential_grok: ['VITE_GROK_API_KEY'],
};

let _instance: InstanceType<typeof CredentialStoreJs> | null = null;
let _currentUserId: string | null = null;
let _currentKey: CryptoKey | null = null;

function getUserCredentialPath(userId: string): string {
  return `users/${userId}/${CREDENTIAL_COLLECTION}`;
}

/**
 * Returns (or creates) the shared CredentialStoreJs singleton.
 *
 * Recreated when userId or encryptionKey changes (login, vault lock/unlock).
 */
export function getCredentialStore(
  userId: string | null,
  encryptionKey: CryptoKey | null,
): InstanceType<typeof CredentialStoreJs> | null {
  if (!CredentialStoreJs) return null;

  if (_instance && userId === _currentUserId && encryptionKey === _currentKey) {
    return _instance;
  }

  _currentUserId = userId;
  _currentKey = encryptionKey;

  const dataLayer = getNexusDataLayer();

  const jsGetEncrypted = (
    key: string,
    onComplete: (value: string | null) => void,
    onError: (err: string) => void,
  ) => {
    // Phase 1: Try Firestore encrypted storage (if user is logged in + vault unlocked).
    if (userId && encryptionKey) {
      const collectionPath = getUserCredentialPath(userId);
      dataLayer
        .getDocument<Record<string, unknown>>(collectionPath, CREDENTIAL_DOC_ID)
        .then(async (doc) => {
          if (!doc || !doc[key]) {
            // No encrypted value — try legacy localStorage migration.
            const legacyValue = readLegacyKey(key);
            if (legacyValue) {
              // Migrate: write to encrypted store, then return.
              try {
                const encrypted = await encryptWithKey(legacyValue, encryptionKey);
                const updates: Record<string, unknown> = { [key]: encrypted };
                await dataLayer.updateDocument(collectionPath, CREDENTIAL_DOC_ID, updates);
                clearLegacyKey(key);
              } catch (migrationErr) {
                NexusLogger.warn('CredentialStore', 'Encryption migration failed — using legacy key this session', migrationErr);
              }
              onComplete(legacyValue);
              return;
            }
            onComplete(null);
            return;
          }
          try {
            const decrypted = await decryptWithKey(
              doc[key] as { ciphertext: string; iv: string; salt: string },
              encryptionKey,
            );
            onComplete(decrypted);
          } catch (e) {
            NexusLogger.warn('CredentialStore', `Decryption failed for ${key}: ${e}`);
            onComplete(null);
          }
        })
        .catch((e) => onError(String(e)));
      return;
    }

    // Phase 2: Fallback to localStorage (guest, vault locked, no user).
    const legacyValue = readLegacyKey(key);
    onComplete(legacyValue);
  };

  const jsSetEncrypted = (
    key: string,
    value: string,
    onComplete: () => void,
    onError: (err: string) => void,
  ) => {
    if (userId && encryptionKey) {
      const collectionPath = getUserCredentialPath(userId);
      encryptWithKey(value, encryptionKey)
        .then((encrypted) => {
          const updates: Record<string, unknown> = { [key]: encrypted };
          return dataLayer.updateDocument(collectionPath, CREDENTIAL_DOC_ID, updates);
        })
        .then(() => {
          clearLegacyKey(key);
          onComplete();
        })
        .catch((e) => onError(String(e)));
      return;
    }

    // Fallback: write to localStorage.
    const legacyNames = LEGACY_KEYS[key];
    if (legacyNames && legacyNames.length > 0) {
      try {
        localStorage.setItem(legacyNames[0], value);
        onComplete();
      } catch (e) {
        onError(String(e));
      }
      return;
    }
    onError(`No storage available for key: ${key}`);
  };

  const jsDeleteKey = (
    key: string,
    onComplete: () => void,
    onError: (err: string) => void,
  ) => {
    clearLegacyKey(key);

    if (userId && encryptionKey) {
      const collectionPath = getUserCredentialPath(userId);
      const updates: Record<string, unknown> = { [key]: null };
      dataLayer
        .updateDocument(collectionPath, CREDENTIAL_DOC_ID, updates)
        .then(() => onComplete())
        .catch((e) => onError(String(e)));
      return;
    }

    onComplete();
  };

  _instance = new CredentialStoreJs(jsGetEncrypted, jsSetEncrypted, jsDeleteKey);
  return _instance;
}

/**
 * Invalidate the credential store singleton (e.g. on logout).
 */
export function invalidateCredentialStore(): void {
  _instance = null;
  _currentUserId = null;
  _currentKey = null;
}

// ── Legacy localStorage helpers ──────────────────────────────────────────

function readLegacyKey(key: string): string | null {
  if (typeof window === 'undefined') return null;

  // Also check env vars.
  const envMap: Record<string, string | undefined> = {
    nexus_credential_openrouter: import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined,
    nexus_credential_gemini: import.meta.env.VITE_GOOGLE_API_KEY as string | undefined,
    nexus_credential_grok: import.meta.env.VITE_GROK_API_KEY as string | undefined,
  };

  const fromEnv = envMap[key];
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  const legacyNames = LEGACY_KEYS[key];
  if (!legacyNames) return null;

  for (const name of legacyNames) {
    const value = localStorage.getItem(name);
    if (value && value.trim().length > 0) return value.trim();
  }

  return null;
}

function clearLegacyKey(key: string): void {
  if (typeof window === 'undefined') return;
  const legacyNames = LEGACY_KEYS[key];
  if (!legacyNames) return;
  for (const name of legacyNames) {
    localStorage.removeItem(name);
  }
}
