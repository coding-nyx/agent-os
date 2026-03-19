import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { AgnesOnboarding } from './onboarding/AgnesOnboarding';
import { AGNES_PERSONA } from './personas';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { Sparkles, ShieldAlert, CheckSquare, LogOut, Brain, Clock, MessageSquare, Shield, ArrowRight, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { SomaticSessionPicker, type SomaticExerciseType } from './components/somatic/SomaticSessionPicker';
import { BreathworkExercise } from './components/somatic/BreathworkExercise';
import { GroundingExercise } from './components/somatic/GroundingExercise';
import { Spine } from '@/lib/spine/spine-event-bus';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { AnimatePresence, motion } from 'framer-motion';
import { NexusChat } from '@/core/components/NexusChat';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { buildAgnesSessionPrompt } from './prompts/agnes-session-prompt';
import { Agnes3DEnvironment } from './components/Agnes3DEnvironment';
import { AgnesTelemetryHeader } from './components/AgnesTelemetryHeader';
import { AgnesPersonalitySidebar } from './components/AgnesPersonalitySidebar';
import { AgnesTherapistCard } from './components/AgnesTherapistCard';
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
    <div className={cn(
      "h-full flex flex-col transition-[width] duration-300 overflow-hidden",
      collapsed ? "w-10" : "w-72"
    )}>
      {/* Collapse toggle */}
      <div className={cn("flex shrink-0 pt-4 px-3", collapsed ? "justify-center" : "justify-end")}>
        <button
          onClick={toggleCollapsed}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 overflow-y-auto no-scrollbar mx-3 my-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-6"
        >
          <AgnesPersonalitySidebar
            baseContext={profile?.baseContext}
            naked
          />
          <div className="h-px w-full bg-white/[0.06]" />
          <AgnesTherapistCard
            baseContext={profile?.baseContext}
            agentAlias={agentAlias}
            naked
          />

        </motion.div>
      )}
    </div>
  );
});

interface AgnesContentProps extends ContentRenderProps<TherapyIntakeProfile> {}

function AgnesContent({
  profile,
  encryptionKey,
  setSessionActive
}: AgnesContentProps) {
  const { globalSoul, updateCrossFunctionalState } = useGlobalSoul();

  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const navigate = useNavigate();
  const isAccessible = isModuleAccessible('agnes');
  const [currentState, setCurrentState] = useState<AgnesState>('selecting');

  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());
  const [pendingImpromptuWelcome, setPendingImpromptuWelcome] = useState<string | null>(null);
  const prevUserRef = useRef(user);

  // Somatic session state
  const [selectedSomaticExercise, setSelectedSomaticExercise] = useState<SomaticExerciseType | null>(null);
  const somaticStartedAt = useRef<number>(0);

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
    if (!profile || !user) return;
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
        { userId: user.uid, encryptionKey: null }
      );
    } finally {
      setTimeout(() => { pendingSomaticSave.current = false; }, 500);
    }
  }, [profile, user, somaticEnabled]);

  const agentAlias = globalSoul?.displayNames?.agnes || 'Agnes';

  const isImpromptu = sessionType === 'impromptu';

  const regularSystemPrompt = useMemo(
    () => buildAgnesSessionPrompt(AGNES_PERSONA, profile?.baseContext),
    [profile?.baseContext]
  );

  // Impromptu uses bare persona — no profile context injected
  const systemPrompt = isImpromptu ? AGNES_PERSONA : regularSystemPrompt;

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

  const startSession = async (type: 'impromptu' | 'new' | 'continue') => {
    if (type === 'continue') {
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
        "You reached out, and that matters. This space is private — nothing here is saved or tracked. Take a breath, and whenever you're ready, tell me what's on your mind.",
        "This is a quiet, off-the-record space — just between us, nothing stored. There's no agenda here. What's coming up for you right now?",
        "Whatever brought you here, you don't have to hold it alone right now. This session leaves no trace. I'm listening — take your time."
      ];
      const greeting = quickSupportGreetings[Math.floor(Math.random() * quickSupportGreetings.length)];
      // Store greeting to inject AFTER the hook's reset+hydration effects settle
      setPendingImpromptuWelcome(greeting);
      setSessionType('impromptu');
      setSessionStartedAt(Date.now());
      setCurrentState('session');
      return;
    }

    // Starting a new regular session — clear the previous one first
    await clearSession();
    setSessionType('new');
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

    const firstTimeGreetings = [
      `Hi, I'm ${agentAlias}. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin?`,
      `Hello, I'm ${agentAlias}. It's a privilege to establish this link with you. How are you feeling today?`,
      `Hi there, I'm ${agentAlias}. Think of me as a mirror for your inner world. What's on your mind?`
    ];
    const returningGreetings = [
      `Hi ${userName}, it's good to see you again. Shall we pick up where we left off?`,
      `Hello ${userName}, welcome back. How has your journey been since we last spoke?`,
      `Hi ${userName}, I'm glad you're back. How are you holding up today?`,
      `Good to see you, ${userName}. What's been surfacing for you lately?`
    ];

    const initialMsg = isFirstSession
      ? firstTimeGreetings[Math.floor(Math.random() * firstTimeGreetings.length)]
      : returningGreetings[Math.floor(Math.random() * returningGreetings.length)];

    setMessages([{ role: 'assistant', content: initialMsg }]);
  };

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

  const hasActiveSession = !isGuest && messages.length > 0;

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
    <div className="flex-1 flex min-h-0 relative p-0 min-[620px]:p-4 lg:p-6">
      <div className="absolute inset-0">
        <Agnes3DEnvironment activeSession={currentState === 'session'} isProcessing={isProcessing} />
      </div>

      <div className={cn(
        "flex-1 flex flex-col min-h-0 relative z-10 !backdrop-blur-[1px] min-[620px]:rounded-panel w-full min-w-0"
      )}>
        <AnimatePresence mode="wait">
          {currentState === 'selecting' ? (
            <motion.div 
              key="selecting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="min-h-full overflow-y-auto no-scrollbar flex flex-col items-center justify-start p-4 min-[620px]:p-12 min-[620px]:justify-center max-w-5xl mx-auto w-full space-y-12 pb-20"
            >
              {/* s18-002: show spinner while hydrating to prevent accidental clearSession click */}
              {isHydrating ? (
                <div className="flex flex-col items-center gap-4 text-white/30">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/60">Restoring Session</span>
                </div>
              ) : (
              <motion.div 
                className="w-full bg-black/20 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-8 min-[620px]:p-16 shadow-2xl space-y-12"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-center space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-4"
                  >
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/80 italic">Secure Neural Environment</span>
                  </motion.div>
                  <h2 className="text-4xl min-[620px]:text-7xl font-black italic tracking-tighter text-white uppercase leading-none">
                    Neural <span className="text-indigo-400">Sync</span>
                  </h2>
                  <p className="text-white/40 text-xs min-[620px]:text-sm font-medium tracking-wide">Establish a high-fidelity link with your emotional telemetry.</p>
                </div>

                {/* Session Cards - Primary on Mobile */}
                <div className="grid grid-cols-1 min-[620px]:grid-cols-2 gap-4 min-[620px]:gap-8 w-full">
                  <motion.button 
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => startSession('impromptu')} 
                    className="p-8 min-[620px]:p-10 rounded-[2rem] min-[620px]:rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left group relative overflow-hidden backdrop-blur-md"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <ShieldAlert className="w-20 h-24 text-orange-400" />
                    </div>
                    <div className="relative z-10">
                        <ShieldAlert className="w-10 h-10 text-orange-400 mb-6" />
                        <h3 className="text-xl min-[620px]:text-2xl font-black tracking-tighter uppercase mb-3 italic text-white">Quick Support</h3>
                        <p className="text-xs text-white/40 leading-relaxed font-medium max-w-[200px]">Private, off-the-record support. Nothing is saved — no context, no trace.</p>
                        <div className="mt-6 flex items-center gap-2 text-orange-400 opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0">
                            <span className="text-[10px] font-black uppercase tracking-widest">Initialize</span>
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>
                  </motion.button>

                  {(!isGuest) && (
                    hasActiveSession ? (
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => startSession('continue')} 
                        className="p-8 min-[620px]:p-10 rounded-[2rem] min-[620px]:rounded-[2.5rem] bg-indigo-500/10 border-2 border-indigo-500/40 hover:bg-indigo-500/20 transition-all text-left group relative overflow-hidden backdrop-blur-md shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]"
                      >
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
                            <Sparkles className="w-20 h-24 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-400/20 border border-indigo-400/30 mb-6">
                              <Shield className="w-3 h-3 text-indigo-400" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-indigo-300">Active Handshake</span>
                            </div>
                            <h3 className="text-xl min-[620px]:text-3xl font-black tracking-tighter uppercase mb-3 italic text-white">Reconnect Link</h3>
                            <p className="text-xs text-indigo-200/60 leading-relaxed font-medium max-w-[240px]">Neural link interrupted. Re-establish secure tunnel to continue your session.</p>
                            <div className="mt-8 flex items-center gap-3 text-indigo-400">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Resume Session</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                            </div>
                        </div>
                      </motion.button>
                    ) : isAccessible ? (
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => startSession('new')} 
                        className="p-8 min-[620px]:p-10 rounded-[2rem] min-[620px]:rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/20 hover:bg-indigo-500/10 transition-all text-left group relative overflow-hidden backdrop-blur-md"
                      >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Sparkles className="w-20 h-24 text-indigo-400" />
                        </div>
                        <div className="relative z-10">
                            <Sparkles className="w-10 h-10 text-indigo-400 mb-6" />
                            <h3 className="text-xl min-[620px]:text-2xl font-black tracking-tighter uppercase mb-3 italic text-white">New Session</h3>
                            <p className="text-xs text-indigo-200/40 leading-relaxed font-medium max-w-[200px]">Initialize a deep baseline synchronization.</p>
                            <div className="mt-6 flex items-center gap-2 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0">
                                <span className="text-[10px] font-black uppercase tracking-widest">Initialize</span>
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>
                      </motion.button>
                    ) : (
                      <div className="p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] bg-white/[0.01] border border-white/5 opacity-40 cursor-not-allowed text-left backdrop-blur-sm">
                        <ShieldAlert className="w-10 h-10 text-white/20 mb-6" />
                        <h3 className="text-xl md:text-2xl font-black tracking-tighter uppercase mb-3 italic text-white/20">Locked</h3>
                        <p className="text-xs text-white/10 leading-relaxed font-medium max-w-[200px]">Unlock vault to access encrypted neural sessions.</p>
                      </div>
                    )
                  )}
                </div>

                {/* Session preferences card — somatic toggle + somatic practice entry */}
                {isAccessible && !isGuest && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="w-full rounded-[2rem] bg-white/[0.03] border border-white/[0.06] overflow-hidden"
                  >
                    {/* Somatic Awareness toggle */}
                    <div className="flex items-start justify-between gap-3 p-6">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Activity className="w-4 h-4 text-indigo-400/60 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/80 leading-none mb-1">Somatic Awareness</p>
                          <p className="text-[11px] text-white/35 leading-relaxed">
                            Agnes asks about physical sensations and body-based feelings during sessions.
                          </p>
                        </div>
                      </div>
                      <NeuralToggle
                        checked={somaticEnabled}
                        onChange={handleSomaticToggle}
                        color="indigo"
                        label="Somatic Awareness"
                      />
                    </div>


                  </motion.div>
                )}
              </motion.div>
              )} {/* end isHydrating gate */}
            </motion.div>
          ) : (
            <motion.div 
              key="session"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col min-h-0 relative z-10"
            >
              <div className="flex-1 flex flex-col min-h-0 relative">
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
                      className="flex-1 flex flex-col min-h-0"
                    >
                      {/* Session Telemetry & Control Bar - Persistent above chat to prevent clipping */}
                      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/40 backdrop-blur-2xl z-20">
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <AgnesTelemetryHeader />
                        </div>
                        <div className="shrink-0 ml-4">
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

                      <NexusChat
                        ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                        agentName={sessionType === 'impromptu' ? 'Emergency Agent' : agentAlias}
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
        <NeuralModal isOpen={!!sessionSummary} onClose={() => setSessionSummary(null)} title="Session Complete" subtitle="Neural synthesis finalized" icon={Brain} maxWidth="lg">
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex-1 p-4 rounded-[2rem] bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">Exchanges</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {messages.filter(m => m.role === 'user').length}
                </span>
              </div>
              <div className="flex-1 p-4 rounded-[2rem] bg-white/[0.03] border border-white/5">
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

            <div className="relative p-6 rounded-[2rem] bg-indigo-500/[0.04] border border-indigo-500/10">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60">Reflection</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed font-medium italic">"{sessionSummary}"</p>
            </div>

            <div className="space-y-3">
              {sessionType !== 'impromptu' && (
                <NeuralButton size="xl" className="w-full rounded-full" loading={isClosingSession} onClick={handleMergeAndClose}>
                  <CheckSquare className="w-4 h-4 mr-2" /> Sync to Vault
                </NeuralButton>
              )}
              <button
                onClick={handleDiscardAndClose}
                disabled={isClosingSession}
                className="w-full py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white/40 transition-colors disabled:opacity-30"
              >
                {sessionType === 'impromptu' ? 'Finalize Session' : 'Discard Session Data'}
              </button>
            </div>
          </div>
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
    />
  );
}
