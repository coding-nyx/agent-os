// --- Soma Diagnosis Session Service ---
//
// Manages the full lifecycle of a single Soma diagnosis session:
//
//   startDiagnosisSession  →  upload + Firestore record (status: 'uploaded')
//   triggerParse           →  download, extract, LLM, encrypt, store (status: 'reviewed')
//   getActiveDiagnosisSession → fetch + decrypt most-recent non-error session
//   closeDiagnosis         →  optional merge → cleanup → Spine event
//   discardDiagnosis       →  cleanup → Spine event
//
// CRITICAL isolation contract:
//   - NO Spine events are emitted during upload or parsing.
//   - NO SomaProfile mutations, no GlobalSoul updates, no NSV writes
//     until closeDiagnosis is called with merge=true.
//   - Spine events fire ONLY after successful cleanup (doc + storage deleted).
//
// Encryption:
//   - The structured analysis payload is AES-GCM encrypted (same pattern as
//     soma-profile-service.ts) before writing to Firestore.
//   - rawText is NEVER written anywhere — only a SHA-256 hash is stored.
//
// Firebase Storage:
//   - Files are uploaded via getFirebase().storage (no NexusDataLayer abstraction
//     exists for binary blob storage).
//   - Firestore session documents use getNexusDataLayer() (NexusDataLayer boundary).

import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { getFirebase } from '@/lib/firebase';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEventType } from '@/lib/types';
import type { ExtractedDataItem } from '@/core/diagnosis/types';
import { mergeSomaDiagnosisData } from '../diagnosis/soma-diagnosis-merge';
import {
  DocumentAnalysisService,
  type DocumentAnalysisResult,
  type ExtractedField,
} from '@/lib/services/document-analysis-service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSIONS_COLLECTION = (uid: string) => `soma_diagnoses/${uid}/sessions`;
const STORAGE_PREFIX = 'diagnoses';

/** Sessions expire after 24 hours — a safety TTL in case the user abandons. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiagnosisStatus = 'uploading' | 'uploaded' | 'parsing' | 'reviewed' | 'error';

/**
 * A single Soma diagnosis session record stored in Firestore.
 * Non-PHI metadata fields are stored in plaintext for querying.
 * PHI (extracted fields, raw text hash) is stored only in the encrypted envelope.
 */
export interface SomaDiagnosisSession {
  id: string;
  userId: string;
  status: DiagnosisStatus;
  uploadedAt: string;
  // ── Plaintext metadata (non-PHI, queryable) ───────────────────────────────
  /** Original file name — contains no patient data. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** MIME type. */
  mimeType: string;
  /** Firebase Storage path: diagnoses/{uid}/{id}/{filename} */
  sourceStoragePath: string;
  // ── Encrypted payload (PHI — AES-GCM with vault key) ─────────────────────
  /** Base64 ciphertext of JSON: { extractedFields, rawTextHash, analysedAt } */
  encryptedData?: string;
  /** Base64 IV for the AES-GCM cipher. */
  iv?: string;
  // ── Error info (plaintext, no PHI) ───────────────────────────────────────
  parseError?: string;
  /** uploadedAt + 24 h — TTL safety net so orphaned sessions self-expire. */
  expiresAt: string;
}

/** Stored inside the AES-GCM encrypted envelope — never persisted in plaintext. */
interface DiagnosisEncryptedPayload {
  extractedFields: ExtractedField[];
  /** SHA-256 hex digest of the raw document text. Used for deduplication only. */
  rawTextHash: string;
  analysedAt: string;
}

// ── Private Helpers ───────────────────────────────────────────────────────────

async function computeTextHash(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptPayload(
  payload: DiagnosisEncryptedPayload,
  key: CryptoKey,
): Promise<{ encryptedData: string; iv: string }> {
  const encrypted = await encryptWithKey(JSON.stringify(payload), key);
  return { encryptedData: encrypted.ciphertext, iv: encrypted.iv };
}

async function decryptPayload(
  encryptedData: string,
  iv: string,
  key: CryptoKey,
): Promise<DiagnosisEncryptedPayload | null> {
  try {
    const decrypted = await decryptWithKey({ ciphertext: encryptedData, iv }, key);
    const parsed = JSON.parse(decrypted) as DiagnosisEncryptedPayload;
    if (!Array.isArray(parsed.extractedFields)) return null;
    return parsed;
  } catch (e) {
    console.error('[DiagnosisSessionService] Failed to decrypt diagnosis payload:', e);
    return null;
  }
}

/** Update only the session status (and optional error) in Firestore. */
async function updateSessionStatus(
  uid: string,
  sessionId: string,
  status: DiagnosisStatus,
  extra?: Partial<SomaDiagnosisSession>,
): Promise<void> {
  const dataLayer = getNexusDataLayer();
  await dataLayer.updateDocument<SomaDiagnosisSession>(
    SESSIONS_COLLECTION(uid),
    sessionId,
    { status, ...extra },
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts a new diagnosis session by uploading the file to Firebase Storage
 * and writing an initial session record to Firestore.
 *
 * NO Spine events are emitted here.
 * Status flow: (new) → 'uploading' → 'uploaded' (on success) / 'error' (on failure)
 *
 * @param uid           - Authenticated user's Firebase UID.
 * @param file          - The document File to upload.
 * @param encryptionKey - The vault AES-GCM key (used later in triggerParse).
 * @returns The new session ID (UUID).
 * @throws  If Firebase Storage or Firestore write fails.
 */
export async function startDiagnosisSession(
  uid: string,
  file: File,
  encryptionKey: CryptoKey,
): Promise<string> {
  // encryptionKey is accepted here so the caller validates the vault is unlocked
  // before starting; we don't use it for the upload itself.
  void encryptionKey;

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const storagePath = `${STORAGE_PREFIX}/${uid}/${sessionId}/${file.name}`;
  const dataLayer = getNexusDataLayer();

  // Create session doc with 'uploading' status first so the UI can show progress.
  const sessionDoc: SomaDiagnosisSession = {
    id: sessionId,
    userId: uid,
    status: 'uploading',
    uploadedAt: now,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    sourceStoragePath: storagePath,
    expiresAt,
  };

  await dataLayer.setDocument<SomaDiagnosisSession>(
    SESSIONS_COLLECTION(uid),
    sessionId,
    sessionDoc,
  );

  try {
    // Upload file to Firebase Storage.
    const { storage } = getFirebase();
    if (!storage) {
      throw new Error('[DiagnosisSessionService] Firebase Storage is not initialised.');
    }
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });

    // Mark session as uploaded.
    await updateSessionStatus(uid, sessionId, 'uploaded');

    return sessionId;
  } catch (uploadError) {
    // Record failure — do not rethrow without marking the session as errored.
    const message =
      uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
    await updateSessionStatus(uid, sessionId, 'error', { parseError: message }).catch(() => {
      /* best-effort — original error is still surfaced */
    });
    throw uploadError;
  }
}

/**
 * Downloads the previously uploaded file from Firebase Storage, extracts text,
 * builds an LLM prompt, calls the provided LLM callback, parses and encrypts
 * the result, then persists it to Firestore.
 *
 * The `llmCallback` parameter keeps this service LLM-agnostic — the UI layer
 * supplies the actual LLM call (e.g. via `useModuleAI`).
 *
 * NO Spine events are emitted here. Diagnosis remains fully isolated.
 * Status flow: 'uploaded' → 'parsing' → 'reviewed' / 'error'
 *
 * @param uid           - Authenticated user's Firebase UID.
 * @param sessionId     - Session ID returned by startDiagnosisSession.
 * @param encryptionKey - Vault AES-GCM key for encrypting the analysis result.
 * @param llmCallback   - Async function that accepts a prompt string and returns the LLM response.
 * @returns The fully parsed DocumentAnalysisResult (rawText is in-memory only).
 * @throws  If storage download, text extraction, or Firestore write fails.
 */
export async function triggerParse(
  uid: string,
  sessionId: string,
  encryptionKey: CryptoKey,
  llmCallback: (prompt: string) => Promise<string>,
): Promise<DocumentAnalysisResult> {
  const dataLayer = getNexusDataLayer();

  // Load session metadata.
  const sessionRecord = await dataLayer.getDocument<SomaDiagnosisSession>(
    SESSIONS_COLLECTION(uid),
    sessionId,
  );

  if (!sessionRecord) {
    throw new Error(`[DiagnosisSessionService] Session ${sessionId} not found for user ${uid}.`);
  }

  const session = sessionRecord as SomaDiagnosisSession;

  if (session.status === 'error') {
    throw new Error(`[DiagnosisSessionService] Session ${sessionId} is in error state: ${session.parseError ?? 'unknown'}`);
  }

  // Transition to 'parsing'.
  await updateSessionStatus(uid, sessionId, 'parsing');

  try {
    // ── 1. Download file from Firebase Storage ────────────────────────────
    const { storage } = getFirebase();
    if (!storage) {
      throw new Error('[DiagnosisSessionService] Firebase Storage is not initialised.');
    }

    const storageRef = ref(storage, session.sourceStoragePath);
    const downloadUrl = await getDownloadURL(storageRef);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`[DiagnosisSessionService] Failed to fetch file from Storage: HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const reconstructedFile = new File([blob], session.fileName, {
      type: session.mimeType || blob.type,
    });

    // ── 2. Extract text ───────────────────────────────────────────────────
    const { text: rawText, type: docType } = await DocumentAnalysisService.extractText(
      reconstructedFile,
    );

    // ── 3. Build prompt and call LLM ──────────────────────────────────────
    const prompt = DocumentAnalysisService.buildAnalysisPrompt(rawText);
    const llmResponse = await llmCallback(prompt);

    // ── 4. Parse LLM response ─────────────────────────────────────────────
    const analysisResult = DocumentAnalysisService.parseAnalysisResponse(llmResponse, rawText);
    // Patch the documentType from extractText (the LLM doesn't determine this).
    analysisResult.documentType = docType;

    // ── 5. Build encrypted payload ────────────────────────────────────────
    const rawTextHash = await computeTextHash(rawText);
    const payload: DiagnosisEncryptedPayload = {
      extractedFields: analysisResult.extractedFields,
      rawTextHash,
      analysedAt: analysisResult.analysedAt,
    };

    const { encryptedData, iv } = await encryptPayload(payload, encryptionKey);

    // ── 6. Persist encrypted result + transition to 'reviewed' ────────────
    await updateSessionStatus(uid, sessionId, 'reviewed', { encryptedData, iv });

    return analysisResult;
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : 'Unknown parse error';
    await updateSessionStatus(uid, sessionId, 'error', {
      parseError: message.slice(0, 500), // truncate to avoid bloating Firestore
    }).catch(() => {
      /* best-effort status update — original error is still re-thrown */
    });
    throw parseError;
  }
}

/**
 * Returns the first active (non-error) diagnosis session for a user, or null
 * if none exists.
 *
 * For sessions in 'reviewed' status, the encrypted analysis result is
 * decrypted and attached as `analysisResult`.  The `rawText` field of
 * `analysisResult` will be empty string (rawText is never stored).
 *
 * @param uid           - Authenticated user's Firebase UID.
 * @param encryptionKey - Vault AES-GCM key for decrypting the stored payload.
 * @returns The session record (with optional analysisResult) or null.
 */
export async function getActiveDiagnosisSession(
  uid: string,
  encryptionKey: CryptoKey,
): Promise<(SomaDiagnosisSession & { analysisResult?: DocumentAnalysisResult }) | null> {
  const dataLayer = getNexusDataLayer();

  const results = await dataLayer.query<SomaDiagnosisSession>({
    collection: SESSIONS_COLLECTION(uid),
    where: [{ field: 'status', op: '!=', value: 'error' }],
    orderBy: [{ field: 'uploadedAt', direction: 'desc' }],
    limit: 1,
  });

  if (results.length === 0) return null;

  const session = results[0] as SomaDiagnosisSession;

  // If the session has a parsed result, decrypt and attach it.
  if (session.status === 'reviewed' && session.encryptedData && session.iv) {
    const payload = await decryptPayload(session.encryptedData, session.iv, encryptionKey);
    if (payload) {
      const analysisResult: DocumentAnalysisResult = {
        documentType: 'text', // file type metadata not re-derived; callers can update if needed
        detectedPanels: [],   // not stored in encrypted payload — only extractedFields are
        extractedFields: payload.extractedFields,
        rawText: '',          // rawText is NEVER stored — returned as empty string
        analysedAt: payload.analysedAt,
      };
      return { ...session, analysisResult };
    }
  }

  return session;
}

/**
 * Closes a diagnosis session — either merging the user-approved data into
 * SomaProfile or discarding it — then cleans up Storage and Firestore.
 *
 * ISOLATION CONTRACT: Spine events are emitted ONLY after successful cleanup.
 * Merge (if requested) happens BEFORE cleanup.
 *
 * Cleanup order:
 *   1. (if merge=true) mergeSomaDiagnosisData
 *   2. Delete Firestore session document
 *   3. Delete Firebase Storage file
 *   4. Emit SOMA_DIAGNOSIS_MERGED or SOMA_DIAGNOSIS_DISCARDED Spine event
 *
 * @param uid           - Authenticated user's Firebase UID.
 * @param sessionId     - Session ID to close.
 * @param selectedItems - ExtractedDataItem[] approved by the user for merge.
 * @param encryptionKey - Vault AES-GCM key.
 * @param merge         - true = commit to profile; false = discard silently.
 * @throws If merge or cleanup fails (partial cleanup is logged but not re-thrown).
 */
export async function closeDiagnosis(
  uid: string,
  sessionId: string,
  selectedItems: unknown[],
  encryptionKey: CryptoKey,
  merge: boolean,
): Promise<void> {
  const dataLayer = getNexusDataLayer();

  // Load session to get the storage path before deleting the Firestore doc.
  const sessionRecord = await dataLayer.getDocument<SomaDiagnosisSession>(
    SESSIONS_COLLECTION(uid),
    sessionId,
  );

  const storagePath = (sessionRecord as SomaDiagnosisSession | null)?.sourceStoragePath ?? null;

  // ── 1. Merge (if requested) ───────────────────────────────────────────────
  if (merge) {
    await mergeSomaDiagnosisData(
      uid,
      selectedItems as ExtractedDataItem[],
      encryptionKey,
    );
  }

  // ── 2. Delete Firestore session document ──────────────────────────────────
  try {
    await dataLayer.deleteDocument(SESSIONS_COLLECTION(uid), sessionId);
  } catch (e) {
    console.error('[DiagnosisSessionService] Failed to delete session document:', e);
    // Continue to Storage cleanup — partial cleanup is better than none.
  }

  // ── 3. Delete Firebase Storage file ──────────────────────────────────────
  if (storagePath) {
    try {
      const { storage } = getFirebase();
      if (storage) {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
      }
    } catch (e) {
      console.error('[DiagnosisSessionService] Failed to delete session file from Storage:', e);
      // Non-fatal — the file has a TTL via Firebase Storage rules.
    }
  }

  // ── 4. Emit Spine event (ONLY after cleanup) ──────────────────────────────
  if (merge) {
    Spine.publish({
      type: 'SOMA_DIAGNOSIS_MERGED' as SpineEventType,
      source: 'soma',
      domain: 'B',
      priority: 'info',
      data: {
        sessionId,
        mergedFieldCount: (selectedItems as ExtractedDataItem[]).length,
      },
    });
  } else {
    Spine.publish({
      type: 'SOMA_DIAGNOSIS_DISCARDED' as SpineEventType,
      source: 'soma',
      domain: 'B',
      priority: 'info',
      data: { sessionId },
    });
  }
}

/**
 * Discards a diagnosis session without merging any data.
 * Equivalent to `closeDiagnosis(..., merge=false)`.
 *
 * @param uid           - Authenticated user's Firebase UID.
 * @param sessionId     - Session ID to discard.
 * @param encryptionKey - Vault AES-GCM key (required for API consistency).
 */
export async function discardDiagnosis(
  uid: string,
  sessionId: string,
  encryptionKey: CryptoKey,
): Promise<void> {
  return closeDiagnosis(uid, sessionId, [], encryptionKey, false);
}
