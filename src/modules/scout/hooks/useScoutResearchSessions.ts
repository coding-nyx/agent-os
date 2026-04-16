/**
 * useScoutResearchSessions.ts
 *
 * Manages research session lifecycle: selection, seeding, reasoning history
 * tracking, creation, archive, and rename. Extracted from ScoutContent.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WebCrawlerService } from '@/lib/services/web-crawler-service';
import { addKnowledgeNode } from '../services/scout-knowledge-service';
import type { ScoutTopLevelView } from '../scout-shell-layout';
import type { ResearchSession, ScoutKnowledgeNode } from '../types';

interface UseScoutResearchSessionsParams {
  userId: string | undefined;
  encryptionKey: CryptoKey | null;
  sessions: ResearchSession[];
  knowledgeNodes: ScoutKnowledgeNode[];
  updateSessionFn: (id: string, patch: Partial<ResearchSession>) => Promise<void>;
  createSessionFn: (topic: string, options?: { mode?: 'web' | 'deep' }) => Promise<ResearchSession | null>;
  addSourceFn: (source: any) => Promise<any>;
  openDeepResearch: (query: string) => void;
}

interface UseScoutResearchSessionsReturn {
  activeSessionId: string | null;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  activeSession: ResearchSession | null;
  sessionContext: string;
  selectedView: ScoutTopLevelView;
  setSelectedView: React.Dispatch<React.SetStateAction<ScoutTopLevelView>>;
  isNewSessionDialogOpen: boolean;
  setIsNewSessionDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;

  seedSessionContext: (session: { id: string; topic: string }, options?: { force?: boolean }) => Promise<void>;
  handleSelectSession: (sessionId: string) => void;
  handleViewChange: (view: ScoutTopLevelView) => void;
  handleRenameSession: (sessionId: string, newTopic: string) => Promise<void>;
  handleArchiveSession: (sessionId: string) => Promise<void>;
  handleStartSession: () => void;
  handleNewSessionSubmit: (topic: string, isDeepResearch: boolean) => Promise<void>;
}

export function useScoutResearchSessions({
  userId,
  encryptionKey,
  sessions,
  knowledgeNodes,
  updateSessionFn,
  createSessionFn,
  addSourceFn,
  openDeepResearch,
}: UseScoutResearchSessionsParams): UseScoutResearchSessionsReturn {
  const [selectedView, setSelectedView] = useState<ScoutTopLevelView>('research');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const sessionContext = useMemo(() => {
    if (!activeSession || knowledgeNodes.length === 0) return '';
    // Session-scoped only — global retrieval happens at query-time in useScoutPromptBuilder
    const sessionNodes = knowledgeNodes
      .filter((n: any) => n.parentSessionId === activeSession.id)
      .slice(0, 15);
    if (sessionNodes.length === 0) return 'No prior findings in this session yet.';
    return sessionNodes
      .map((n: any) => `- ${n.claim} (confidence: ${n.confidence.toFixed(2)}, status: ${n.status})`)
      .join('\n');
  }, [activeSession, knowledgeNodes]);

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  const seedSessionContext = useCallback(async (
    session: { id: string; topic: string },
    options?: { force?: boolean },
  ) => {
    if (!userId || !encryptionKey) return;
    if (!options?.force) {
      const alreadySeeded = knowledgeNodes.some((node) => node.parentSessionId === session.id);
      if (alreadySeeded) {
        await updateSessionFn(session.id, { seedState: 'seeded', seededAt: new Date().toISOString() });
        return;
      }
    }

    await updateSessionFn(session.id, { seedState: 'seeding' });
    const response = await WebCrawlerService.search(session.topic, { maxResults: 5, includeImages: false });
    const topResults = response.results.slice(0, 3);

    await Promise.allSettled(
      topResults.map(async (result) => {
        const source = await addSourceFn({
          url: result.url,
          title: result.title,
          snippet: (result.content ?? '').slice(0, 280),
          discoveredVia: 'search',
        });
        await addKnowledgeNode(
          {
            claim: (result.content ?? result.title).slice(0, 420),
            confidence: typeof result.score === 'number' ? Math.min(0.85, result.score) : 0.65,
            evidence: source ? [source.id] : [],
            status: 'pending',
            parentSessionId: session.id,
            source: result.url,
            sources: [result.url],
          },
          { userId, encryptionKey },
        );
      }),
    );

    await updateSessionFn(session.id, {
      seedState: 'seeded',
      seededAt: new Date().toISOString(),
      lastSearchAt: new Date().toISOString(),
    });
  }, [userId, encryptionKey, knowledgeNodes, updateSessionFn, addSourceFn]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Auto-deselect session if it got deleted
  useEffect(() => {
    if (activeSessionId && !activeSession) {
      setActiveSessionId(null);
    }
  }, [activeSessionId, activeSession]);

  // Auto-seed deep sessions
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.mode !== 'deep') return;
    if (activeSession.seedState === 'seeded' || activeSession.seedState === 'seeding') return;
    seedSessionContext(activeSession).catch((error) => {
      console.warn('[Scout] Deep-session seed failed:', error);
      void updateSessionFn(activeSession.id, { seedState: 'unseeded' });
    });
  }, [activeSession, seedSessionContext, updateSessionFn]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setSelectedView('research');
    },
    [],
  );

  const handleViewChange = useCallback((view: ScoutTopLevelView) => {
    setSelectedView(view);
  }, []);

  const handleRenameSession = useCallback(
    async (sessionId: string, newTopic: string): Promise<void> => {
      await updateSessionFn(sessionId, { topic: newTopic });
    },
    [updateSessionFn],
  );

  const handleArchiveSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await updateSessionFn(sessionId, { archived: true });
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    },
    [updateSessionFn, activeSessionId],
  );

  const handleStartSession = useCallback(() => {
    setIsNewSessionDialogOpen(true);
  }, []);

  const handleNewSessionSubmit = useCallback(async (topic: string, isDeepResearch: boolean) => {
    setIsNewSessionDialogOpen(false);
    const session = await createSessionFn(topic, { mode: isDeepResearch ? 'deep' : 'web' });
    if (session) {
      setActiveSessionId(session.id);
      setSelectedView('research');
      if (isDeepResearch) {
        openDeepResearch(topic);
      }
    }
  }, [createSessionFn, openDeepResearch]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    activeSessionId,
    setActiveSessionId,
    activeSession,
    sessionContext,
    selectedView,
    setSelectedView,
    isNewSessionDialogOpen,
    setIsNewSessionDialogOpen,
    seedSessionContext,
    handleSelectSession,
    handleViewChange,
    handleRenameSession,
    handleArchiveSession,
    handleStartSession,
    handleNewSessionSubmit,
  };
}
