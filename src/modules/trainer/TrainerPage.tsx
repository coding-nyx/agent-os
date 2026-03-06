import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { TitanDashboard } from './components/TitanDashboard';
import { TrainerRoutinePanel } from './components/TrainerRoutinePanel';
import { TrainerOnboarding } from './onboarding/TrainerOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { TrainerProfile } from '@/lib/types';
import { buildTrainerSessionPrompt } from './prompts/trainer-session-prompt';
import { loadTrainerProfile, saveTrainerProfile, subscribeTrainerProfile, syncGuestTrainerProfileToUser } from './services/trainer-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NexusChat } from '@/core/components/NexusChat';
import { cn } from '@/lib/utils';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerTrainerActions } from './services/actions';
import { useVault } from '@/lib/vault-context';
import { useNavigate } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

registerTrainerActions();

function TrainerContent({ profile, encryptionKey }: { profile: TrainerProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('trainer');
  const navigate = useNavigate();
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  const agentAlias = globalSoul?.displayNames?.trainer || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PROMPT;
    return buildTrainerSessionPrompt(profile);
  }, [profile]);

  const {
    messages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage,
    setMessages
  } = useModuleAI({
    moduleId: 'trainer',
    systemPrompt,
    encryptionKey
  });

  const processedClearanceRef = useRef(new Set<string>());

  useSpineEvent('CLEARANCE_DENIED', (event) => {
    if (event.source !== 'soma') return;
    if (processedClearanceRef.current.has(event.id)) return;
    processedClearanceRef.current.add(event.id);
    if (processedClearanceRef.current.size > 500) processedClearanceRef.current.clear();

    const activity = typeof event.data.activity === 'string' ? event.data.activity : 'activity';
    const reason = typeof event.data.reason === 'string' ? event.data.reason : 'No reason provided.';
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Soma clearance denied for ${activity}. Reason: ${reason}. Reduce training intensity and update the plan.`
      }
    ]);
  });

  useSpineEvent('CLEARANCE_GRANTED', (event) => {
    if (event.source !== 'soma') return;
    if (processedClearanceRef.current.has(event.id)) return;
    processedClearanceRef.current.add(event.id);
    if (processedClearanceRef.current.size > 500) processedClearanceRef.current.clear();

    const activity = typeof event.data.activity === 'string' ? event.data.activity : 'activity';
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Soma clearance granted for ${activity}. Proceed with training within safe intensity bands.`
      }
    ]);
  });

  useEffect(() => {
    if (profile?.onboardingComplete && messages.length === 0 && !isProcessing && !streamingText) {
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
  }, [profile?.onboardingComplete, messages.length, isProcessing, streamingText, setMessages]);

  const chatWidth = 'clamp(320px, 32vw, 520px)';

  const handleCalibrate = useCallback(
    (metricKey: string) => {
      const key = metricKey as NSVMetricPath;
      const owner = getMetricOwner(key);
      const prompt = NSV_CALIBRATION_PROMPTS[key] || 'Share the missing metric value.';
      NexusHandoffService.store({
        moduleId: owner,
        type: 'delegate',
        content: prompt,
        reason: 'calibration_request',
        sourceModuleId: 'trainer',
        createdAt: new Date().toISOString()
      });
      const route = NexusRoutingService.getRoute(owner as any);
      if (route) navigate(route);
    },
    [navigate]
  );

  return (
    <div className="h-full flex overflow-hidden relative">
      <div className="flex-1 h-full overflow-y-auto no-scrollbar flex flex-col relative">
        {isChatCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setIsChatCollapsed(false)}
            className="absolute top-6 right-6 z-[70] flex items-center gap-3 px-4 py-2 bg-orange-600/20 border border-orange-500/20 rounded-full text-orange-400 font-black text-[9px] uppercase tracking-widest italic backdrop-blur-xl"
          >
            <MessageSquare className="w-3 h-3" /> Open Titan Link
          </motion.button>
        )}
        <TrainerRoutinePanel routines={profile?.routines || []} />
        <div className="flex-1">
          <TitanDashboard soul={globalSoul as any} isLocked={isLocked} onCalibrate={handleCalibrate} />
        </div>
      </div>

      <motion.aside
        initial={false}
        animate={{
          width: isChatCollapsed ? 0 : chatWidth,
          opacity: isChatCollapsed ? 0 : 1
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-full border-l border-white/5 bg-black/20 overflow-hidden flex flex-col relative"
      >
        <NexusChat
          ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
          agentName={agentAlias}
          themeColor="orange"
          placeholder="Input training data or queries..."
          authMode="trainer"
        />
        {!isChatCollapsed && (
          <button
            onClick={() => setIsChatCollapsed(true)}
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-[60] w-7 h-12 flex items-center justify-center bg-orange-600/20 border border-orange-500/20 text-orange-400 backdrop-blur-xl transition-all hover:bg-orange-600/40 rounded-l-xl'
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </motion.aside>
    </div>
  );
}

export default function TrainerPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<TrainerProfile>
      moduleId="trainer"
      profileOptions={{
        loadProfile: loadTrainerProfile,
        saveProfile: saveTrainerProfile,
        subscribeProfile: subscribeTrainerProfile,
        syncGuestProfile: syncGuestTrainerProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <TrainerOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForTrainer({ coreProfile, trainerProfile: profile })}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            try {
              onComplete(completed);
            } catch (e) {
              console.error('Trainer onboarding completion sync failed:', e);
            }
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <TrainerContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
