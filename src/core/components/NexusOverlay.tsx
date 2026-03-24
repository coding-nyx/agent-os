import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAI } from '@/llm-engine/ai-context';
import { ORCHESTRATOR_PERSONA } from '@/modules/nexus/personas';
import { CommandPalette } from '@/modules/nexus/components/CommandPalette';
import { NexusChat } from '@/core/components/NexusChat';
import { NexusSubModulePanel } from '@/core/components/NexusSubModulePanel';
import { useUIStore } from '@/lib/stores/ui-store';
import { type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { useNexusCrossModuleBlocker } from '@/lib/hooks/use-nexus-cross-module-blocker';
import { useNexusConflictBlocker } from '@/lib/hooks/use-nexus-conflict-blocker';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import type { ThreadParticipant } from '@/lib/contracts/orchestration';
import { useRoutineProposals } from '@/lib/hooks/use-routine-proposals';
import {
  useOrchestrationStore,
} from '@/lib/stores/orchestration-store';
import { NexusAgentPresenceStack } from '@/core/components/NexusAgentPresenceStack';
import { useNexusCoordination } from '@/modules/nexus/hooks/useNexusCoordination';

function getNexusGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface SubModuleState {
  moduleId: string;
  content?: string;
}

const COLLAPSED_W = 60;
const EXPANDED_W = 180;
const EMPTY_THREAD_PARTICIPANTS: ThreadParticipant[] = [];

export function NexusOverlay() {
  const { user, profile, isGuest } = useAuth();
  const { refreshGlobalSoul } = useGlobalSoul();
  const { hasVault, isUnlocked } = useVault();
  const location = useLocation();
  const navigate = useNavigate();
  const { sendMessage, analyzeImage } = useAI();
  const { isCrossModuleBusy, pendingTargets } = useNexusCrossModuleBlocker();
  const { isConflictBlocking } = useNexusConflictBlocker();
  const [open, setOpen] = useState(false);
  const [subModule, setSubModule] = useState<SubModuleState | null>(null);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  // Allow external components to open Nexus via a custom DOM event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-nexus', handler);
    return () => window.removeEventListener('open-nexus', handler);
  }, []);

  const close = useCallback(() => { setOpen(false); setSubModule(null); }, []);

  const handleDelegation = useCallback((path: string) => {
    const moduleId = path.replace(/^\//, '').split('/')[0];
    if (moduleId) setSubModule({ moduleId });
  }, []);

  const ai = useModuleAI({
    moduleId: 'nexus',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: handleDelegation,
  });

  const handleUploadDocuments = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a neutral document analyst. Follow the instructions exactly.',
        memoryContext: [],
        summary: 'Nexus document analysis.',
        history: [],
      });
      return response.publicText;
    };
    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return a concise summary and key points. No action tags.',
        memoryContext: [],
        summary: 'Nexus document fallback.',
        history: [],
      });
      return response.publicText;
    };

    setDocUploadError(null);
    setDocUploadBusy(true);
    setDocStage({
      id: 'parsing',
      label: request.files.length > 1 ? 'Uploading documents…' : 'Uploading document…',
    });

    try {
      const result = await prepareDocumentChatPrompt({
        moduleId: 'nexus',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage: (imageDataUrl, prompt) => analyzeImage(imageDataUrl, prompt),
        userContext: request.caption,
        onStageChange: (stage) => setDocStage(stage),
      });
      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      await ai.handleSendMessage(result.prompt, undefined, { visibleContent: request.visibleContent });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [ai, analyzeImage, sendMessage]);

  const handleNavigateToModule = useCallback((path: string) => {
    setSubModule(null);
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const handleOpenDashboard = useCallback(() => {
    setSubModule(null);
    setOpen(false);
    navigate('/nexus');
  }, [navigate]);

  const handleOpenOperations = useCallback(() => {
    setSubModule(null);
    setOpen(false);
    navigate('/nexus/ops');
  }, [navigate]);

  const handleClearChat = useCallback(() => {
    void ai.clearSession();
  }, [ai]);

  const isVisible = useMemo(() => {
    if (!user || !profile?.onboardingComplete) return false;
    if (hasVault && !isUnlocked) return false;
      return (
        location.pathname !== '/' &&
        !location.pathname.startsWith('/nexus') &&
        location.pathname !== '/vault-gate'
      );
  }, [user, profile?.onboardingComplete, location.pathname, hasVault, isUnlocked]);

  const isNexusBusy = isCrossModuleBusy || docUploadBusy || isConflictBlocking;
  const busyLabel = (() => {
    if (docUploadBusy) return docStage?.label ?? 'Uploading…';
    if (docUploadError) return docStage?.label ?? 'Analysis failed.';
    if (isConflictBlocking) return 'Conflict active';
    if (isCrossModuleBusy) {
      const names = pendingTargets.slice(0, 2).join(', ');
      return names ? `Waiting: ${names}…` : 'Waiting for module…';
    }
    return '';
  })();

  const isChatOverlayOpen = useUIStore((s) => s.isChatOverlayOpen);
  const hideGlobalFAB = useUIStore((s) => s.hideGlobalFAB);
  const activeThreadId = useOrchestrationStore((s) => s.activeThreadId);
  const autopilotLevel = useOrchestrationStore((s) => s.autopilotLevel);
  const lastTurnRuntime = useOrchestrationStore((s) => s.lastTurnRuntime);
  const currentThreadId = activeThreadId ?? lastTurnRuntime?.activeThreadId ?? 'nexus.dashboard';
  const applyThreadSnapshot = useOrchestrationStore((s) => s.applyThreadSnapshot);
  const threadParticipantsByThreadId = useOrchestrationStore((s) => s.threadParticipantsByThreadId);
  const threadMessagesByThreadId = useOrchestrationStore((s) => s.threadMessagesByThreadId);
  const threadTurnsByThreadId = useOrchestrationStore((s) => s.threadTurnsByThreadId);
  const routingSuggestion = useOrchestrationStore((s) => s.threadRoutingSuggestionByThreadId[currentThreadId] ?? null);
  const setThreadRoutingSuggestion = useOrchestrationStore((s) => s.setThreadRoutingSuggestion);
  const patchThreadRoutingSuggestion = useOrchestrationStore((s) => s.patchThreadRoutingSuggestion);
  const clearThreadRoutingSuggestion = useOrchestrationStore((s) => s.clearThreadRoutingSuggestion);
  const planningSuggestion = useOrchestrationStore((s) => s.threadPlanningSuggestionByThreadId[currentThreadId] ?? null);
  const persistedThreadParticipants = threadParticipantsByThreadId[currentThreadId] ?? EMPTY_THREAD_PARTICIPANTS;
  const persistedThreadMessages = threadMessagesByThreadId[currentThreadId] ?? [];
  const persistedThreadTurns = threadTurnsByThreadId[currentThreadId] ?? [];
  const pendingTargetsKey = pendingTargets.join('|');
  const mentionedParticipantsKey = (ai.lastParsedCommand?.mentionedModuleIds ?? []).join('|');
  const [snapshotNow, setSnapshotNow] = useState(() => new Date().toISOString());
  const routineProposals = useRoutineProposals('any');
  const { handleConsultModule, handleMemorySearch } = useNexusCoordination({
    ai,
    userId: user?.uid,
    isGuest,
    currentThreadId,
    autopilotLevel,
    navigate,
    setThreadRoutingSuggestion,
    patchThreadRoutingSuggestion,
    clearThreadRoutingSuggestion,
  });

  useEffect(() => {
    if (!isVisible) return;
    setSnapshotNow(new Date().toISOString());
  }, [
    isVisible,
    currentThreadId,
    pendingTargetsKey,
    routingSuggestion?.target,
    routingSuggestion?.reason,
    routingSuggestion?.state,
    routineProposals.activeProposal?.id,
    planningSuggestion?.id,
    planningSuggestion?.state,
    docUploadBusy,
    docStage?.label,
    isConflictBlocking,
    lastTurnRuntime,
    mentionedParticipantsKey,
  ]);

  const masterThreadSnapshot = useMemo(() => {
    return MasterThreadService.createNexusShellSnapshot({
      threadId: currentThreadId,
      now: snapshotNow,
      seedParticipants: persistedThreadParticipants,
      seedMessages: persistedThreadMessages,
      seedTurns: persistedThreadTurns,
      liveChatMessages: ai.messages,
      liveStreamingAssistantText: ai.streamingText,
      liveChatAssistantSource: 'nexus',
      pendingTargets,
      mentionedParticipants: ai.lastParsedCommand?.mentionedModuleIds ?? [],
      routingSuggestion: routingSuggestion
        ? {
            target: routingSuggestion.target,
            reason: routingSuggestion.reason,
          }
        : null,
      routingSuggestionState: routingSuggestion?.state ?? 'draft',
      routineProposal: routineProposals.activeProposal,
      planningProposal: planningSuggestion,
      docUploadBusy,
      docStageLabel: docStage?.label ?? null,
      isConflictBlocking,
      lastTurnRuntime,
    });
  }, [currentThreadId, persistedThreadParticipants, persistedThreadMessages, persistedThreadTurns, ai.messages, ai.streamingText, ai.lastParsedCommand?.mentionedModuleIds, pendingTargets, routingSuggestion, routineProposals.activeProposal, planningSuggestion, docUploadBusy, docStage?.label, isConflictBlocking, lastTurnRuntime, snapshotNow]);

  useEffect(() => {
    if (!isVisible) return;
    applyThreadSnapshot(masterThreadSnapshot.thread.threadId, {
      participants: masterThreadSnapshot.thread.participants,
      messages: masterThreadSnapshot.thread.messages,
      turns: masterThreadSnapshot.thread.turns,
    });
  }, [
    applyThreadSnapshot,
    isVisible,
    masterThreadSnapshot.thread.messages,
    masterThreadSnapshot.thread.participants,
    masterThreadSnapshot.thread.threadId,
    masterThreadSnapshot.thread.turns,
  ]);

  if (!isVisible) return null;

  // Mobile = bottom sheet (y-axis), Desktop = right panel (x-axis)
  const panelVariants = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 } };
  const welcomeGreeting = getNexusGreeting();
  const welcomeName = profile?.preferredName?.trim();

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={close}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/55 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.aside
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              drag={isMobile ? 'y' : undefined}
              dragConstraints={isMobile ? { top: 0 } : undefined}
              onDragEnd={(_, info) => {
                if (isMobile && (info.offset.y > 100 || info.velocity.y > 500)) {
                  close();
                }
              }}
              className={[
                'fixed z-[var(--z-modal)] flex flex-col',
                'bg-[#09090e]/96 backdrop-blur-[52px]',
                // Mobile: bottom sheet
                'bottom-0 left-0 right-0 rounded-t-[28px]',
                'h-[88dvh] border-t border-l border-r border-white/[0.06]',
                'shadow-[0_-20px_60px_rgba(0,0,0,0.55)]',
                // Desktop: right panel overrides
                'lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:bottom-0',
                'lg:w-full lg:max-w-[420px]',
                'lg:rounded-none lg:border-t-0 lg:border-r-0 lg:border-l lg:border-white/[0.06]',
                'lg:shadow-[-24px_0_60px_rgba(0,0,0,0.45)]',
              ].join(' ')}
              aria-label="Nexus overlay"
            >
              <div className="shrink-0 px-3 pt-3 sm:px-4 sm:pt-4">
                {/* Mobile drag handle */}
                <div className="flex justify-center pb-2 shrink-0 lg:hidden cursor-grab active:cursor-grabbing" aria-hidden="true">
                  <div className="w-9 h-1 rounded-full bg-white/[0.12]" />
                </div>

                <div className="rounded-[26px] border border-cyan-500/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_42%),linear-gradient(180deg,rgba(8,12,18,0.96),rgba(5,8,13,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:px-5 sm:py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Nexus</p>
                      <h2 className="mt-2 text-[clamp(1.2rem,2.8vw,1.8rem)] font-semibold leading-none tracking-[-0.03em] text-white">
                        {welcomeGreeting}
                        {welcomeName ? `, ${welcomeName}` : ''}.
                      </h2>
                      <p className="mt-2 text-sm text-white/55">
                        {isNexusBusy ? busyLabel : 'Welcome back. Nexus is online and listening.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="nexus-overlay-open-ops"
                          onClick={handleOpenOperations}
                          className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/14"
                        >
                          Ops
                        </button>
                        <button
                          type="button"
                          data-testid="nexus-overlay-open-home"
                          onClick={handleOpenDashboard}
                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/90"
                        >
                          Home
                        </button>
                        <button
                          type="button"
                          data-testid="nexus-overlay-clear-chat"
                          onClick={handleClearChat}
                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/90"
                        >
                          Clear chat
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/45 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/85"
                      aria-label="Close Nexus"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <NexusAgentPresenceStack participants={masterThreadSnapshot.thread.participants} />
                  </div>
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                <NexusChat
                  ai={{ ...ai, isProcessing: ai.isProcessing || isNexusBusy }}
                  agentName="Nexus"
                  moduleId="nexus"
                  themeColor="indigo"
                  placeholder="Ask Nexus anything…"
                  showInternalSignals={false}
                  processingLabel={isNexusBusy ? busyLabel : undefined}
                  onUploadDocuments={handleUploadDocuments}
                />

                <AnimatePresence>
                  {subModule && (
                    <NexusSubModulePanel
                      moduleId={subModule.moduleId}
                      initialContent={subModule.content}
                      onBack={() => setSubModule(null)}
                      onNavigate={handleNavigateToModule}
                    />
                  )}
                </AnimatePresence>
              </div>

              <CommandPalette
                onSynthesisRefresh={() => {
                  handleOpenOperations();
                  refreshGlobalSoul();
                }}
                onMemorySearch={handleMemorySearch}
                onAskModule={handleConsultModule}
                onExpandBrief={handleOpenDashboard}
                onOpenOperations={handleOpenOperations}
                onClearSession={handleClearChat}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
