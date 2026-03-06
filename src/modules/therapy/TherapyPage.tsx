import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { TherapyOnboarding } from './onboarding/TherapyOnboarding';
import { AGNES_PERSONA } from './personas';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { Sparkles, ShieldAlert, CheckSquare, LogOut, Brain, Clock, MessageSquare, Shield } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { motion, AnimatePresence } from 'framer-motion';
import { NexusChat } from '@/core/components/NexusChat';
import { BaseContext } from './types';
import { buildTherapySessionPrompt } from './prompts/therapy-session-prompt';
import { TherapyDashboard } from './components/TherapyDashboard';
import {
  createEmptyTherapyProfile,
  loadTherapyProfile,
  saveTherapyProfile,
  subscribeTherapyProfile,
  TherapyIntakeProfile
} from './services/therapy-profile-service';
import { BeliefGraph, subscribeBeliefGraph } from './services/belief-graph-service';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerTherapyActions } from './services/actions';
import type { AuthUser } from '@/lib/services/auth-service';
import type { CoreUserProfile, GlobalSoul } from '@/lib/types';

type TherapyState = 'selecting' | 'session';

registerTherapyActions();

interface TherapyContentProps {
  profile: TherapyIntakeProfile | null;
  encryptionKey: CryptoKey | null;
  globalSoul: GlobalSoul | null;
  updateTherapeuticBaseline: (baseline: GlobalSoul['therapeuticBaseline']) => Promise<void>;
  refreshGlobalSoul: () => Promise<void>;
  user: AuthUser | null;
  isGuest: boolean;
  coreProfile: CoreUserProfile | null;
  refreshProfile: () => Promise<void>;
  isAccessible: boolean;
  setBeliefGraph: React.Dispatch<React.SetStateAction<BeliefGraph | null>>;
  onSessionActiveChange: (active: boolean) => void;
}

function TherapyContent({
  profile,
  encryptionKey,
  globalSoul,
  updateTherapeuticBaseline,
  refreshGlobalSoul,
  user,
  isGuest,
  coreProfile,
  refreshProfile,
  isAccessible,
  setBeliefGraph,
  onSessionActiveChange
}: TherapyContentProps) {
  const [currentState, setCurrentState] = useState<TherapyState>('selecting');
  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());

  // Notify parent of session state changes for layout adjustments
  useEffect(() => {
    onSessionActiveChange(currentState === 'session');
  }, [currentState, onSessionActiveChange]);

  const agentAlias = globalSoul?.displayNames?.therapy || 'Agnes';
  const isDeepIntakeDone = Boolean(globalSoul?.therapeuticBaseline?.isInitialized || profile?.onboardingComplete);

  const systemPrompt = useMemo(
    () => buildTherapySessionPrompt(AGNES_PERSONA, profile?.baseContext),
    [profile?.baseContext]
  );

  const {
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession,
    summarizeSession
  } = useModuleAI({
    moduleId: 'therapy',
    systemPrompt,
    encryptionKey
  });

  // Effect for subscribing to belief graph
  useEffect(() => {
    if (!user || isGuest || !encryptionKey) {
      setBeliefGraph(null);
      return;
    }
    return subscribeBeliefGraph({ userId: user.uid, encryptionKey }, (graph) => {
      setBeliefGraph(graph);
    });
  }, [user?.uid, isGuest, encryptionKey, setBeliefGraph]);

  // Intercept profile changes that happen post-onboarding (if needed)
  // For therapy, intake completion means we save it here
  const handleIntakeCompleteWrapper = async (completedProfile: TherapyIntakeProfile) => {
    if (user && !isGuest && encryptionKey) {
      await saveTherapyProfile(completedProfile, { userId: user.uid, encryptionKey });
    } else if (isGuest) {
      await saveTherapyProfile(completedProfile, {});
    }

    if (user && !isGuest) {
      const onboardingBaseContext = IntakeBaseContextService.buildForTherapy({ coreProfile, therapyContext: profile?.baseContext });
      const globalPatch = IntakeBaseContextService.toCoreProfilePatch({
        ...onboardingBaseContext,
        ...completedProfile.baseContext
      });
      if (Object.keys(globalPatch).length > 0) {
        await CoreProfileService.updateProfile(user.uid, globalPatch);
      }
    }
    await updateTherapeuticBaseline({ isInitialized: true, initializedAt: new Date().toISOString() });
    setCurrentState('session');
    setSessionType('new');
    setMessages([{ role: 'assistant', content: "Breakthrough achieved. Your neural baseline is now synchronized. How should we begin our first deep session?" }]);
    await refreshProfile();
    await refreshGlobalSoul();
  };

  // For this page, if we need to force onboarding, we can hook it into the startSession flow
  const startSession = async (type: 'impromptu' | 'new' | 'continue') => {
    setSessionStartedAt(Date.now());
    if (type === 'continue') {
      const inferred = messages.some((msg) => msg.role === 'assistant' && msg.content.includes('Emergency protocol engaged'))
        ? 'impromptu'
        : 'new';
      setSessionType(inferred);
      setCurrentState('session');
      return;
    }

    setSessionType(type);
    setCurrentState('session');

    let initialMsg = `Neural link established. I'm ${agentAlias}. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin?`;

    if (type === 'impromptu') {
      initialMsg = "Emergency protocol engaged. I am a supportive, in-house neural agent. This session is detached from your primary encrypted context. How can I support you right now?";
    }

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
    await clearSession();
    setCurrentState('selecting');
    setSessionType(null);
    setSessionSummary(null);
  };

  const handleMergeAndClose = async () => {
    setIsClosingSession(true);
    try {
      if (user && !isGuest && messages.length > 0) {
        const snapshot = JSON.stringify({
          moduleId: 'therapy',
          endedAt: new Date().toISOString(),
          history: messages
        });

        const existing = await ModuleMemoryService.getEnvelope(user.uid, 'therapy');
        if (!existing) {
          await ModuleMemoryService.initializeEnvelope(user.uid, 'therapy');
        }

        await ModuleMemoryService.commitSession(
          user.uid,
          'therapy',
          {
            id: `therapy_${Date.now()}`,
            timestamp: new Date().toISOString(),
            summary: sessionSummary || 'Therapy session completed.',
            keyInsights: [],
            sentiment: 0,
            tokenUsage: 0
          },
          snapshot
        );
      }

      await finalizeClose();
    } catch (e) {
      console.error('Failed to merge therapy session:', e);
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

  if (currentState === 'selecting') {
    if (!isGuest && isHydrating) {
      return (
        <div className="h-full flex items-center justify-center text-white/40 text-sm">
          Initializing therapy session...
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 max-w-3xl mx-auto">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-4xl font-black italic tracking-widest text-indigo-400 uppercase">Initialize Connection</h2>
            <p className="text-white/60 text-sm leading-relaxed">Choose your neural synchronization mode.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <button onClick={() => startSession('impromptu')} className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
              <ShieldAlert className="w-10 h-10 text-orange-400 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-black tracking-wider uppercase mb-3">Impromptu</h3>
              <p className="text-sm text-white/50 leading-relaxed font-medium">A detached session with an attuned agent. Perfect for trials.</p>
            </button>

            {(!isGuest) && (
              hasActiveSession ? (
                <button onClick={() => startSession('continue')} className="p-8 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-left group">
                  <Sparkles className="w-10 h-10 text-emerald-400 mb-6 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">Continue Session</h3>
                  <p className="text-sm text-emerald-200/60 leading-relaxed font-medium">
                    Resume your active encrypted therapy session.
                  </p>
                </button>
              ) : isAccessible ? (
                <button onClick={() => {
                  if (!isDeepIntakeDone) {
                    // Trigger onboarding manually here if we want to force it
                    // In this specific flow, since renderOnboarding handles it via state,
                    // we can just pretend it's complete if it skips, or ideally we just render Onboarding inline.
                    // For now, if the profile isn't onboarded, the UnifiedModulePage would have caught it
                    // EXCEPT we didn't force it to display. Let's just start the session.
                    startSession('new');
                  } else {
                    startSession('new');
                  }
                }} className="p-8 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-left group">
                  <Sparkles className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">New Session</h3>
                  <p className="text-sm text-indigo-200/60 leading-relaxed font-medium">
                    Initialize your deep therapeutic baseline.
                  </p>
                </button>
              ) : (
                <div className="p-8 rounded-3xl bg-amber-500/5 border border-amber-500/10 opacity-50 cursor-not-allowed text-left">
                  <ShieldAlert className="w-10 h-10 text-amber-500 mb-6" />
                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">Vault Locked</h3>
                  <p className="text-sm text-amber-200/40 leading-relaxed font-medium">Unlock vault to start encrypted sessions.</p>
                </div>
              )
            )}
          </div>
        </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <NexusChat
        ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
        agentName={sessionType === 'impromptu' ? 'Emergency Agent' : agentAlias}
        themeColor="indigo"
        placeholder="Share your thoughts..."
        authMode="therapy"
        headerActions={messages.length > 2 && (
          <NeuralButton size="sm" variant="secondary" onClick={endSession} loading={isSummarizing} className="flex items-center gap-2">
            <LogOut className="w-3 h-3" /> End Session
          </NeuralButton>
        )}
      />

      <AnimatePresence>
        <NeuralModal isOpen={!!sessionSummary} onClose={() => setSessionSummary(null)} title="Session Complete" subtitle="Neural synthesis finalized" icon={Brain} maxWidth="lg">
          <div className="space-y-8">
            {/* Session stats */}
            <div className="flex gap-4">
              <div className="flex-1 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">Exchanges</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {messages.filter(m => m.role === 'user').length}
                </span>
              </div>
              <div className="flex-1 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
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
              <div className="flex-1 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">Encryption</span>
                </div>
                <span className="text-sm font-black text-emerald-400 uppercase tracking-wider">E2EE</span>
              </div>
            </div>

            {/* Summary reflection */}
            <div className="relative p-6 rounded-2xl bg-indigo-500/[0.04] border border-indigo-500/10">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60">Session Reflection</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed font-medium">{sessionSummary}</p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <NeuralButton size="xl" className="w-full" loading={isClosingSession} onClick={handleMergeAndClose}>
                <CheckSquare className="w-4 h-4 mr-2" /> Save & Close Session
              </NeuralButton>
              <button
                onClick={handleDiscardAndClose}
                disabled={isClosingSession}
                className="w-full py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/40 hover:text-white/50 transition-colors disabled:opacity-30"
              >
                Discard Session Data
              </button>
            </div>
          </div>
        </NeuralModal>
      </AnimatePresence>
    </div>
  );
}

export default function TherapyPage() {
  const { globalSoul, refreshGlobalSoul, updateTherapeuticBaseline } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isAccessible = isModuleAccessible('therapy');

  const [beliefGraph, setBeliefGraph] = useState<BeliefGraph | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  return (
    <UnifiedModulePage<TherapyIntakeProfile>
      moduleId="therapy"
      workspaceType="focus"
      sessionActive={sessionActive}
      // Therapy allows impromptu sessions even if the vault is locked
      requireVault={false}
      profileOptions={{
        loadProfile: loadTherapyProfile,
        saveProfile: saveTherapyProfile,
        subscribeProfile: subscribeTherapyProfile
      }}
      renderOnboarding={({ profile, onComplete }) => (
         <TherapyOnboarding 
            initialBaseContext={IntakeBaseContextService.buildForTherapy({ coreProfile, therapyContext: profile?.baseContext })} 
            onComplete={(ctx) => {
               // We merge context into a new profile and complete it
               const now = new Date().toISOString();
               const completedProfile: TherapyIntakeProfile = {
                 ...(profile ?? createEmptyTherapyProfile()),
                 onboardingComplete: true,
                 baseContext: ctx,
                 updatedAt: now
               };
               onComplete(completedProfile);
            }} 
         />
      )}
      renderDashboard={({ profile }) => (
        <TherapyDashboard soul={globalSoul} graph={beliefGraph} isLocked={!isAccessible} />
      )}
      renderContent={({ profile, encryptionKey }) => {
        return (
          <TherapyContent
            profile={profile}
            encryptionKey={encryptionKey}
            globalSoul={globalSoul}
            updateTherapeuticBaseline={updateTherapeuticBaseline}
            refreshGlobalSoul={refreshGlobalSoul}
            user={user}
            isGuest={isGuest}
            coreProfile={coreProfile}
            refreshProfile={refreshProfile}
            isAccessible={isAccessible}
            setBeliefGraph={setBeliefGraph}
            onSessionActiveChange={setSessionActive}
          />
        );
      }}
    />
  );
}
