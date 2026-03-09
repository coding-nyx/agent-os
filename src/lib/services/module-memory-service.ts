import { getNexusDataLayer } from '../data-layer/provider';
import { ModuleMemoryEnvelope, SessionEventSummary, ActiveSessionState } from '../types';
import { EmbeddingService } from './embedding-service';
import { encryptWithKey, decryptWithKey } from '../encryption';
import { MODULE_MANIFEST } from '../module-manifest';

const COLLECTION_PREFIX = 'module_memory';
const ACTIVE_SESSION_COLLECTION = 'active_sessions';
const VAULT_SALT_MARKER = 'vault_salt_used';

function getActiveSessionDocId(uid: string, moduleId: string, sessionId?: string) {
  if (sessionId && sessionId !== 'current') {
    return `${uid}_${moduleId}_${sessionId}`;
  }
  return `${uid}_${moduleId}`;
}

export const ModuleMemoryService = {
  async getEnvelope(uid: string, moduleId: string, encryptionKey?: CryptoKey | null): Promise<ModuleMemoryEnvelope | null> {
    if (!uid || !moduleId) return null;
    const dataLayer = getNexusDataLayer();

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
    const dataLayer = getNexusDataLayer();

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

  async initializeEnvelope(uid: string, moduleId: string): Promise<ModuleMemoryEnvelope> {
    if (!uid || !moduleId) throw new Error('Missing UID or Module ID');
    const dataLayer = getNexusDataLayer();

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
    options?: { encryptionKey?: CryptoKey | null }
  ): Promise<void> {
    if (!uid || !moduleId) return;
    const dataLayer = getNexusDataLayer();

    const now = new Date().toISOString();
    const encryptionKey = options?.encryptionKey || null;
    const manifestPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = manifestPolicy ? (manifestPolicy.mandatory || manifestPolicy.defaultLocked) : false;

    if (requiresVault && !encryptionKey) {
      console.warn(`[ModuleMemoryService] Vault key required for ${moduleId} episodic write. Skipping persistence.`);
      return;
    }

    const docId = `${uid}_${moduleId}`;
    const embeddedEvent: SessionEventSummary = {
      ...event,
      embedding: event.embedding || await EmbeddingService.embed(`${event.summary}\n${event.keyInsights.join('\n')}`)
    };

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

        const nextHistory = [...existingHistory, embeddedEvent];
        const encryptedPayload = await encryptWithKey(
          JSON.stringify({
            latestSnapshot: snapshot,
            eventHistory: nextHistory
          }),
          encryptionKey
        );

        await dataLayer.setDocument(COLLECTION_PREFIX, docId, {
          moduleId,
          lastActive: now,
          // Do not persist plaintext event history when vault is available
          latestSnapshot: '',
          eventHistory: [],
          encryptedPayload,
          metadata: {
            ...existingMetadata,
            vault: {
              encrypted: true,
              salt: VAULT_SALT_MARKER,
              eventCount: nextHistory.length,
              updatedAt: now
            }
          }
        });
        return;
      } catch (error) {
        console.error('[ModuleMemoryService] Failed to commit encrypted session:', error);
        return;
      }
    }

    // Fallback (non-vault modules): read existing history, append, then write back
    try {
      const existingDoc = await dataLayer.getDocument<{ eventHistory?: SessionEventSummary[] }>(
        COLLECTION_PREFIX, docId
      );
      const existingHistory: SessionEventSummary[] = Array.isArray(existingDoc?.eventHistory)
        ? existingDoc.eventHistory as SessionEventSummary[]
        : [];
      await dataLayer.setDocument(COLLECTION_PREFIX, docId, {
        moduleId,
        eventHistory: [...existingHistory, embeddedEvent],
        latestSnapshot: snapshot,
        lastActive: now
      });
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to commit session:', error);
    }
  },

  async saveActiveSession(uid: string, session: ActiveSessionState): Promise<void> {
    if (!uid || !session?.moduleId) return;
    const dataLayer = getNexusDataLayer();
    const docId = getActiveSessionDocId(uid, session.moduleId, session.sessionId);
    try {
      await dataLayer.setDocument(ACTIVE_SESSION_COLLECTION, docId, session);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to save active session:', error);
    }
  },

  async getActiveSession(uid: string, moduleId: string, sessionId?: string): Promise<ActiveSessionState | null> {
    if (!uid || !moduleId) return null;
    const dataLayer = getNexusDataLayer();
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
    const dataLayer = getNexusDataLayer();
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
    const dataLayer = getNexusDataLayer();
    const docId = getActiveSessionDocId(uid, moduleId, sessionId);
    try {
      await dataLayer.deleteDocument(ACTIVE_SESSION_COLLECTION, docId);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to clear active session:', error);
    }
  }
};
