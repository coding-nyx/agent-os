import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { SpineEventType } from '@/lib/types';
import { ActionHub } from '@/lib/actions/action-hub';
import { ATLAS_PERSONA } from './personas';
import { AtlasDashboard } from './components/AtlasDashboard';
import {
  AtlasProfile,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile,
  subscribeAtlasProfile,
  syncGuestAtlasProfileToUser
} from './services/atlas-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { AtlasOnboarding } from './onboarding/AtlasOnboarding';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { registerAtlasActions } from './services/actions';

registerAtlasActions();

function buildRecoveryWindow(reason: string): RecoveryWindow {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'Recovery Window',
    start: new Date(now).toISOString(),
    end: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    reason,
    status: 'planned'
  };
}

interface AtlasContentProps {
  profile: AtlasProfile | null;
  encryptionKey: CryptoKey | null;
  user: ReturnType<typeof useAuth>['user'];
  isGuest: boolean;
  globalSoul: ReturnType<typeof useGlobalSoul>['globalSoul'];
  updateCrossFunctionalState: ReturnType<typeof useGlobalSoul>['updateCrossFunctionalState'];
  isLocked: boolean;
}

function AtlasContent({ profile, encryptionKey, user, isGuest, globalSoul, updateCrossFunctionalState, isLocked }: AtlasContentProps) {
  const agentAlias = globalSoul?.displayNames?.atlas || 'Atlas';
  const [mobileTab, setMobileTab] = useState<'planner' | 'chat'>('planner');

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
    moduleId: 'atlas',
    systemPrompt: ATLAS_PERSONA,
    encryptionKey
  });

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
      setMessages([{
        role: 'assistant',
        content: `Cognitive link active. I am ${agentAlias}. Share task pressure, schedule constraints, or focus instability and I will reshape your wave.`
      }]);
    }
  }, [messages.length, isProcessing, streamingText, agentAlias, setMessages, profile?.onboardingComplete]);

  const persistUpdate = useCallback((nextProfile: AtlasProfile) => {
    nextProfile.updatedAt = new Date().toISOString();
    saveAtlasProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
      console.error('Failed to persist atlas action update:', saveError);
    });
  }, [user?.uid, encryptionKey]);

  // --- Action dispatch helpers ---

  const buildActionContext = useCallback((payload: Record<string, unknown>) => ({
    userId: user?.uid,
    isGuest,
    moduleId: 'atlas',
    payload,
    encryptionKey,
    emitSpineEvent: (type: SpineEventType, data: Record<string, unknown>) => Spine.emit({
      type,
      source: 'atlas',
      domain: 'system' as const,
      data,
      cascadeDepth: 0,
      priority: 'info' as const
    }),
    updateGlobalSoul: updateCrossFunctionalState,
    delegateToModule: () => {}
  }), [user?.uid, isGuest, encryptionKey, updateCrossFunctionalState]);

  const handleCompleteTask = useCallback((taskId: string) => {
    ActionHub.execute('atlas', 'complete_task', buildActionContext({
      id: taskId,
      completedAt: new Date().toISOString()
    }));
  }, [buildActionContext]);

  const handleCompleteHabit = useCallback((habitId: string) => {
    ActionHub.execute('atlas', 'update_habit_streak', buildActionContext({
      id: habitId,
      completedToday: true
    }));
  }, [buildActionContext]);

  const handleUpdateGoalProgress = useCallback((goalId: string, milestoneId: string) => {
    ActionHub.execute('atlas', 'update_goal_progress', buildActionContext({
      id: goalId,
      milestoneId,
      completed: true
    }));
  }, [buildActionContext]);

  const handlePauseHabit = useCallback((habitId: string) => {
    ActionHub.execute('atlas', 'pause_habit', buildActionContext({
      id: habitId,
      paused: true
    }));
  }, [buildActionContext]);

  const handleCreateTask = useCallback((task: Record<string, unknown>) => {
    const now = new Date().toISOString();
    ActionHub.execute('atlas', 'create_task', buildActionContext({
      id: `task_${crypto.randomUUID()}`,
      status: 'queued',
      priority: 3,
      energyCost: 5,
      dependencies: [],
      createdAt: now,
      updatedAt: now,
      ...task
    }));
  }, [buildActionContext]);

  const handleCreateHabit = useCallback((habit: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'create_habit', buildActionContext({
      id: `habit_${crypto.randomUUID()}`,
      ...habit
    }));
  }, [buildActionContext]);

  const handleCreateGoal = useCallback((goal: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'create_goal', buildActionContext({
      id: `goal_${crypto.randomUUID()}`,
      ...goal
    }));
  }, [buildActionContext]);

  const handleDeferTask = useCallback((taskId: string) => {
    ActionHub.execute('atlas', 'update_task', buildActionContext({
      id: taskId,
      status: 'deferred'
    }));
  }, [buildActionContext]);

  useSpineEvent('BURNOUT_WARNING', (event) => {
    if (!profile) return;
    const window = buildRecoveryWindow('burnout_warning');
    const next: AtlasProfile = {
      ...profile,
      recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
      flattenedUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    persistUpdate(next);
  });

  useSpineEvent('BLOCK_HIGH_INTENSITY', (event) => {
    if (!profile) return;
    const window = buildRecoveryWindow('cns_fatigue_block');
    const next: AtlasProfile = {
      ...profile,
      recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
      flattenedUntil: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    persistUpdate(next);
  });

  useSpineEvent('FLATTEN_ENERGY_WAVE', (event) => {
    if (!profile) return;
    const window = buildRecoveryWindow('energy_wave_flatten');
    const now = Date.now();
    const nextFlattenUntil = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const existingUntil = profile.flattenedUntil ? Date.parse(profile.flattenedUntil) : 0;
    const resolvedUntil = existingUntil > now ? new Date(Math.max(existingUntil, Date.parse(nextFlattenUntil))).toISOString() : nextFlattenUntil;
    const next: AtlasProfile = {
      ...profile,
      recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
      flattenedUntil: resolvedUntil,
      updatedAt: new Date().toISOString()
    };
    persistUpdate(next);
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile tab bar */}
      <div className="flex md:hidden border-b border-white/10">
        <button
          onClick={() => setMobileTab('planner')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === 'planner'
              ? 'text-sky-400 border-b-2 border-sky-400'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Planner
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === 'chat'
              ? 'text-sky-400 border-b-2 border-sky-400'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Chat
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Planner panel */}
        <div className={`w-full md:w-1/2 lg:w-[40%] md:h-full md:border-r border-white/5 overflow-y-auto no-scrollbar ${
          mobileTab !== 'planner' ? 'hidden md:block' : 'flex-1'
        }`}>
          <AtlasDashboard
            soul={globalSoul}
            profile={profile}
            isLocked={isLocked}
            onCompleteTask={handleCompleteTask}
            onCompleteHabit={handleCompleteHabit}
            onUpdateGoalProgress={handleUpdateGoalProgress}
            onPauseHabit={handlePauseHabit}
            onCreateTask={handleCreateTask}
            onCreateHabit={handleCreateHabit}
            onCreateGoal={handleCreateGoal}
            onDeferTask={handleDeferTask}
          />
        </div>

        {/* Chat panel */}
        <div className={`flex-1 md:h-full overflow-hidden ${
          mobileTab !== 'chat' ? 'hidden md:block' : ''
        }`}>
          <NexusChat
            ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
            agentName={agentAlias}
            themeColor="sky"
            placeholder="Share your schedule pressure, focus bottlenecks, or request load flattening..."
          />
        </div>
      </div>
    </div>
  );
}

export default function AtlasPage() {
  const { globalSoul, updateCrossFunctionalState } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('atlas');

  const baseContext = useMemo(() => IntakeBaseContextService.buildForAtlas({ coreProfile }), [coreProfile]);

  return (
    <UnifiedModulePage<AtlasProfile>
      moduleId="atlas"
      profileOptions={{
        loadProfile: loadAtlasProfile,
        saveProfile: saveAtlasProfile,
        subscribeProfile: subscribeAtlasProfile,
        syncGuestProfile: syncGuestAtlasProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <AtlasOnboarding
          initialProfile={profile}
          initialBaseContext={baseContext}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            onComplete(completed);
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <AtlasContent
          profile={profile}
          encryptionKey={encryptionKey}
          user={user}
          isGuest={!!isGuest}
          globalSoul={globalSoul}
          updateCrossFunctionalState={updateCrossFunctionalState}
          isLocked={isLocked}
        />
      )}
    />
  );
}
