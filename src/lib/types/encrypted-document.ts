/**
 * Canonical Firestore document shapes for encrypted and plaintext profiles.
 *
 * All profile services write one of these two shapes. Legacy documents
 * (written before `payloadMode` was introduced) lack the field entirely and
 * must be treated as `'encrypted'`.
 */

// ---------------------------------------------------------------------------
// Payload mode discriminant
// ---------------------------------------------------------------------------

export type PayloadMode = 'encrypted' | 'plaintext';

// ---------------------------------------------------------------------------
// Document shapes
// ---------------------------------------------------------------------------

export interface EncryptedDocumentBase {
  /** Absent on legacy documents — treat absence as `'encrypted'`. */
  payloadMode?: PayloadMode;
}

/** Encrypted profile stored in Firestore (current and legacy format). */
export interface EncryptedPayloadDocument extends EncryptedDocumentBase {
  payloadMode?: 'encrypted';
  encryptedData: string;            // AES-GCM ciphertext, base64-encoded
  iv: string;                       // AES-GCM initialisation vector, base64-encoded
  salt: string;                     // Constant marker: 'vault_salt_used'
  metadata: Record<string, unknown>; // Plaintext projection for server-side queries
}

/** Plaintext profile for users who have not set up a vault (hasVault = false). */
export interface PlaintextPayloadDocument extends EncryptedDocumentBase {
  payloadMode: 'plaintext';
  plaintextData: string;            // JSON.stringify of the profile object
  metadata: Record<string, unknown>; // Plaintext projection for server-side queries
}

export type ProfileDocument = EncryptedPayloadDocument | PlaintextPayloadDocument;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the document is encrypted (or is a legacy doc that
 * pre-dates `payloadMode` and must be decrypted).
 */
export function isEncryptedDoc(doc: ProfileDocument): doc is EncryptedPayloadDocument {
  return !doc.payloadMode || doc.payloadMode === 'encrypted';
}

// ---------------------------------------------------------------------------
// Shared load context (replaces the local type in every profile service)
// ---------------------------------------------------------------------------

export type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};
