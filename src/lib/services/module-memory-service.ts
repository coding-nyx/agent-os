import { doc, setDoc, deleteDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { ModuleMemoryEnvelope, SessionEventSummary, ActiveSessionState } from '../types';
import { EmbeddingService } from './embedding-service';
import { readDocOnce } from './firestore-once';
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
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const snap = await readDocOnce(docRef);

    if (!snap.exists()) return null;

    const data = snap.data() as ModuleMemoryEnvelope & {
      encryptedPayload?: { ciphertext: string; iv: string };
      metadata?: Record<string, unknown>;
      lastActive?: string;
      latestSnapshot?: string;
    };

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
    const { db } = getFirebase();
    if (!db) return () => {};

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        const data = snap.data() as ModuleMemoryEnvelope & { encryptedPayload?: { ciphertext: string; iv: string } };
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
      },
      (error) => {
        console.error('Module memory subscription error:', error);
      }
    );

    return unsubscribe;
  },

  async initializeEnvelope(uid: string, moduleId: string): Promise<ModuleMemoryEnvelope> {
    if (!uid || !moduleId) throw new Error('Missing UID or Module ID');
    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    const newEnvelope: ModuleMemoryEnvelope = {
      moduleId,
      lastActive: new Date().toISOString(),
      latestSnapshot: '', // Will be updated during first session
      eventHistory: [],
      metadata: {}
    };

    try {
      await setDoc(doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`), newEnvelope);
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
    const { db } = getFirebase();
    if (!db) return;

    const now = new Date().toISOString();
    const encryptionKey = options?.encryptionKey || null;
    const manifestPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = manifestPolicy ? (manifestPolicy.mandatory || manifestPolicy.defaultLocked) : false;

    if (requiresVault && !encryptionKey) {
      console.warn(`[ModuleMemoryService] Vault key required for ${moduleId} episodic write. Skipping persistence.`);
      return;
    }

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const embeddedEvent: SessionEventSummary = {
      ...event,
      embedding: event.embedding || await EmbeddingService.embed(`${event.summary}\n${event.keyInsights.join('\n')}`)
    };

    if (encryptionKey) {
      try {
        let existingMetadata: Record<string, unknown> = {};
        let existingHistory: SessionEventSummary[] = [];
        const snap = await readDocOnce(docRef);
        if (snap.exists()) {
          const data = snap.data() as ModuleMemoryEnvelope & { encryptedPayload?: { ciphertext: string; iv: string } };
          existingMetadata = (data.metadata as Record<string, unknown>) || {};
          if (data.encryptedPayload) {
            try {
              const decrypted = await decryptWithKey(data.encryptedPayload, encryptionKey);
              const parsed = JSON.parse(decrypted) as Pick<ModuleMemoryEnvelope, 'eventHistory'>;
              existingHistory = parsed.eventHistory || [];
            } catch (error) {
              console.warn('[ModuleMemoryService] Failed to decrypt existing envelope, starting new history:', error);
            }
          } else if (Array.isArray(data.eventHistory)) {
            existingHistory = data.eventHistory;
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

        await setDoc(docRef, {
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
        }, { merge: true });
        return;
      } catch (error) {
        console.error('[ModuleMemoryService] Failed to commit encrypted session:', error);
        return;
      }
    }

    // Fallback (non-vault modules): Atomic update contract: event append -> snapshot write -> lastActive update
    try {
      await setDoc(docRef, {
        moduleId,
        eventHistory: arrayUnion(embeddedEvent),
        latestSnapshot: snapshot,
        lastActive: now
      }, { merge: true });
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to commit session:', error);
    }
  },

  async saveActiveSession(uid: string, session: ActiveSessionState): Promise<void> {
    if (!uid || !session?.moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, ACTIVE_SESSION_COLLECTION, getActiveSessionDocId(uid, session.moduleId, session.sessionId));
    try {
      await setDoc(docRef, session);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to save active session:', error);
    }
  },

  async getActiveSession(uid: string, moduleId: string, sessionId?: string): Promise<ActiveSessionState | null> {
    if (!uid || !moduleId) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, ACTIVE_SESSION_COLLECTION, getActiveSessionDocId(uid, moduleId, sessionId));
    const snap = await readDocOnce(docRef);

    if (snap.exists()) {
      return snap.data() as ActiveSessionState;
    }
    return null;
  },

  subscribeActiveSession(
    uid: string,
    moduleId: string,
    sessionId: string | undefined,
    onUpdate: (session: ActiveSessionState | null) => void
  ): () => void {
    if (!uid || !moduleId) return () => {};
    const { db } = getFirebase();
    if (!db) return () => {};

    const docRef = doc(db, ACTIVE_SESSION_COLLECTION, getActiveSessionDocId(uid, moduleId, sessionId));
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        onUpdate(snap.data() as ActiveSessionState);
      },
      (error) => {
        console.error('Active session subscription error:', error);
      }
    );

    return unsubscribe;
  },

  async clearActiveSession(uid: string, moduleId: string, sessionId?: string): Promise<void> {
    if (!uid || !moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, ACTIVE_SESSION_COLLECTION, getActiveSessionDocId(uid, moduleId, sessionId));
    try {
      await deleteDoc(docRef);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to clear active session:', error);
    }
  }
};
