import { collection, query, where, orderBy, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import type { ChatThread, ContextPolicy } from '../types';

const COLLECTION = 'chat_threads';

function threadDocId(userId: string, moduleId: string, threadId: string) {
  return `${userId}_${moduleId}_${threadId}`;
}

export const ChatThreadService = {
  subscribeThreads(
    userId: string,
    moduleId: string,
    onUpdate: (threads: ChatThread[]) => void
  ): () => void {
    if (!userId || !moduleId) return () => {};
    const { db } = getFirebase();
    if (!db) return () => {};

    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('moduleId', '==', moduleId),
      where('archived', '==', false),
      orderBy('lastMessageAt', 'desc')
    );

    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((docSnap) => docSnap.data() as ChatThread);
        onUpdate(items);
      },
      (error) => {
        console.error('[ChatThreadService] Subscription error:', error);
      }
    );
  },

  async createThread(userId: string, moduleId: string, title: string, contextPolicy: ContextPolicy = 'base-context') {
    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: threadId,
      moduleId,
      userId,
      title,
      contextPolicy,
      docIds: [],
      archived: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now
    };

    await setDoc(doc(db, COLLECTION, threadDocId(userId, moduleId, threadId)), thread);
    return thread;
  },

  async updateThread(
    userId: string,
    moduleId: string,
    threadId: string,
    patch: Partial<Omit<ChatThread, 'id' | 'moduleId' | 'userId' | 'createdAt'>>
  ) {
    const { db } = getFirebase();
    if (!db) return;
    const ref = doc(db, COLLECTION, threadDocId(userId, moduleId, threadId));
    await updateDoc(ref, { ...patch, updatedAt: new Date().toISOString() });
  },

  async touchThread(userId: string, moduleId: string, threadId: string) {
    const { db } = getFirebase();
    if (!db) return;
    const now = new Date().toISOString();
    const ref = doc(db, COLLECTION, threadDocId(userId, moduleId, threadId));
    await updateDoc(ref, { lastMessageAt: now, updatedAt: now });
  },

  async archiveThread(userId: string, moduleId: string, threadId: string) {
    const { db } = getFirebase();
    if (!db) return;
    const ref = doc(db, COLLECTION, threadDocId(userId, moduleId, threadId));
    await updateDoc(ref, { archived: true, updatedAt: new Date().toISOString() });
  }
};
