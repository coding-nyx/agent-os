import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useGlobalSoulStore, useGlobalSoulActions } from '@/lib/global-soul-context';
import { useAtlasPredictiveState } from '@/lib/hooks/use-atlas-predictive-state';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import type { AtlasReviewBlueprint, SpineDomain, SpineEventType } from '@/lib/types';
import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasActionsProvider } from './context/AtlasActionsContext';
import { EnhancedAtlasDashboard } from './components/EnhancedAtlasDashboard';
import { AtlasActionRail } from './components/AtlasActionRail';
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
import { useUIStore } from '@/lib/stores/ui-store';
import { createFlowMeta } from '@/lib/spine/flow-contracts';

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
  const { updateCrossFunctionalState } = useGlobalSoulActions();
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const agentAlias = globalSoul?.displayNames?.atlas || 'Atlas';
  // Keep globalSoul in a ref so callbacks that need it at call-time don't list it
  // as a dep — prevents AtlasActionsContext from recreating on every NSV write.
  const globalSoulRef = useRef(globalSoul);
  globalSoulRef.current = globalSoul;
  const setHideGlobalFAB = useUIStore((s) => s.setHideGlobalFAB);
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

  // Optimistic UI — applied immediately before Firestore confirms
  const [optimisticPatch, setOptimisticPatch] = useState<Partial<AtlasProfile> | null>(null);
  const effectiveProfile = useMemo(
    () => (optimisticPatch && profile ? { ...profile, ...optimisticPatch } : profile),
    [profile, optimisticPatch],
  );

  // Clear optimistic patch when real Firestore profile arrives
  const lastProfileRef = useRef(profile);
  useEffect(() => {
    if (profile !== lastProfileRef.current) {
      lastProfileRef.current = profile;
      setOptimisticPatch(null);
    }
  }, [profile]);

  useEffect(() => {
    setHideGlobalFAB(true);
    return () => setHideGlobalFAB(false);
  }, [setHideGlobalFAB]);

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
            impactDomain: 'physical',
            moduleAffinity: ['titan'],
          },
          ...createFlowMeta('atlas'),
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

  const ai = useModuleAI({
    moduleId: 'atlas',
    encryptionKey,
    persistencePolicy: 'atlas-planning',
    moduleContext: {
      atlas_profile: profile,
      atlas_mode: 'general',
    },
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
    emitSpineEvent: (
      type: SpineEventType,
      data: Record<string, unknown>,
      options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string }
    ) => Spine.emit({
      type,
      source: 'atlas',
      domain: (options?.domain ?? 'C') as SpineDomain,
      target: options?.target,
      data,
      cascadeDepth: 0,
      priority: options?.priority ?? 'info',
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
    void ActionHub.execute('atlas', actionType, buildActionContext(payload)).then((executed) => {
      if (!executed) return;
      Spine.emit({
        type: 'MODULE_PROFILE_UPDATED',
        source: 'atlas',
        domain: 'system',
        data: { moduleId: 'atlas', reason },
        cascadeDepth: 0,
        priority: 'info',
        ...createFlowMeta('atlas'),
      });
    });
  }, [buildActionContext]);


  const handleUncompleteTask = useCallback((taskId: string) => {
    if (profile?.tasks) {
      setOptimisticPatch(prev => ({
        ...(prev ?? {}),
        tasks: profile.tasks.map(t =>
          t.id === taskId ? { ...t, status: 'active' as const, completedAt: undefined } : t
        ),
      }));
    }
    executeAtlasAction('uncomplete_task', {
      id: taskId
    }, 'task_uncompleted');
  }, [profile?.tasks, executeAtlasAction]);

  const handleCompleteTask = useCallback((taskId: string) => {
    if (profile?.tasks) {
      const now = new Date().toISOString();
      setOptimisticPatch(prev => ({
        ...(prev ?? {}),
        tasks: profile.tasks.map(t =>
          t.id === taskId ? { ...t, status: 'done' as const, completedAt: now } : t
        ),
      }));
    }
    executeAtlasAction('complete_task', {
      id: taskId,
      completedAt: new Date().toISOString()
    }, 'task_completed');
  }, [profile?.tasks, executeAtlasAction]);

  const handleCompleteHabit = useCallback((habitId: string) => {
    if (profile?.habits) {
      const now = new Date().toISOString();
      setOptimisticPatch(prev => ({
        ...(prev ?? {}),
        habits: profile.habits.map(h =>
          h.id === habitId ? { ...h, lastCompleted: now, currentStreak: (h.currentStreak ?? 0) + 1 } : h
        ),
      }));
    }
    executeAtlasAction('complete_habit', {
      id: habitId,
      completedAt: new Date().toISOString()
    }, 'habit_completed');
  }, [profile?.habits, executeAtlasAction]);

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

  const handleCreateProject = useCallback((project: Partial<import('./services/atlas-profile-service').AtlasProject>) => {
    executeAtlasAction('create_project', {
      ...project,
    }, 'project_created');
  }, [executeAtlasAction]);

  const handleUpdateProject = useCallback((projectId: string, updates: Partial<import('./services/atlas-profile-service').AtlasProject>) => {
    executeAtlasAction('update_project', {
      id: projectId,
      ...updates,
    }, 'project_updated');
  }, [executeAtlasAction]);

  const handleDeleteProject = useCallback((projectId: string) => {
    executeAtlasAction('delete_project', {
      id: projectId,
    }, 'project_deleted');
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

  const handleCreateRecoveryWindow = useCallback((window: Partial<RecoveryWindow>) => {
    executeAtlasAction('create_recovery_window', {
      title: window.title ?? 'Recovery Window',
      start: window.start ?? new Date().toISOString(),
      end: window.end ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      reason: window.reason ?? 'Scheduled recovery',
      status: window.status ?? 'planned',
    }, 'recovery_window_created');
  }, [executeAtlasAction]);

  const handleUpdateRecoveryWindow = useCallback((windowId: string, updates: Partial<RecoveryWindow>) => {
    executeAtlasAction('update_recovery_window', { id: windowId, ...updates }, 'recovery_window_updated');
  }, [executeAtlasAction]);

  const handleDeleteRecoveryWindow = useCallback((windowId: string) => {
    executeAtlasAction('delete_recovery_window', { id: windowId }, 'recovery_window_deleted');
  }, [executeAtlasAction]);

  const handleUpdateRoutine = useCallback((updates: Record<string, unknown>) => {
    executeAtlasAction('update_routine', updates, 'routine_updated');
  }, [executeAtlasAction]);

  const handleScheduleTask = useCallback((taskId: string, date: string) => {
    executeAtlasAction('update_task', { id: taskId, scheduledSlot: date }, 'task_scheduled');
  }, [executeAtlasAction]);

  const handleUnscheduleTask = useCallback((taskId: string) => {
    executeAtlasAction('update_task', { id: taskId, scheduledSlot: null }, 'task_unscheduled');
  }, [executeAtlasAction]);

  const handleUpdateIntention = useCallback((updates: Record<string, unknown>) => {
    executeAtlasAction('set_daily_intention', updates, 'intention_updated');
  }, [executeAtlasAction]);

  /** Persist a weekly review snapshot to profile.reviews so the Review tab shows it. */
  const handleSaveWeeklyReview = useCallback((incomingBlueprint?: AtlasReviewBlueprint) => {
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
    // Read from ref so this callback doesn't need globalSoul as a dep.
    const soul = globalSoulRef.current;
    const cognitive = soul?.crossFunctionalState?.cognitive ?? {};
    const blueprint = incomingBlueprint ?? AtlasReviewService.buildActionableReview(profile, soul);
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
      resilienceTrend:
        blueprint.capacity.vectors.resilience >= 6.5
          ? 'improving'
          : blueprint.capacity.vectors.resilience <= 4.5
            ? 'declining'
            : 'stable',
      insights: [
        blueprint.projection.summary,
        ...blueprint.capacity.pressurePoints,
        ...blueprint.projection.recommendedActions.map((action) => action.title),
      ].slice(0, 5),
      driftScore: Number((blueprint.capacity.loadRatio * 10).toFixed(1)),
      nextPeriodFocus: blueprint.projection.nextPeriodFocus,
      blueprint,
    }, 'weekly_review_saved');
    handleReviewOpened();
  // globalSoul is read from globalSoulRef at call-time — no dep needed.
  }, [profile, executeAtlasAction, handleReviewOpened]);

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

  // Memoize the context actions object so AtlasActionsContext.value stays stable
  // across re-renders triggered by globalSoul writes. All individual handlers are
  // useCallback-wrapped — this object only recreates when a handler actually changes.
  const atlasActions = useMemo(() => ({
    onCompleteTask: handleCompleteTask,
    onUncompleteTask: handleUncompleteTask,
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
    onCreateRecoveryWindow: handleCreateRecoveryWindow,
    onUpdateRecoveryWindow: handleUpdateRecoveryWindow,
    onDeleteRecoveryWindow: handleDeleteRecoveryWindow,
    onCreateProject: handleCreateProject,
    onUpdateProject: handleUpdateProject,
    onDeleteProject: handleDeleteProject,
    onScheduleTask: handleScheduleTask,
    onUnscheduleTask: handleUnscheduleTask,
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
  }), [
    handleCompleteTask, handleUncompleteTask, handleCompleteHabit, handleUpdateGoalProgress,
    handlePauseHabit, handleCreateTask, handleCreateHabit, handleCreateGoal,
    handleUpdateTask, handleUpdateHabit, handleUpdateGoal,
    handleDeleteTask, handleDeleteHabit, handleDeleteGoal,
    handleCreateRecoveryWindow, handleUpdateRecoveryWindow, handleDeleteRecoveryWindow,
    handleCreateProject, handleUpdateProject, handleDeleteProject,
    handleScheduleTask, handleUnscheduleTask, handleUpdateRoutine, handleUpdateIntention,
    handleSaveFieldValue, handleRemoveFieldValue, handleAddField, handleDeleteField,
    ai.handleSendMessage, handleSaveWeeklyReview,
    setActiveTab, setActiveView, handleReviewOpened,
    handleMorningBriefDismiss, handleEveningCheckinDismiss,
  ]);

  return (
    <SingleAgentLayout
      moduleId="atlas"
      agentName={agentAlias}
      themeColor="sky"
      ai={ai}
      authMode="atlas"
      placeholder="Share task pressure or schedule constraints..."
      primaryAction={
        <AtlasActionRail
          quickAddAction={
            <QuickAddForm
              isFluid
              onCreateTask={handleCreateTask}
              onCreateHabit={handleCreateHabit}
              onCreateGoal={handleCreateGoal}
            />
          }
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
        <AtlasActionsProvider actions={atlasActions}>
          <EnhancedAtlasDashboard
            soul={globalSoul}
            profile={effectiveProfile}
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
