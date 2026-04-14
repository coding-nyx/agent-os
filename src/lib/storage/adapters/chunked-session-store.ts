import type { NexusDataLayer } from '@/lib/data-layer';
import type { ActiveSessionState } from '@/lib/types';
import {
  buildSessionDocId,
  compactSessionMessages,
  estimateSessionBytes,
  MAX_PERSISTED_SESSION_MESSAGES,
  PersistedMessage,
  PersistedSessionChunk,
  PersistedSessionMeta,
  sanitizeSessionMessages,
  SaveSessionResult,
  SESSION_SIZE_HARD_LIMIT_BYTES,
  SESSION_SIZE_SOFT_LIMIT_BYTES,
  SessionKey,
  SessionStore,
} from '@/lib/storage/domain/session-store';

const ACTIVE_SESSION_COLLECTION = 'active_sessions';
const SESSION_MESSAGES_SUBCOLLECTION = 'messages';
const MAX_MESSAGES_PER_CHUNK = 36;
const TARGET_CHUNK_BYTES = 120_000;

function getChunkCollectionPath(docId: string): string {
  return `${ACTIVE_SESSION_COLLECTION}/${docId}/${SESSION_MESSAGES_SUBCOLLECTION}`;
}

function estimateBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) out[k] = stripUndefined(v);
  }
  return out as T;
}

function buildChunks(messages: PersistedSessionChunk['messages'], now: string): PersistedSessionChunk[] {
  const chunks: PersistedSessionChunk[] = [];

  let buffer: PersistedSessionChunk['messages'] = [];
  let seqStart = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const seqEnd = seqStart + buffer.length - 1;
    const id = `${String(seqStart).padStart(6, '0')}_${String(seqEnd).padStart(6, '0')}`;
    const estimated = estimateBytes(buffer);
    chunks.push({
      id,
      seqStart,
      seqEnd,
      messageCount: buffer.length,
      estimatedBytes: estimated,
      messages: buffer,
      createdAt: now,
      updatedAt: now,
    });
    buffer = [];
    seqStart = seqEnd + 1;
  };

  for (const message of messages) {
    const candidate = [...buffer, message];
    const candidateBytes = estimateBytes(candidate);
    if (buffer.length >= MAX_MESSAGES_PER_CHUNK || candidateBytes > TARGET_CHUNK_BYTES) {
      flush();
    }
    buffer.push(message);
  }
  flush();

  return chunks;
}

export class ChunkedSessionStore implements SessionStore {
  constructor(private readonly dataLayer: NexusDataLayer) {}

  async save(sessionKey: SessionKey, session: ActiveSessionState): Promise<SaveSessionResult> {
    const docId = buildSessionDocId(sessionKey);
    const now = new Date().toISOString();

    const { messages: sanitizedMessages, debugStripped, truncatedCount } = sanitizeSessionMessages(session.history || []);
    const compacted = compactSessionMessages(sanitizedMessages);

    const existingMeta = await this.dataLayer.getDocument<PersistedSessionMeta>(ACTIVE_SESSION_COLLECTION, docId);

    const chunks = buildChunks(compacted.messages, now);
    const historyVersion = (existingMeta?.historyVersion ?? 0) + 1;

    const meta: PersistedSessionMeta = {
      sessionId: session.sessionId,
      moduleId: session.moduleId,
      startTime: session.startTime,
      lastMessageAt: session.lastMessageAt,
      tokenCount: session.tokenCount,
      isGuestTrial: session.isGuestTrial,
      threadTitle: session.threadTitle,
      contextPolicy: session.contextPolicy,
      docIds: session.docIds,
      historyVersion,
      messageCount: compacted.messages.length,
      chunkCount: chunks.length,
      chunkIndex: chunks.map((c) => ({ id: c.id, seqStart: c.seqStart, seqEnd: c.seqEnd })),
      updatedAt: now,
      metadata: {
        droppedCountTotal: (existingMeta?.metadata?.droppedCountTotal ?? 0) + compacted.droppedCount,
        truncatedCountTotal: (existingMeta?.metadata?.truncatedCountTotal ?? 0) + truncatedCount,
        debugStripped: (existingMeta?.metadata?.debugStripped ?? false) || debugStripped,
        compactedAt: compacted.droppedCount > 0 || truncatedCount > 0 ? now : existingMeta?.metadata?.compactedAt,
      },
    };

    const chunkCollection = getChunkCollectionPath(docId);
    const existingChunks = await this.dataLayer.listDocuments<PersistedSessionChunk>(chunkCollection, { limit: 20 });

    const operations = [
      ...existingChunks.map((chunk) => ({ type: 'delete' as const, collection: chunkCollection, id: chunk.id })),
      ...chunks.map((chunk) => ({ type: 'set' as const, collection: chunkCollection, id: chunk.id, data: stripUndefined(chunk) })),
    ];

    if (operations.length > 0) {
      await this.dataLayer.batchWrite(operations);
    }

    const estimatedBytes = estimateSessionBytes(meta, chunks);
    const nearLimit = estimatedBytes >= SESSION_SIZE_SOFT_LIMIT_BYTES;
    const hardLimitExceeded = estimatedBytes >= SESSION_SIZE_HARD_LIMIT_BYTES;
    meta.metadata = {
      ...(meta.metadata || {}),
      estimatedBytes,
      nearLimit,
      hardLimitExceeded,
    };

    await this.dataLayer.setDocument(ACTIVE_SESSION_COLLECTION, docId, stripUndefined(meta));

    return {
      saved: true,
      compacted: compacted.droppedCount > 0 || truncatedCount > 0,
      droppedCount: compacted.droppedCount,
      truncatedCount,
      estimatedBytes,
      debugStripped,
      nearLimit,
      hardLimitExceeded,
    };
  }

  async read(sessionKey: SessionKey): Promise<ActiveSessionState | null> {
    const docId = buildSessionDocId(sessionKey);
    const meta = await this.dataLayer.getDocument<PersistedSessionMeta & Partial<ActiveSessionState>>(
      ACTIVE_SESSION_COLLECTION,
      docId,
    );
    if (!meta) return null;

    // Legacy shape fallback: old active_sessions docs stored full history inline.
    if (Array.isArray(meta.history)) {
      return {
        sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : (sessionKey.sessionId || 'current'),
        moduleId: typeof meta.moduleId === 'string' ? meta.moduleId : sessionKey.moduleId,
        startTime: typeof meta.startTime === 'string' ? meta.startTime : new Date().toISOString(),
        lastMessageAt: typeof meta.lastMessageAt === 'string' ? meta.lastMessageAt : new Date().toISOString(),
        history: meta.history,
        tokenCount: typeof meta.tokenCount === 'number' ? meta.tokenCount : 0,
        isGuestTrial: Boolean(meta.isGuestTrial),
        threadTitle: meta.threadTitle,
        contextPolicy: meta.contextPolicy,
        docIds: meta.docIds,
      };
    }

    const chunkCollection = getChunkCollectionPath(docId);
    let history: PersistedMessage[];

    if (meta.chunkIndex && meta.chunkIndex.length > 0) {
      // Lazy path: fetch chunks newest-first, stop once we have ≥ the full
      // persisted message cap.  This avoids fetching stale/orphaned chunks
      // that may exist from a previous save cycle while still loading the
      // complete current session history.
      const byNewest = [...meta.chunkIndex].sort((a, b) => b.seqStart - a.seqStart);
      const collected: PersistedMessage[] = [];
      for (const entry of byNewest) {
        const chunk = await this.dataLayer.getDocument<PersistedSessionChunk>(chunkCollection, entry.id);
        if (chunk && Array.isArray(chunk.messages)) {
          collected.unshift(...chunk.messages);
        }
        if (collected.length >= MAX_PERSISTED_SESSION_MESSAGES) break;
      }
      history = collected;
    } else {
      // Legacy path: no index stored — fetch all chunks.
      const chunks = await this.dataLayer.listDocuments<PersistedSessionChunk>(chunkCollection, { limit: 20 });
      const ordered = [...chunks].sort((left, right) => left.seqStart - right.seqStart);
      history = ordered.flatMap((chunk) => Array.isArray(chunk.messages) ? chunk.messages : []);
    }

    return {
      sessionId: meta.sessionId,
      moduleId: meta.moduleId,
      startTime: meta.startTime,
      lastMessageAt: meta.lastMessageAt,
      history,
      tokenCount: meta.tokenCount,
      isGuestTrial: meta.isGuestTrial,
      threadTitle: meta.threadTitle,
      contextPolicy: meta.contextPolicy,
      docIds: meta.docIds,
    };
  }

  subscribe(sessionKey: SessionKey, onUpdate: (session: ActiveSessionState | null) => void): () => void {
    const docId = buildSessionDocId(sessionKey);
    const unsubscribe = this.dataLayer.subscribeToDocument<PersistedSessionMeta & Partial<ActiveSessionState>>(
      ACTIVE_SESSION_COLLECTION,
      docId,
      async (meta) => {
        if (!meta) {
          onUpdate(null);
          return;
        }

        // Legacy shape fallback.
        if (Array.isArray(meta.history)) {
          onUpdate({
            sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : (sessionKey.sessionId || 'current'),
            moduleId: typeof meta.moduleId === 'string' ? meta.moduleId : sessionKey.moduleId,
            startTime: typeof meta.startTime === 'string' ? meta.startTime : new Date().toISOString(),
            lastMessageAt: typeof meta.lastMessageAt === 'string' ? meta.lastMessageAt : new Date().toISOString(),
            history: meta.history,
            tokenCount: typeof meta.tokenCount === 'number' ? meta.tokenCount : 0,
            isGuestTrial: Boolean(meta.isGuestTrial),
            threadTitle: meta.threadTitle,
            contextPolicy: meta.contextPolicy,
            docIds: meta.docIds,
          });
          return;
        }

        try {
          const chunkCollection = getChunkCollectionPath(docId);
          let history: PersistedMessage[];

          if (meta.chunkIndex && meta.chunkIndex.length > 0) {
            const byNewest = [...meta.chunkIndex].sort((a, b) => b.seqStart - a.seqStart);
            const collected: PersistedMessage[] = [];
            for (const entry of byNewest) {
              const chunk = await this.dataLayer.getDocument<PersistedSessionChunk>(chunkCollection, entry.id);
              if (chunk && Array.isArray(chunk.messages)) collected.unshift(...chunk.messages);
              if (collected.length >= MAX_PERSISTED_SESSION_MESSAGES) break;
            }
            history = collected;
          } else {
            const chunks = await this.dataLayer.listDocuments<PersistedSessionChunk>(chunkCollection, { limit: 20 });
            const ordered = [...chunks].sort((left, right) => left.seqStart - right.seqStart);
            history = ordered.flatMap((chunk) => Array.isArray(chunk.messages) ? chunk.messages : []);
          }

          onUpdate({
            sessionId: meta.sessionId,
            moduleId: meta.moduleId,
            startTime: meta.startTime,
            lastMessageAt: meta.lastMessageAt,
            history,
            tokenCount: meta.tokenCount,
            isGuestTrial: meta.isGuestTrial,
            threadTitle: meta.threadTitle,
            contextPolicy: meta.contextPolicy,
            docIds: meta.docIds,
          });
        } catch (error) {
          console.error('[ChunkedSessionStore] Failed to hydrate session chunks:', error);
          onUpdate(null);
        }
      },
    );

    return unsubscribe;
  }

  async clear(sessionKey: SessionKey): Promise<void> {
    const docId = buildSessionDocId(sessionKey);
    const chunkCollection = getChunkCollectionPath(docId);
    const chunks = await this.dataLayer.listDocuments<PersistedSessionChunk>(chunkCollection, { limit: 20 });
    const operations = chunks.map((chunk) => ({
      type: 'delete' as const,
      collection: chunkCollection,
      id: chunk.id,
    }));

    if (operations.length > 0) {
      await this.dataLayer.batchWrite(operations);
    }

    await this.dataLayer.deleteDocument(ACTIVE_SESSION_COLLECTION, docId);
  }
}
