import type { BatchOperation, AraDataLayer } from '@/lib/data-layer';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';

export interface ActionHubCallbacks {
  getDocument: (collection: string, id: string, onComplete: (json: string | null) => void, onError: (err: string) => void) => void;
  setDocument: (collection: string, id: string, dataJson: string, onComplete: () => void, onError: (err: string) => void) => void;
  updateDocument: (collection: string, id: string, updatesJson: string, onComplete: () => void, onError: (err: string) => void) => void;
  deleteDocument: (collection: string, id: string, onComplete: () => void, onError: (err: string) => void) => void;
  batchWrite: (operationsJson: string, onComplete: () => void, onError: (err: string) => void) => void;
  vaultEncrypt: ((plaintext: string, _keyIgnored: string, onComplete: (envelopeJson: string) => void, onError: (err: string) => void) => void) | null;
  vaultDecrypt: ((envelopeJson: string, _keyIgnored: string, onComplete: (plaintext: string) => void, onError: (err: string) => void) => void) | null;
}

/**
 * Safely parses a value that should be a JSON object.
 *
 * Kotlin/JS may pass the value as:
 *   - A JS string (normal case) — parse it
 *   - A double-encoded JSON string — parse twice (KMP serialization artifact)
 *   - A JS object directly (Kotlin/JS IR boxing edge case) — use as-is
 *
 * Throws on invalid JSON so the caller's onError path is taken instead of
 * writing garbage to Firestore.
 */
function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return JSON.parse(parsed); // double-encoded
    return parsed;
  }
  if (typeof value === 'object' && value !== null) {
    // Could be a Kotlin boxed String (not instanceof JS String, but toString() gives JSON)
    // or a plain JS object already parsed by Kotlin/JS IR.
    const str = (value as object).toString();
    if (str !== '[object Object]') {
      // Kotlin boxed String — its toString() returns the underlying string content
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return parsed;
    }
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Safely parses a value that should be a JSON array.
 *
 * Handles the same Kotlin/JS edge cases as `parseJsonObject` but validates
 * the result is an array. Throws on invalid input so the caller's onError
 * path is taken instead of silently dropping operations.
 */
function parseJsonArray<T = unknown>(value: unknown): T[] {
  let parsed: unknown;
  if (typeof value === 'string') {
    parsed = JSON.parse(value);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed); // double-encoded
  } else if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) return value as T[];
    const str = (value as object).toString();
    if (str !== '[object Object]') {
      parsed = JSON.parse(str);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    } else {
      parsed = value;
    }
  } else {
    throw new Error(`parseJsonArray: expected string or object, got ${typeof value}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`parseJsonArray: expected array, got ${typeof parsed}`);
  }
  return parsed as T[];
}

/**
 * Creates the flat callback object that the `ActionHubJs` KMP constructor expects.
 *
 * The `CryptoKey` is captured in the vault callbacks' closure and never crosses the
 * JSON boundary. KMP's `ActionCall.encryptionKey` is always null from this bridge.
 */
export function createActionHubCallbacks(
  dataLayer: AraDataLayer,
  encryptionKey: CryptoKey | null,
): ActionHubCallbacks {
  return {
    getDocument: (collection, id, onComplete, onError) => {
      dataLayer
        .getDocument<Record<string, unknown>>(collection, id)
        .then((record) => onComplete(record ? JSON.stringify(record) : null))
        .catch((err) => onError(String(err)));
    },

    setDocument: (collection, id, dataJson, onComplete, onError) => {
      try {
        const data = parseJsonObject(dataJson);
        dataLayer
          .setDocument(collection, id, data)
          .then(() => {
            onComplete();
          })
          .catch((err) => {
            console.error(`[TS Bridge] setDocument error: collection=${collection}, id=${id}, err=${err}`);
            onError(String(err));
          });
      } catch (err) {
        console.error(`[TS Bridge] setDocument parse error: ${err}`);
        onError(String(err));
      }
    },

    updateDocument: (collection, id, updatesJson, onComplete, onError) => {
      try {
        const updates = parseJsonObject(updatesJson);
        dataLayer
          .updateDocument(collection, id, updates)
          .then(() => {
            onComplete();
          })
          .catch((err) => {
            console.error(`[TS Bridge] updateDocument error: collection=${collection}, id=${id}, err=${err}`);
            onError(String(err));
          });
      } catch (err) {
        console.error(`[TS Bridge] updateDocument parse error: ${err}`);
        onError(String(err));
      }
    },

    deleteDocument: (collection, id, onComplete, onError) => {
      dataLayer
        .deleteDocument(collection, id)
        .then(() => onComplete())
        .catch((err) => onError(String(err)));
    },

    batchWrite: (operationsJson, onComplete, onError) => {
      try {
        const ops = parseJsonArray<{
          type: 'set' | 'update' | 'delete';
          collection: string;
          id: string;
          data?: unknown;
        }>(operationsJson);
        dataLayer
          .batchWrite(
            ops.map((op) => ({
              type: op.type,
              collection: op.collection,
              id: op.id,
              ...(op.data !== undefined ? { data: op.data } : {}),
            }) as BatchOperation),
          )
          .then(() => onComplete())
          .catch((err) => onError(String(err)));
      } catch (err) {
        onError(String(err));
      }
    },

    vaultEncrypt: encryptionKey
      ? (plaintext, _keyIgnored, onComplete, onError) => {
          encryptWithKey(plaintext, encryptionKey)
            .then((result) => onComplete(JSON.stringify({ ...result, version: 1 })))
            .catch((err) => onError(String(err)));
        }
      : null,

    vaultDecrypt: encryptionKey
      ? (envelopeJson, _keyIgnored, onComplete, onError) => {
          decryptWithKey(JSON.parse(envelopeJson) as { ciphertext: string; iv: string }, encryptionKey)
            .then((plaintext) => onComplete(plaintext))
            .catch((err) => onError(String(err)));
        }
      : null,
  };
}
