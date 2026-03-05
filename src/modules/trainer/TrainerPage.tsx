import React, { useState, useEffect, useMemo } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { TitanDashboard } from './components/TitanDashboard';
import { TrainerRoutinePanel } from './components/TrainerRoutinePanel';
import { TrainerOnboarding } from './onboarding/TrainerOnboarding';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { Message } from '@/llm-engine/types';
import { SessionPersistenceService } from '@/lib/services/session-persistence-service';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { TrainerProfile } from './types';
import { buildTrainerSessionPrompt } from './prompts/trainer-session-prompt';
import { mergeTrainerProfile, normalizeRoutines, stripActionTags } from './utils';
import { loadTrainerProfile, saveTrainerProfile, syncGuestTrainerProfileToUser } from './services/trainer-profile-service';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

export default function TrainerPage() {
  const { streamMessage } = useAI();
  const { globalSoul, enhanceContext } = useGlobalSoul();
  const { user } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);

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

      if (loadedProfile?.onboardingComplete) {
        const saved = SessionPersistenceService.getHistory('trainer');
        if (saved && saved.length > 0) {
          setMessages(saved);
        } else {
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

  useEffect(() => {
    if (!isOnboarding && messages.length > 0) {
      SessionPersistenceService.saveHistory('trainer', messages);
    }
  }, [messages, isOnboarding]);

  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PROMPT;
    return buildTrainerSessionPrompt(profile);
  }, [profile]);

  const handleSendMessage = async (content: string) => {
    if (isOnboarding || !profile) return;
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');

    try {
      const { updatedHistory } = await streamMessage(
        content,
        enhanceContext({
          systemPrompt,
          insights: [],
          summary: "A training calibration session with Titan.",
          history: messages
        }),
        (chunk) => {
          setStreamingText(prev => prev + chunk);
        }
      );

      let nextProfile = { ...profile };
      const response = updatedHistory[updatedHistory.length - 1]?.content || '';

      const updateMatches = response.match(/<action type="update_trainer_profile">([\s\S]*?)<\/action>/gi);
      if (updateMatches) {
        for (const match of updateMatches) {
          const jsonStr = match
            .replace(/<action type="update_trainer_profile">/i, '')
            .replace(/<\/action>/i, '');
          try {
            const parsed = JSON.parse(jsonStr) as Partial<TrainerProfile>;
            nextProfile = mergeTrainerProfile(nextProfile, parsed);
          } catch (e) {
            console.error('Failed to parse trainer profile update:', e);
          }
        }
      }

      const routineMatches = response.match(/<action type="update_routine">([\s\S]*?)<\/action>/gi);
      if (routineMatches) {
        for (const match of routineMatches) {
          const jsonStr = match
            .replace(/<action type="update_routine">/i, '')
            .replace(/<\/action>/i, '');
          try {
            const parsed = JSON.parse(jsonStr) as { routines?: any[] };
            if (parsed.routines) {
              nextProfile.routines = normalizeRoutines(parsed.routines as any);
            }
          } catch (e) {
            console.error('Failed to parse routine update:', e);
          }
        }
      }

      nextProfile.updatedAt = new Date().toISOString();
      setProfile(nextProfile);
      await saveTrainerProfile(nextProfile, { userId: user?.uid, encryptionKey });

      const displayHistory = updatedHistory.map(m => ({
        ...m,
        content: stripActionTags(m.content)
      }));

      setMessages(displayHistory);
      setStreamingText('');
    } catch (e: any) {
      console.error("Telemetry link lost:", e);
      setError("Biometric telemetry stream interrupted.");
    } finally {
      setIsProcessing(false);
    }
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
            SessionPersistenceService.clearHistory('trainer');
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

  return (
    <ModuleLayout title="Titan Performance" themeColor="orange">
      <div className="h-full flex flex-col">
        <TrainerRoutinePanel routines={profile?.routines || []} />
        <TitanDashboard soul={globalSoul} />
        <div className="flex-1 overflow-hidden">
          <ChatInterface 
            messages={streamingText ? [...messages, { role: 'assistant', content: stripActionTags(streamingText) }] : messages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="orange"
            agentName="Titan"
            placeholder="Input training data or queries..."
            error={error}
            onRetry={() => {
              const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
              if (lastUserMsg) handleSendMessage(lastUserMsg.content);
            }}
          />
        </div>
      </div>
    </ModuleLayout>
  );
}
