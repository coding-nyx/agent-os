import { getNexusDataLayer } from '../data-layer/provider';
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
    const dataLayer = getNexusDataLayer();
    return dataLayer.subscribeToQuery<ChatThread>(
      {
        collection: COLLECTION,
        where: [
          { field: 'userId', op: '==', value: userId },
          { field: 'moduleId', op: '==', value: moduleId },
          { field: 'archived', op: '==', value: false },
        ],
        orderBy: [{ field: 'lastMessageAt', direction: 'desc' }],
      },
      onUpdate
    );
  },

  async createThread(userId: string, moduleId: string, title: string, contextPolicy: ContextPolicy = 'base-context') {
    const dataLayer = getNexusDataLayer();

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

    await dataLayer.setDocument(COLLECTION, threadDocId(userId, moduleId, threadId), thread);
    return thread;
  },

  async updateThread(
    userId: string,
    moduleId: string,
    threadId: string,
    patch: Partial<Omit<ChatThread, 'id' | 'moduleId' | 'userId' | 'createdAt'>>
  ) {
    const dataLayer = getNexusDataLayer();
    await dataLayer.updateDocument(COLLECTION, threadDocId(userId, moduleId, threadId), {
      ...patch,
      updatedAt: new Date().toISOString()
    });
  },

  async touchThread(userId: string, moduleId: string, threadId: string) {
    const dataLayer = getNexusDataLayer();
    const now = new Date().toISOString();
    await dataLayer.updateDocument(COLLECTION, threadDocId(userId, moduleId, threadId), {
      lastMessageAt: now,
      updatedAt: now
    });
  },

  async archiveThread(userId: string, moduleId: string, threadId: string) {
    const dataLayer = getNexusDataLayer();
    await dataLayer.updateDocument(COLLECTION, threadDocId(userId, moduleId, threadId), {
      archived: true,
      updatedAt: new Date().toISOString()
    });
  }
};
