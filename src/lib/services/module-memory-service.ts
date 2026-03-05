import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { ModuleMemoryEnvelope, SessionEventSummary, ActiveSessionState } from '../types';

const COLLECTION_PREFIX = 'module_memory';

export const ModuleMemoryService = {
  async getEnvelope(uid: string, moduleId: string): Promise<ModuleMemoryEnvelope | null> {
    if (!uid || !moduleId) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as ModuleMemoryEnvelope;
    }
    return null;
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

    await setDoc(doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`), newEnvelope);
    return newEnvelope;
  },

  async commitSession(uid: string, moduleId: string, event: SessionEventSummary, snapshot: string): Promise<void> {
    if (!uid || !moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION_PREFIX, `${uid}_${moduleId}`);
    
    // Atomic update contract: event append -> snapshot write -> lastActive update
    await updateDoc(docRef, {
      eventHistory: arrayUnion(event),
      latestSnapshot: snapshot,
      lastActive: new Date().toISOString()
    });
  },

  async saveActiveSession(uid: string, session: ActiveSessionState): Promise<void> {
    if (!uid || !session?.moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, 'active_sessions', `${uid}_${session.moduleId}`);
    await setDoc(docRef, session);
  },

  async getActiveSession(uid: string, moduleId: string): Promise<ActiveSessionState | null> {
    if (!uid || !moduleId) return null;
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, 'active_sessions', `${uid}_${moduleId}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as ActiveSessionState;
    }
    return null;
  },

  async clearActiveSession(uid: string, moduleId: string): Promise<void> {
    if (!uid || !moduleId) return;
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, 'active_sessions', `${uid}_${moduleId}`);
    await setDoc(docRef, { history: [] }, { merge: true }); // We keep the doc but clear history to signal end
  }
};
