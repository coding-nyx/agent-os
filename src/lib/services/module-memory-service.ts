import { doc, setDoc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { ModuleMemoryEnvelope, SessionEventSummary, ActiveSessionState } from '../types';
import { EmbeddingService } from './embedding-service';
import { readDocOnce } from './firestore-once';

const COLLECTION_PREFIX = 'module_memory';

export const ModuleMemoryService = {
  async getEnvelope(uid: string, moduleId: string): Promise<ModuleMemoryEnvelope | null> {
    if (!uid || !moduleId) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const snap = await readDocOnce(docRef);

    if (snap.exists()) {
      return snap.data() as ModuleMemoryEnvelope;
    }
    return null;
  },

  subscribeEnvelope(
    uid: string,
    moduleId: string,
    onUpdate: (envelope: ModuleMemoryEnvelope | null) => void
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
        onUpdate(snap.data() as ModuleMemoryEnvelope);
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

  async commitSession(uid: string, moduleId: string, event: SessionEventSummary, snapshot: string): Promise<void> {
    if (!uid || !moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const embeddedEvent: SessionEventSummary = {
      ...event,
      embedding: event.embedding || await EmbeddingService.embed(`${event.summary}\n${event.keyInsights.join('\n')}`)
    };
    
    // Atomic update contract: event append -> snapshot write -> lastActive update
    try {
      await setDoc(docRef, {
        moduleId,
        eventHistory: arrayUnion(embeddedEvent),
        latestSnapshot: snapshot,
        lastActive: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to commit session:', error);
    }
  },

  async saveActiveSession(uid: string, session: ActiveSessionState): Promise<void> {
    if (!uid || !session?.moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, 'active_sessions', `${uid}_${session.moduleId}`);
    try {
      await setDoc(docRef, session);
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to save active session:', error);
    }
  },

  async getActiveSession(uid: string, moduleId: string): Promise<ActiveSessionState | null> {
    if (!uid || !moduleId) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, 'active_sessions', `${uid}_${moduleId}`);
    const snap = await readDocOnce(docRef);

    if (snap.exists()) {
      return snap.data() as ActiveSessionState;
    }
    return null;
  },

  subscribeActiveSession(
    uid: string,
    moduleId: string,
    onUpdate: (session: ActiveSessionState | null) => void
  ): () => void {
    if (!uid || !moduleId) return () => {};
    const { db } = getFirebase();
    if (!db) return () => {};

    const docRef = doc(db, 'active_sessions', `${uid}_${moduleId}`);
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

  async clearActiveSession(uid: string, moduleId: string): Promise<void> {
    if (!uid || !moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, 'active_sessions', `${uid}_${moduleId}`);
    try {
      await setDoc(docRef, { history: [] }, { merge: true });
    } catch (error) {
      console.error('[ModuleMemoryService] Failed to clear active session:', error);
    }
  }
};
