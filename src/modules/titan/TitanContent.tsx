import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AnalyticsTab } from './components/AnalyticsTab';
import { QuickLogDrawer } from './components/QuickLogDrawer';
import type { QuickLogPayload } from './components/QuickLogDrawer';
import { QuickLogBar } from './components/QuickLogBar';
import { LogConfirmCard } from './components/LogConfirmCard';
import { TitanProposalCard, type TitanProposal } from './components/TitanProposalCard';
import { RecoveryPlanModal } from './components/RecoveryPlanModal';
import type { RecoveryConsultResult } from './components/RecoveryPlanModal';
import { RecoveryBanner } from './components/RecoveryBanner';
import { RecoveryCheckinPanel } from './components/RecoveryCheckinPanel';
import { RecoveryManager } from './components/RecoveryManager';
import { TrainTab } from './tabs/TrainTab';
import { PlanTab } from './tabs/PlanTab';
import { BodyTab } from './tabs/BodyTab';
import { CyclesTab } from './tabs/CyclesTab';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  TitanProfile,
  WorkoutSession,
  PersonalRecord,
  SleepEntry,
  CycleEntry,
  BodyWeightEntry,
  CardioSession,
  CustomField,
  Routine,
  MealEntry,
  Injury,
  WorkoutGoal,
  PlannedWorkout,
  Weekday,
} from '@/lib/types';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { Spine } from '@/lib/spine/spine-event-bus';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile } from './services/titan-profile-service';
import { calculateE1RM } from './utils/e1rm';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { NeuralModal } from '@/core/components/NeuralModal';
import { Activity, RefreshCw, Zap, X, ShieldAlert, TrendingUp, Scale, Dumbbell, Trophy } from 'lucide-react';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import type { NexusHandoff } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';
import { ActionHub } from '@/lib/actions/action-hub';
import { TITAN_PERSONA } from './personas';
import { TitanNotificationSettingsPanel } from './components/TitanNotificationSettingsPanel';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';

// ── Custom hooks ──────────────────────────────────────────────────────────────
import type { TitanTab } from './hooks/types';
import { useTitanKeyboardLayout } from './hooks/useTitanKeyboardLayout';
import { useTitanSomaSync } from './hooks/useTitanSomaSync';
import { useTitanClearanceGate } from './hooks/useTitanClearanceGate';
import { useTitanRecovery } from './hooks/useTitanRecovery';
import { useTitanQuickLog } from './hooks/useTitanQuickLog';
import { activateBiomarkerMigration } from './services/titan-migration-service';

function resolveInitialTab(searchParams: URLSearchParams, recoveryActive: boolean): TitanTab {
  const param = searchParams.get('tab');
  const legacyMap: Record<string, TitanTab> = { training: 'train', progress: 'body', sleep: 'body' };
  const resolved = (param ? (legacyMap[param] ?? param) : null) as TitanTab | null;
  if (resolved === 'train' || resolved === 'plan' || resolved === 'body' || resolved === 'cycles' || resolved === 'analytics' || resolved === 'recovery') {
    if (resolved === 'recovery' && !recoveryActive) return 'train';
    return resolved;
  }
  return recoveryActive ? 'recovery' : 'train';
}

export function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible, getMasterKey, lockVault } = useVault();
  const { user, isGuest } = useAuth();
  const isLocked = !isModuleAccessible('titan');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const isRecoveryActive = Boolean(profile?.recoveryPlan?.active);
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams, isRecoveryActive));
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [calendarSelectedRoutine, setCalendarSelectedRoutine] = useState<Parameters<typeof TrainTab>[0]['calendarSelectedRoutine']>(null);
  const [activeProposal, setActiveProposal] = useState<TitanProposal | null>(null);
  const [showAdvisory, setShowAdvisory] = useState(false);
  const [isClearProgramModalOpen, setIsClearProgramModalOpen] = useState(false);
  const [planResetVersion, setPlanResetVersion] = useState(0);

  const directWrite = profile?.directWriteMode ?? false;
  const recoveryPlan = profile?.recoveryPlan ?? null;

  // ── Custom hooks ───────────────────────────────────────────────────────────
  const keyboardLayout = useTitanKeyboardLayout(activeTab);

  const { somaProfile, somaEncryptionKey: _somaEncryptionKey } = useTitanSomaSync(
    user?.uid,
    getMasterKey,
  );

  const clearanceGate = useTitanClearanceGate({
    profile,
    somaProfile,
    globalSoul,
    isRecoveryActive,
    encryptionKey,
    user,
  });

  const recovery = useTitanRecovery({
    profile,
    encryptionKey,
    user,
    somaProfile,
    globalSoul,
    isGuest,
    isRecoveryActive,
    setActiveTab,
    ai: { handleSendMessage: (msg: string) => ai.handleSendMessage(msg) },
  });

  const loadLatestPersistedProfile = useCallback(async (): Promise<TitanProfile | null> => {
    if (!user?.uid || !encryptionKey) return profile;
    try {
      return await loadTitanProfile({ userId: user.uid, encryptionKey }) ?? profile;
    } catch (error) {
      console.error('[Titan] Failed to load latest profile before save:', error);
      return profile;
    }
  }, [user?.uid, encryptionKey, profile]);

  const quickLog = useTitanQuickLog({
    profile,
    encryptionKey,
    user,
    isRecoveryActive,
    trainingGateState: clearanceGate.trainingGateState,
    loadLatestPersistedProfile,
    setRecoveryGate: clearanceGate.setRecoveryGate,
  });

  // ── AI ─────────────────────────────────────────────────────────────────────
  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PERSONA;
    return buildTitanSessionPrompt(profile, {
      mode: isRecoveryActive ? 'recovery' : 'training',
      recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
      hormonalContext: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
      somaProfile,
    });
  }, [profile, globalSoul?.crossFunctionalState?.biological?.recoveryScore, globalSoul?.crossFunctionalState?.biological?.hormonalContext, somaProfile, isRecoveryActive]);

  const ai = useModuleAI({ moduleId: 'titan', systemPrompt, encryptionKey });

  const openChatAndSend = useCallback((prompt: string) => {
    setIsChatCollapsed(false);
    ai.handleSendMessage(prompt);
  }, [ai.handleSendMessage]);

  // ── Existing exercises memo for QuickLogDrawer autocomplete ───────────────
  const existingExercises = useMemo(() => {
    const names = new Set<string>();
    for (const session of profile?.workoutSessions ?? []) {
      for (const ex of session.exercises) names.add(ex.exerciseName);
    }
    for (const routine of profile?.routines ?? []) {
      for (const ex of routine.exercises) names.add(ex.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [profile?.workoutSessions, profile?.routines]);

  // ── Spine: focus redirect (e.g. deep-link into a session) ─────────────────
  useEffect(() => {
    const focusId = (location.state as { focusId?: string } | null)?.focusId;
    if (!focusId) return;
    if (focusId.startsWith('session:')) setActiveTab('train');
  }, [location.state]);

  // ── Spine: AI proposal cards ───────────────────────────────────────────────
  useSpineEvent('TITAN_PROPOSAL', useCallback((event) => {
    const proposal = event.data as unknown as TitanProposal;
    if (proposal && (proposal.type === 'routine_proposal' || proposal.type === 'sleep_log_proposal' || proposal.type === 'workout_log_proposal')) {
      setActiveProposal(proposal);
    }
  }, []));

  // ── Spine: incoming module handoffs ───────────────────────────────────────
  const parseRecoveryConsult = useCallback((content: string): RecoveryConsultResult | null => {
    if (!content) return null;
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const json = JSON.parse(content.slice(start, end + 1)) as RecoveryConsultResult;
      if (!json.summary) return null;
      return json;
    } catch {
      return null;
    }
  }, []);

  const handleIncomingHandoff = useCallback((handoff: NexusHandoff) => {
    if (handoff.type === 'query_result' && handoff.content) {
      const parsed = parseRecoveryConsult(handoff.content);
      if (parsed && (handoff.sourceModuleId === 'soma' || handoff.sourceModuleId === 'agnes')) {
        if (handoff.sourceModuleId === 'soma') {
          recovery.setSomaConsult(parsed);
          recovery.setPendingConsults((prev) => ({ ...prev, soma: false }));
        } else {
          recovery.setAgnesConsult(parsed);
          recovery.setPendingConsults((prev) => ({ ...prev, agnes: false }));
        }
        return;
      }
    }

    if (handoff.type === 'delegate') {
      if (handoff.sourceModuleId === 'agnes') {
        openChatAndSend(`[Context from Agnes] ${handoff.content}`);
      } else if (handoff.sourceModuleId === 'atlas') {
        openChatAndSend(
          `[Atlas] A physical commitment was missed: "${handoff.content}". ` +
          `Should we reschedule or adjust the training plan?`,
        );
      } else {
        openChatAndSend(`[${handoff.sourceModuleId ?? 'System'}] ${handoff.content}`);
      }
      return;
    }

    if (handoff.type === 'query_result' && handoff.content) {
      openChatAndSend(`[Query Result from ${handoff.sourceModuleId ?? 'module'}] ${handoff.content}`);
    }
  }, [openChatAndSend, parseRecoveryConsult, recovery.setSomaConsult, recovery.setAgnesConsult, recovery.setPendingConsults]);

  useSpineEvent('MODULE_HANDOFF_RECEIVED', useCallback((event) => {
    const handoff = event.data as unknown as NexusHandoff;
    if (handoff && handoff.moduleId === 'titan') handleIncomingHandoff(handoff);
  }, [handleIncomingHandoff]));

  // ── Spine: commitment missed / financial stress (stays in coordinator) ─────
  const handledMiscEventsRef = useRef<Set<string>>(new Set());

  useSpineEvent('COMMITMENT_MISSED', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `commitment-missed-${event.id}`;
    if (handledMiscEventsRef.current.has(eventKey)) return;
    handledMiscEventsRef.current.add(eventKey);
    if (event.data?.domain !== 'physical' && event.domain !== 'B') return;
    const title = event.data?.commitmentTitle ?? event.data?.title ?? 'a physical commitment';
    ai.handleSendMessage(
      `[System] You missed ${title as string}. Should we adjust your training plan or reschedule this session?`,
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  useSpineEvent('FINANCIAL_STRESS', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `financial-stress-${event.id}`;
    if (handledMiscEventsRef.current.has(eventKey)) return;
    handledMiscEventsRef.current.add(eventKey);
    const rawLevel = (event.data?.stressLevel ?? event.data?.level) as number | undefined;
    const stressLevel = rawLevel ?? 0;
    if (stressLevel < 7) return;
    ai.handleSendMessage(
      `[System] Financial stress detected at ${stressLevel}/10. This is a cortisol contributor that compresses recovery capacity. Please factor this into today's training intensity and recovery recommendations.`,
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  // ── Cycle phase auto-advance ───────────────────────────────────────────────
  const isAutoAdvancingRef = useRef(false);
  useEffect(() => {
    if (isAutoAdvancingRef.current) return;
    if (!profile?.cycles?.length || !user || !encryptionKey) return;

    const today = new Date().toISOString().slice(0, 10);
    let needsUpdate = false;

    const updatedCycles = profile.cycles.map((cycle) => {
      if (cycle.status !== 'active') return cycle;
      const currentPhase = cycle.phases[cycle.currentPhaseIndex];
      if (!currentPhase?.durationDays) return cycle;

      const phaseStart = new Date(cycle.currentPhaseStartDate);
      const phaseEnd = new Date(phaseStart);
      phaseEnd.setDate(phaseStart.getDate() + currentPhase.durationDays);
      const phaseEndISO = phaseEnd.toISOString().slice(0, 10);

      if (today > phaseEndISO) {
        needsUpdate = true;
        const now = new Date().toISOString();
        const nextPhaseIndex = cycle.currentPhaseIndex + 1;
        if (nextPhaseIndex >= cycle.phases.length) {
          return { ...cycle, status: 'completed' as const, updatedAt: now };
        }
        return { ...cycle, currentPhaseIndex: nextPhaseIndex, currentPhaseStartDate: today, updatedAt: now };
      }
      return cycle;
    });

    if (!needsUpdate) return;

    isAutoAdvancingRef.current = true;
    const updated: TitanProfile = { ...profile, cycles: updatedCycles, updatedAt: new Date().toISOString() };
    saveTitanProfile(updated, { userId: user.uid, encryptionKey })
      .catch((e) => console.error('cycle auto-advance failed:', e))
      .finally(() => { isAutoAdvancingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cycles, user, encryptionKey]);

  // ── AI: seed opening message after onboarding ──────────────────────────────
  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      const hasRoutine = profile.routines && profile.routines.length > 0;
      ai.setMessages([{
        role: 'assistant',
        content: hasRoutine
          ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
          : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?",
      }]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, profile?.routines]);

  // ── Medical-data vault advisory (S21-015) ─────────────────────────────────
  useEffect(() => {
    const hasMedicalData = (
      (profile?.labSummaries?.length ?? 0) > 0 ||
      (profile?.medicalImageAnalyses?.length ?? 0) > 0 ||
      (profile?.medications?.length ?? 0) > 0
    );
    if (!hasMedicalData || !profile?.onboardingComplete || !isModuleAccessible('titan')) return;
    const sessionKey = `titan-vault-advisory-${user?.uid ?? 'guest'}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    setShowAdvisory(true);
  }, [
    profile?.labSummaries?.length,
    profile?.medicalImageAnalyses?.length,
    profile?.medications?.length,
    profile?.onboardingComplete,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);
  useEffect(() => {
    if (!showAdvisory) return;
    const timer = window.setTimeout(() => setShowAdvisory(false), 8000);
    return () => window.clearTimeout(timer);
  }, [showAdvisory]);

  // ── Biomarker migration (Titan → Soma, one-shot per profile load) ──────────
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (migrationRanRef.current) return;
    if (!profile || !somaProfile || !user?.uid || !encryptionKey) return;
    migrationRanRef.current = true;
    activateBiomarkerMigration({ titanProfile: profile, somaProfile, userId: user.uid, encryptionKey })
      .then((status) => {
        if (status.biomarkersMigrated > 0) {
          console.info(`[Titan] Migrated ${status.biomarkersMigrated} biomarker(s) → Soma.`);
        }
        if (status.errors.length > 0) {
          console.warn('[Titan] Biomarker migration partial errors:', status.errors);
        }
      })
      .catch((err) => console.error('[Titan] Biomarker migration failed:', err));
  }, [profile, somaProfile, user, encryptionKey]);

  // ── Proposal action handler ────────────────────────────────────────────────
  const handleProposalAction = useCallback(async (handler: string, data?: Record<string, unknown>) => {
    if (!user?.uid || !encryptionKey) throw new Error('Not authenticated');

    const actionMap: Record<string, string> = {
      log_sleep: 'log_sleep', saveSleepLog: 'log_sleep',
      log_workout_session: 'log_workout_session', commitWorkoutSession: 'log_workout_session',
      update_routine: 'update_routine', createRoutine: 'update_routine',
    };
    const actionType = actionMap[handler] ?? handler;
    let resolvedPayload: Record<string, unknown> = data ?? {};
    if (actionType === 'update_routine' && !Array.isArray(resolvedPayload.routines)) {
      resolvedPayload = { routines: [resolvedPayload] };
    }

    const success = await ActionHub.execute('titan', actionType, {
      moduleId: 'titan',
      payload: resolvedPayload,
      userId: user.uid,
      isGuest,
      encryptionKey,
      getLatestNSV: () => globalSoul?.crossFunctionalState ?? {},
      pushAssistantMessage: (msg: string) => { console.log('[Titan Proposal]', msg); },
      emitSpineEvent: (type, payload) => {
        Spine.emit({ type, source: 'titan', domain: 'B', data: payload, cascadeDepth: 0, priority: 'info' });
      },
      updateGlobalSoul: async () => {},
      delegateToModule: () => {},
    });

    if (!success) throw new Error(`Action "${actionType}" could not be found. Please try again.`);
    setActiveProposal(null);
  }, [user?.uid, isGuest, encryptionKey, globalSoul?.crossFunctionalState]);

  // ── Direct-write handlers ──────────────────────────────────────────────────
  const handleToggleDirectWrite = useCallback(async () => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, directWriteMode: !directWrite, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, directWrite, encryptionKey, user]);

  const handleDirectSaveBodyWeight = useCallback(async (entry: BodyWeightEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile({ ...profile, bodyWeightLog: [entry, ...(profile.bodyWeightLog ?? [])].slice(0, 1000), updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectSaveCardio = useCallback(async (session: CardioSession) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile({ ...profile, cardioLog: [session, ...(profile.cardioLog ?? [])].slice(0, 500), updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectSaveSleep = useCallback(async (entry: SleepEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile({ ...profile, sleepLog: [entry, ...(profile.sleepLog ?? [])].slice(0, 365), updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectSaveInjury = useCallback(async (injury: Injury) => {
    if (!profile || !encryptionKey || !user) return;
    const existingInjuries: Injury[] = (profile.history?.injuries ?? []).filter(
      (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i
    );
    const updatedHistory = {
      ...profile.history,
      injuries: [injury, ...existingInjuries].slice(0, 50),
    };
    await saveTitanProfile(
      { ...profile, history: updatedHistory, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey }
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdateInjury = useCallback(async (updated: Injury) => {
    if (!profile || !encryptionKey || !user) return;
    const existingInjuries: Injury[] = (profile.history?.injuries ?? []).filter(
      (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i
    );
    const updatedInjuries = existingInjuries.map((i) => (i.id === updated.id ? updated : i));
    const updatedHistory = { ...profile.history, injuries: updatedInjuries };
    await saveTitanProfile(
      { ...profile, history: updatedHistory, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey }
    );
  }, [profile, encryptionKey, user]);

  const handleDirectSaveMeal = useCallback(async (entry: MealEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, mealLog: [entry, ...(profile.mealLog ?? [])].slice(0, 2000), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectSavePlan = useCallback(async (plan: PlannedWorkout) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      {
        ...profile,
        plannedWorkouts: [plan, ...(profile.plannedWorkouts ?? [])].slice(0, 200),
        updatedAt: new Date().toISOString(),
      },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdatePlan = useCallback(async (updated: PlannedWorkout) => {
    if (!profile || !encryptionKey || !user) return;
    const existing = profile.plannedWorkouts ?? [];
    const idx = existing.findIndex(pw => pw.id === updated.id);
    const updatedList = idx >= 0
      ? existing.map((pw, i) => (i === idx ? updated : pw))
      : existing;
    await saveTitanProfile(
      { ...profile, plannedWorkouts: updatedList, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectSaveGoal = useCallback(async (goal: WorkoutGoal) => {
    if (!profile || !encryptionKey || !user) return;
    const existingGoals: WorkoutGoal[] = (profile.goals ?? []).filter(
      (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g
    );
    await saveTitanProfile(
      { ...profile, goals: [goal, ...existingGoals].slice(0, 50), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey }
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdateGoal = useCallback(async (updated: WorkoutGoal) => {
    if (!profile || !encryptionKey || !user) return;
    const existingGoals: WorkoutGoal[] = (profile.goals ?? []).filter(
      (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g
    );
    const updatedGoals = existingGoals.map((g) => (g.id === updated.id ? updated : g));
    await saveTitanProfile(
      { ...profile, goals: updatedGoals, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey }
    );
  }, [profile, encryptionKey, user]);

  const handleDirectCreateMacros = useCallback(async (fields: CustomField[]) => {
    if (!profile || !encryptionKey || !user) return;
    const existing = profile.customFields ?? [];
    const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));
    const newFields = fields.filter((f) => !existingNames.has(f.name.toLowerCase()));
    if (newFields.length === 0) return;
    await saveTitanProfile({ ...profile, customFields: [...existing, ...newFields].slice(0, 20), updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectCreateCycle = useCallback(async (cycle: CycleEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile({ ...profile, cycles: [...(profile.cycles ?? []), cycle], updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectDeleteCycle = useCallback(async (cycleId: string) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile({ ...profile, cycles: (profile.cycles ?? []).filter((c) => c.id !== cycleId), updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  // ── Session commit (shared by QuickLogDrawer and TrainTab) ─────────────────
  const commitWorkoutSession = useCallback(async (session: WorkoutSession, recoverySession?: boolean) => {
    if (!profile || !encryptionKey || !user) return;
    const latestProfile = await loadLatestPersistedProfile();
    if (!latestProfile) return;
    const sessionWithFlag = { ...session, recoverySession: recoverySession ?? session.recoverySession };
    const updatedSessions = [sessionWithFlag, ...(latestProfile.workoutSessions ?? [])].slice(0, 500);
    const updatedPRs: Record<string, PersonalRecord> = { ...(latestProfile.personalRecords ?? {}) };
    for (const exLog of sessionWithFlag.exercises) {
      const key = exLog.exerciseName.toLowerCase().trim();
      for (const s of exLog.sets) {
        if (!s.completed || !s.weight || !s.repsCompleted) continue;
        const e1RM = calculateE1RM(s.weight, s.repsCompleted);
        const existing = updatedPRs[key];
        if (!existing || e1RM > existing.e1RM) {
          updatedPRs[key] = { exerciseName: exLog.exerciseName, maxWeight: s.weight, repsAtMax: s.repsCompleted, e1RM, achievedDate: sessionWithFlag.date, sessionId: sessionWithFlag.id };
        }
      }
    }
    await saveTitanProfile({ ...latestProfile, workoutSessions: updatedSessions, personalRecords: updatedPRs, updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user, loadLatestPersistedProfile]);

  // ── Chat-prompt helpers ────────────────────────────────────────────────────
  const handleCalibrate = useCallback((metricKey: string) => {
    const key = metricKey as NSVMetricPath;
    const owner = getMetricOwner(key);
    const prompt = NSV_CALIBRATION_PROMPTS[key] || 'Share the missing metric value.';
    NexusHandoffService.store({ moduleId: owner, type: 'delegate', content: prompt, reason: 'calibration_request', sourceModuleId: 'titan', createdAt: new Date().toISOString() });
    const route = NexusRoutingService.getRoute(owner as ModuleId);
    if (route) navigate(route);
  }, [navigate]);

  const handleAnalyzeRoutine = useCallback((routine: Parameters<typeof PlanTab>[0]['onAnalyzeRoutine'] extends (r: infer R) => void ? R : never) => {
    const exerciseList = routine.exercises.map((ex, i) => `${i + 1}. **${ex.name}** — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`).join('\n');
    openChatAndSend([
      `Analyze my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}":`,
      routine.rationale ? `Rationale: ${routine.rationale}` : '',
      `\nExercises:\n${exerciseList}`,
      '\nIs this well-balanced? Any improvements for injury prevention or performance?',
    ].filter(Boolean).join('\n'));
  }, [openChatAndSend]);

  const handleGeneratePlan = useCallback(() => {
    openChatAndSend('Generate a personalized weekly training routine based on my profile, goals, and current recovery state.');
  }, [openChatAndSend]);

  const handleImportRoutine = useCallback(() => {
    openChatAndSend("I already have a training routine I'd like to log. Let me describe it to you.");
  }, [openChatAndSend]);

  const handleSubmitRoutineForApproval = useCallback((routine: Parameters<typeof PlanTab>[0]['onSubmitRoutineForApproval'] extends (r: infer R) => void ? R : never) => {
    const isEdit = (profile?.routines ?? []).some((r) => r.id === routine.id);
    const exerciseList = routine.exercises.map((ex, i) => `  ${i + 1}. ${ex.name} — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`).join('\n');
    const meta = [
      routine.rationale ? `Rationale: ${routine.rationale}` : null,
      routine.timeframe ? `Duration: ${routine.timeframe}` : null,
    ].filter(Boolean).join(' | ');
    openChatAndSend([
      isEdit ? `I've edited my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}".` : `I've manually built a new ${routine.weekday?.toUpperCase() || ''} routine: "${routine.name}".`,
      meta,
      `\nExercises:\n${exerciseList}`,
      '\nPlease review this against my current goals, recovery state, and training history.',
      'If it is appropriate and well-structured, commit it now using the update_routine action.',
      'If you have concerns or improvements, raise them first — but be concise.',
    ].filter(Boolean).join('\n'));
  }, [profile?.routines, openChatAndSend]);

  const handleApplyProgram = useCallback(async (routines: Routine[], programName: string, programId?: string, durationWeeks: number = 12, phases?: { name: string; weeks: [number, number] }[]) => {
    if (!profile || !encryptionKey || !user) return;

    // Always apply program templates as direct writes — they're static trusted data.
    const existingNames = new Set((profile.routines ?? []).map((r) => r.name));
    const incoming = routines.filter((r) => !existingNames.has(r.name));
    const merged = [...incoming, ...(profile.routines ?? [])];

    // Generate planned workouts for the next 4 weeks based on the applied routines
    const today = new Date();
    const plannedWorkouts: PlannedWorkout[] = [...(profile.plannedWorkouts ?? [])];
    const generatedIds = new Set(plannedWorkouts.map(pw => `${pw.date}:${pw.routineName}`));

    // Only generate for incoming routines (so we don't double-schedule existing ones)
    // Actually, we should generate for ALL routines in the program to be safe
    const routinesToSchedule = routines;

    for (let i = 0; i < 28; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        // "monday", "tuesday", etc.
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as Weekday;
        
        // Find routines that run on this day
        const dayRoutines = routinesToSchedule.filter(r => r.weekday === dayName);
        
        for (const routine of dayRoutines) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dayStr = String(d.getDate()).padStart(2, '0');
            const isoDate = `${y}-${m}-${dayStr}`;

            const uniqueKey = `${isoDate}:${routine.name}`;
            if (generatedIds.has(uniqueKey)) continue;

            plannedWorkouts.push({
                id: crypto.randomUUID(),
                date: isoDate,
                routineName: routine.name,
                exerciseNames: routine.exercises.map(e => e.name),
                status: 'planned',
                createdAt: new Date().toISOString()
            });
            generatedIds.add(uniqueKey);
        }
    }

    const activeProgram = {
      id: programId ?? programName.toLowerCase().replace(/\s+/g, '-'),
      name: programName,
      startDate: new Date().toISOString(),
      durationWeeks,
      phases,
    };

    await saveTitanProfile(
      { 
        ...profile, 
        routines: merged, 
        plannedWorkouts: plannedWorkouts.slice(0, 200),
        activeProgram,
        updatedAt: new Date().toISOString() 
      },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, directWrite, encryptionKey, user]);

  const handleClearProgram = useCallback(() => {
    setIsClearProgramModalOpen(true);
  }, []);

  const handleConfirmClearProgram = useCallback(async () => {
    if (!profile || !encryptionKey || !user) {
      setIsClearProgramModalOpen(false);
      return;
    }
    
    await saveTitanProfile(
      { 
        ...profile, 
        routines: [], 
        activeProgram: undefined,
        plannedWorkouts: [],
        updatedAt: new Date().toISOString() 
      },
      { userId: user.uid, encryptionKey },
    );
    setPlanResetVersion((prev) => prev + 1);
    setIsClearProgramModalOpen(false);
  }, [profile, encryptionKey, user]);

  const handleUpdateProgram = useCallback(async (updates: Partial<NonNullable<TitanProfile['activeProgram']>>) => {
    if (!profile || !encryptionKey || !user || !profile.activeProgram) return;
    
    await saveTitanProfile(
      { 
        ...profile, 
        activeProgram: { ...profile.activeProgram, ...updates },
        updatedAt: new Date().toISOString() 
      },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleSubmitCustomFieldsForApproval = useCallback((values: Record<string, unknown>, categoryLabel: string) => {
    const nonEmpty = Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (nonEmpty.length === 0) return;
    openChatAndSend([
      `I want to update my custom ${categoryLabel} tracking fields:`,
      nonEmpty.map(([key, val]) => `  • ${key}: ${val}`).join('\n'),
      'Please review these values against my current goals and nutrition context.',
      'If they look correct and relevant, commit them via the update_titan_profile action.',
      'Flag anything that looks inconsistent or out of range.',
    ].join('\n'));
  }, [openChatAndSend]);

  // ── Tab configuration ──────────────────────────────────────────────────────
  const activeCycleCount = (profile?.cycles ?? []).filter((c) => c.status === 'active').length;
  const prCount = Object.keys(profile?.personalRecords ?? {}).length;

  const tabs: NeuralTabItem<TitanTab>[] = isRecoveryActive
    ? [
        { id: 'recovery' as const, label: 'Recovery', icon: ShieldAlert },
        { id: 'body' as const, label: 'Body', icon: Scale, badge: prCount > 0 ? prCount : undefined },
        { id: 'cycles' as const, label: 'Cycles', icon: RefreshCw, badge: activeCycleCount > 0 ? activeCycleCount : undefined },
      ]
    : [
        { id: 'train' as const, label: 'Train', icon: Activity },
        { id: 'plan' as const, label: 'Plan', icon: Dumbbell },
        { id: 'analytics' as const, label: 'Analytics', icon: TrendingUp },
        { id: 'body' as const, label: 'Body', icon: Scale, badge: prCount > 0 ? prCount : undefined },
        { id: 'cycles' as const, label: 'Cycles', icon: RefreshCw, badge: activeCycleCount > 0 ? activeCycleCount : undefined },
      ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'recovery':
        return (
          <RecoveryManager
            recoveryPlan={recoveryPlan}
            daysRemaining={recovery.daysRemaining}
            hasCheckinToday={recovery.hasCheckinToday}
            onResume={() => recovery.setIsResumeModalOpen(true)}
            onSaveCheckin={recovery.handleSaveRecoveryCheckin}
            onOpenQuickLog={() => {
              quickLog.setQuickLogIsRecovery(true);
              quickLog.setQuickLogDate(new Date());
              quickLog.setIsQuickLogOpen(true);
            }}
          />
        );
      case 'analytics':
        return <AnalyticsTab profile={profile} />;
      case 'body':
        return (
          <BodyTab
            profile={profile}
            encryptionKey={encryptionKey}
            directWriteMode={directWrite}
            onAnalyze={openChatAndSend}
            onDirectSaveBodyWeight={handleDirectSaveBodyWeight}
            onDirectSaveCardio={handleDirectSaveCardio}
            onDirectSaveSleep={handleDirectSaveSleep}
            mealLog={profile?.mealLog}
            macroTargets={profile?.nutrition?.macroEstimate}
            onDirectSaveMeal={handleDirectSaveMeal}
            onDirectSaveInjury={handleDirectSaveInjury}
            onDirectUpdateInjury={handleDirectUpdateInjury}
            goals={profile?.goals}
            onDirectSaveGoal={handleDirectSaveGoal}
            onDirectUpdateGoal={handleDirectUpdateGoal}
          />
        );
      case 'cycles':
        return (
          <CyclesTab
            cycles={profile?.cycles ?? []}
            directWriteMode={directWrite}
            onSubmitForApproval={openChatAndSend}
            onDirectCreate={handleDirectCreateCycle}
            onDirectDelete={handleDirectDeleteCycle}
          />
        );
      case 'plan':
        return (
          <PlanTab
            key={`plan-${planResetVersion}`}
            profile={profile}
            directWriteMode={directWrite}
            onAnalyzeRoutine={handleAnalyzeRoutine}
            onGeneratePlan={handleGeneratePlan}
            onImportRoutine={handleImportRoutine}
            onSubmitRoutineForApproval={handleSubmitRoutineForApproval}
            onStartSession={(routine) => {
              setCalendarSelectedRoutine(routine);
              setActiveTab('train');
            }}
            onSubmitCustomFieldsForApproval={handleSubmitCustomFieldsForApproval}
            onDirectCreateMacros={handleDirectCreateMacros}
            onApplyProgram={handleApplyProgram}
            onClearProgram={handleClearProgram}
            onUpdateProgram={handleUpdateProgram}
            plannedWorkouts={profile?.plannedWorkouts}
            completedSessions={profile?.workoutSessions}
            onDirectSavePlan={handleDirectSavePlan}
            onDirectUpdatePlan={handleDirectUpdatePlan}
            onAnalyzePlan={ai.handleSendMessage}
          />
        );
      case 'train':
        return (
          <TrainTab
            profile={profile}
            somaProfile={somaProfile}
            globalSoul={globalSoul}
            isLocked={isLocked}
            isRecoveryActive={isRecoveryActive}
            clearanceStatus={clearanceGate.trainingGateState.clearanceStatus}
            clearanceMessage={clearanceGate.trainingGateState.enforcementReason}
            activeDebtCount={clearanceGate.trainingGateState.activeDebtCount}
            readinessPresentationMode={clearanceGate.trainingGateState.presentationMode}
            directWriteMode={directWrite}
            advisoryBanner={clearanceGate.advisoryBanner}
            onDismissAdvisory={() => clearanceGate.setAdvisoryBanner(null)}
            calendarSelectedRoutine={calendarSelectedRoutine}
            onCalendarRoutineSelect={setCalendarSelectedRoutine}
            plannedWorkouts={profile?.plannedWorkouts}
            onOpenQuickLog={(date, isRecovery) => {
              quickLog.setQuickLogDate(date);
              quickLog.setQuickLogIsRecovery(isRecovery);
              quickLog.setIsQuickLogOpen(true);
            }}
            onRemindDate={quickLog.setRemindDate}
            onCalibrate={handleCalibrate}
            onOpenChatAndSend={openChatAndSend}
            guardRecoveryAction={clearanceGate.guardRecoveryAction}
            commitWorkoutSession={commitWorkoutSession}
            onSetAdvisoryBanner={clearanceGate.setAdvisoryBanner}
          />
        );
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <SingleAgentLayout
        moduleId="titan"
        agentName={agentAlias}
        themeColor="module"
        ai={ai}
        authMode="titan"
        placeholder="Input training data or queries..."
        isChatCollapsed={isChatCollapsed}
        onToggleChat={setIsChatCollapsed}
        hideChatTrigger={activeTab === 'train'}
        aboveInput={
          activeProposal ? (
            <div className="px-3 sm:px-4 pb-2">
              <TitanProposalCard
                proposal={activeProposal}
                onAction={handleProposalAction}
                onDismiss={() => setActiveProposal(null)}
              />
            </div>
          ) : null
        }
      >
        <div className="titan-theme flex flex-col h-full min-h-0 relative">
          <div className="shrink-0 px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 pb-3 sm:pb-4 md:pb-5">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                label={isRecoveryActive ? 'Recovery Mode' : 'Performance Domain'}
                title={isRecoveryActive ? 'Recovery Protocol Active' : 'Titan Strategy & Readiness'}
                subtitle={isRecoveryActive ? 'Focused on recovery tracking, body metrics, and cycle management.' : 'Elite physical performance optimization and biometric clearance.'}
                accentClassName="text-[var(--module-color-400)]"
              />
            </div>
          </div>

          {isRecoveryActive && recoveryPlan && (
            <div className="shrink-0">
              <RecoveryBanner
                plan={recoveryPlan}
                daysRemaining={recovery.daysRemaining}
                onOpenCheckin={() => setActiveTab('recovery')}
                onViewPlan={() => setActiveTab('recovery')}
                onResume={() => recovery.setIsResumeModalOpen(true)}
              />
            </div>
          )}

          <div className="shrink-0 border-b border-white/5 px-4 pb-4 sm:px-6 sm:pb-5 md:px-8 md:pb-6">
            <div className="relative flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 overflow-x-auto no-scrollbar mask-edges-horizontal">
                <NeuralTabGroup
                  tabs={tabs}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  themeColor="module"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:justify-end">
                <ModuleReminderEntry
                  title="Titan"
                  themeColor="orange"
                  panel={<TitanNotificationSettingsPanel />}
                  compact
                  iconOnly
                />
                {!isRecoveryActive && (
                  <>
                    <NeuralButton
                      variant="secondary"
                      size="sm"
                      onClick={() => recovery.openRecoveryModal(null)}
                      className="min-h-9 rounded-xl px-3.5 text-[11px] font-semibold tracking-[0.02em]"
                    >
                      Start Recovery
                    </NeuralButton>

                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] sm:text-xs">
                      <span className="font-medium text-white/45">
                        {directWrite ? 'Direct Logbook' : 'Coach Review'}
                      </span>
                      <NeuralToggle
                        checked={directWrite}
                        onChange={handleToggleDirectWrite}
                        color="orange"
                        label={directWrite ? 'Direct Logbook Mode: sessions save instantly' : 'Coach Review Mode: Titan reviews session updates before commit'}
                      />
                      <Zap className={cn('h-3.5 w-3.5 transition-colors', directWrite ? 'text-[var(--module-color-400)]' : 'text-white/30')} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            role="tabpanel"
            id={`tab-panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className={cn(
              'flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-visible no-scrollbar pt-4 sm:pt-5 md:pt-6',
              activeTab === 'train' && 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]',
            )}
            style={
              activeTab === 'train' && keyboardLayout.quickLogBarHeight > 0
                ? { paddingBottom: Math.max(keyboardLayout.quickLogBarHeight, 16) }
                : undefined
            }
          >
            <div className="flex-1 w-full overflow-x-hidden flex flex-col min-h-0">
              {renderTabContent()}
            </div>

            {activeTab === 'train' && (
              <div
                className="fixed left-0 bottom-0 z-[var(--z-fab)] transition-[right] duration-300 ease-out"
                style={{
                  right: 'var(--spine-sidebar-width, 0px)',
                  ...(keyboardLayout.keyboardOffset > 0 ? { bottom: `${keyboardLayout.keyboardOffset}px` } : {}),
                }}
              >
                <div className="relative w-full">
                  <AnimatePresence>
                    {quickLog.pendingLogEntries.length > 0 && (
                      <LogConfirmCard
                        entries={quickLog.pendingLogEntries}
                        onCommit={quickLog.handleQuickLogBarCommit}
                        onEdit={() => { quickLog.setPendingLogEntries([]); }}
                        onDismiss={() => {
                          quickLog.setPendingLogEntries([]);
                        }}
                        commitError={quickLog.quickLogCommitError}
                      />
                    )}
                  </AnimatePresence>
                  <div ref={keyboardLayout.quickLogBarRef}>
                    <QuickLogBar
                      value={quickLog.quickLogBarInput}
                      onChange={quickLog.setQuickLogBarInput}
                      onSubmit={quickLog.handleQuickLogBarSubmit}
                      onOpenChat={() => setIsChatCollapsed(false)}
                      onManualLog={() => {
                        quickLog.setQuickLogDate(new Date());
                        quickLog.setQuickLogIsRecovery(isRecoveryActive);
                        quickLog.setIsQuickLogOpen(true);
                      }}
                      onCardioLog={() => setActiveTab('body')}
                      recentSessions={profile?.workoutSessions ?? []}
                      disabled={quickLog.pendingLogEntries.length > 0}
                      onFocusChange={keyboardLayout.setIsQuickLogFocused}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SingleAgentLayout>

      <RecoveryPlanModal
        isOpen={recovery.isRecoveryModalOpen}
        onClose={() => {
          recovery.setIsRecoveryModalOpen(false);
          recovery.setPendingConsults({ soma: false, agnes: false });
        }}
        onConfirm={recovery.handleSaveRecoveryPlan}
        recoveryScore={globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null}
        draft={recovery.recoveryDraft}
        somaConsult={recovery.somaConsult}
        agnesConsult={recovery.agnesConsult}
        pendingConsults={recovery.pendingConsults}
        onRequestConsults={recovery.requestRecoveryConsults}
        onOpenModule={(moduleId) => {
          const route = NexusRoutingService.getRoute(moduleId);
          if (route) navigate(route);
        }}
      />

      <NeuralModal
        isOpen={recovery.isResumeModalOpen}
        onClose={() => recovery.setIsResumeModalOpen(false)}
        title="Resume Training"
        subtitle="Final recovery check-in"
        icon={ShieldAlert}
        themeColor="module"
        maxWidth="md"
      >
        <RecoveryCheckinPanel
          allowSkip={false}
          onSubmit={async (payload) => {
            await recovery.handleSaveRecoveryCheckin(payload);
            await recovery.handleResumeTraining();
          }}
          onSkip={() => {}}
        />
      </NeuralModal>

      <NeuralModal
        isOpen={!!clearanceGate.recoveryGate}
        onClose={() => clearanceGate.setRecoveryGate(null)}
        title={clearanceGate.recoveryGate?.mode === 'clearance' ? 'Soma Clearance Enforcement' : 'Recovery Mode Active'}
        subtitle={clearanceGate.recoveryGate?.mode === 'clearance' ? 'Choose a compliant response' : 'Choose how to log this session'}
        icon={ShieldAlert}
        themeColor="module"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            {clearanceGate.recoveryGate?.message ?? "You're in recovery mode. Log this as a light recovery session or continue with full training."}
          </p>
          <div className="flex flex-col gap-2">
            <NeuralButton
              variant="primary"
              onClick={async () => {
                const action = clearanceGate.recoveryGate?.onLight;
                clearanceGate.setRecoveryGate(null);
                await action?.();
              }}
            >
              {clearanceGate.recoveryGate?.mode === 'clearance' ? 'Log Recovery Instead' : 'Log Light Recovery Session'}
            </NeuralButton>
            {clearanceGate.recoveryGate?.mode === 'clearance' ? (
              <NeuralButton
                variant="secondary"
                onClick={clearanceGate.handleOverrideSomaVeto}
                disabled={!clearanceGate.recoveryGate.allowOverride}
              >
                Override Soma Veto
              </NeuralButton>
            ) : (
              <NeuralButton
                variant="secondary"
                onClick={async () => {
                  const action = clearanceGate.recoveryGate?.onFull;
                  clearanceGate.setRecoveryGate(null);
                  await action?.();
                }}
              >
                Proceed with Full Training
              </NeuralButton>
            )}
            <NeuralButton variant="ghost" onClick={() => clearanceGate.setRecoveryGate(null)}>
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      <NeuralModal
        isOpen={isClearProgramModalOpen}
        onClose={() => setIsClearProgramModalOpen(false)}
        title="Clear Program"
        subtitle="Remove all planned routines and scheduled workouts"
        themeColor="module"
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/70">
            This action cannot be undone. Your weekly routines, active program, and planned workouts will be deleted.
          </p>
          <div className="flex items-center justify-end gap-3">
            <NeuralButton
              variant="ghost"
              onClick={() => setIsClearProgramModalOpen(false)}
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="danger"
              onClick={() => void handleConfirmClearProgram()}
            >
              Clear Program
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      <QuickReminderModal
        open={!!quickLog.remindDate}
        moduleId="titan"
        defaultTitle={quickLog.remindDate ? `Workout session: ${quickLog.remindDate}` : ''}
        defaultNote="Reminder to log or complete your workout session."
        deepLink={quickLog.remindDate ? { route: '/titan', focusId: `session:${quickLog.remindDate}` } : undefined}
        source={quickLog.remindDate ? { moduleId: 'titan', entityType: 'session', entityId: quickLog.remindDate, label: `Workout ${quickLog.remindDate}` } : undefined}
        onClose={() => quickLog.setRemindDate(null)}
      />

      <QuickLogDrawer
        isOpen={quickLog.isQuickLogOpen}
        onClose={() => {
          quickLog.setIsQuickLogOpen(false);
          quickLog.setQuickLogIsRecovery(false);
        }}
        selectedDate={quickLog.quickLogDate}
        existingExercises={existingExercises}
        recoverySession={quickLog.quickLogIsRecovery}
        onCommit={async (payload: QuickLogPayload) => {
          if (!profile || !encryptionKey || !user) return;

          const handleCommit = async (isRecovery: boolean) => {
            if ('exercises' in payload) {
              await commitWorkoutSession({ ...payload, recoverySession: isRecovery }, isRecovery);
            } else {
              const latestProfile = await loadLatestPersistedProfile();
              if (!latestProfile) return;
              const record = payload;
              const updatedPRs: Record<string, PersonalRecord> = { ...(latestProfile.personalRecords ?? {}) };
              const key = record.exerciseName.toLowerCase().trim();
              const existing = updatedPRs[key];
              if (!existing || record.e1RM > existing.e1RM) {
                updatedPRs[key] = { exerciseName: record.exerciseName, maxWeight: record.weight, repsAtMax: record.reps, e1RM: record.e1RM, achievedDate: record.date, sessionId: record.exerciseId };
              }
              const now = new Date().toISOString();
              const session: WorkoutSession = {
                id: `ql-${Date.now()}`,
                routineId: 'quick-log',
                routineName: 'Quick Log',
                date: record.date,
                startedAt: now,
                completedAt: now,
                exercises: [{ exerciseName: record.exerciseName, plannedSets: 1, plannedReps: String(record.reps), sets: [{ setNumber: 1, weight: record.weight, repsCompleted: record.reps, completed: true }] }],
                recoverySession: isRecovery,
                status: 'completed',
              };
              await saveTitanProfile({ ...latestProfile, workoutSessions: [session, ...(latestProfile.workoutSessions ?? [])].slice(0, 500), personalRecords: updatedPRs, updatedAt: new Date().toISOString() }, { userId: user.uid, encryptionKey });
            }
          };

          if ((clearanceGate.trainingGateState.shouldBlockFullTraining || isRecoveryActive) && !quickLog.quickLogIsRecovery) {
            clearanceGate.setRecoveryGate({
              onLight: () => handleCommit(true),
              onFull: () => handleCommit(false),
              mode: clearanceGate.trainingGateState.shouldBlockFullTraining ? 'clearance' : 'recovery',
              message: clearanceGate.trainingGateState.enforcementReason ?? "You're in recovery mode. Log this as a light recovery session or continue with full training.",
              allowOverride: clearanceGate.trainingGateState.shouldRequireExplicitOverride,
            });
            return;
          }
          await handleCommit(quickLog.quickLogIsRecovery);
        }}
      />

      {/* ── Recovery complete celebration toast ───────────────────────── */}
      <AnimatePresence>
        {recovery.recoveryCompleteMessage && (
          <motion.div
            key="recovery-complete"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-[var(--z-toast)] w-[340px] max-w-[calc(100vw-3rem)] rounded-2xl border border-emerald-500/30 bg-[#05050a]/95 backdrop-blur-xl p-4 shadow-2xl pointer-events-auto"
          >
            <div className="flex items-start gap-3">
              <Trophy className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-bold leading-snug">Recovery complete</p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{recovery.recoveryCompleteMessage}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Medical-data vault advisory toast (S21-015) ──────────────────── */}
      <AnimatePresence>
        {showAdvisory && (
          <motion.div
            key="vault-advisory"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            role="alert"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-[var(--z-toast)] w-[340px] max-w-[calc(100vw-3rem)] rounded-2xl border border-[var(--module-accent-border)] bg-[#05050a]/95 backdrop-blur-xl p-4 shadow-2xl pointer-events-auto"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-[var(--module-color-400)]" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-bold leading-snug">Medical data is unprotected</p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">Your Titan profile contains lab reports or clinical data. Lock the vault to encrypt it.</p>
                <button
                  onClick={() => { lockVault(); setShowAdvisory(false); }}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-[var(--module-accent-muted)] hover:bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] text-[11px] font-semibold text-[var(--module-color-300)] transition-colors"
                  aria-label="Lock vault now"
                >
                  Lock Vault
                </button>
              </div>
              <button
                onClick={() => setShowAdvisory(false)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors"
                aria-label="Dismiss advisory"
              >
                <X className="w-3 h-3 text-white/50" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
