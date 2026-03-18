/**
 * useSessions.ts
 *
 * React hook for persistent research sessions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  loadSessions,
  createSession,
  updateSession,
  deleteSession,
} from '../services/scout-session-service';
import { ResearchSession } from '../types';

type SessionContext = {
  userId?: string | null;
};

interface UseSessionsReturn {
  sessions: ResearchSession[];
  isLoading: boolean;
  error: string | null;
  createSession: (topic: string) => Promise<ResearchSession | null>;
  updateSession: (id: string, patch: Partial<ResearchSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSessions({ userId }: SessionContext): UseSessionsReturn {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ userId }), [userId]);

  const load = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadSessions(ctx);
      setSessions(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [ctx, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateSession = useCallback(
    async (topic: string): Promise<ResearchSession | null> => {
      if (!userId) {
        throw new Error("You must be signed in to create a persistent research session.");
      }
      try {
        const result = await createSession(topic, ctx);
        if (result) {
          setSessions((prev) => [result, ...prev]);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        setError(message);
        throw new Error(message);
      }
    },
    [ctx, userId],
  );

  const handleUpdateSession = useCallback(
    async (id: string, patch: Partial<ResearchSession>): Promise<void> => {
      if (!userId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      try {
        await updateSession(id, patch, ctx);
      } catch (err) {
        await load();
        setError(err instanceof Error ? err.message : 'Failed to update session');
      }
    },
    [ctx, userId, load],
  );

  const handleDeleteSession = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) return;
      setSessions((prev) => prev.filter((s) => s.id !== id));
      try {
        await deleteSession(id, ctx);
      } catch (err) {
        await load();
        setError(err instanceof Error ? err.message : 'Failed to delete session');
      }
    },
    [ctx, userId, load],
  );

  return {
    sessions,
    isLoading,
    error,
    createSession: handleCreateSession,
    updateSession: handleUpdateSession,
    deleteSession: handleDeleteSession,
    refresh: load,
  };
}
