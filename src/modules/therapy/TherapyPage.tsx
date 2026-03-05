import React, { useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { TherapyOnboarding } from './onboarding/TherapyOnboarding';
import { AGNES_PERSONA } from './personas';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { Sparkles, ShieldAlert, Lock, CheckSquare, LogOut } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { motion, AnimatePresence } from 'framer-motion';
import { NexusChat } from '@/core/components/NexusChat';
import { BaseContext } from './types';
import { buildTherapySessionPrompt } from './prompts/therapy-session-prompt';
import { createEmptyTherapyProfile, loadTherapyProfile, saveTherapyProfile, TherapyIntakeProfile } from './services/therapy-profile-service';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';

type TherapyState = 'selecting' | 'intake' | 'session';

export default function TherapyPage() {
  const { globalSoul, refreshGlobalSoul, updateTherapeuticBaseline } = useGlobalSoul();
  const { user, isGuest, profile, refreshProfile } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();
  const [currentState, setCurrentState] = useState<TherapyState>('selecting');
  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [therapyProfile, setTherapyProfile] = useState<TherapyIntakeProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

  const agentAlias = globalSoul?.displayNames?.therapy || 'Agnes';
  const onboardingBaseContext = useMemo(
    () =>
      IntakeBaseContextService.buildForTherapy({
        coreProfile: profile,
        therapyContext: therapyProfile?.baseContext
      }),
    [profile, therapyProfile?.baseContext]
  );

  const isDeepIntakeDone = Boolean(globalSoul?.therapeuticBaseline?.isInitialized || therapyProfile?.onboardingComplete);
  const systemPrompt = useMemo(
    () => buildTherapySessionPrompt(AGNES_PERSONA, therapyProfile?.baseContext),
    [therapyProfile?.baseContext]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user) {
        if (!mounted) return;
        setTherapyProfile(null);
        setEncryptionKey(null);
        setIsProfileLoading(false);
        return;
      }

      setIsProfileLoading(true);
      const key = isUnlocked ? await getModuleKey('therapy') : null;
      if (!mounted) return;
      setEncryptionKey(key);

      const loaded = await loadTherapyProfile({ userId: user.uid, encryptionKey: key });
      if (!mounted) return;

      setTherapyProfile(loaded);
      setIsProfileLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [user?.uid, isUnlocked, getModuleKey]);

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
    systemPrompt
  });

  const hasActiveSession = !isGuest && messages.length > 0;

  const handleIntakeComplete = async (context: Partial<BaseContext>) => {
      if (user && !isGuest && !encryptionKey) {
        setShowAuth(true);
        return;
      }

      const now = new Date().toISOString();
      const completedProfile: TherapyIntakeProfile = {
        ...(therapyProfile ?? createEmptyTherapyProfile()),
        onboardingComplete: true,
        baseContext: context,
        updatedAt: now
      };

      if (user && !isGuest && encryptionKey) {
        await saveTherapyProfile(completedProfile, { userId: user.uid, encryptionKey });
      } else if (isGuest) {
        await saveTherapyProfile(completedProfile, {});
      }

      setTherapyProfile(completedProfile);
      if (user && !isGuest) {
        const globalPatch = IntakeBaseContextService.toCoreProfilePatch({
          ...onboardingBaseContext,
          occupation: context.occupation ?? onboardingBaseContext.occupation,
          typicalSleepHours: context.typicalSleepHours ?? onboardingBaseContext.typicalSleepHours,
          name:
            (typeof context.identity === 'object' && context.identity?.name) ||
            (typeof context.identity === 'string' ? context.identity : undefined) ||
            onboardingBaseContext.name,
          pronouns:
            (typeof context.identity === 'object' && context.identity?.pronouns) ||
            onboardingBaseContext.pronouns
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

  const startSession = async (type: 'impromptu' | 'new' | 'continue') => {
      if (type === 'continue') {
          const inferred = messages.some((msg) => msg.role === 'assistant' && msg.content.includes('Emergency protocol engaged'))
            ? 'impromptu'
            : 'new';
          setSessionType(inferred);
          setCurrentState('session');
          return;
      }

      if (type === 'new' && !isDeepIntakeDone && !isGuest) {
          setCurrentState('intake');
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

  if (currentState === 'intake') {
      return (
          <ModuleLayout title="Therapy Intake" themeColor="indigo">
              <TherapyOnboarding initialBaseContext={onboardingBaseContext} onComplete={handleIntakeComplete} />
          </ModuleLayout>
      );
  }

  if (currentState === 'selecting') {
      if ((user && isUnlocked && isProfileLoading) || (!isGuest && isHydrating)) {
        return (
          <ModuleLayout title="Agnes" themeColor="indigo">
            <div className="h-full flex items-center justify-center text-white/40 text-sm">
              Initializing therapy session...
            </div>
          </ModuleLayout>
        );
      }

      return (
          <ModuleLayout title="Agnes" themeColor="indigo">
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
                          ) : isUnlocked ? (
                              <button onClick={() => startSession('new')} className="p-8 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-left group">
                                  <Sparkles className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">{isDeepIntakeDone ? 'New Session' : 'Begin Intake'}</h3>
                                  <p className="text-sm text-indigo-200/60 leading-relaxed font-medium">
                                      {isDeepIntakeDone ? 'Use your configured base context and preferred traits.' : 'Initialize your deep therapeutic baseline to unlock persistent memory.'}
                                  </p>
                              </button>
                          ) : (
                              <button onClick={() => setShowAuth(true)} className="p-8 rounded-3xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all text-left group">
                                  <Lock className="w-10 h-10 text-amber-500 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">Vault Locked</h3>
                                  <p className="text-sm text-amber-200/40 leading-relaxed font-medium">Unlock your master vault to synchronize.</p>
                              </button>
                          )
                      )}
                  </div>
                  <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="therapy" />
              </div>
          </ModuleLayout>
      );
  }

  return (
    <ModuleLayout title="Agnes" themeColor="indigo">
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
            <NeuralModal isOpen={!!sessionSummary} onClose={() => setSessionSummary(null)} title="Session Reflection" icon={CheckSquare}>
                <div className="space-y-6">
                    <p className="text-sm text-indigo-100 italic">"{sessionSummary}"</p>
                    <div className="flex gap-4">
                        <NeuralButton size="xl" variant="secondary" className="w-full" loading={isClosingSession} onClick={handleDiscardAndClose}>
                          Discard & Close
                        </NeuralButton>
                        <NeuralButton size="xl" className="w-full" loading={isClosingSession} onClick={handleMergeAndClose}>
                          Merge & Close
                        </NeuralButton>
                    </div>
                </div>
            </NeuralModal>
        </AnimatePresence>
    </ModuleLayout>
  );
}
