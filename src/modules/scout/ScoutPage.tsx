import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAI } from '@/cortex-bridge/ai-context';
import type { MessageContent } from '@/lib/types';
import { contentToString } from '@/core/components/chat/ChatBubble';
import { ScoutDashboard } from './components/ScoutDashboard';
import { UniversalUploadZone } from '@/core/components/forms/UniversalUploadZone';
import { parseDocument } from './services/scout-document-service';
import {
  type ScoutProfile,
  loadScoutProfile,
  saveScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser,
  loadKnowledgeNodes,
  addKnowledgeNode,
} from './services/scout-knowledge-service';
import { generateNewsBriefs } from './services/scout-news-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import {
  AlertTriangle,
  BookMarked,
  FileText,
  LayoutDashboard,
  PanelLeft,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { scoutDiagnosisSpec } from './diagnosis/scout-diagnosis-spec';
import { Spine } from '@/lib/spine/spine-event-bus';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, type NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { ScoutOnboarding } from './onboarding/ScoutOnboarding';
import { useSources } from './hooks/useSources';
import { useDigests } from './hooks/useDigests';
import { useDeepResearch } from './hooks/useDeepResearch';
import { useSessions } from './hooks/useSessions';
import { useKnowledgeNodes } from './hooks/useKnowledgeNodes';
import { SourceLibraryPane } from './components/sources/SourceLibraryPane';
import { DigestViewer } from './components/digest/DigestViewer';
import { DeepResearchPanel } from './components/deep-research/DeepResearchPanel';
import { ExportDialog } from './components/ExportDialog';
import { ActiveResearchWorkspace } from './components/ActiveResearchWorkspace';
import { ScoutResearchArtifactsPanel } from './components/ScoutResearchArtifactsPanel';
import { ScoutSessionList } from './components/ScoutSessionList';
import type { DeepResearchResult } from './hooks/useDeepResearch';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NewSessionDialog } from './components/NewSessionDialog';
import {
  SCOUT_SHELL_BREAKPOINTS,
  type ScoutTopLevelView,
} from './scout-shell-layout';

// Extracted hooks
import { useScoutShellLayout } from './hooks/useScoutShellLayout';
import { useScoutResearchSessions } from './hooks/useScoutResearchSessions';
import { useScoutPromptBuilder } from './hooks/useScoutPromptBuilder';
import { useScoutDocumentUpload } from './hooks/useScoutDocumentUpload';
import { useScoutSpineEvents } from './hooks/useScoutSpineEvents';

registerDiagnosisSpec(scoutDiagnosisSpec);

interface ScoutViewProps {
  profile: ScoutProfile | null;
  encryptionKey: CryptoKey | null;
  isRefreshingNews?: boolean;
  onRefreshNews?: () => void;
  onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
}

function ScoutContent({ profile, encryptionKey, isRefreshingNews, onRefreshNews, onActionParsed }: ScoutViewProps) {
  const { user } = useAuth();
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const agentAlias = useGlobalSoulStore(s => s.globalSoul?.displayNames?.scout || 'Scout');
  const { sendMessage, analyzeImage } = useAI();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Data hooks (already existed) ---

  const ctx = useMemo(
    () => ({ userId: user?.uid, encryptionKey }),
    [user?.uid, encryptionKey],
  );

  const {
    sources,
    isLoading: sourcesLoading,
    addSource: addSourceFn,
    updateSource: updateSourceFn,
    archiveSource: archiveSourceFn,
  } = useSources(ctx);

  const {
    digests,
    isLoading: digestsLoading,
    isGenerating: isGeneratingDigest,
    error: digestError,
    generateDigest: generateDigestFn,
    deleteDigest: deleteDigestFn,
  } = useDigests(ctx);

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession: createSessionFn,
    updateSession: updateSessionFn,
    deleteSession: deleteSessionFn,
  } = useSessions({ userId: user?.uid });

  const { knowledgeNodes } = useKnowledgeNodes(ctx);

  const deepResearch = useDeepResearch({
    userId: user?.uid,
    encryptionKey,
  });

  // --- openDeepResearch (defined here to avoid circular dep between hooks) ---

  const emitDeepResearchBackupFound = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    const matches = knowledgeNodes
      .filter((node) => {
        const title = node.title ?? '';
        const claim = node.claim ?? '';
        return (
          title.toLowerCase().includes(normalized) ||
          claim.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 5);

    if (matches.length === 0) return;

    Spine.emit({
      type: 'DEEP_RESEARCH_BACKUP_FOUND',
      source: 'scout',
      domain: 'C',
      data: {
        query: trimmed,
        nodeIds: matches.map((node) => node.id),
        count: matches.length,
      },
      cascadeDepth: 0,
      priority: 'info',
    });
  }, [knowledgeNodes]);

  // --- Spine events hook (owns deepResearchOpen state) ---

  // We need a stable openDeepResearch but it requires spine events' setters.
  // Use a ref to break the initialization cycle.
  const openDeepResearchRef = useRef<(query: string) => void>(() => {});

  const spineEvents = useScoutSpineEvents({
    userId: user?.uid,
    encryptionKey,
    sources,
    digests,
    openDeepResearch: useCallback((query: string) => openDeepResearchRef.current(query), []),
    setSelectedView: useCallback((view: ScoutTopLevelView) => sessionsRef.current.setSelectedView(view), []),
    setActiveSessionId: useCallback((id: string) => sessionsRef.current.setActiveSessionId(id), []),
  });

  // Now define the real openDeepResearch and keep the ref up to date
  const openDeepResearch = useCallback((query: string) => {
    const trimmed = query.trim();
    spineEvents.setDeepResearchInitialQuery(trimmed);
    spineEvents.setDeepResearchOpen(true);
    emitDeepResearchBackupFound(trimmed);
  }, [emitDeepResearchBackupFound, spineEvents.setDeepResearchInitialQuery, spineEvents.setDeepResearchOpen]);

  openDeepResearchRef.current = openDeepResearch;

  // --- Research sessions hook ---

  const researchSessions = useScoutResearchSessions({
    userId: user?.uid,
    encryptionKey,
    sessions,
    knowledgeNodes,
    updateSessionFn,
    createSessionFn,
    addSourceFn,
    openDeepResearch,
  });

  // Use ref so spine events can call setSelectedView/setActiveSessionId without stale closures
  const sessionsRef = useRef(researchSessions);
  sessionsRef.current = researchSessions;

  const {
    activeSessionId,
    setActiveSessionId,
    activeSession,
    sessionContext,
    selectedView,
    setSelectedView,
    isNewSessionDialogOpen,
    setIsNewSessionDialogOpen,
    seedSessionContext,
    handleSelectSession: handleSelectSessionBase,
    handleViewChange: handleViewChangeBase,
    handleRenameSession,
    handleArchiveSession,
    handleStartSession,
    handleNewSessionSubmit: handleNewSessionSubmitBase,
  } = researchSessions;

  // --- Shell layout hook ---

  const shell = useScoutShellLayout({
    activeSessionId,
    selectedView,
  });

  const {
    shellState,
    isChatCollapsed,
    setIsChatCollapsed,
    isSessionSheetOpen,
    setIsSessionSheetOpen,
    isArtifactsSheetOpen,
    setIsArtifactsSheetOpen,
    isArtifactsDockedOpen,
    setIsArtifactsDockedOpen,
  } = shell;

  // --- Wrapped handlers that bridge sessions + shell layout ---

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      handleSelectSessionBase(sessionId);
      if (!shellState.isSessionRailDocked) {
        setIsSessionSheetOpen(false);
      }
    },
    [handleSelectSessionBase, shellState.isSessionRailDocked, setIsSessionSheetOpen],
  );

  const handleViewChange = useCallback((view: ScoutTopLevelView) => {
    handleViewChangeBase(view);
    setIsSessionSheetOpen(false);
    if (view !== 'research') {
      setIsArtifactsSheetOpen(false);
    }
  }, [handleViewChangeBase, setIsSessionSheetOpen, setIsArtifactsSheetOpen]);

  const handleToggleArtifacts = useCallback(() => {
    if (!activeSessionId || selectedView !== 'research') {
      return;
    }

    if (shellState.viewport === 'desktop') {
      setIsArtifactsDockedOpen((current) => !current);
      return;
    }

    setIsSessionSheetOpen(false);
    setIsArtifactsSheetOpen((current) => !current);
  }, [activeSessionId, selectedView, shellState.viewport, setIsArtifactsDockedOpen, setIsSessionSheetOpen, setIsArtifactsSheetOpen]);

  // Clear artifacts sheet when session deselected
  useEffect(() => {
    if (activeSessionId === null) {
      setIsArtifactsSheetOpen(false);
    }
  }, [activeSessionId, setIsArtifactsSheetOpen]);

  const handleNewSessionSubmit = useCallback(async (topic: string, isDeepResearch: boolean) => {
    try {
      await handleNewSessionSubmitBase(topic, isDeepResearch);
      setIsSessionSheetOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create session.');
    }
  }, [handleNewSessionSubmitBase, setIsSessionSheetOpen]);

  // --- Prompt builder hook ---

  const { buildMasterDeterministicPrompt, buildSessionDeterministicPrompt } = useScoutPromptBuilder({
    activeSession,
    addSourceFn,
    encryptionKey,
    updateSessionFn,
    userId: user?.uid,
  });

  // --- AI hook ---

  const ai = useModuleAI({
    moduleId: 'scout',
    encryptionKey,
    sessionId: activeSessionId || 'default',
    persistencePolicy: 'scout-research',
    moduleContext: {
      scout_active_topic: activeSession?.topic ?? null,
      scout_session_context: sessionContext ?? null,
      scout_research_focus: profile?.researchFocus ?? null,
    },
  });

  // Re-instantiate the sessions hook with real messages + shell state
  // (We can't re-call hooks conditionally. Instead, wire messages via a ref-based effect.)
  // The reasoning history effect in useScoutResearchSessions uses `messages` from params.
  // Since we can't re-pass them after AI hook is created, we handle it here:
  const prevMessagesLengthRef = useRef(0);

  useEffect(() => {
    prevMessagesLengthRef.current = ai.messages.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    const msgs = ai.messages;
    const prevLen = prevMessagesLengthRef.current;
    if (!activeSession || msgs.length <= prevLen) {
      prevMessagesLengthRef.current = msgs.length;
      return;
    }

    const newMsgs = msgs.slice(prevLen);
    prevMessagesLengthRef.current = msgs.length;

    const newEntries = newMsgs
      .filter((m) => m.role === 'assistant' || m.role === 'user')
      .map((m) => ({
        id: crypto.randomUUID(),
        type: (m.role === 'user' ? 'user' : 'reasoning') as 'user' | 'reasoning',
        text: contentToString(m.content),
        timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
      }));

    if (newEntries.length === 0) return;

    const existing = activeSession.reasoningHistory ?? [];
    updateSessionFn(activeSession.id, { reasoningHistory: [...existing, ...newEntries] }).catch((err) => { console.warn('[Scout] Failed to persist reasoning history:', err); });
  }, [ai.messages, activeSession, updateSessionFn]);

  // --- Document upload hook ---

  const docUpload = useScoutDocumentUpload({
    sendMessage,
    analyzeImage,
    ai,
    onActionParsed,
    setErrorMessage,
  });

  // --- Wrapped send message ---

  const handleSendMessageWrapped = useCallback(async (
    content: MessageContent,
    onAction?: (actionType: string, payload: Record<string, unknown>) => void,
  ) => {
    setErrorMessage(null);
    try {
      const rawUserText = typeof content === 'string' ? content : contentToString(content);
      if (!rawUserText.trim()) {
        await ai.handleSendMessage(content, onAction ?? onActionParsed);
        return;
      }

      if (!activeSession) {
        const deterministicPrompt = await buildMasterDeterministicPrompt(rawUserText);
        await ai.handleSendMessage(deterministicPrompt, onAction ?? onActionParsed, { visibleContent: content });
        return;
      }

      if (activeSession.mode !== 'deep' && activeSession.seedState !== 'seeded' && activeSession.seedState !== 'seeding') {
        await seedSessionContext(activeSession).catch((error) => {
          console.warn('[Scout] Session seed-on-first-question failed:', error);
        });
      }

      const deterministicPrompt = await buildSessionDeterministicPrompt(rawUserText);
      await ai.handleSendMessage(deterministicPrompt, onAction ?? onActionParsed, { visibleContent: content });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }, [
    ai.handleSendMessage,
    onActionParsed,
    activeSession,
    buildMasterDeterministicPrompt,
    buildSessionDeterministicPrompt,
    seedSessionContext,
  ]);

  const aiProp = useMemo(() => ({
    ...ai,
    handleSendMessage: handleSendMessageWrapped,
  }), [ai, handleSendMessageWrapped]);

  // --- Welcome message ---

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      ai.setMessages([
        {
          role: 'assistant',
          content: `Research protocol active. I am ${agentAlias}. How can I assist your inquiry?`,
        },
      ]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, agentAlias]);

  // --- Deep research accept ---

  const handleDeepResearchAccepted = useCallback(async (result: DeepResearchResult) => {
    if (!profile || !encryptionKey) return;

    try {
      const addedSourceIds: string[] = [];
      for (const src of result.capturedSources) {
        const added = await addSourceFn(src).catch(() => null);
        if (added) addedSourceIds.push(added.id);
      }

      await addKnowledgeNode(
        {
          ...result.synthesisNode,
          evidence: addedSourceIds,
          parentSessionId: activeSessionId || undefined,
        },
        { userId: user?.uid, encryptionKey },
      );
    } catch (err) {
      console.error('Failed to persist deep research node', err);
    }

    deepResearch.reset();
    spineEvents.setDeepResearchOpen(false);
    setSelectedView('research');
  }, [encryptionKey, addSourceFn, deepResearch, user?.uid, activeSessionId, profile, spineEvents.setDeepResearchOpen, setSelectedView]);

  // --- Digest generation ---

  const handleGenerateDigest = useCallback(() => {
    loadKnowledgeNodes({ userId: user?.uid, encryptionKey }).then((nodes) => {
      generateDigestFn(profile?.interests.map((interest) => interest.topic) || [], nodes, sources, 'manual');
    });
  }, [user?.uid, encryptionKey, generateDigestFn, profile, sources]);

  // --- Proposal accept ---

  const handleProposalAccept = useCallback(() => {
    if (!spineEvents.researchProposal) return;
    const { query, mode } = spineEvents.researchProposal;
    spineEvents.setResearchProposal(null);
    if (mode === 'deep') {
      openDeepResearch(query);
    } else {
      ai.handleSendMessage(`Search the web for: "${query}"`, onActionParsed);
    }
  }, [spineEvents.researchProposal, spineEvents.setResearchProposal, openDeepResearch, ai, onActionParsed]);

  // --- Tabs ---

  const tabs: NeuralTabItem<ScoutTopLevelView>[] = [
    { id: 'research', label: 'Research', icon: Search },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'sources', label: 'Sources', icon: BookMarked },
    { id: 'briefings', label: 'Briefings', icon: FileText },
  ];

  // --- Render helpers ---

  const renderNewSessionButton = () => (
    <NeuralButton
      type="button"
      onClick={handleStartSession}
      themeColor="lime"
      className="min-h-11"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span>New session</span>
    </NeuralButton>
  );

  const sessionPanel = (
    <section className="surface-foundation flex min-h-[20rem] min-w-0 flex-col overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.09] pb-4">
        <div className="min-w-0">
          <p className="text-chip-soft text-white/50">Sessions</p>
          <h3 className="mt-1 text-panel-heading text-white">Research history</h3>
          <p className="mt-1 text-body-secondary">Open a session to continue an inquiry or review the latest status.</p>
        </div>
        <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 py-1 text-[11px] font-semibold text-white/60">
          {sessions.filter((s) => !s.archived).length}
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <NeuralButton
          type="button"
          onClick={handleStartSession}
          variant="secondary"
          className="min-h-11 w-full"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Start new session</span>
        </NeuralButton>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="scrollbar-ghost h-full overflow-y-auto pr-1">
            {sessionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-2xl border border-white/[0.09] bg-white/[0.045] skeleton" />
                ))}
              </div>
            ) : (
              <ScoutSessionList
                sessions={sessions}
                onSelect={handleSelectSession}
                onDelete={deleteSessionFn}
                onRename={handleRenameSession}
                onArchive={handleArchiveSession}
                activeSessionId={activeSessionId ?? undefined}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const artifactsPanel = activeSession ? (
    <ScoutResearchArtifactsPanel
      session={activeSession}
      knowledgeNodes={knowledgeNodes}
      sources={sources}
      className="h-full"
    />
  ) : null;

  const renderResearchView = () => {
    const proposalCard = spineEvents.researchProposal ? (
      <div className="mx-auto mb-3 w-full max-w-2xl rounded-2xl border border-lime-500/20 bg-lime-500/[0.06] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-lime-400/70">Research Proposal</p>
            <p className="mt-0.5 text-sm text-white/80">{spineEvents.researchProposal.reason}</p>
          </div>
          <button
            type="button"
            onClick={() => spineEvents.setResearchProposal(null)}
            className="mt-0.5 shrink-0 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss proposal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <NeuralButton
            type="button"
            size="sm"
            themeColor="lime"
            onClick={handleProposalAccept}
          >
            {spineEvents.researchProposal.mode === 'deep' ? 'Start Deep Research' : 'Search Web'}
          </NeuralButton>
          <NeuralButton
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => spineEvents.setResearchProposal(null)}
          >
            Dismiss
          </NeuralButton>
        </div>
      </div>
    ) : null;

    if (activeSession) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          {proposalCard && <div className="px-4 pt-3">{proposalCard}</div>}
          <ActiveResearchWorkspace
          session={activeSession}
          encryptionKey={encryptionKey}
          onStartDeepResearch={(query) => {
            openDeepResearch(query);
          }}
          onSendMessage={(text) => ai.handleSendMessage(text, onActionParsed)}
          onUpdateSession={updateSessionFn}
          onAddSource={addSourceFn}
          knowledgeNodes={knowledgeNodes}
          sources={sources}
          messages={ai.messages}
          setMessages={ai.setMessages}
          isProcessing={ai.isProcessing}
          aiState={ai.aiState}
          streamingText={ai.streamingText}
          error={ai.error}
          quota={ai.quota}
          artifactsMode={shellState.artifactsVisibility}
          artifactsPanel={artifactsPanel}
          onToggleArtifacts={handleToggleArtifacts}
        />
        </div>
      );
    }

    return (
      <section className="surface-foundation-raised flex min-h-[24rem] flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
        {proposalCard && <div className="mb-6 w-full max-w-xl px-4">{proposalCard}</div>}
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] text-white/35 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
          <Search className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="mt-6 max-w-md space-y-2">
          <h3 className="text-section-heading text-white">No active research session</h3>
          <p className="text-body-secondary">
            Start a new session or open one from the session drawer to keep the workspace focused on a single inquiry.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {renderNewSessionButton()}
          {!shellState.isSessionRailDocked && (
            <NeuralButton
              type="button"
              onClick={() => {
                setIsArtifactsSheetOpen(false);
                setIsSessionSheetOpen(true);
              }}
              variant="secondary"
              className="min-h-11"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
              <span>Open sessions</span>
            </NeuralButton>
          )}
        </div>
      </section>
    );
  };

  const pageContent = (() => {
    switch (selectedView) {
      case 'research':
        return renderResearchView();
      case 'sources':
        return (
          <SourceLibraryPane
            sources={sources}
            isLoading={sourcesLoading}
            onAddSource={addSourceFn}
            onUpdateSource={updateSourceFn}
            onArchiveSource={archiveSourceFn}
            onExportSources={() => spineEvents.requestExport({ type: 'sources', sources })}
          />
        );
      case 'briefings':
        return (
          <DigestViewer
            digests={digests}
            isLoading={digestsLoading}
            isGenerating={isGeneratingDigest}
            error={digestError}
            profile={profile}
            onGenerate={() => {
              loadKnowledgeNodes({ userId: user?.uid, encryptionKey }).then((nodes) => {
                generateDigestFn(profile?.interests.map((interest) => interest.topic) || [], nodes, sources, 'manual');
              });
            }}
            onDelete={deleteDigestFn}
            onExport={(digest) => spineEvents.requestExport({ type: 'digest', digest })}
          />
        );
      case 'overview':
      default:
        return (
          <ScoutDashboard
            soul={globalSoul}
            profile={profile}
            knowledgeNodes={knowledgeNodes}
            sources={sources}
            sessions={sessions}
            activeSessionId={activeSessionId || undefined}
            onSelectSession={handleSelectSession}
            onDeleteSession={deleteSessionFn}
            onRefreshNews={onRefreshNews}
            isRefreshingNews={isRefreshingNews}
            onStartSession={handleStartSession}
            onGenerateDigest={handleGenerateDigest}
          />
        );
    }
  })();

  return (
    <SingleAgentLayout
      moduleId="scout"
      agentName={agentAlias}
      themeColor="lime"
      ai={aiProp}
      authMode="scout"
      placeholder="Discuss research strategy..."
      dockChatBreakpoint={SCOUT_SHELL_BREAKPOINTS.desktop}
      onUploadDocuments={docUpload.handleChatDocumentUploads}
      hideChatTrigger={spineEvents.deepResearchOpen}
      isChatCollapsed={isChatCollapsed}
      onToggleChat={setIsChatCollapsed}
      contentClassName="min-h-0"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-[var(--shell-content-max)] flex-col">
        <div className="sticky top-0 z-[var(--z-header)] border-b border-white/[0.09] bg-[#020205]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
          <div className="px-[var(--shell-page-gutter)] py-4 sm:py-5">
            <SectionHeader
              label="Intelligence domain"
              title="Scout protocol"
              subtitle="Research, evidence review, and synthesis with explicit workspace, session, and overlay ownership."
              subtitleClassName="hidden lg:block"
              accentClassName="text-[var(--module-color-400)]"
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!shellState.isSessionRailDocked && (
                    <NeuralButton
                      type="button"
                      onClick={() => {
                        setIsArtifactsSheetOpen(false);
                        setIsSessionSheetOpen(true);
                      }}
                      variant="secondary"
                      className="min-h-11"
                    >
                      <PanelLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Sessions</span>
                    </NeuralButton>
                  )}
                  {renderNewSessionButton()}
                </div>
              }
            />

            {errorMessage && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="text-sm leading-relaxed">{errorMessage}</p>
                <NeuralButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setErrorMessage(null)}
                  className="ml-auto h-9 w-9 p-0 text-red-400/70 hover:bg-white/10 hover:text-red-200"
                >
                  <X size={14} />
                </NeuralButton>
              </div>
            )}

            <div className="mt-3 min-w-0 flex-1 lg:mt-4">
              <NeuralTabGroup
                tabs={tabs}
                activeTab={selectedView}
                onTabChange={handleViewChange}
                themeColor="lime"
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 px-[var(--shell-page-gutter)] py-4 sm:py-5 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-6">
          {shellState.isSessionRailDocked && (
            <aside className="hidden w-[300px] shrink-0 lg:block">
              <div className="max-h-[calc(100dvh-12rem)]">{sessionPanel}</div>
            </aside>
          )}

          <main className="min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-[calc(var(--space-8)+env(safe-area-inset-bottom,0px))] lg:flex-1">
            {pageContent}
          </main>
        </div>

        <AnimatePresence>
          {shellState.isSessionSheetVisible && (
            <motion.div
              key="scout-session-sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsSessionSheetOpen(false);
                }
              }}
            >
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                role="dialog"
                aria-modal="true"
                aria-label="Research sessions"
                className="flex h-full w-full max-w-[min(24rem,88vw)] flex-col overflow-hidden border-r border-white/[0.12] bg-[#05050a]/95 shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/[0.09] px-4 py-4 sm:px-5">
                  <div>
                    <p className="text-chip-soft text-[var(--module-color-300)]">Scout sessions</p>
                    <h3 className="mt-1 text-panel-heading text-white">Switch inquiries</h3>
                  </div>
                  <NeuralButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsSessionSheetOpen(false)}
                    className="h-9 w-9 p-0"
                  >
                    <X className="h-4 w-4" />
                  </NeuralButton>
                </div>
                <div className="min-h-0 flex-1 p-4 sm:p-5">{sessionPanel}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shellState.artifactsVisibility === 'sheet' && artifactsPanel && activeSession && (
            <motion.div
              key="scout-artifacts-sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsArtifactsSheetOpen(false);
                }
              }}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                role="dialog"
                aria-modal="true"
                aria-label={`${activeSession.topic} artifacts`}
                className="absolute inset-x-0 bottom-0 flex max-h-[var(--shell-overlay-max-height)] min-h-[22rem] flex-col overflow-hidden rounded-t-[2rem] border-t border-white/[0.12] bg-[#05050a]/95 shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/[0.09] px-4 py-4 sm:px-5">
                  <div>
                    <p className="text-chip-soft text-[var(--module-color-300)]">Session artifacts</p>
                    <h3 className="mt-1 text-panel-heading text-white">{activeSession.topic}</h3>
                  </div>
                  <NeuralButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsArtifactsSheetOpen(false)}
                    className="h-9 w-9 p-0"
                  >
                    <X className="h-4 w-4" />
                  </NeuralButton>
                </div>
                <div className="min-h-0 flex-1 p-4 sm:p-5">{artifactsPanel}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {spineEvents.deepResearchOpen && (
            <DeepResearchPanel
              isOpen={spineEvents.deepResearchOpen}
              onClose={() => spineEvents.setDeepResearchOpen(false)}
              initialQuery={spineEvents.deepResearchInitialQuery}
              onResultAccepted={handleDeepResearchAccepted}
              deepResearch={deepResearch}
            />
          )}
        </AnimatePresence>

        <ExportDialog
          isOpen={spineEvents.exportDialogOpen}
          onClose={() => {
            spineEvents.setExportDialogOpen(false);
            spineEvents.setExportTarget(null);
          }}
          target={spineEvents.exportTarget}
        />

        <NeuralModal
          isOpen={docUpload.docReviewOpen}
          onClose={docUpload.clearDocProposal}
          title="Document Evidence Detected"
          themeColor="emerald"
          maxWidth="2xl"
        >
          <div className="space-y-6">
            {docUpload.docProposal && (
              <div className="space-y-4">
                <p className="text-sm text-white/68">{docUpload.docProposalSummary ?? 'Document analysis ready for review.'}</p>
                <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-3 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/68">Analysis Summary</h4>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-white/68">
                    {docUpload.docProposal.summary}
                  </pre>
                </div>
                <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-3">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/68">Text Preview</h4>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] text-white/50">
                    {docUpload.docProposal.rawTextPreview}
                    {docUpload.docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}
                  </pre>
                </div>
              </div>
            )}
            <div className="flex gap-3 border-t border-white/[0.12] pt-4">
              <NeuralButton
                onClick={docUpload.handleDocProposalCommit}
                themeColor="lime"
                className="flex-1"
              >
                Apply
              </NeuralButton>
              <NeuralButton
                onClick={() => docUpload.setDocReviewOpen(false)}
                variant="secondary"
                className="flex-1"
              >
                Discard
              </NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <AnimatePresence>
          {docUpload.showUploadZone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) docUpload.setShowUploadZone(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg rounded-3xl border border-white/[0.12] bg-[#05050a] p-6 shadow-2xl"
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--module-color-300)]">Evidence Vault</h2>
                    <p className="mt-1 text-sm text-white/50">Extract research evidence from documents</p>
                  </div>
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    onClick={() => docUpload.setShowUploadZone(false)}
                    className="h-9 w-9 p-0 text-white/50 transition-colors hover:bg-white/10"
                  >
                    <X size={18} />
                  </NeuralButton>
                </div>
                <UniversalUploadZone
                  onFileSelected={async (file: File) => {
                    const result = await parseDocument(file);
                    await docUpload.handleUploadSubmit(result);
                  }}
                  themeColor="cyan"
                  label="Evidence Source"
                  description="Upload for research analysis"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <NewSessionDialog
          isOpen={isNewSessionDialogOpen}
          onClose={() => setIsNewSessionDialogOpen(false)}
          onSubmit={handleNewSessionSubmit}
        />
      </div>
    </SingleAgentLayout>
  );
}

export default function ScoutPage() {
  const { user } = useAuth();
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);

  const [activeProfile, setActiveProfile] = useState<ScoutProfile | null>(null);

  const handleRefreshNews = useCallback(async (profile: ScoutProfile | null, encryptionKey: CryptoKey | null) => {
    if (!profile || profile.interests.length === 0 || isRefreshingNews) return;
    setIsRefreshingNews(true);
    try {
      const topics = profile.interests.map((interest) => interest.topic);
      const briefs = await generateNewsBriefs(topics, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: ScoutProfile = {
        ...profile,
        newsBriefs: briefs,
        updatedAt: now,
      };
      await saveScoutProfile(next, { userId: user?.uid, encryptionKey });
    } catch (err) {
      console.error('Scout news refresh failed:', err);
    } finally {
      setIsRefreshingNews(false);
    }
  }, [user?.uid, isRefreshingNews]);

  return (
    <UnifiedModulePage<ScoutProfile>
      moduleId="scout"
      workspaceType="command"
      profileOptions={{
        loadProfile: async (params) => {
          const loadedProfile = await loadScoutProfile(params);
          setActiveProfile(loadedProfile);
          return loadedProfile;
        },
        saveProfile: saveScoutProfile,
        subscribeProfile: (params, onUpdate) => {
          return subscribeScoutProfile(params, (loadedProfile) => {
            setActiveProfile(loadedProfile);
            onUpdate(loadedProfile);
          });
        },
        refreshProfile: async (params) => {
          const loadedProfile = await loadScoutProfile(params);
          setActiveProfile(loadedProfile);
          return loadedProfile;
        },
        syncGuestProfile: syncGuestScoutProfileToUser,
      }}
      renderOnboarding={(props) => (
        <ScoutOnboarding
          initialProfile={props.profile}
          onComplete={props.onComplete}
        />
      )}
      renderContent={({ encryptionKey, onActionParsed }) => (
        <ScoutContent
          profile={activeProfile}
          encryptionKey={encryptionKey}
          isRefreshingNews={isRefreshingNews}
          onRefreshNews={() => handleRefreshNews(activeProfile, encryptionKey)}
          onActionParsed={onActionParsed}
        />
      )}
    />
  );
}
