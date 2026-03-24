import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { AgnesOnboarding } from './onboarding/AgnesOnboarding';
import { AGNES_PERSONA } from './personas';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { Sparkles, ShieldAlert, CheckSquare, LogOut, Brain, Clock, MessageSquare, Shield, ArrowRight, ChevronLeft, ChevronRight, Activity, Settings } from 'lucide-react';
import { SomaticSessionPicker, type SomaticExerciseType } from './components/somatic/SomaticSessionPicker';
import { BreathworkExercise } from './components/somatic/BreathworkExercise';
import { GroundingExercise } from './components/somatic/GroundingExercise';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { AgnesTelemetryHeader } from './components/AgnesTelemetryHeader';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { AnimatePresence, motion } from 'framer-motion';
import { NexusChat } from '@/core/components/NexusChat';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { buildAgnesSessionPrompt } from './prompts/agnes-session-prompt';
import { Agnes3DEnvironment } from './components/Agnes3DEnvironment';
import { AgnesSettingsPanel } from './components/AgnesSettingsPanel';
import { AgnesDashboard } from './components/AgnesDashboard';
import { AgnesPersonalitySidebar } from './components/AgnesPersonalitySidebar';
import { AgnesTherapistCard } from './components/AgnesTherapistCard';
import {
  dismissBeliefGraphProposal,
  subscribeBeliefGraphWorkflow,
  type BeliefGraphWorkflow,
  confirmBeliefGraphProposal,
  updateBeliefSessionInvitationStatus,
} from './services/belief-graph-workflow-service';
import { buildBeliefSessionInvitationSnapshot } from './services/belief-trigger-service';
import {
  subscribeBeliefGraph,
  type BeliefGraph as AgnesBeliefGraph,
} from './services/belief-graph-service';
import {
  createEmptyAgnesProfile,
  loadAgnesProfile,
  saveAgnesProfile,
  subscribeAgnesProfile,
  TherapyIntakeProfile
} from './services/agnes-profile-service';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import type { ContentRenderProps } from '@/core/components/UnifiedModulePage';
import { useUIStore } from '@/lib/stores/ui-store';
import { AgnesNotificationSettingsPanel } from './components/AgnesNotificationSettingsPanel';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';

import { SanctuaryBackground } from './components/SanctuaryBackground';
import { AgnesSanctuarySidebar } from './components/AgnesSanctuarySidebar';
import { AgnesSanctuaryContent } from './components/AgnesSanctuaryContent';
import { AgnesEngagementModeControl } from './components/AgnesEngagementModeControl';
import {
  AGNES_ENGAGEMENT_MODE_DEFINITIONS,
  AgnesEngagementMode,
  AgnesPersistentEngagementMode,
  buildAgnesPromptContinuity,
  DEFAULT_AGNES_ENGAGEMENT_MODE,
  getAgnesSessionModeOptions,
  resolvePersistentAgnesMode,
  saveGuestAgnesPreferredMode,
  loadGuestAgnesPreferredMode,
} from './engagement-modes';

type AgnesState = 'selecting' | 'session' | 'somatic';

const AgnesSidebar = React.memo(function AgnesSidebar({
  profile,
  agentAlias,
  onSave
}: {
  profile: TherapyIntakeProfile | null;
  agentAlias: string;
  onSave: (updated: TherapyIntakeProfile) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const toggleCollapsed = React.useCallback(() => setCollapsed(c => !c), []);

  return (
    <AgnesSanctuarySidebar 
      collapsed={collapsed} 
      onToggle={toggleCollapsed} 
      agentAlias={agentAlias} 
      profile={profile}
    />
  );
});

interface AgnesContentProps extends ContentRenderProps<TherapyIntakeProfile> {}

function AgnesContent({
  profile,
  encryptionKey,
  setSessionActive
}: AgnesContentProps) {
  const { globalSoul, updateCrossFunctionalState } = useGlobalSoul();

  const { user, isGuest, profile: coreProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const navigate = useNavigate();
  const isAccessible = isModuleAccessible('agnes');
  const [currentState, setCurrentState] = useState<AgnesState>('selecting');
  const setHideGlobalFAB = useUIStore((s) => s.setHideGlobalFAB);

  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [engagementMode, setEngagementMode] = useState<AgnesEngagementMode>(DEFAULT_AGNES_ENGAGEMENT_MODE);
  const [preferredPersistentMode, setPreferredPersistentMode] = useState<AgnesPersistentEngagementMode>(DEFAULT_AGNES_ENGAGEMENT_MODE);
  const [modeContinuity, setModeContinuity] = useState<ReturnType<typeof buildAgnesPromptContinuity>>();
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());
  const [pendingImpromptuWelcome, setPendingImpromptuWelcome] = useState<string | null>(null);
  const [beliefGraph, setBeliefGraph] = useState<AgnesBeliefGraph | null>(null);
  const [beliefWorkflow, setBeliefWorkflow] = useState<BeliefGraphWorkflow | null>(null);
  const [beliefWorkflowBusy, setBeliefWorkflowBusy] = useState(false);
  const prevUserRef = useRef(user);

  // Somatic session state
  const [selectedSomaticExercise, setSelectedSomaticExercise] = useState<SomaticExerciseType | null>(null);
  const somaticStartedAt = useRef<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // S14-006: Reactive Spine event handling
  const handledSpineEventsRef = useRef<Set<string>>(new Set());

  // Somatic support requested via Spine cascade (e.g. from Ledger or Soma)
  useSpineEvent('SOMATIC_SUPPORT_REQUESTED', useCallback((event: import('@/lib/types').SpineEvent) => {
    if (!profile?.onboardingComplete || currentState !== 'selecting') return;
    const eventKey = `somatic-req-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);

    // Auto-open somatic picker
    setCurrentState('somatic');
    setSelectedSomaticExercise(null);
  }, [profile?.onboardingComplete, currentState]));

  useEffect(() => {
    const handleOpenSettings = () => setIsSettingsOpen(true);
    window.addEventListener('agnes:open-settings', handleOpenSettings);
    return () => window.removeEventListener('agnes:open-settings', handleOpenSettings);
  }, []);

  useEffect(() => {
    if (!user || isGuest || !encryptionKey) {
      setBeliefGraph(null);
      setBeliefWorkflow(null);
      return;
    }

    const unsubscribeGraph = subscribeBeliefGraph({ userId: user.uid, encryptionKey }, setBeliefGraph);
    const unsubscribeWorkflow = subscribeBeliefGraphWorkflow({ userId: user.uid, encryptionKey }, setBeliefWorkflow);

    return () => {
      unsubscribeGraph();
      unsubscribeWorkflow();
    };
  }, [encryptionKey, isGuest, user]);

  useEffect(() => {
    const storedMode = user
      ? resolvePersistentAgnesMode(
          profile?.baseContext && 'preferredEngagementMode' in profile.baseContext
            ? (profile.baseContext as { preferredEngagementMode?: unknown }).preferredEngagementMode
            : DEFAULT_AGNES_ENGAGEMENT_MODE,
        )
      : loadGuestAgnesPreferredMode();

    setPreferredPersistentMode(storedMode);
    if (!sessionType) {
      setEngagementMode(storedMode);
      setModeContinuity(undefined);
    }
  }, [user, profile?.baseContext, sessionType]);

  // Somatic preference toggle (mirrors AgnesSettingsPanel logic)
  const [somaticEnabled, setSomaticEnabled] = useState<boolean>(
    profile?.baseContext?.somaticEnabled !== false
  );
  const pendingSomaticSave = useRef(false);

  useEffect(() => {
    if (pendingSomaticSave.current) return;
    setSomaticEnabled(profile?.baseContext?.somaticEnabled !== false);
  }, [profile?.baseContext?.somaticEnabled]);

  const handleSomaticToggle = useCallback(async () => {
    if (!profile) return;
    const newValue = !somaticEnabled;
    setSomaticEnabled(newValue);
    pendingSomaticSave.current = true;
    try {
      await saveAgnesProfile(
        {
          ...profile,
          baseContext: { ...profile.baseContext, somaticEnabled: newValue },
          updatedAt: new Date().toISOString(),
        },
        { userId: user?.uid, encryptionKey }
      );
    } finally {
      setTimeout(() => { pendingSomaticSave.current = false; }, 500);
    }
  }, [profile, user, somaticEnabled, encryptionKey]);

  const agentAlias = globalSoul?.displayNames?.agnes || 'Agnes';

  const isImpromptu = sessionType === 'impromptu';
  const sessionModeOptions = useMemo(
    () => getAgnesSessionModeOptions(isImpromptu ? 'ephemeral' : 'persistent'),
    [isImpromptu]
  );
  const activeModeDefinition = AGNES_ENGAGEMENT_MODE_DEFINITIONS[engagementMode];
  const systemPrompt = useMemo(
    () => buildAgnesSessionPrompt(
      AGNES_PERSONA,
      isImpromptu ? null : profile?.baseContext,
      coreProfile?.agentPersonalityProvision?.agentGenders?.agnes,
      {
        engagementMode,
        continuity: modeContinuity,
      }
    ),
    [isImpromptu, profile?.baseContext, coreProfile?.agentPersonalityProvision?.agentGenders?.agnes, engagementMode, modeContinuity]
  );

  const {
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    routingSuggestion,
    setRoutingSuggestion,
    handleSendMessage,
    prewarmMemory,
    clearSession,
    summarizeSession
  } = useModuleAI({
    moduleId: 'agnes',
    systemPrompt,
    encryptionKey,
    contextPolicy: isImpromptu ? 'doc-only' : 'prompted',
    persistencePolicy: isImpromptu ? 'ephemeral' : 'auto',
    sessionId: isImpromptu ? 'impromptu' : undefined
  });

  useEffect(() => {
    setSessionActive?.(currentState === 'session');
  }, [currentState, setSessionActive]);

  // Hide Nexus FAB universally in Agnes as it's not required
  useEffect(() => {
    setHideGlobalFAB(true);
    return () => setHideGlobalFAB(false);
  }, [setHideGlobalFAB]);

  // s18-002: once hydration settles, auto-advance to session if messages already exist
  // This prevents the picker rendering on reload and the user accidentally wiping their session
  useEffect(() => {
    if (!isHydrating && messages.length > 0 && currentState === 'selecting' && !sessionType) {
      setSessionType('new');
      setCurrentState('session');
    }
  }, [isHydrating, messages.length, currentState, sessionType]);

  // s18-006: logout guard — clear local session state when user transitions to null
  useEffect(() => {
    if (prevUserRef.current && !user) {
      clearSession();
      setCurrentState('selecting');
      setSessionType(null);
      setEngagementMode(loadGuestAgnesPreferredMode());
      setPreferredPersistentMode(loadGuestAgnesPreferredMode());
      setModeContinuity(undefined);
      setSessionSummary(null);
    }
    prevUserRef.current = user;
  }, [user, clearSession]);

  // Inject impromptu welcome AFTER the hook's reset+hydration effects settle.
  // Without this, the welcome set during startSession() gets overwritten by
  // useModuleAI's reset effect (activeSessionId change) and hydration effect.
  useEffect(() => {
    if (pendingImpromptuWelcome && !isHydrating && isImpromptu) {
      setMessages([{ role: 'assistant', content: pendingImpromptuWelcome }]);
      setPendingImpromptuWelcome(null);
    }
  }, [pendingImpromptuWelcome, isHydrating, isImpromptu, setMessages]);

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

  const persistPreferredMode = useCallback(async (mode: AgnesPersistentEngagementMode) => {
    if (user) {
      if (!profile) return;
      await saveAgnesProfile(
        {
          ...profile,
          baseContext: { ...profile.baseContext, preferredEngagementMode: mode } as TherapyIntakeProfile['baseContext'],
          updatedAt: new Date().toISOString(),
        },
        { userId: user.uid, encryptionKey }
      );
      return;
    }

    saveGuestAgnesPreferredMode(mode);
    if (!profile) return;
    await saveAgnesProfile(
      {
        ...profile,
        baseContext: { ...profile.baseContext, preferredEngagementMode: mode } as TherapyIntakeProfile['baseContext'],
        updatedAt: new Date().toISOString(),
      },
      { userId: undefined, encryptionKey }
    );
  }, [user, profile, encryptionKey]);

  const handlePreferredPersistentModeChange = useCallback(async (mode: AgnesPersistentEngagementMode) => {
    setPreferredPersistentMode(mode);
    if (!sessionType) {
      setEngagementMode(mode);
      setModeContinuity(undefined);
    }
    await persistPreferredMode(mode);
  }, [persistPreferredMode, sessionType]);

  const handleEngagementModeChange = useCallback(async (nextMode: AgnesEngagementMode) => {
    if (nextMode === engagementMode) return;
    setModeContinuity(buildAgnesPromptContinuity(messages, engagementMode));
    setEngagementMode(nextMode);

    if (!isImpromptu && nextMode !== 'impromptu') {
      const persistentMode = resolvePersistentAgnesMode(nextMode);
      setPreferredPersistentMode(persistentMode);
      await persistPreferredMode(persistentMode);
    }
  }, [engagementMode, messages, isImpromptu, persistPreferredMode]);

  const startSession = useCallback(async (type: 'impromptu' | 'new' | 'continue') => {
    if (type === 'continue') {
      setSessionType('new'); // Continue is effectively a 'new' persistent session from a routing perspective
      setEngagementMode(preferredPersistentMode);
      setModeContinuity(undefined);
      setSessionStartedAt(Date.now());
      setCurrentState('session');
      const ctx = profile?.baseContext;
      if (ctx) {
        const seedParts = [
          typeof ctx.struggles !== 'undefined' && `struggles: ${Array.isArray(ctx.struggles) ? ctx.struggles.join(', ') : ctx.struggles}`,
          typeof ctx.goals !== 'undefined' && `goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}`,
          ctx.backgroundSummary || ctx.childhood
        ].filter(Boolean).join('. ');
        prewarmMemory(seedParts || 'therapy session');
      }
      return;
    }

    if (type === 'impromptu') {
      // Clear any stale impromptu cache so the hydration effect finds nothing
      // and doesn't overwrite the welcome we're about to inject.
      sessionStorage.removeItem(`nexus_session_agnes_impromptu`);
      const quickSupportGreetings = [
        "You reached out, and that matters. This is Impromptu mode — private, off the record, and focused on what you need right now. Take a breath, and whenever you're ready, tell me what's happening.",
        "This is a quiet, off-the-record space. We can keep it immediate and simple for as long as you need. What's coming up for you right now?",
        "Whatever brought you here, you don't have to hold it alone right now. This Impromptu session leaves no trace. I'm with you — start wherever feels most urgent."
      ];
      const greeting = quickSupportGreetings[Math.floor(Math.random() * quickSupportGreetings.length)];
      // Store greeting to inject AFTER the hook's reset+hydration effects settle
      setPendingImpromptuWelcome(greeting);
      setSessionType('impromptu');
      setEngagementMode('impromptu');
      setModeContinuity(undefined);
      setSessionStartedAt(Date.now());
      setCurrentState('session');
      return;
    }

    // Starting a new regular session — clear the previous one first
    await clearSession();
    setSessionType('new');
    setEngagementMode(preferredPersistentMode);
    setModeContinuity(undefined);
    setSessionStartedAt(Date.now());
    setCurrentState('session');

    if (profile?.baseContext) {
      const ctx = profile.baseContext;
      const seedParts = [
        typeof ctx.struggles !== 'undefined' && `struggles: ${Array.isArray(ctx.struggles) ? ctx.struggles.join(', ') : ctx.struggles}`,
        typeof ctx.goals !== 'undefined' && `goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}`,
        ctx.backgroundSummary || ctx.childhood
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
        `Hello, I'm ${agentAlias}. Casual Chat is open — we can start wherever feels easiest.`,
      ],
      deep: [
        `Hi, I'm ${agentAlias}. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin?`,
        `Hello, I'm ${agentAlias}. It's a privilege to establish this link with you. How are you feeling today?`,
        `Hi there, I'm ${agentAlias}. Think of me as a mirror for your inner world. What's on your mind?`,
      ],
      somatic: [
        `Hi, I'm ${agentAlias}. We can go slowly and pay attention to what your system is signaling as we talk. What feels most present right now?`,
        `Hello, I'm ${agentAlias}. Somatic Mode is open — we can track what's happening in your body and emotions without rushing.`,
      ],
    } satisfies Record<AgnesPersistentEngagementMode, string[]>;
    const returningGreetings = {
      casual: [
        `Hi ${userName}, good to see you again. We can keep this simple today — what's most alive for you right now?`,
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
    } satisfies Record<AgnesPersistentEngagementMode, string[]>;

    const initialMsg = isFirstSession
      ? firstTimeGreetings[preferredPersistentMode][Math.floor(Math.random() * firstTimeGreetings[preferredPersistentMode].length)]
      : returningGreetings[preferredPersistentMode][Math.floor(Math.random() * returningGreetings[preferredPersistentMode].length)];

    setMessages([{ role: 'assistant', content: initialMsg }]);
  }, [
    agentAlias,
    clearSession,
    preferredPersistentMode,
    prewarmMemory,
    profile,
    setMessages,
  ]);

  const hasActiveSession = !isGuest && messages.length > 0;

  const beliefInvitationSnapshot = useMemo(
    () => buildBeliefSessionInvitationSnapshot(beliefWorkflow?.invitation),
    [beliefWorkflow?.invitation],
  );

  const handleConfirmBeliefProposal = useCallback(
    async (proposalId: string, editedGraph: AgnesBeliefGraph) => {
      if (!user || isGuest || !encryptionKey) return;
      setBeliefWorkflowBusy(true);
      try {
        await confirmBeliefGraphProposal({
          proposalId,
          editedGraph,
          userId: user.uid,
          encryptionKey,
          emotionalState: globalSoul?.crossFunctionalState.emotional ?? null,
          isGuest,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    },
    [encryptionKey, globalSoul?.crossFunctionalState.emotional, isGuest, user],
  );

  const handleDismissBeliefProposal = useCallback(
    async (proposalId: string) => {
      if (!user || isGuest || !encryptionKey) return;
      setBeliefWorkflowBusy(true);
      try {
        await dismissBeliefGraphProposal({
          proposalId,
          userId: user.uid,
          encryptionKey,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    },
    [encryptionKey, isGuest, user],
  );

  const handleAcceptBeliefInvitation = useCallback(async () => {
    if (user && !isGuest && encryptionKey) {
      setBeliefWorkflowBusy(true);
      try {
        await updateBeliefSessionInvitationStatus({
          status: 'accepted',
          userId: user.uid,
          encryptionKey,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    }
    await startSession(hasActiveSession ? 'continue' : 'new');
  }, [encryptionKey, hasActiveSession, isGuest, startSession, user]);

  const handleDismissBeliefInvitation = useCallback(async () => {
    if (!user || isGuest || !encryptionKey) return;
    setBeliefWorkflowBusy(true);
    try {
      await updateBeliefSessionInvitationStatus({
        status: 'dismissed',
        userId: user.uid,
        encryptionKey,
      });
    } finally {
      setBeliefWorkflowBusy(false);
    }
  }, [encryptionKey, isGuest, user]);

  const endSession = async () => {
    setIsSummarizing(true);
    try {
      const summary = await summarizeSession();
      setSessionSummary(summary);
    } catch (e) {
      console.error("Summary failed:", e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const finalizeClose = async () => {
    if (isImpromptu) {
      // Ephemeral session: only wipe sessionStorage, never touch Firestore
      try { sessionStorage.removeItem('nexus_session_agnes_impromptu'); } catch { /* ignore */ }
      setMessages([]);
    } else {
      await clearSession();
    }
    setCurrentState('selecting');
    setSessionType(null);
    setEngagementMode(preferredPersistentMode);
    setModeContinuity(undefined);
    setSessionSummary(null);
  };

  const handleMergeAndClose = async () => {
    setIsClosingSession(true);
    try {
      if (user && !isGuest && messages.length > 0) {
        const snapshot = JSON.stringify({
          moduleId: 'agnes',
          endedAt: new Date().toISOString(),
          history: messages
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
              tokenUsage: 0
            },
            snapshot,
            { encryptionKey }
          );
        }

        // Always increment sessionCount regardless of memory service state
        if (profile) {
          const updatedCount = (profile.baseContext?.sessionCount ?? 0) + 1;
          await saveAgnesProfile(
            {
              ...profile,
              baseContext: { ...profile.baseContext, sessionCount: updatedCount },
              updatedAt: new Date().toISOString(),
            },
            { userId: user.uid, encryptionKey }
          );
        }
      }

      await finalizeClose();
    } catch (e) {
      console.error('Failed to merge agnes session:', e);
    } finally {
      setIsClosingSession(false);
    }
  };

  const handleDiscardAndClose = async () => {
    setIsClosingSession(true);
    try {
      await finalizeClose();
    } finally {
      setIsClosingSession(false);
    }
  };

  // ── Somatic session handlers ──────────────────────────────────────────────

  const handleOpenSomatic = useCallback(() => {
    somaticStartedAt.current = Date.now();
    setSelectedSomaticExercise(null);
    setCurrentState('somatic');
  }, []);

  const handleSomaticSelect = useCallback((exercise: SomaticExerciseType) => {
    somaticStartedAt.current = Date.now();
    setSelectedSomaticExercise(exercise);
  }, []);

  const handleSomaticComplete = useCallback(async () => {
    const durationSeconds = Math.round((Date.now() - somaticStartedAt.current) / 1000);
    const exerciseType = selectedSomaticExercise ?? 'breathwork';

    // Update NSV: reduce stress load, increase resilience
    const emotional = globalSoul?.crossFunctionalState?.emotional;
    await updateCrossFunctionalState({
      emotional: {
        stressLoad: Math.max(0, (emotional?.stressLoad ?? 5) - 1.5),
        emotionalResilience: Math.min(10, (emotional?.emotionalResilience ?? 5) + 0.5),
      },
    });

    // Emit Spine event
    Spine.publish({
      type: 'SOMATIC_SESSION_COMPLETE',
      source: 'agnes',
      domain: 'E',
      priority: 'info',
      data: { exerciseType, durationSeconds, completedFully: true },
    });

    setCurrentState('selecting');
    setSelectedSomaticExercise(null);
  }, [selectedSomaticExercise, globalSoul, updateCrossFunctionalState]);

  const handleSomaticExit = useCallback(() => {
    setCurrentState('selecting');
    setSelectedSomaticExercise(null);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full relative">
      <SanctuaryBackground />
      
      <div className="absolute inset-0 pointer-events-none">
        <Agnes3DEnvironment activeSession={currentState === 'session'} isProcessing={isProcessing} />
      </div>

      <div className={cn(
        "flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)] w-full min-w-0"
      )}>
        <AnimatePresence mode="wait">
          {currentState === 'selecting' ? (
            <motion.div 
              key="selecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0 h-full"
            >
              {isHydrating ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/60">Restoring Session</span>
                </div>
              ) : (
                <AgnesSanctuaryContent
                  onStartSession={startSession}
                  onConfirmBeliefProposal={handleConfirmBeliefProposal}
                  onDismissBeliefProposal={handleDismissBeliefProposal}
                  onAcceptInvitation={handleAcceptBeliefInvitation}
                  onDismissInvitation={handleDismissBeliefInvitation}
                  selectedPersistentMode={preferredPersistentMode}
                  onPersistentModeChange={handlePreferredPersistentModeChange}
                  agentAlias={agentAlias}
                  userName={(typeof profile?.baseContext?.identity === 'object' 
                    ? profile?.baseContext?.identity?.name 
                    : profile?.baseContext?.identity) || (user as unknown as { displayName?: string })?.displayName || 'User'}
                  somaticEnabled={somaticEnabled}
                  isAccessible={isAccessible}
                  hasActiveSession={hasActiveSession}
                  beliefGraph={beliefGraph}
                  beliefWorkflow={beliefWorkflow}
                  beliefInvitationSnapshot={beliefInvitationSnapshot}
                  beliefWorkflowBusy={beliefWorkflowBusy}
                />
              )}
            </motion.div>
          ) : currentState === 'somatic' ? (
            <motion.div
              key="somatic"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)] overflow-hidden"
            >
              <div className="flex-1 flex flex-col min-h-0 h-full items-center justify-center p-4">
                {selectedSomaticExercise === 'breathwork' ? (
                  <BreathworkExercise 
                    onComplete={handleSomaticComplete}
                    onExit={handleSomaticExit}
                  />
                ) : selectedSomaticExercise === 'grounding' ? (
                  <GroundingExercise 
                    onComplete={handleSomaticComplete}
                    onExit={handleSomaticExit}
                  />
                ) : (
                  <SomaticSessionPicker 
                    onSelect={handleSomaticSelect}
                    onExit={handleSomaticExit}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="session"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)]"
            >
              <div className="flex-1 flex flex-col min-h-0 h-full relative">
                <AnimatePresence mode="wait">
                  {isHydrating ? (
                    <motion.div
                      key="hydrating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/60">
                        Synchronizing Neural Link
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="chat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col min-h-0 h-full"
                    >
                      {/* Session Telemetry & Control Bar - Persistent above chat to prevent clipping */}
                      <div className="shrink-0 flex flex-col gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 bg-black/40 backdrop-blur-2xl z-[var(--z-content)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <AgnesTelemetryHeader />
                          </div>
                          <div className="shrink-0 ml-2 sm:ml-4 flex items-center gap-1.5 sm:gap-2">
                            <ModuleReminderEntry
                              title="Agnes"
                              themeColor="indigo"
                              panel={<AgnesNotificationSettingsPanel />}
                              compact
                            />
                            <NeuralButton 
                              size="sm" 
                              variant="ghost" 
                              onClick={endSession} 
                              loading={isSummarizing} 
                              className="flex items-center gap-2 px-4 rounded-full border-white/5 hover:border-rose-500/20 hover:text-rose-400"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline font-bold uppercase tracking-widest text-[10px] ml-2">End</span>
                            </NeuralButton>
                          </div>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
                            <span className="px-3 py-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-100/70">
                              {activeModeDefinition.label}
                            </span>
                            <span className="px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-white/40">
                              {isImpromptu ? 'Off the Record' : 'Vault Continuity'}
                            </span>
                            {engagementMode === 'somatic' && (
                              <span className="px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-white/40">
                                Somatic Inquiry {somaticEnabled ? 'Enabled' : 'Adapted'}
                              </span>
                            )}
                          </div>
                          <AgnesEngagementModeControl
                            compact
                            value={engagementMode}
                            onChange={(mode) => { void handleEngagementModeChange(mode); }}
                            modes={sessionModeOptions}
                            label="Switch Agnes engagement mode"
                            className="lg:justify-end"
                          />
                        </div>
                      </div>

                      <NexusChat
                        ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                        agentName={agentAlias}
                        themeColor="indigo"
                        placeholder="Communicate..."
                        authMode="agnes"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <RoutingSuggestion
                  target={routingSuggestion?.target || 'titan'}
                  reason={routingSuggestion?.reason}
                  onConfirm={handleRouteConfirm}
                  onDismiss={handleRouteDismiss}
                  visible={routingSuggestion !== null}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isSummarizing && (
          <motion.div
            key="summary-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center bg-[#05050a]/90 backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Synthesizing</h3>
                <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Neural link distillation in progress</p>
              </div>
            </div>
          </motion.div>
        )}

        <NeuralModal 
          key="session-summary-modal" 
          isOpen={!!sessionSummary} 
          onClose={() => setSessionSummary(null)} 
          title="Session Complete" 
          subtitle="Neural synthesis finalized" 
          icon={Brain} 
          maxWidth="lg"
        >
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="p-4 rounded-2xl sm:rounded-[2rem] bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">Exchanges</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {messages.filter(m => m.role === 'user').length}
                </span>
              </div>
              <div className="p-4 rounded-2xl sm:rounded-[2rem] bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">Duration</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {(() => {
                    const mins = Math.round((Date.now() - sessionStartedAt) / 60000);
                    return mins < 1 ? '<1m' : `${mins}m`;
                  })()}
                </span>
              </div>
            </div>

            <div className="relative p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-indigo-500/[0.04] border border-indigo-500/10">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60">Reflection</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed font-medium italic">"{sessionSummary}"</p>
            </div>

            <div className="space-y-3">
              {sessionType !== 'impromptu' && (
                <NeuralButton size="xl" className="w-full rounded-full" loading={isClosingSession} onClick={handleMergeAndClose}>
                  <CheckSquare className="w-4 h-4 mr-2" /> End Session
                </NeuralButton>
              )}
              <NeuralButton
                variant="ghost"
                onClick={handleDiscardAndClose}
                disabled={isClosingSession}
                className={cn(
                  "w-full h-auto text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white/40 hover:bg-transparent border-none transition-colors disabled:opacity-30",
                  sessionType === 'impromptu' ? "py-2" : "py-3"
                )}
              >
                {sessionType === 'impromptu' ? 'End to End' : 'Discard Session'}
              </NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <NeuralModal
          key="agnes-settings-modal"
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="Agnes Settings"
          subtitle="Neural calibration and reminders"
          icon={Settings}
          maxWidth="lg"
        >
          <AgnesSettingsPanel
            profile={profile}
            onSave={async (updated) => {
              await saveAgnesProfile(updated, { userId: user?.uid, encryptionKey });
            }}
          />
        </NeuralModal>
      </AnimatePresence>
    </div>
  );
}

function AgnesOnboardingWrapper({ profile, onComplete }: { profile: TherapyIntakeProfile | null; onComplete: (profile: TherapyIntakeProfile) => void }) {
  const { profile: coreProfile } = useAuth();
  return (
    <AgnesOnboarding
      initialBaseContext={IntakeBaseContextService.buildForAgnes({ coreProfile, agnesContext: profile?.baseContext })}
      onComplete={(ctx) => {
        const now = new Date().toISOString();
        const completedProfile: TherapyIntakeProfile = {
          ...(profile ?? createEmptyAgnesProfile()),
          onboardingComplete: true,
          baseContext: ctx,
          updatedAt: now
        };
        onComplete(completedProfile);
      }}
    />
  );
}

export default function AgnesPage() {
  const { globalSoul } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.agnes || 'Agnes';

  return (
    <UnifiedModulePage<TherapyIntakeProfile>
      moduleId="agnes"
      workspaceType="focus"
      requireVault={false}
      noContainer={true}
      profileOptions={{
        loadProfile: loadAgnesProfile,
        saveProfile: saveAgnesProfile,
        subscribeProfile: subscribeAgnesProfile,
        refreshProfile: loadAgnesProfile
      }}
      renderOnboarding={AgnesOnboardingWrapper}
      renderContent={AgnesContent}
      renderLeftRail={({ profile, persistProfile }) => (
        <AgnesSidebar profile={profile} agentAlias={agentAlias} onSave={persistProfile} />
      )}
      renderDashboard={({ profile, encryptionKey }) => (
        <AgnesDashboard profile={profile} encryptionKey={encryptionKey} />
      )}
      renderMobileFooter={({ sessionActive }) => {
        // Hide settings button on mobile during active session
        if (sessionActive) return null;
        return (
          <div className="flex items-center justify-center p-3">
            <NeuralButton
              variant="ghost"
              themeColor="indigo"
              onClick={() => window.dispatchEvent(new Event('agnes:open-settings'))}
              className="w-full flex items-center justify-center gap-3 h-auto px-6 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black uppercase tracking-widest text-[10px] hover:bg-indigo-500/20 hover:border-indigo-500/30 active:scale-95 transition-all"
            >
              <Settings size={14} />
              Agnes Settings
            </NeuralButton>
          </div>
        );
      }}
    />
  );
}
