import { getAraDataLayer } from '../data-layer/provider';
import { ModuleMemoryEnvelope, SessionEventSummary, ActiveSessionState } from '../types';
import { EmbeddingService } from './embedding-service';
import { encryptWithKey, decryptWithKey } from '../encryption';
import { MODULE_MANIFEST } from '../module-manifest';

const COLLECTION_PREFIX = 'module_memory';
const ACTIVE_SESSION_COLLECTION = 'active_sessions';
const VAULT_SALT_MARKER = 'vault_salt_used';
const MAX_ENCRYPTED_DOC_BYTES = 900_000;
const TARGET_TRIMMED_SNAPSHOT_BYTES = 180_000;
const EMBEDDING_STORAGE_DIM = 256;
const MAX_EVENT_SUMMARY_CHARS = 800;
const MAX_EVENT_INSIGHTS = 12;
const MAX_EVENT_INSIGHT_CHARS = 240;

// ---------------------------------------------------------------------------
// Per-module write queue
// Serialises commitSession calls for the same (uid, moduleId) pair.
// The doc key is `${uid}_${moduleId}`, matching the Firestore document id,
// so only writes that genuinely target the same document are serialised;
// writes for different modules run concurrently without interference.
// ---------------------------------------------------------------------------
const _memoryWriteQueues = new Map<string, Promise<void>>();

function enqueueMemoryWrite(queueKey: string, fn: () => Promise<void>): Promise<void> {
  const prev = _memoryWriteQueues.get(queueKey) ?? Promise.resolve();
  // Retry fn once if it (or any previous queued write) throws, so a transient
  // failure does not permanently stall subsequent commits for this module.
  const next = prev.then(fn).catch(() => fn());
  _memoryWriteQueues.set(queueKey, next);
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => {
      const sanitized = sanitizeForFirestore(item);
      return sanitized === undefined ? null : sanitized;
    });
  }
  if (value instanceof Date) return value.toISOString();
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const sanitized = sanitizeForFirestore(nested);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  }
  return String(value);
}

function toUtf8Bytes(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function estimatePayloadSizeBytes(payload: unknown): number {
  try {
    return toUtf8Bytes(JSON.stringify(payload));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function truncateSnapshotToBytes(snapshot: string, maxBytes: number): string {
  if (!snapshot) return '';
  if (toUtf8Bytes(snapshot) <= maxBytes) return snapshot;
  const marker = '\n[truncated-for-storage]';
  let low = 0;
  let high = snapshot.length;
  let best = '';
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${snapshot.slice(0, mid)}${marker}`;
    if (toUtf8Bytes(candidate) <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best || marker;
}

function normalizeEmbedding(values: unknown): number[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const normalized = values
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
    .slice(0, EMBEDDING_STORAGE_DIM);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSessionEventForStorage(event: SessionEventSummary): SessionEventSummary {
  const summary = typeof event.summary === 'string' ? event.summary.slice(0, MAX_EVENT_SUMMARY_CHARS) : '';
  const keyInsights = Array.isArray(event.keyInsights)
    ? event.keyInsights
      .filter((insight): insight is string => typeof insight === 'string')
      .slice(0, MAX_EVENT_INSIGHTS)
      .map((insight) => insight.slice(0, MAX_EVENT_INSIGHT_CHARS))
    : [];
  const embedding = normalizeEmbedding(event.embedding);
  return {
    id: typeof event.id === 'string' ? event.id : `evt_${Date.now()}`,
    timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
    summary,
    keyInsights,
    sentiment: typeof event.sentiment === 'number' && Number.isFinite(event.sentiment) ? event.sentiment : 0,
    tokenUsage: typeof event.tokenUsage === 'number' && Number.isFinite(event.tokenUsage) ? event.tokenUsage : 0,
    ...(embedding ? { embedding } : {})
  };
}

function getActiveSessionDocId(uid: string, moduleId: string, sessionId?: string) {
  if (sessionId && sessionId !== 'current') {
    return `${uid}_${moduleId}_${sessionId}`;
  }
  return `${uid}_${moduleId}`;
}

export const ModuleMemoryService = {
  async getEnvelope(uid: string, moduleId: string, encryptionKey?: CryptoKey | null): Promise<ModuleMemoryEnvelope | null> {
    if (!uid || !moduleId) return null;
    const dataLayer = getAraDataLayer();

    const data = await dataLayer.getDocument<ModuleMemoryEnvelope & {
      encryptedPayload?: { ciphertext: string; iv: string };
      metadata?: Record<string, unknown>;
      lastActive?: string;
      latestSnapshot?: string;
    }>(COLLECTION_PREFIX, `${uid}_${moduleId}`);

    if (!data) return null;

    const baseEnvelope: ModuleMemoryEnvelope = {
      moduleId,
      lastActive: data.lastActive || new Date().toISOString(),
      latestSnapshot: data.latestSnapshot || '',
      eventHistory: Array.isArray((data as ModuleMemoryEnvelope).eventHistory) ? (data as ModuleMemoryEnvelope).eventHistory : [],
      metadata: data.metadata || {}
    };

    if (data.encryptedPayload) {
      if (!encryptionKey) {
        return {
          ...baseEnvelope,
          latestSnapshot: '',
          eventHistory: [],
          metadata: {
            ...baseEnvelope.metadata,
            vaultLocked: true
          }
        };
      }

      try {
        const decrypted = await decryptWithKey(data.encryptedPayload, encryptionKey);
        const parsed = JSON.parse(decrypted) as Pick<ModuleMemoryEnvelope, 'latestSnapshot' | 'eventHistory'>;
        return {
          ...baseEnvelope,
          latestSnapshot: parsed.latestSnapshot || '',
          eventHistory: parsed.eventHistory || []
        };
      } catch (error) {
        console.warn('[ModuleMemoryService] Failed to decrypt envelope, returning empty payload:', error);
        return {
          ...baseEnvelope,
          latestSnapshot: '',
          eventHistory: [],
          metadata: {
            ...baseEnvelope.metadata,
            vaultLocked: true,
            vaultError: 'decrypt_failed'
          }
        };
      }
    }

    return baseEnvelope;
  },

  subscribeEnvelope(
    uid: string,
    moduleId: string,
    onUpdate: (envelope: ModuleMemoryEnvelope | null) => void,
    encryptionKey?: CryptoKey | null
  ): () => void {
    if (!uid || !moduleId) return () => {};
    const dataLayer = getAraDataLayer();

    const unsubscribe = dataLayer.subscribeToDocument<ModuleMemoryEnvelope & { encryptedPayload?: { ciphertext: string; iv: string } }>(
      COLLECTION_PREFIX,
      `${uid}_${moduleId}`,
      (data) => {
        if (!data) {
          onUpdate(null);
          return;
        }
        if (data.encryptedPayload) {
          if (!encryptionKey) {
            onUpdate({
              moduleId,
              lastActive: data.lastActive || new Date().toISOString(),
              latestSnapshot: '',
              eventHistory: [],
              metadata: { ...(data.metadata || {}), vaultLocked: true }
            });
            return;
          }

          (async () => {
            try {
              const decrypted = await decryptWithKey(data.encryptedPayload!, encryptionKey);
              const parsed = JSON.parse(decrypted) as Pick<ModuleMemoryEnvelope, 'latestSnapshot' | 'eventHistory'>;
              onUpdate({
                moduleId,
                lastActive: data.lastActive || new Date().toISOString(),
                latestSnapshot: parsed.latestSnapshot || '',
                eventHistory: parsed.eventHistory || [],
                metadata: data.metadata || {}
              });
            } catch (error) {
              console.warn('[ModuleMemoryService] Envelope decrypt failed in subscription:', error);
              onUpdate({
                moduleId,
                lastActive: data.lastActive || new Date().toISOString(),
                latestSnapshot: '',
                eventHistory: [],
                metadata: { ...(data.metadata || {}), vaultLocked: true, vaultError: 'decrypt_failed' }
              });
            }
          })();
          return;
        }

        onUpdate({
          moduleId,
          lastActive: data.lastActive || new Date().toISOString(),
          latestSnapshot: data.latestSnapshot || '',
          eventHistory: data.eventHistory || [],
          metadata: data.metadata || {}
        });
      }
    );

    return unsubscribe;
  },

  async initializeEnvelope(uid: string, moduleId: string, encryptionKey?: CryptoKey | null): Promise<ModuleMemoryEnvelope> {
    if (!uid || !moduleId) throw new Error('Missing UID or Module ID');
    const dataLayer = getAraDataLayer();
    const manifestPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = manifestPolicy ? (manifestPolicy.mandatory || manifestPolicy.defaultLocked) : false;

    // For vault-required modules, refuse to initialize without an encryption key to prevent plaintext envelopes.
    if (requiresVault && !encryptionKey) {
      console.warn(`[ModuleMemoryService] Vault key required for ${moduleId} envelope initialization. Skipping.`);
      throw new Error('Vault key required for envelope initialization');
    }

    const newEnvelope: ModuleMemoryEnvelope = {
      moduleId,
      lastActive: new Date().toISOString(),
      latestSnapshot: '', // Will be updated during first session
      eventHistory: [],
      metadata: {}
    };

    try {
      await dataLayer.setDocument(COLLECTION_PREFIX, `${uid}_${moduleId}`, newEnvelope);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to initialize envelope:', error);
      throw error;
    }
    return newEnvelope;
  },

  async commitSession(
    uid: string,
    moduleId: string,
    event: SessionEventSummary,
    snapshot: string,
    options?: { encryptionKey?: CryptoKey | null; facts?: string[] }
  ): Promise<void> {
    if (!uid || !moduleId) return;

    // Serialise writes for this (uid, moduleId) pair so that concurrent
    // commitSession calls cannot race on the same document's eventHistory array.
    // Each call reads the current history, appends, and writes back — this queue
    // ensures those three steps are never interleaved with another caller's steps.
    const queueKey = `${uid}_${moduleId}`;
    return enqueueMemoryWrite(queueKey, async () => {
      const dataLayer = getAraDataLayer();

      const now = new Date().toISOString();
      const encryptionKey = options?.encryptionKey || null;
      const facts = options?.facts || [];
      const manifestPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
      const requiresVault = manifestPolicy ? (manifestPolicy.mandatory || manifestPolicy.defaultLocked) : false;

      if (requiresVault && !encryptionKey) {
        console.warn(`[ModuleMemoryService] Vault key required for ${moduleId} episodic write. Skipping persistence.`);
        return;
      }

      const docId = `${uid}_${moduleId}`;
      const embeddedEvent: SessionEventSummary = normalizeSessionEventForStorage({
        ...event,
        embedding: normalizeEmbedding(event.embedding) || await EmbeddingService.embed(`${event.summary}\n${event.keyInsights.join('\n')}`)
      });

      if (encryptionKey) {
        try {
          let existingMetadata: Record<string, unknown> = {};
          let existingHistory: SessionEventSummary[] = [];
          const existingDoc = await dataLayer.getDocument<ModuleMemoryEnvelope & { encryptedPayload?: { ciphertext: string; iv: string } }>(
            COLLECTION_PREFIX, docId
          );
          if (existingDoc) {
            existingMetadata = (existingDoc.metadata as Record<string, unknown>) || {};
            if (existingDoc.encryptedPayload) {
              try {
                const decrypted = await decryptWithKey(existingDoc.encryptedPayload, encryptionKey);
                const parsed = JSON.parse(decrypted) as Pick<ModuleMemoryEnvelope, 'eventHistory'>;
                existingHistory = parsed.eventHistory || [];
              } catch (error) {
                console.warn('[ModuleMemoryService] Failed to decrypt existing envelope, starting new history:', error);
              }
            } else if (Array.isArray(existingDoc.eventHistory)) {
              existingHistory = existingDoc.eventHistory;
            }
          }

          // Cap history to prevent ciphertext from growing beyond Firestore's 1MB document limit.
          const MAX_HISTORY_EVENTS = 50;
          const normalizedExistingHistory = existingHistory.map((entry) => normalizeSessionEventForStorage(entry));
          let nextHistory = [...normalizedExistingHistory, embeddedEvent].slice(-MAX_HISTORY_EVENTS);
          const originalHistoryCount = nextHistory.length;
          const originalSnapshotBytes = toUtf8Bytes(snapshot);
          const candidateSnapshots: Array<{ value: string; truncated: boolean }> = [
            { value: snapshot, truncated: false }
          ];
          if (originalSnapshotBytes > TARGET_TRIMMED_SNAPSHOT_BYTES) {
            candidateSnapshots.push({
              value: truncateSnapshotToBytes(snapshot, TARGET_TRIMMED_SNAPSHOT_BYTES),
              truncated: true
            });
          }
          candidateSnapshots.push({ value: '', truncated: true });

          let writePayload: Record<string, unknown> | null = null;
          let estimatedBytes = Number.MAX_SAFE_INTEGER;
          let historyCompacted = false;
          let snapshotWasTruncated = false;
          for (const candidate of candidateSnapshots) {
            let candidateHistory = nextHistory;
            while (candidateHistory.length > 0) {
              const encrypted = await encryptWithKey(
                JSON.stringify({
                  latestSnapshot: candidate.value,
                  eventHistory: candidateHistory,
                  facts
                }),
                encryptionKey
              );

              const encryptedPayload = {
                ciphertext: String(encrypted.ciphertext ?? ''),
                iv: String(encrypted.iv ?? '')
              };

              const metadata = sanitizeForFirestore({
                ...existingMetadata,
                vault: {
                  encrypted: true,
                  salt: VAULT_SALT_MARKER,
                  eventCount: candidateHistory.length,
                  updatedAt: now,
                  snapshotTruncated: candidate.truncated,
                  snapshotOriginalBytes: candidate.truncated ? originalSnapshotBytes : undefined,
                  snapshotStoredBytes: candidate.truncated ? toUtf8Bytes(candidate.value) : undefined,
                  historyCompacted: candidateHistory.length < originalHistoryCount,
                  historyOriginalCount: candidateHistory.length < originalHistoryCount ? originalHistoryCount : undefined
                }
              }) as Record<string, unknown>;

              const candidatePayload = sanitizeForFirestore({
                moduleId,
                lastActive: now,
                // Do not persist plaintext event history when vault is available
                latestSnapshot: '',
                eventHistory: [],
                encryptedPayload,
                metadata
              }) as Record<string, unknown>;

              estimatedBytes = estimatePayloadSizeBytes(candidatePayload);
              writePayload = candidatePayload;
              snapshotWasTruncated = candidate.truncated;
              historyCompacted = candidateHistory.length < originalHistoryCount;

              if (estimatedBytes <= MAX_ENCRYPTED_DOC_BYTES) {
                nextHistory = candidateHistory;
                break;
              }

              if (candidateHistory.length <= 1) break;
              candidateHistory = candidateHistory.slice(1);
            }

            if (estimatedBytes <= MAX_ENCRYPTED_DOC_BYTES) break;
          }

          if (!writePayload) {
            throw new Error('[ModuleMemoryService] Failed to build encrypted payload');
          }

          if (estimatedBytes > MAX_ENCRYPTED_DOC_BYTES) {
            console.warn(
              '[ModuleMemoryService] Encrypted payload estimated above Firestore limit threshold.',
              {
                docId,
                estimatedBytes,
                threshold: MAX_ENCRYPTED_DOC_BYTES,
                eventCount: nextHistory.length,
                snapshotTruncated: snapshotWasTruncated,
                historyCompacted
              }
            );
          }

          await dataLayer.setDocument(COLLECTION_PREFIX, docId, writePayload);
          return;
        } catch (error) {
          const described = error as { message?: string };
          console.error(
            '[ModuleMemoryService] Encrypted commit diagnostics:',
            {
              docId,
              errorMessage: described?.message || String(error)
            }
          );
          console.error('[ModuleMemoryService] Failed to commit encrypted session:', error);
          // Re-throw so the queue's retry mechanism can attempt the write once more.
          throw error;
        }
      }

      // Fallback (non-vault modules): read existing history, append, then write back
      try {
        const existingDoc = await dataLayer.getDocument<{ eventHistory?: SessionEventSummary[]; metadata?: Record<string, unknown> }>(
          COLLECTION_PREFIX, docId
        );
        const existingHistory: SessionEventSummary[] = Array.isArray(existingDoc?.eventHistory)
          ? existingDoc.eventHistory as SessionEventSummary[]
          : [];
        await dataLayer.setDocument(COLLECTION_PREFIX, docId, {
          moduleId,
          eventHistory: [...existingHistory, embeddedEvent],
          latestSnapshot: snapshot,
          metadata: { ...(existingDoc?.metadata || {}), facts },
          lastActive: now
        });
      } catch (error) {
        console.error('[ModuleMemoryService] Failed to commit session:', error);
        // Re-throw so the queue's retry mechanism can attempt the write once more.
        throw error;
      }
    });
  },

  async compactEnvelope(
    uid: string,
    moduleId: string,
    options?: { encryptionKey?: CryptoKey | null; maxHistoryEvents?: number }
  ): Promise<{
    compacted: boolean;
    eventCount?: number;
    snapshotTruncated?: boolean;
    historyCompacted?: boolean;
    estimatedBytes?: number;
    reason?: string;
  }> {
    if (!uid || !moduleId) return { compacted: false, reason: 'missing_identifiers' };
    const encryptionKey = options?.encryptionKey || null;
    if (!encryptionKey) return { compacted: false, reason: 'missing_encryption_key' };

    const dataLayer = getAraDataLayer();
    const docId = `${uid}_${moduleId}`;
    const now = new Date().toISOString();
    const maxHistoryEvents = Math.max(1, Math.min(100, options?.maxHistoryEvents ?? 50));

    const existingDoc = await dataLayer.getDocument<ModuleMemoryEnvelope & { encryptedPayload?: { ciphertext: string; iv: string } }>(
      COLLECTION_PREFIX,
      docId
    );
    if (!existingDoc?.encryptedPayload) return { compacted: false, reason: 'no_encrypted_payload' };

    let latestSnapshot = '';
    let facts: string[] = [];
    let eventHistory: SessionEventSummary[] = [];
    try {
      const decrypted = await decryptWithKey(existingDoc.encryptedPayload, encryptionKey);
      const parsed = JSON.parse(decrypted) as {
        latestSnapshot?: string;
        eventHistory?: SessionEventSummary[];
        facts?: string[];
      };
      latestSnapshot = typeof parsed.latestSnapshot === 'string' ? parsed.latestSnapshot : '';
      eventHistory = Array.isArray(parsed.eventHistory) ? parsed.eventHistory : [];
      facts = Array.isArray(parsed.facts) ? parsed.facts.filter((f): f is string => typeof f === 'string') : [];
    } catch (error) {
      console.warn('[ModuleMemoryService] Failed to decrypt envelope for compaction:', error);
      return { compacted: false, reason: 'decrypt_failed' };
    }

    const normalizedHistory = eventHistory.map((entry) => normalizeSessionEventForStorage(entry)).slice(-maxHistoryEvents);
    const originalHistoryCount = normalizedHistory.length;
    const originalSnapshotBytes = toUtf8Bytes(latestSnapshot);
    const candidateSnapshots: Array<{ value: string; truncated: boolean }> = [{ value: latestSnapshot, truncated: false }];
    if (originalSnapshotBytes > TARGET_TRIMMED_SNAPSHOT_BYTES) {
      candidateSnapshots.push({
        value: truncateSnapshotToBytes(latestSnapshot, TARGET_TRIMMED_SNAPSHOT_BYTES),
        truncated: true
      });
    }
    candidateSnapshots.push({ value: '', truncated: true });

    let writePayload: Record<string, unknown> | null = null;
    let estimatedBytes = Number.MAX_SAFE_INTEGER;
    let compactedHistory = normalizedHistory;
    let snapshotWasTruncated = false;
    let historyCompacted = false;

    for (const candidate of candidateSnapshots) {
      let candidateHistory = compactedHistory;
      while (candidateHistory.length > 0) {
        const encrypted = await encryptWithKey(
          JSON.stringify({
            latestSnapshot: candidate.value,
            eventHistory: candidateHistory,
            facts
          }),
          encryptionKey
        );

        const encryptedPayload = {
          ciphertext: String(encrypted.ciphertext ?? ''),
          iv: String(encrypted.iv ?? '')
        };

        const metadata = sanitizeForFirestore({
          ...(existingDoc.metadata as Record<string, unknown> || {}),
          vault: {
            encrypted: true,
            salt: VAULT_SALT_MARKER,
            eventCount: candidateHistory.length,
            updatedAt: now,
            snapshotTruncated: candidate.truncated,
            snapshotOriginalBytes: candidate.truncated ? originalSnapshotBytes : undefined,
            snapshotStoredBytes: candidate.truncated ? toUtf8Bytes(candidate.value) : undefined,
            historyCompacted: candidateHistory.length < originalHistoryCount,
            historyOriginalCount: candidateHistory.length < originalHistoryCount ? originalHistoryCount : undefined,
            compactedBy: 'manual'
          }
        }) as Record<string, unknown>;

        const candidatePayload = sanitizeForFirestore({
          moduleId,
          lastActive: now,
          latestSnapshot: '',
          eventHistory: [],
          encryptedPayload,
          metadata
        }) as Record<string, unknown>;

        estimatedBytes = estimatePayloadSizeBytes(candidatePayload);
        writePayload = candidatePayload;
        snapshotWasTruncated = candidate.truncated;
        historyCompacted = candidateHistory.length < originalHistoryCount;

        if (estimatedBytes <= MAX_ENCRYPTED_DOC_BYTES) {
          compactedHistory = candidateHistory;
          break;
        }

        if (candidateHistory.length <= 1) break;
        candidateHistory = candidateHistory.slice(1);
      }

      if (estimatedBytes <= MAX_ENCRYPTED_DOC_BYTES) break;
    }

    if (!writePayload) {
      return { compacted: false, reason: 'payload_build_failed' };
    }

    if (estimatedBytes > MAX_ENCRYPTED_DOC_BYTES) {
      return {
        compacted: false,
        reason: 'still_oversized',
        estimatedBytes
      };
    }

    await dataLayer.setDocument(COLLECTION_PREFIX, docId, writePayload);
    return {
      compacted: true,
      eventCount: compactedHistory.length,
      snapshotTruncated: snapshotWasTruncated,
      historyCompacted,
      estimatedBytes
    };
  },

  async saveActiveSession(uid: string, session: ActiveSessionState): Promise<void> {
    if (!uid || !session?.moduleId) return;
    const dataLayer = getAraDataLayer();
    const docId = getActiveSessionDocId(uid, session.moduleId, session.sessionId);
    try {
      await dataLayer.setDocument(ACTIVE_SESSION_COLLECTION, docId, session);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to save active session:', error);
    }
  },

  async getActiveSession(uid: string, moduleId: string, sessionId?: string): Promise<ActiveSessionState | null> {
    if (!uid || !moduleId) return null;
    const dataLayer = getAraDataLayer();
    const docId = getActiveSessionDocId(uid, moduleId, sessionId);
    const data = await dataLayer.getDocument<ActiveSessionState>(ACTIVE_SESSION_COLLECTION, docId);
    return data ?? null;
  },

  subscribeActiveSession(
    uid: string,
    moduleId: string,
    sessionId: string | undefined,
    onUpdate: (session: ActiveSessionState | null) => void
  ): () => void {
    if (!uid || !moduleId) return () => {};
    const dataLayer = getAraDataLayer();
    const docId = getActiveSessionDocId(uid, moduleId, sessionId);
    const unsubscribe = dataLayer.subscribeToDocument<ActiveSessionState>(
      ACTIVE_SESSION_COLLECTION,
      docId,
      (data) => {
        onUpdate(data ?? null);
      }
    );
    return unsubscribe;
  },

  async clearActiveSession(uid: string, moduleId: string, sessionId?: string): Promise<void> {
    if (!uid || !moduleId) return;
    const dataLayer = getAraDataLayer();
    const docId = getActiveSessionDocId(uid, moduleId, sessionId);
    try {
      await dataLayer.deleteDocument(ACTIVE_SESSION_COLLECTION, docId);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to clear active session:', error);
    }
  }
};
