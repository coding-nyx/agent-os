import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { SpineEventType } from '@/lib/types';
import { ActionHub } from '@/lib/actions/action-hub';
import { ATLAS_PERSONA } from './personas';
import { EnhancedAtlasDashboard } from './components/EnhancedAtlasDashboard';
import { QuickAddForm } from './components/QuickAddForm';
import {
  AtlasProfile,
  AtlasTask,
  AtlasHabit,
  AtlasGoal,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile,
  subscribeAtlasProfile,
  syncGuestAtlasProfileToUser
} from './services/atlas-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { AtlasOnboarding } from './onboarding/AtlasOnboarding';
import { CoreProfileService } from '@/lib/services/core-profile-service';

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
  const [activeTab, setActiveTab] = useState<any>('dashboard');
  const [activeView, setActiveView] = useState<any>('today');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // AI Logic for Atlas
  const ai = useModuleAI({
    moduleId: 'atlas',
    systemPrompt: ATLAS_PERSONA,
    encryptionKey,
    persistencePolicy: 'atlas-planning'
  });

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      ai.setMessages([
        {
          role: 'assistant',
          content: `Cognitive link active. I am ${agentAlias}. Share task pressure, schedule constraints, or focus instability and I will reshape your wave.`
        }
      ]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, agentAlias, ai.setMessages]);

  // Extension field management via SchemaRegistry
  const {
    extensions,
    addExtension,
    removeExtension,
  } = useSchemaRegistry('atlas');

  // Field values state (ephemeral for now — persisted via SchemaRegistry in future)
  const [fieldValues, setFieldValues] = useState<Record<string, import('@/lib/field-system/types').FieldValue>>({});

  const handleAddField = useCallback(() => {
    ai.handleSendMessage(
      'I want to add a custom tracking field to my Atlas dashboard. Please suggest some options based on my current goals and habits, or help me create a specific field if I describe what I want to track.'
    );
  }, [ai.handleSendMessage]);

  const handleDeleteField = useCallback(async (fieldId: string) => {
    try {
      await removeExtension(fieldId);
    } catch (err) {
      console.error('[Atlas] Failed to delete extension field:', err);
    }
  }, [removeExtension]);

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
    const habit = profile?.habits.find(h => h.id === habitId);
    if (!habit) return;
    
    if (habit.status === 'paused') {
      ActionHub.execute('atlas', 'update_habit', buildActionContext({
        id: habitId,
        status: 'active'
      }));
    } else {
      ActionHub.execute('atlas', 'pause_habit', buildActionContext({
        id: habitId
      }));
    }
  }, [profile?.habits, buildActionContext]);

  const handleCreateTask = useCallback((task: Partial<AtlasTask>) => {
    const now = new Date().toISOString();
    ActionHub.execute('atlas', 'create_task', buildActionContext({
      id: `task_${crypto.randomUUID()}`,
      status: 'queued',
      dependencies: [],
      createdAt: now,
      updatedAt: now,
      priority: 3,
      energyCost: 5,
      ...task
    }));
  }, [buildActionContext]);

  const handleCreateHabit = useCallback((habit: Partial<AtlasHabit>) => {
    ActionHub.execute('atlas', 'create_habit', buildActionContext({
      id: `habit_${crypto.randomUUID()}`,
      ...habit
    }));
  }, [buildActionContext]);

  const handleCreateGoal = useCallback((goal: Partial<AtlasGoal>) => {
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

  const handleUpdateTask = useCallback((taskId: string, updates: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'update_task', buildActionContext({
      id: taskId,
      ...updates
    }));
  }, [buildActionContext]);

  const handleDeleteTask = useCallback((taskId: string) => {
    ActionHub.execute('atlas', 'delete_task', buildActionContext({
      id: taskId
    }));
  }, [buildActionContext]);

  const handleUpdateGoal = useCallback((goalId: string, updates: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'update_goal', buildActionContext({
      id: goalId,
      ...updates
    }));
  }, [buildActionContext]);

  const handleDeleteGoal = useCallback((goalId: string) => {
    ActionHub.execute('atlas', 'delete_goal', buildActionContext({
      id: goalId
    }));
  }, [buildActionContext]);

  const handleUpdateHabit = useCallback((habitId: string, updates: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'update_habit', buildActionContext({
      id: habitId,
      ...updates
    }));
  }, [buildActionContext]);

  const handleDeleteHabit = useCallback((habitId: string) => {
    ActionHub.execute('atlas', 'delete_habit', buildActionContext({
      id: habitId
    }));
  }, [buildActionContext]);

  const handleUpdateRoutine = useCallback((updates: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'update_routine', buildActionContext(updates));
  }, [buildActionContext]);

  const handleUpdateIntention = useCallback((updates: Record<string, unknown>) => {
    ActionHub.execute('atlas', 'set_daily_intention', buildActionContext(updates));
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
    <SingleAgentLayout
      moduleId="atlas"
      agentName={agentAlias}
      themeColor="sky"
      ai={ai}
      authMode="atlas"
      placeholder="Share task pressure or schedule constraints..."
      primaryAction={
        activeTab === 'dashboard' && activeView !== 'focus' && (
          <QuickAddForm
            projects={profile?.projects ?? []}
            onCreateTask={handleCreateTask}
            onCreateHabit={handleCreateHabit}
            onCreateGoal={handleCreateGoal}
            isOpen={isQuickAddOpen}
            onOpenChange={setIsQuickAddOpen}
            isFluid
          />
        )
      }
    >
      <EnhancedAtlasDashboard
        soul={globalSoul}
        profile={profile}
        isLocked={isLocked}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeView={activeView}
        onViewChange={setActiveView}
        onCompleteTask={handleCompleteTask}
        onCompleteHabit={handleCompleteHabit}
        onUpdateGoalProgress={handleUpdateGoalProgress}
        onPauseHabit={handlePauseHabit}
        onCreateTask={handleCreateTask}
        onCreateHabit={handleCreateHabit}
        onCreateGoal={handleCreateGoal}
        onUpdateTask={handleUpdateTask}
        onUpdateHabit={handleUpdateHabit}
        onUpdateGoal={handleUpdateGoal}
        onDeleteTask={handleDeleteTask}
        onDeleteHabit={handleDeleteHabit}
        onDeleteGoal={handleDeleteGoal}
        onUpdateRoutine={handleUpdateRoutine}
        onUpdateIntention={handleUpdateIntention}
        extensions={extensions}
        fieldValues={fieldValues}
        onAddField={handleAddField}
        onDeleteField={handleDeleteField}
        onSendMessage={ai.handleSendMessage}
      />
    </SingleAgentLayout>
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
        refreshProfile: loadAtlasProfile,
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
