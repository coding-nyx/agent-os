import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { TitanDashboard } from './components/TitanDashboard';
import { TrainerRoutinePanel } from './components/TrainerRoutinePanel';
import { TrainerOnboarding } from './onboarding/TrainerOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { TrainerProfile } from '@/lib/types';
import { buildTrainerSessionPrompt } from './prompts/trainer-session-prompt';
import { mergeTrainerProfile, normalizeRoutines } from './utils';
import { loadTrainerProfile, saveTrainerProfile, syncGuestTrainerProfileToUser } from './services/trainer-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NexusChat } from '@/core/components/NexusChat';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { normalizeTrainerProfilePatch } from './onboarding/intake-accumulator';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

export default function TrainerPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  const trainerBaseContext = useMemo(
    () =>
      IntakeBaseContextService.buildForTrainer({
        coreProfile,
        trainerProfile: profile
      }),
    [coreProfile, profile]
  );

  const agentAlias = globalSoul?.displayNames?.trainer || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PROMPT;
    return buildTrainerSessionPrompt(profile);
  }, [profile]);

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage
  } = useModuleAI({
    moduleId: 'trainer',
    systemPrompt
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const key = user && isUnlocked ? await getModuleKey('trainer') : null;
      if (!mounted) return;
      setEncryptionKey(key);

      const loadedProfile = await loadTrainerProfile({ userId: user?.uid, encryptionKey: key });
      if (!mounted) return;
      setProfile(loadedProfile);
      setIsOnboarding(!loadedProfile || !loadedProfile.onboardingComplete);
      setIsProfileLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [user?.uid, isUnlocked, getModuleKey]);

  useEffect(() => {
    if (!user || !isUnlocked || hasSyncedGuest) return;
    (async () => {
      const key = await getModuleKey('trainer');
      if (!key) return;
      const synced = await syncGuestTrainerProfileToUser({ userId: user.uid, encryptionKey: key });
      if (synced) setHasSyncedGuest(true);
    })();
  }, [user, isUnlocked, hasSyncedGuest, getModuleKey]);

  const handleActionParsed = useCallback((type: string, payload: any) => {
    setProfile(prev => {
      if (!prev) return prev;
      let nextProfile = { ...prev };
      let hasChanges = false;

      if (type === 'update_trainer_profile') {
        const normalizedPatch = normalizeTrainerProfilePatch(payload as Partial<TrainerProfile>);
        nextProfile = mergeTrainerProfile(nextProfile, normalizedPatch);
        hasChanges = true;
      } else if (type === 'update_routine') {
        if (payload.routines) {
          nextProfile.routines = normalizeRoutines(payload.routines as any);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        nextProfile.updatedAt = new Date().toISOString();
        saveTrainerProfile(nextProfile, { userId: user?.uid, encryptionKey });
        return nextProfile;
      }
      return prev;
    });
  }, [user?.uid, encryptionKey]);

  useEffect(() => {
    // Initial greeting for returning users
    if (!isProfileLoading && !isOnboarding && profile?.onboardingComplete && messages.length === 0 && !isProcessing && !streamingText) {
        const hasRoutine = profile.routines && profile.routines.length > 0;
        setMessages([
          {
            role: 'assistant',
            content: hasRoutine
              ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
              : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?"
          }
        ]);
    }
  }, [isProfileLoading, isOnboarding, profile?.onboardingComplete, messages.length, isProcessing, streamingText, setMessages]);

  if (isProfileLoading) {
    return (
      <ModuleLayout title="Titan Performance" themeColor="orange">
        <div className="h-full flex items-center justify-center text-white/40 text-sm">
          Initializing trainer profile...
        </div>
      </ModuleLayout>
    );
  }

  if (isOnboarding) {
    if (user && !isGuest && !isUnlocked) {
      return (
        <ModuleLayout title="Titan Onboarding" themeColor="orange">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-xl w-full p-10 rounded-[36px] border border-amber-500/20 bg-amber-500/5 text-center space-y-6">
              <h3 className="text-2xl font-black italic uppercase tracking-tight text-amber-400">Vault Handshake Required</h3>
              <p className="text-sm text-amber-100/60 leading-relaxed">
                Trainer intake writes encrypted profile data. Unlock the vault to continue guided onboarding.
              </p>
              <NeuralButton size="xl" className="w-full" onClick={() => setShowAuth(true)}>
                Unlock Trainer Vault
              </NeuralButton>
            </div>
          </div>
          <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="trainer" />
        </ModuleLayout>
      );
    }

    return (
      <ModuleLayout title="Titan Onboarding" themeColor="orange">
        <TrainerOnboarding
          initialProfile={profile}
          initialBaseContext={trainerBaseContext}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            setProfile(completed);
            setIsOnboarding(false);
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: completed.routines.length > 0
                  ? "Onboarding complete. Do you want a new routine for this week, or should we keep your current plan?"
                  : "Onboarding complete. Do you want me to generate a weekly routine, or do you already have one?"
              }
            ]);
            try {
              await saveTrainerProfile(completed, { userId: user?.uid, encryptionKey });
              if (user && !isGuest) {
                const patch = IntakeBaseContextService.toCoreProfilePatch({
                  ...trainerBaseContext,
                  occupation: (completed.history as any)?.occupation ?? (completed.activity as any)?.occupation ?? trainerBaseContext.occupation,
                  typicalSleepHours: (completed.activity as any)?.sleepHours ?? trainerBaseContext.typicalSleepHours
                });
                if (Object.keys(patch).length > 0) {
                  await CoreProfileService.updateProfile(user.uid, patch);
                  await refreshProfile();
                }
              }
            } catch (e) {
              console.error('Trainer onboarding completion sync failed:', e);
            }
          }}
        />
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout title="Titan Performance" themeColor="orange">
      <div className="h-full flex overflow-hidden relative">
        {/* Left Side: Collapsible Chat */}
        <motion.div 
            initial={false}
            animate={{ 
                width: isChatCollapsed ? 0 : '450px',
                opacity: isChatCollapsed ? 0 : 1
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-full border-r border-white/5 bg-black/20 overflow-hidden flex flex-col relative"
        >
            <NexusChat
                ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                agentName={agentAlias}
                themeColor="orange"
                placeholder="Input training data or queries..."
                onActionParsed={handleActionParsed}
                authMode="trainer"
            />
        </motion.div>

        {/* Toggle Button */}
        <button 
            onClick={() => setIsChatCollapsed(!isChatCollapsed)}
            className={cn(
                "absolute top-1/2 -translate-y-1/2 z-[60] w-6 h-12 flex items-center justify-center bg-orange-600/20 border border-orange-500/20 text-orange-400 backdrop-blur-xl transition-all hover:bg-orange-600/40",
                isChatCollapsed ? "left-0 rounded-r-xl" : "left-[450px] -translate-x-full rounded-l-xl"
            )}
        >
            {isChatCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Right Side: Main Content */}
        <div className="flex-1 h-full overflow-y-auto no-scrollbar flex flex-col relative">
            {isChatCollapsed && (
                <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setIsChatCollapsed(false)}
                    className="absolute top-8 left-8 z-[70] flex items-center gap-3 px-4 py-2 bg-orange-600/20 border border-orange-500/20 rounded-full text-orange-400 font-black text-[9px] uppercase tracking-widest italic backdrop-blur-xl"
                >
                    <MessageSquare className="w-3 h-3" /> Re-open Link
                </motion.button>
            )}
            <TrainerRoutinePanel routines={profile?.routines || []} />
            <div className="flex-1">
                <TitanDashboard soul={globalSoul as any} />
            </div>
        </div>
        <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="trainer" />
      </div>
    </ModuleLayout>
  );
}
