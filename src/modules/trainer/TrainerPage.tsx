import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { TitanDashboard } from './components/TitanDashboard';
import { TrainerRoutinePanel } from './components/TrainerRoutinePanel';
import { TrainerOnboarding } from './onboarding/TrainerOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { TrainerProfile } from '@/lib/types';
import { buildTrainerSessionPrompt } from './prompts/trainer-session-prompt';
import { mergeTrainerProfile, normalizeRoutines, stripActionTags } from './utils';
import { loadTrainerProfile, saveTrainerProfile, syncGuestTrainerProfileToUser } from './services/trainer-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

export default function TrainerPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

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

      // Hydrate initial greeting if no messages
      if (loadedProfile?.onboardingComplete && messages.length === 0 && !isProcessing && !streamingText) {
          const hasRoutine = loadedProfile.routines && loadedProfile.routines.length > 0;
          setMessages([
            {
              role: 'assistant',
              content: hasRoutine
                ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
                : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?"
            }
          ]);
      }

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
    if (!profile) return;
    let nextProfile = { ...profile };
    let hasChanges = false;

    if (type === 'update_trainer_profile') {
      nextProfile = mergeTrainerProfile(nextProfile, payload as Partial<TrainerProfile>);
      hasChanges = true;
    } else if (type === 'update_routine') {
      if (payload.routines) {
        nextProfile.routines = normalizeRoutines(payload.routines as any);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      nextProfile.updatedAt = new Date().toISOString();
      setProfile(nextProfile);
      saveTrainerProfile(nextProfile, { userId: user?.uid, encryptionKey });
    }
  }, [profile, user, encryptionKey]);

  const onSendMessage = async (content: string) => {
    if (isOnboarding || !profile) return;
    await handleSendMessage(content, handleActionParsed);
  };

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
    return (
      <ModuleLayout title="Titan Onboarding" themeColor="orange">
        <TrainerOnboarding
          initialProfile={profile}
          onComplete={async (completed) => {
            setProfile(completed);
            setIsOnboarding(false);
            setMessages([
              {
                role: 'assistant',
                content: completed.routines.length > 0
                  ? "Onboarding complete. Do you want a new routine for this week, or should we keep your current plan?"
                  : "Onboarding complete. Do you want me to generate a weekly routine, or do you already have one?"
              }
            ]);
            await saveTrainerProfile(completed, { userId: user?.uid, encryptionKey });
          }}
        />
      </ModuleLayout>
    );
  }

  // Strip action tags for display
  const displayMessages = messages.map(m => ({
    ...m,
    content: stripActionTags(m.content)
  }));
  
  const displayStreamingText = stripActionTags(streamingText);

  return (
    <ModuleLayout title="Titan Performance" themeColor="orange">
      <div className="h-full flex flex-col relative">
        <TrainerRoutinePanel routines={profile?.routines || []} />
        <TitanDashboard soul={globalSoul as any} />
        <div className="flex-1 overflow-hidden">
          <ChatInterface 
            messages={displayStreamingText ? [...displayMessages, { role: 'assistant', content: displayStreamingText }] : displayMessages}
            onSendMessage={onSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="orange"
            agentName={agentAlias}
            placeholder="Input training data or queries..."
            error={error}
            isGuestTrial={isGuest}
            quota={quota}
            onQuotaExhausted={() => setShowAuth(true)}
            onRetry={() => {
              const lastUserMsg = [...displayMessages].reverse().find(m => m.role === 'user');
              if (lastUserMsg) onSendMessage(lastUserMsg.content);
            }}
          />
        </div>
        <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="trainer" />
      </div>
    </ModuleLayout>
  );
}
