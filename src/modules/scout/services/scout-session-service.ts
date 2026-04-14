/**
 * scout-session-service.ts
 *
 * Manages persistent research sessions.
 * Firestore path: scout_sessions/{userId}/sessions/{sessionId}
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { ResearchSession } from '../types';

type SessionContext = {
  userId?: string | null;
};

function sessionsCollection(userId: string): string {
  return `scout_sessions/${userId}/sessions`;
}

export async function createSession(
  topic: string,
  { userId }: SessionContext,
  options?: { mode?: 'web' | 'deep' }
): Promise<ResearchSession | null> {
  if (!userId) return null;

  const dataLayer = getNexusDataLayer();
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const session: ResearchSession = {
    id,
    userId,
    topic,
    mode: options?.mode ?? 'web',
    seedState: 'unseeded',
    status: 'idle',
    subQuestions: [],
    createdAt: now,
    updatedAt: now,
  };

  await dataLayer.setDocument(sessionsCollection(userId), id, session);
  return session;
}

export async function loadSessions({ userId }: SessionContext): Promise<ResearchSession[]> {
  if (!userId) return [];
  const dataLayer = getNexusDataLayer();
  try {
    const docs = await dataLayer.listDocuments<ResearchSession>(sessionsCollection(userId), { limit: 50 });
    return (docs || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    console.warn('[ScoutSessionService] Failed to load sessions:', err);
    return [];
  }
}

export async function getSession(id: string, { userId }: SessionContext): Promise<ResearchSession | null> {
  if (!userId) return null;
  const dataLayer = getNexusDataLayer();
  return dataLayer.getDocument<ResearchSession>(sessionsCollection(userId), id);
}

export async function updateSession(
  id: string,
  patch: Partial<ResearchSession>,
  { userId }: SessionContext
): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  const current = await getSession(id, { userId });
  if (!current) return;

  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await dataLayer.setDocument(sessionsCollection(userId), id, updated);
}

export async function deleteSession(id: string, { userId }: SessionContext): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  await dataLayer.deleteDocument(sessionsCollection(userId), id);
}
