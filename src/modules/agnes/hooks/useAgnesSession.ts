import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useUIStore } from '@/lib/stores/ui-store';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { saveAgnesProfile, type TherapyIntakeProfile } from '../services/agnes-profile-service';
import type { AgnesSessionPhase } from '../session-arc';
import type { AgnesEngagementMode, AgnesPersistentEngagementMode } from '../engagement-modes';
import type { AgnesState } from './types';
import * as AgnesLifecycleBridge from '@/cortex-bridge/agnes-session-lifecycle-bridge';

interface UseAgnesSessionParams {
  profile: TherapyIntakeProfile | null;
  encryptionKey: CryptoKey | null | undefined;
  setSessionActive?: (active: boolean) => void;
  // Lifted state (owned by component)
  currentState: AgnesState;
  setCurrentState: (state: AgnesState) => void;
  sessionType: 'impromptu' | 'new' | null;
  setSessionType: (type: 'impromptu' | 'new' | null) => void;
  sessionStartedAt: number;
  setSessionStartedAt: (ts: number) => void;
  // From engagement hook
  engagementMode: AgnesEngagementMode;
  preferredPersistentMode: AgnesPersistentEngagementMode;
  isImpromptu: boolean;
  resetEngagementToPreferred: () => void;
  setEngagementForImpromptu: () => void;
  setEngagementForSession: () => void;
  resetOnLogout: () => void;
  // From beliefs hook
  activeBeliefContext: { triggeringBeliefs: string[]; rationale: string[] } | null;
  setActiveBeliefContext: (ctx: { triggeringBeliefs: string[]; rationale: string[] } | null) => void;
  flushPendingPostSessionWorkflow: () => void;
  autoHandlePendingBeliefSuggestions: () => Promise<void>;
  acceptBeliefInvitationAndGetContext: () => Promise<{ triggeringBeliefs: string[]; rationale: string[] } | undefined>;
  // From system prompt hook
  systemPrompt: string;
  getSessionProgressBlock: () => string | null;
}

export function useAgnesSession({
  profile,
  encryptionKey,
  setSessionActive,
  currentState,
  setCurrentState,
  sessionType,
  setSessionType,
  sessionStartedAt,
  setSessionStartedAt,
  engagementMode,
  preferredPersistentMode,
  isImpromptu,
  resetEngagementToPreferred,
  setEngagementForImpromptu,
  setEngagementForSession,
  resetOnLogout,
  activeBeliefContext,
  setActiveBeliefContext,
  flushPendingPostSessionWorkflow,
  autoHandlePendingBeliefSuggestions,
  acceptBeliefInvitationAndGetContext,
  systemPrompt,
  getSessionProgressBlock,
}: UseAgnesSessionParams) {
  const { user, isGuest } = useAuth();
  const globalSoul = useGlobalSoulStore((s) => s.globalSoul);
  const navigate = useNavigate();
  const setHideGlobalFAB = useUIStore((s) => s.setHideGlobalFAB);

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [isCompactingMemory, setIsCompactingMemory] = useState(false);
  const [compactMemoryStatus, setCompactMemoryStatus] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [pendingImpromptuWelcome, setPendingImpromptuWelcome] = useState<string | null>(null);
  const [pendingBeliefOpen, setPendingBeliefOpen] = useState(false);
  const [detectedPhase, setDetectedPhase] = useState<AgnesSessionPhase | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const closingHeldTurnsRef = useRef(0);
  const prevUserRef = useRef(user);

  const agentAlias = globalSoul?.displayNames?.agnes || 'Agnes';

  // ── Session lifecycle (KMP Bridge) ────────────────────────────────────────

  // Purge expired impromptu sessions on mount or when user changes
  useEffect(() => {
    if (user && !isGuest) {
      AgnesLifecycleBridge.purgeExpiredSessions().catch((e) => {
        console.error('[AgnesSession] Failed to purge expired sessions:', e);
      });
    }
  }, [user, isGuest]);

  const {
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    routingSuggestion,
    setRoutingSuggestion: setRoutingSuggestionRaw,
    handleSendMessage,
    prewarmMemory,
    clearSession,
    summarizeSession,
    pendingApprovals,
    approveAction,
    dismissAction,
  } = useModuleAI({
    moduleId: 'agnes',
    systemPrompt,
    encryptionKey,
    contextPolicy: isImpromptu ? 'doc-only' : 'prompted',
    persistencePolicy: isImpromptu ? 'ephemeral' : 'auto',
    sessionId: isImpromptu ? 'impromptu' : undefined,
    getSessionProgressBlock,
    moduleSessionActive: currentState === 'session',
  });

  // Guard: never accumulate routing suggestions while a session is active.
  const setRoutingSuggestion = useCallback(
    (value: Parameters<typeof setRoutingSuggestionRaw>[0]) => {
      if (currentState === 'session' && value !== null) return;
      setRoutingSuggestionRaw(value);
    },
    [currentState, setRoutingSuggestionRaw],
  );

  // Notify parent about session activity
  useEffect(() => {
    setSessionActive?.(currentState === 'session');
  }, [currentState, setSessionActive]);

  // Hide Ara FAB universally in Agnes
  useEffect(() => {
    setHideGlobalFAB(true);
    return () => setHideGlobalFAB(false);
  }, [setHideGlobalFAB]);

  // Settings event listener
  useEffect(() => {
    const handleOpenSettings = () => setIsSettingsOpen(true);
    window.addEventListener('agnes:open-settings', handleOpenSettings);
    return () => window.removeEventListener('agnes:open-settings', handleOpenSettings);
  }, []);

  // s18-002: once hydration settles, auto-advance to session if messages already exist
  useEffect(() => {
    if (!isHydrating && messages.length > 0 && currentState === 'selecting' && !sessionType) {
      setSessionType('new');
      setCurrentState('session');
    }
  }, [isHydrating, messages.length, currentState, sessionType, setSessionType, setCurrentState]);

  // s18-006: logout guard — clear local session state when user transitions to null
  useEffect(() => {
    if (prevUserRef.current && !user) {
      clearSession();
      setCurrentState('selecting');
      setSessionType(null);
      resetOnLogout();
      setActiveBeliefContext(null);
      setPendingBeliefOpen(false);
      setDetectedPhase(null);
      closingHeldTurnsRef.current = 0;
      setSessionSummary(null);
    }
    prevUserRef.current = user;
  }, [user, clearSession, resetOnLogout, setActiveBeliefContext, setCurrentState, setSessionType]);

  // Inject impromptu welcome AFTER the hook's reset+hydration effects settle.
  useEffect(() => {
    if (pendingImpromptuWelcome && !isHydrating && isImpromptu) {
      setMessages([{ role: 'assistant', content: pendingImpromptuWelcome }]);
      setPendingImpromptuWelcome(null);
    }
  }, [pendingImpromptuWelcome, isHydrating, isImpromptu, setMessages]);

  // For belief-triggered sessions, fire a hidden trigger so Agnes generates a
  // personalised opening.
  useEffect(() => {
    if (pendingBeliefOpen && !isHydrating && !isImpromptu && !isProcessing) {
      setPendingBeliefOpen(false);
      handleSendMessage(
        '[Open session — begin with a warm, present greeting. Let the client lead.]',
        undefined,
        { hideUserMessage: true },
      );
    }
  }, [pendingBeliefOpen, isHydrating, isImpromptu, isProcessing, handleSendMessage]);

  // Evaluate sentiment gravity and trigger invitations if needed
  useEffect(() => {
    if (messages.length === 0 || isProcessing || isImpromptu || currentState !== 'session') return;
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    const content = typeof last.content === 'string' ? last.content : '';
    const match = content.match(/Sentiment Gravity:\s*(\d*\.?\d+)/i);
    if (!match) return;
    const gravity = parseFloat(match[1]);
    if (!isNaN(gravity)) {
      AgnesLifecycleBridge.evaluateSentimentGravity(gravity, `session_${sessionStartedAt}`).catch(() => {});
    }
  }, [messages, isProcessing, isImpromptu, currentState, sessionStartedAt]);

  // Parse Agnes's declared Phase from the last assistant message after each completed turn.
  useEffect(() => {
    if (messages.length === 0 || isProcessing || isImpromptu) return;
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    const content = typeof last.content === 'string' ? last.content : '';
    const match = content.match(/<thought>[\s\S]*?Phase:\s*(OPENING|DEEPENING|INTEGRATION|CLOSING)[\s\S]*?<\/thought>/);
    if (!match) return;
    const phase = match[1] as AgnesSessionPhase;
    setDetectedPhase(phase);
    closingHeldTurnsRef.current = phase === 'CLOSING' ? closingHeldTurnsRef.current + 1 : 0;
  }, [messages, isProcessing, isImpromptu]);

  // Reset arc state whenever a new session starts.
  useEffect(() => {
    setDetectedPhase(null);
    closingHeldTurnsRef.current = 0;
  }, [sessionStartedAt]);

  const hasActiveSession = !isGuest && messages.length > 0;

  // ── Session lifecycle ─────────────────────────────────────────────────────

  const startSession = useCallback(async (type: 'impromptu' | 'new' | 'continue', beliefContext?: { triggeringBeliefs: string[]; rationale: string[] }) => {
    const sessionId = type === 'impromptu' ? 'impromptu' : `session_${Date.now()}`;

    if (type === 'continue') {
      await AgnesLifecycleBridge.transitionTo(preferredPersistentMode.toUpperCase() as AgnesLifecycleBridge.AgnesSessionMode, sessionId);
      setSessionType('new');
      setEngagementForSession();
      setSessionStartedAt(Date.now());
      setCurrentState('session');
      const ctx = profile?.baseContext;
      if (ctx) {
        const seedParts = [
          typeof ctx.struggles !== 'undefined' && `struggles: ${Array.isArray(ctx.struggles) ? ctx.struggles.join(', ') : ctx.struggles}`,
          typeof ctx.goals !== 'undefined' && `goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}`,
          ctx.backgroundSummary || ctx.childhood,
        ].filter(Boolean).join('. ');
        prewarmMemory(seedParts || 'therapy session');
      }
      return;
    }

    if (type === 'impromptu') {
      await AgnesLifecycleBridge.transitionTo('IMPROMPTU', 'impromptu');
      sessionStorage.removeItem(`ara_session_agnes_impromptu`);
      const quickSupportGreetings = [
        "You reached out, and that matters. This is Impromptu mode \u2014 private, off the record, and focused on what you need right now. Take a breath, and whenever you're ready, tell me what's happening.",
        "This is a quiet, off-the-record space. We can keep it immediate and simple for as long as you need. What's coming up for you right now?",
        "Whatever brought you here, you don\u2019t have to hold it alone right now. This Impromptu session leaves no trace. I'm with you \u2014 start wherever feels most urgent.",
      ];
      const greeting = quickSupportGreetings[Math.floor(Math.random() * quickSupportGreetings.length)];
      setPendingImpromptuWelcome(greeting);
      setSessionType('impromptu');
      setEngagementForImpromptu();
      setSessionStartedAt(Date.now());
      setCurrentState('session');
      return;
    }

    // Starting a new regular session
    await clearSession();
    await AgnesLifecycleBridge.transitionTo(preferredPersistentMode.toUpperCase() as AgnesLifecycleBridge.AgnesSessionMode, sessionId);
    setSessionType('new');
    setEngagementForSession();
    setSessionStartedAt(Date.now());
    setCurrentState('session');
    setActiveBeliefContext(beliefContext ?? null);

    if (profile?.baseContext) {
      const ctx = profile.baseContext;
      const seedParts = [
        typeof ctx.struggles !== 'undefined' && `struggles: ${Array.isArray(ctx.struggles) ? ctx.struggles.join(', ') : ctx.struggles}`,
        typeof ctx.goals !== 'undefined' && `goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}`,
        ctx.backgroundSummary || ctx.childhood,
      ].filter(Boolean).join('. ');
      prewarmMemory(seedParts || 'therapy session');
    }

    const userName = (typeof profile?.baseContext?.identity === 'object'
      ? profile?.baseContext?.identity?.name
      : profile?.baseContext?.identity) || 'there';
    const isFirstSession = !profile?.onboardingComplete;

    const firstTimeGreetings = {
      casual: [
        `Hi, I'm ${agentAlias}. We can keep this light and conversational today. What's been on your mind?`,
        `Hello, I'm ${agentAlias}. Casual Chat is open \u2014 we can start wherever feels easiest.`,
      ],
      deep: [
        `Hi, I'm ${agentAlias}. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin?`,
        `Hello, I'm ${agentAlias}. It's a privilege to establish this link with you. How are you feeling today?`,
        `Hi there, I'm ${agentAlias}. Think of me as a mirror for your inner world. What's on your mind?`,
      ],
      somatic: [
        `Hi, I'm ${agentAlias}. We can go slowly and pay attention to what your system is signaling as we talk. What feels most present right now?`,
        `Hello, I'm ${agentAlias}. Somatic Mode is open \u2014 we can track what's happening in your body and emotions without rushing.`,
      ],
    } as const;
    const returningGreetings = {
      casual: [
        `Hi ${userName}, good to see you again. We can keep this simple today \u2014 what's most alive for you right now?`,
        `Welcome back, ${userName}. Casual Chat is open. Where would you like to start?`,
      ],
      deep: [
        `Hi ${userName}, it's good to see you again. Shall we pick up where we left off?`,
        `Hello ${userName}, welcome back. How has your journey been since we last spoke?`,
        `Hi ${userName}, I'm glad you're back. How are you holding up today?`,
        `Good to see you, ${userName}. What's been surfacing for you lately?`,
      ],
      somatic: [
        `Hi ${userName}, welcome back. Let's move slowly and notice what feels most present in your system today.`,
        `Good to see you, ${userName}. We can start with whatever feels most activated, tense, or unsettled right now.`,
      ],
    } as const;

    if (beliefContext?.triggeringBeliefs?.length) {
      setPendingBeliefOpen(true);
    } else {
      const initialMsg = isFirstSession
        ? firstTimeGreetings[preferredPersistentMode][Math.floor(Math.random() * firstTimeGreetings[preferredPersistentMode].length)]
        : returningGreetings[preferredPersistentMode][Math.floor(Math.random() * returningGreetings[preferredPersistentMode].length)];
      setMessages([{ role: 'assistant', content: initialMsg }]);
    }
  }, [
    agentAlias,
    clearSession,
    preferredPersistentMode,
    prewarmMemory,
    profile,
    setMessages,
    setActiveBeliefContext,
    setEngagementForImpromptu,
    setEngagementForSession,
    setCurrentState,
    setSessionType,
    setSessionStartedAt,
  ]);

  const endSession = useCallback(async () => {
    setIsSummarizing(true);
    setCompactMemoryStatus(null);
    try {
      const summary = await summarizeSession();
      setSessionSummary(summary);
    } catch (e) {
      console.error("Summary failed:", e);
    } finally {
      setIsSummarizing(false);
    }
  }, [summarizeSession]);

  const handleSendMessageWithArcCheck = useCallback<typeof handleSendMessage>(
    async (content, onActionParsed?, options?) => {
      if (
        !isImpromptu &&
        !isProcessing &&
        !isSummarizing &&
        !isClosingSession &&
        closingHeldTurnsRef.current >= 2
      ) {
        void endSession();
        return;
      }
      return handleSendMessage(content, onActionParsed, options);
    },
    [handleSendMessage, isImpromptu, isProcessing, isSummarizing, isClosingSession, endSession],
  );

  const finalizeClose = useCallback(async () => {
    if (isImpromptu) {
      try { sessionStorage.removeItem('ara_session_agnes_impromptu'); } catch { /* ignore */ }
      await AgnesLifecycleBridge.closeImpromptu('impromptu');
      setMessages([]);
    } else {
      await AgnesLifecycleBridge.transitionTo('CASUAL', 'closing');
      await clearSession();
    }
    setCurrentState('selecting');
    setSessionType(null);
    resetEngagementToPreferred();
    setSessionSummary(null);
    setActiveBeliefContext(null);
    setPendingBeliefOpen(false);
    setDetectedPhase(null);
    closingHeldTurnsRef.current = 0;

    flushPendingPostSessionWorkflow();
    void autoHandlePendingBeliefSuggestions();
  }, [isImpromptu, setMessages, clearSession, resetEngagementToPreferred, setActiveBeliefContext, flushPendingPostSessionWorkflow, autoHandlePendingBeliefSuggestions, setCurrentState, setSessionType]);

  const handleMergeAndClose = useCallback(async () => {
    setIsClosingSession(true);
    try {
      if (user && !isGuest && messages.length > 0) {
        const snapshot = JSON.stringify({
          moduleId: 'agnes',
          endedAt: new Date().toISOString(),
          history: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          })),
        });

        const existing = await ModuleMemoryService.getEnvelope(user.uid, 'agnes', encryptionKey);
        if (!existing) {
          if (!encryptionKey) {
            console.warn('[Agnes] Skipping session merge: missing encryption key for vault-scoped module.');
          } else {
            await ModuleMemoryService.initializeEnvelope(user.uid, 'agnes', encryptionKey);
          }
        }

        if (existing || encryptionKey) {
          await ModuleMemoryService.commitSession(
            user.uid,
            'agnes',
            {
              id: `agnes_${Date.now()}`,
              timestamp: new Date().toISOString(),
              summary: sessionSummary || 'Agnes session completed.',
              keyInsights: [],
              sentiment: 0,
              tokenUsage: 0,
            },
            snapshot,
            { encryptionKey },
          );
        }

        if (profile) {
          const updatedCount = (profile.baseContext?.sessionCount ?? 0) + 1;
          await saveAgnesProfile(
            {
              ...profile,
              baseContext: { ...profile.baseContext, sessionCount: updatedCount },
              updatedAt: new Date().toISOString(),
            },
            { userId: user.uid, encryptionKey },
          );
        }
      }

      await finalizeClose();
    } catch (e) {
      console.error('Failed to merge agnes session:', e);
    } finally {
      setIsClosingSession(false);
    }
  }, [user, isGuest, messages, encryptionKey, sessionSummary, profile, finalizeClose]);

  const handleDiscardAndClose = useCallback(async () => {
    setIsClosingSession(true);
    try {
      await finalizeClose();
    } finally {
      setIsClosingSession(false);
    }
  }, [finalizeClose]);

  const handleCompactCurrentMemory = useCallback(async () => {
    if (!user || isGuest || !encryptionKey) return;
    setCompactMemoryStatus(null);
    setIsCompactingMemory(true);
    try {
      const result = await ModuleMemoryService.compactEnvelope(user.uid, 'agnes', { encryptionKey });
      if (result.compacted) {
        setCompactMemoryStatus(
          `Compacted successfully (${result.eventCount ?? 0} events${result.snapshotTruncated ? ', snapshot trimmed' : ''}${result.historyCompacted ? ', history compacted' : ''}).`,
        );
      } else {
        setCompactMemoryStatus(`Compaction skipped: ${result.reason ?? 'unknown reason'}.`);
      }
    } catch (error) {
      console.error('[Agnes] Manual memory compaction failed:', error);
      setCompactMemoryStatus('Compaction failed. Check console for details.');
    } finally {
      setIsCompactingMemory(false);
    }
  }, [encryptionKey, isGuest, user]);

  // Accept belief invitation and start a belief-triggered session
  const handleAcceptBeliefInvitation = useCallback(async () => {
    const beliefContext = await acceptBeliefInvitationAndGetContext();
    await startSession('new', beliefContext);
  }, [acceptBeliefInvitationAndGetContext, startSession]);

  const handleRouteConfirm = useCallback(() => {
    if (!routingSuggestion) return;
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    setRoutingSuggestion(null);
  }, [routingSuggestion, navigate, setRoutingSuggestion]);

  const handleRouteDismiss = useCallback(() => {
    setRoutingSuggestion(null);
  }, [setRoutingSuggestion]);

  return {
    // State (read-only from here, owned by component)
    agentAlias,
    hasActiveSession,
    detectedPhase,
    isSettingsOpen,
    setIsSettingsOpen,
    // Session summary & closing
    isSummarizing,
    isClosingSession,
    isCompactingMemory,
    compactMemoryStatus,
    sessionSummary,
    setSessionSummary,
    setCompactMemoryStatus,
    // AI hook pass-through
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    routingSuggestion,
    pendingApprovals,
    approveAction,
    dismissAction,
    // Actions
    startSession,
    endSession,
    handleSendMessageWithArcCheck,
    handleMergeAndClose,
    handleDiscardAndClose,
    handleCompactCurrentMemory,
    handleAcceptBeliefInvitation,
    handleRouteConfirm,
    handleRouteDismiss,
  };
}
