import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAtlasPredictiveState } from '@/lib/hooks/use-atlas-predictive-state';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { SpineEventType } from '@/lib/types';
import { ActionHub } from '@/lib/actions/action-hub';
import { ATLAS_PERSONA } from './personas';
import { buildAtlasPrompt, type AtlasDataContext } from './prompts/atlas-prompt-builder';
import { formatNSVForAtlasPlanner } from '@/lib/services/nsv-service';
import type { NeuralStateVector } from '@/lib/types';
import { AtlasActionsProvider } from './context/AtlasActionsContext';
import { EnhancedAtlasDashboard } from './components/EnhancedAtlasDashboard';
import { AtlasNotificationSettingsPanel } from './components/AtlasNotificationSettingsPanel';
import { QuickAddForm } from './components/QuickAddForm';
import type { EveningCheckInSubmitData } from './components/EveningCheckIn';
import {
  AtlasProfile,
  AtlasTask,
  AtlasHabit,
  AtlasGoal,
  RecoveryWindow,
  EnergyWavePoint,
  loadAtlasProfile,
  saveAtlasProfile,
  subscribeAtlasProfile,
  syncGuestAtlasProfileToUser
} from './services/atlas-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { useExtensionFieldValues } from '@/lib/hooks/use-extension-field-values';
import { AtlasOnboarding } from './onboarding/AtlasOnboarding';
import { PostOnboardingWelcome, hasSeenWelcome, markWelcomeSeen } from './components/PostOnboardingWelcome';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import {
  loadJournalEntry,
  saveJournalEntry,
  createEmptyJournalEntry,
  mergeCheckInData,
} from './services/journal-service';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { AtlasReviewService } from './services/atlas-review-service';

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
  isLocked: boolean;
}

function AtlasContent({ profile, encryptionKey, user, isGuest, isLocked }: AtlasContentProps) {
  const { globalSoul, updateCrossFunctionalState } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.atlas || 'Atlas';
  const { display: predictiveDisplay } = useAtlasPredictiveState(
    globalSoul?.crossFunctionalState ?? null
  );

  const [activeTab, setActiveTab] = useState<any>('dashboard');
  const [activeView, setActiveView] = useState<any>('today');
  const location = useLocation();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [weeklyReviewPending, setWeeklyReviewPending] = useState<boolean>(false);
  const [showWelcomeCard, setShowWelcomeCard] = useState<boolean>(() =>
    !!(profile?.onboardingComplete && !hasSeenWelcome(user?.uid))
  );
  // S9-007: Morning / Evening intelligence cadence — driven by Spine events.
  const [showMorningBrief, setShowMorningBrief] = useState(false);
  const [showEveningCheckin, setShowEveningCheckin] = useState(false);

  // On mount: check if a review is overdue without waiting for a Spine event.
  useEffect(() => {
    const stored = localStorage.getItem('atlas_last_weekly_review');
    if (!stored) { setWeeklyReviewPending(true); return; }
    const ts = new Date(stored).getTime();
    if (Number.isNaN(ts) || Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
      setWeeklyReviewPending(true);
    }
  }, []);

  // S19-atlas-01: On first Atlas open, directly publish MORNING_BRIEF_DUE if in 05:00-11:00 window.
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 5 || hour >= 11) return;
    const briefDateKey = 'atlas_brief_date_' + (user?.uid ?? 'guest');
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(briefDateKey);
    if (stored !== today) {
      Spine.publish({
        type: 'MORNING_BRIEF_DUE',
        source: 'atlas-page',
        domain: 'C',
        priority: 'info',
        data: { triggeredBy: 'atlas_page_open', timestamp: new Date().toISOString() },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // S19-atlas-01: On Sunday evening Atlas open, publish WEEKLY_REVIEW_DUE if not done this week.
  useEffect(() => {
    const now = new Date();
    const isSundayEvening = now.getDay() === 0 && now.getHours() >= 18 && now.getHours() <= 21;
    if (!isSundayEvening) return;
    const stored = localStorage.getItem('atlas_last_weekly_review');
    const isOverdue = !stored || Date.now() - new Date(stored).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (isOverdue) {
      Spine.publish({
        type: 'WEEKLY_REVIEW_DUE',
        source: 'atlas-page',
        domain: 'C',
        priority: 'info',
        data: { triggeredBy: 'atlas_page_open_sunday', timestamp: new Date().toISOString() },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handledSpineEventsRef = useRef<Set<string>>(new Set());

  // React to WEEKLY_REVIEW_DUE Spine events fired by cascade rules or direct publish.
  useSpineEvent('WEEKLY_REVIEW_DUE', (event) => {
    const eventKey = `weekly-review-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    setWeeklyReviewPending(true);
  });

  // S9-007: React to morning/evening cadence events from cascade rules.
  useSpineEvent('MORNING_BRIEF_DUE', (event) => {
    const eventKey = `morning-brief-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    setShowMorningBrief(true);
  });
  useSpineEvent('EVENING_CHECKIN_DUE', (event) => {
    const eventKey = `evening-checkin-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    setShowEveningCheckin(true);
  });

  const handleReviewOpened = useCallback(() => {
    setWeeklyReviewPending(false);
    localStorage.setItem('atlas_last_weekly_review', new Date().toISOString());
  }, []);

  // S9-008: Atlas Failure Notification Loop — emit COMMITMENT_MISSED once per
  // calendar day when the profile contains tasks whose deadline has passed.
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const sessionKey = `atlas_commitment_checked_${today}`;
    let alreadyCheckedToday = false;
    try {
      alreadyCheckedToday = sessionStorage.getItem(sessionKey) === '1';
    } catch (storageError) {
      console.warn('[Atlas] Could not read commitment-check session key:', storageError);
    }

    if (!alreadyCheckedToday && profile?.tasks) {
      const overdueTasks = profile.tasks.filter(
        (t) =>
          t.status !== 'done' &&
          t.deadline !== undefined &&
          t.deadline < today,
      );
      if (overdueTasks.length > 0) {
        Spine.publish({
          type: 'COMMITMENT_MISSED',
          source: 'atlas',
          domain: 'C',
          priority: 'alert',
          data: {
            overdueCount: overdueTasks.length,
            taskIds: overdueTasks.map((t) => t.id),
          },
        });
        try {
          sessionStorage.setItem(sessionKey, '1');
        } catch (storageError) {
          console.warn('[Atlas] Could not persist commitment-check session key:', storageError);
        }
      }
    }
  }, [profile]);

  // AT4: Run AtlasReviewService audit once per calendar day when profile loads.
  // Emits HABIT_STREAK_BROKEN and GOAL_MISSING_PROGRESS Spine events so other
  // modules (Agnes, Titan) can react to commitment failures.
  useEffect(() => {
    if (!profile) return;
    const today = new Date().toISOString().split('T')[0];
    const auditKey = `atlas_review_audited_${today}_${user?.uid ?? 'guest'}`;
    try {
      if (sessionStorage.getItem(auditKey) === '1') return;
      sessionStorage.setItem(auditKey, '1');
    } catch { /* non-browser / SSR */ }
    AtlasReviewService.performAudit(profile).catch((err) => {
      console.warn('[Atlas] Review audit failed:', err);
    });
  }, [profile, user?.uid]);

  // Extension field management via SchemaRegistry — declared early so
  // it can be referenced in the dynamic systemPrompt computation below.
  const {
    extensions,
    addExtension,
    removeExtension,
  } = useSchemaRegistry('atlas');

  // S19-atlas-02: Persisted field values via Firestore
  const {
    fieldValues,
    updateFieldValue,
    removeFieldValue,
  } = useExtensionFieldValues('atlas');

  // Build dynamic system prompt from live profile + NSV so the AI knows
  // the user's actual tasks, goals, habits, and energy state on every call.
  const systemPrompt = useMemo((): string => {
    if (!profile) return ATLAS_PERSONA;

    const nsv = globalSoul?.crossFunctionalState as NeuralStateVector | undefined;
    const nsvBlock = nsv ? formatNSVForAtlasPlanner(nsv) : undefined;

    const extBlock = extensions.length > 0
      ? `CUSTOM TRACKING FIELDS:\n${extensions.map(f => `- "${f.name}" (${f.type})`).join('\n')}`
      : undefined;

    const dataContext: AtlasDataContext = {
      tasks: profile.tasks?.slice(0, 30),
      goals: profile.goals?.slice(0, 25),
      habits: profile.habits?.filter(h => h.status === 'active').slice(0, 10),
      routine: profile.routine ?? null,
      today: new Date().toISOString().split('T')[0],
    };

    return buildAtlasPrompt({ kind: 'general' }, nsvBlock, extBlock, dataContext);
  }, [profile, globalSoul?.crossFunctionalState, extensions]);

  // AI Logic for Atlas
  const ai = useModuleAI({
    moduleId: 'atlas',
    systemPrompt,
    encryptionKey,
    persistencePolicy: 'atlas-planning'
  });


  const handleSaveFieldValue = useCallback(async (fieldId: string, value: any) => {
    await updateFieldValue(fieldId, value);
  }, [updateFieldValue]);

  const handleRemoveFieldValue = useCallback(async (fieldId: string) => {
    await removeFieldValue(fieldId);
  }, [removeFieldValue]);

  const handleAddField = useCallback(async (field?: import('@/lib/field-system/types').FieldDefinition) => {
    if (field) {
      try {
        await addExtension(field);
      } catch (err) {
        console.error('[Atlas] Failed to add extension field:', err);
      }
    } else {
      ai.handleSendMessage(
        'I want to add a custom tracking field to my Atlas dashboard. Please suggest some options based on my current goals and habits, or help me create a specific field if I describe what I want to track.'
      );
    }
  }, [addExtension, ai.handleSendMessage]);

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
    delegateToModule: (target: string, reason: string, delegationContent: string) => {
      if (isGuest || !user?.uid) return;
      NexusHandoffService.store({
        moduleId: target,
        type: 'delegate',
        content: delegationContent,
        reason,
        sourceModuleId: 'atlas',
        createdAt: new Date().toISOString(),
      });
      Spine.emit({
        type: 'MODULE_DELEGATED',
        source: 'atlas',
        target,
        domain: 'system',
        data: { reason, content: delegationContent },
        cascadeDepth: 0,
        priority: 'info',
      });
    }
  }), [user?.uid, isGuest, encryptionKey, updateCrossFunctionalState]);

  const executeAtlasAction = useCallback((
    actionType: string,
    payload: Record<string, unknown>,
    reason: string
  ) => {
    void ActionHub.execute('atlas', actionType, buildActionContext(payload)).then(() => {
      Spine.emit({
        type: 'MODULE_PROFILE_UPDATED',
        source: 'atlas',
        domain: 'system',
        data: { moduleId: 'atlas', reason },
        cascadeDepth: 0,
        priority: 'info',
      });
    });
  }, [buildActionContext]);

  const handleCompleteTask = useCallback((taskId: string) => {
    executeAtlasAction('complete_task', {
      id: taskId,
      completedAt: new Date().toISOString()
    }, 'task_completed');
  }, [executeAtlasAction]);

  const handleCompleteHabit = useCallback((habitId: string) => {
    executeAtlasAction('complete_habit', {
      id: habitId,
      completedAt: new Date().toISOString()
    }, 'habit_completed');
  }, [executeAtlasAction]);

  const handleUpdateGoalProgress = useCallback((goalId: string, milestoneId: string) => {
    executeAtlasAction('update_goal_progress', {
      id: goalId,
      milestoneId,
      completed: true
    }, 'goal_progress_updated');
  }, [executeAtlasAction]);

  const handlePauseHabit = useCallback((habitId: string) => {
    const habit = profile?.habits.find(h => h.id === habitId);
    if (!habit) return;
    
    if (habit.status === 'paused') {
      executeAtlasAction('update_habit', {
        id: habitId,
        status: 'active'
      }, 'habit_resumed');
    } else {
      executeAtlasAction('pause_habit', {
        id: habitId
      }, 'habit_paused');
    }
  }, [profile?.habits, executeAtlasAction]);

  const handleCreateTask = useCallback((task: Partial<AtlasTask>) => {
    const now = new Date().toISOString();
    executeAtlasAction('create_task', {
      id: `task_${crypto.randomUUID()}`,
      status: 'queued',
      dependencies: [],
      createdAt: now,
      updatedAt: now,
      priority: 3,
      energyCost: 5,
      ...task
    }, 'task_created');
  }, [executeAtlasAction]);

  const handleCreateHabit = useCallback((habit: Partial<AtlasHabit>) => {
    executeAtlasAction('create_habit', {
      id: `habit_${crypto.randomUUID()}`,
      ...habit
    }, 'habit_created');
  }, [executeAtlasAction]);

  const handleCreateGoal = useCallback((goal: Partial<AtlasGoal>) => {
    executeAtlasAction('create_goal', {
      id: `goal_${crypto.randomUUID()}`,
      ...goal
    }, 'goal_created');
  }, [executeAtlasAction]);

  const handleDeferTask = useCallback((taskId: string) => {
    executeAtlasAction('update_task', {
      id: taskId,
      status: 'deferred'
    }, 'task_deferred');
  }, [executeAtlasAction]);

  const handleUpdateTask = useCallback((taskId: string, updates: Record<string, unknown>) => {
    executeAtlasAction('update_task', {
      id: taskId,
      ...updates
    }, 'task_updated');
  }, [executeAtlasAction]);

  const handleDeleteTask = useCallback((taskId: string) => {
    executeAtlasAction('delete_task', {
      id: taskId
    }, 'task_deleted');
  }, [executeAtlasAction]);

  const handleUpdateGoal = useCallback((goalId: string, updates: Record<string, unknown>) => {
    executeAtlasAction('update_goal', {
      id: goalId,
      ...updates
    }, 'goal_updated');
  }, [executeAtlasAction]);

  const handleDeleteGoal = useCallback((goalId: string) => {
    executeAtlasAction('delete_goal', {
      id: goalId
    }, 'goal_deleted');
  }, [executeAtlasAction]);

  const handleUpdateHabit = useCallback((habitId: string, updates: Record<string, unknown>) => {
    executeAtlasAction('update_habit', {
      id: habitId,
      ...updates
    }, 'habit_updated');
  }, [executeAtlasAction]);

  const handleDeleteHabit = useCallback((habitId: string) => {
    executeAtlasAction('delete_habit', {
      id: habitId
    }, 'habit_deleted');
  }, [executeAtlasAction]);

  const handleUpdateRoutine = useCallback((updates: Record<string, unknown>) => {
    executeAtlasAction('update_routine', updates, 'routine_updated');
  }, [executeAtlasAction]);

  const handleUpdateIntention = useCallback((updates: Record<string, unknown>) => {
    executeAtlasAction('set_daily_intention', updates, 'intention_updated');
  }, [executeAtlasAction]);

  /** Persist a weekly review snapshot to profile.reviews so the Review tab shows it. */
  const handleSaveWeeklyReview = useCallback(() => {
    if (!profile) return;
    const d = new Date();
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const weekMsStart = weekStart.getTime();
    const weekMsEnd = weekEnd.getTime() + 86400000;
    const thisWeekScheduled = (profile.scheduledTasks ?? []).filter((s) => {
      const t = new Date(s.scheduledAt).getTime();
      return t >= weekMsStart && t < weekMsEnd;
    });
    const totalScheduled = thisWeekScheduled.length;
    const totalCompleted = thisWeekScheduled.filter((s) => s.status === 'done').length;
    const completionRate = totalScheduled > 0 ? totalCompleted / totalScheduled : 0;
    const cognitive = globalSoul?.crossFunctionalState?.cognitive ?? {};
    const habitSummary = (profile.habits ?? []).map((h) => ({
      habitId: h.id,
      habitTitle: h.title ?? '',
      streak: h.currentStreak ?? 0,
      completions: 0,
      status: h.status,
    }));
    const goalProgress = (profile.goals ?? []).map((g) => ({
      goalId: g.id,
      goalTitle: g.title ?? '',
      progressPercent: g.progressPercent ?? 0,
      milestonesCompleted: (g.milestones ?? []).filter((m) => m.completed).length,
      milestonesTotal: (g.milestones ?? []).length || 1,
    }));
    executeAtlasAction('temporal_review', {
      scope: 'weekly',
      periodStart: weekStartStr,
      periodEnd: weekEndStr,
      totalScheduled,
      totalCompleted,
      completionRate,
      habitSummary,
      goalProgress,
      energyBudgetAvg: typeof cognitive.energyBudget === 'number' ? cognitive.energyBudget : 5,
      focusScoreAvg: typeof cognitive.focusScore === 'number' ? cognitive.focusScore : 5,
      resilienceTrend: 'stable',
      insights: [],
    }, 'weekly_review_saved');
    handleReviewOpened();
  }, [profile, globalSoul?.crossFunctionalState?.cognitive, executeAtlasAction, handleReviewOpened]);

  // S-journal-01: Morning brief dismiss — record today's date so JournalTab
  // can pre-populate the morningIntent placeholder.
  const handleMorningBriefDismiss = useCallback(() => {
    setShowMorningBrief(false);
    localStorage.setItem(
      `atlas_morning_brief_shown_${user?.uid ?? 'guest'}`,
      new Date().toISOString().split('T')[0],
    );
  }, [user?.uid]);

  // S-journal-01: Evening check-in dismiss — persist atlas profile check-in,
  // update NSV via ActionHub complete_check_in, and pre-populate today's journal.
  const handleEveningCheckinDismiss = useCallback(
    (data?: EveningCheckInSubmitData) => {
      setShowEveningCheckin(false);

      if (data && profile) {
        // Persist daily check-in data for weekly review aggregation.
        const next: AtlasProfile = {
          ...profile,
          dailyCheckIns: [
            ...(profile.dailyCheckIns ?? []),
            {
              date: data.date,
              tasksCompleted: data.tasksCompleted,
              totalTasks: data.totalTasks,
              energyLevel: data.energyLevel,
              blockers: data.blockers,
              loggedAt: new Date().toISOString(),
            },
          ].slice(-90), // keep last 90 days
          updatedAt: new Date().toISOString(),
        };
        persistUpdate(next);

        // Dispatch complete_check_in so NSV (energyBudget) is updated via ActionHub
        // and a ATLAS_STATE_CHANGED Spine event is emitted.
        executeAtlasAction('complete_check_in', {
          type: 'evening',
          energyRating: data.energyLevel,
          reflection: data.blockers || undefined,
        }, 'evening_check_in_completed');
      }

      // Auto-populate today's journal entry (fire-and-forget).
      if (data && encryptionKey && user?.uid) {
        const uid = user.uid;
        const today = new Date().toISOString().split('T')[0];
        void (async () => {
          try {
            const existing = await loadJournalEntry(today, { userId: uid, encryptionKey });
            const base = existing ?? createEmptyJournalEntry(today);
            const updated = mergeCheckInData(base, {
              energyLevel: data.energyLevel,
              blockers: data.blockers,
            });
            if (!updated.blockers?.trim()) return; // don't save empty entries
            await saveJournalEntry(updated, { userId: uid, encryptionKey });
          } catch (err) {
            console.error('[Atlas] Failed to auto-populate journal from evening check-in:', err);
          }
        })();
      }
    },
    [profile, encryptionKey, user?.uid, persistUpdate, executeAtlasAction],
  );

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
        <QuickAddForm
          isFluid
          projects={profile?.projects ?? []}
          onCreateTask={handleCreateTask}
          onCreateHabit={handleCreateHabit}
          onCreateGoal={handleCreateGoal}
        />
      }
    >
      <>
        <div className="px-[var(--atlas-space-page-x)] pt-[var(--atlas-space-block)] flex justify-end">
          <ModuleReminderEntry
            title="Atlas"
            themeColor="sky"
            panel={<AtlasNotificationSettingsPanel />}
            compact
          />
        </div>
        {showWelcomeCard && profile && (
          <PostOnboardingWelcome
            profile={profile}
            userId={user?.uid}
            onDismiss={() => {
              markWelcomeSeen(user?.uid);
              setShowWelcomeCard(false);
            }}
            onAddHabit={() => {
              markWelcomeSeen(user?.uid);
              setShowWelcomeCard(false);
              setActiveTab('routines');
            }}
            onCreateGoal={() => {
              markWelcomeSeen(user?.uid);
              setShowWelcomeCard(false);
              setActiveTab('backlog');
            }}
          />
        )}
        <AtlasActionsProvider actions={{
          onCompleteTask: handleCompleteTask,
          onCompleteHabit: handleCompleteHabit,
          onUpdateGoalProgress: handleUpdateGoalProgress,
          onPauseHabit: handlePauseHabit,
          onCreateTask: handleCreateTask,
          onCreateHabit: handleCreateHabit,
          onCreateGoal: handleCreateGoal,
          onUpdateTask: handleUpdateTask,
          onUpdateHabit: handleUpdateHabit,
          onUpdateGoal: handleUpdateGoal,
          onDeleteTask: handleDeleteTask,
          onDeleteHabit: handleDeleteHabit,
          onDeleteGoal: handleDeleteGoal,
          onUpdateRoutine: handleUpdateRoutine,
          onUpdateIntention: handleUpdateIntention,
          onSaveFieldValue: handleSaveFieldValue,
          onRemoveFieldValue: handleRemoveFieldValue,
          onAddField: handleAddField,
          onDeleteField: handleDeleteField,
          onSendMessage: ai.handleSendMessage,
          onSaveWeeklyReview: handleSaveWeeklyReview,
          onTabChange: setActiveTab,
          onViewChange: setActiveView,
          onReviewOpened: handleReviewOpened,
          onMorningBriefDismiss: handleMorningBriefDismiss,
          onEveningCheckinDismiss: handleEveningCheckinDismiss,
        }}>
          <EnhancedAtlasDashboard
            soul={globalSoul}
            profile={profile}
            isLocked={isLocked}
            activeTab={activeTab}
            activeView={activeView}
            extensions={extensions}
            fieldValues={fieldValues}
            encryptionKey={encryptionKey}
            predictiveDisplay={predictiveDisplay}
            weeklyReviewPending={weeklyReviewPending}
            morningBriefVisible={showMorningBrief}
            eveningCheckinVisible={showEveningCheckin}
            focusId={(location.state as { focusId?: string } | null)?.focusId}
          />
        </AtlasActionsProvider>
      </>
    </SingleAgentLayout>
  );
}

export default function AtlasPage() {
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
          isLocked={isLocked}
        />
      )}
    />
  );
}