import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AnalyticsTab } from './components/AnalyticsTab';
import { QuickLogDrawer } from './components/QuickLogDrawer';
import type { QuickLogPayload } from './components/QuickLogDrawer';
import { QuickLogBar } from './components/QuickLogBar';
import { LogConfirmCard } from './components/LogConfirmCard';
import { TitanProposalCard, TitanProposalSkeleton, extractProposalFromMessage, type TitanProposal } from './components/TitanProposalCard';
import { RecoveryPlanModal } from './components/RecoveryPlanModal';
import type { RecoveryPlanDraft, RecoveryConsultResult } from './components/RecoveryPlanModal';
import { RecoveryBanner } from './components/RecoveryBanner';
import { RecoveryCheckinPanel } from './components/RecoveryCheckinPanel';
import { RecoveryManager } from './components/RecoveryManager';
import { parseQuickLogInput } from './utils/quick-log-parser';
import type { ParsedEntry } from './utils/quick-log-parser';
import { calculateE1RM } from './utils/e1rm';
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
  Routine,
  Exercise,
  WorkoutSession,
  PersonalRecord,
  SomaProfile,
  ExerciseLog,
  SleepEntry,
  CycleEntry,
  BodyWeightEntry,
  CardioSession,
  CustomField,
  TitanRecoveryPlan,
  TitanRecoveryCheckin,
  TitanRecoveryReason,
  TitanRecoveryBodyRegion
} from '@/lib/types';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile } from './services/titan-profile-service';
import { subscribeSomaProfile } from '../soma/services/soma-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { NeuralModal } from '@/core/components/NeuralModal';
import { Activity, RefreshCw, Zap, X, ShieldAlert, TrendingUp, Scale, Dumbbell } from 'lucide-react';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import type { NexusHandoff } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { TITAN_PERSONA } from './personas';
import { useUIStore } from '@/lib/stores/ui-store';
import { TitanNotificationSettingsPanel } from './components/TitanNotificationSettingsPanel';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';
import {
  getTitanTrainingGateState,
  recordSomaVetoOverride,
  resolveSystemDebtsForGrantedClearance,
} from './services/titan-clearance-debt-service';

type TitanTab = 'train' | 'plan' | 'body' | 'cycles' | 'analytics' | 'recovery';

function resolveInitialTab(searchParams: URLSearchParams, recoveryActive: boolean): TitanTab {
  const param = searchParams.get('tab');
  // Backward-compat: map old tab names to new ones
  const legacyMap: Record<string, TitanTab> = { training: 'train', progress: 'body', sleep: 'body' };
  const resolved = (param ? (legacyMap[param] ?? param) : null) as TitanTab | null;
  if (resolved === 'train' || resolved === 'plan' || resolved === 'body' || resolved === 'cycles' || resolved === 'analytics' || resolved === 'recovery') {
    if (resolved === 'recovery' && !recoveryActive) return 'train';
    return resolved;
  }
  return recoveryActive ? 'recovery' : 'train';
}

type TrainingGateRequest = {
  onLight: () => void | Promise<void>;
  onFull: () => void | Promise<void>;
  mode: 'recovery' | 'clearance';
  message: string;
  allowOverride: boolean;
};

export function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible, getMasterKey, lockVault } = useVault();
  const { user, isGuest } = useAuth();
  const isLocked = !isModuleAccessible('titan');

  // ── Medical-data vault advisory (S21-015) ─────────────────────────────────
  const [showAdvisory, setShowAdvisory] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isRecoveryActive = Boolean(profile?.recoveryPlan?.active);
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams, isRecoveryActive));
  const setModuleBottomBarHeight = useUIStore((s) => s.setModuleBottomBarHeight);
  const setHideGlobalFAB = useUIStore((s) => s.setHideGlobalFAB);
  const [calendarSelectedRoutine, setCalendarSelectedRoutine] = useState<Routine | null>(null);
  const quickLogBarRef = useRef<HTMLDivElement>(null);
  const [quickLogBarHeight, setQuickLogBarHeight] = useState(0);
  const [isQuickLogFocused, setIsQuickLogFocused] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Synchronously measure QuickLogBar height and propagate to the UI store BEFORE
  // the browser paints. Prevents the chat FAB from rendering behind the QuickLogBar.
  useLayoutEffect(() => {
    if (activeTab !== 'train') {
      setQuickLogBarHeight(0);
      setModuleBottomBarHeight(0);
      setHideGlobalFAB(false);
      return;
    }

    setHideGlobalFAB(true);

    const measure = () => {
      const el = quickLogBarRef.current;
      const h = el ? el.getBoundingClientRect().height : 0;
      setQuickLogBarHeight(h);
      setModuleBottomBarHeight(Math.round(Math.max(0, h + keyboardOffset)));
    };

    measure();

    const el = quickLogBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => {
      observer.disconnect();
      setModuleBottomBarHeight(0);
      setHideGlobalFAB(false);
    };
  }, [activeTab, keyboardOffset, setModuleBottomBarHeight, setHideGlobalFAB]);

  useEffect(() => {
    if (!isQuickLogFocused) {
      setKeyboardOffset(0);
      return;
    }
    if (typeof window === 'undefined' || !window.visualViewport) {
      setKeyboardOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    const updateOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };

    updateOffset();
    viewport.addEventListener('resize', updateOffset);
    viewport.addEventListener('scroll', updateOffset);
    window.addEventListener('resize', updateOffset);

    return () => {
      viewport.removeEventListener('resize', updateOffset);
      viewport.removeEventListener('scroll', updateOffset);
      window.removeEventListener('resize', updateOffset);
    };
  }, [isQuickLogFocused]);

  useEffect(() => {
    const focusId = (location.state as { focusId?: string } | null)?.focusId;
    if (!focusId) return;
    if (focusId.startsWith('session:')) {
      setActiveTab('train');
    }
  }, [location.state]);

  useEffect(() => {
    if (isRecoveryActive) {
      // In recovery mode only recovery, body, and cycles are valid tabs
      setActiveTab((prev) =>
        prev === 'recovery' || prev === 'body' || prev === 'cycles' ? prev : 'recovery'
      );
    }
  }, [isRecoveryActive]);

  const [somaProfile, setSomaProfile] = useState<SomaProfile | null>(null);
  const [somaEncryptionKey, setSomaEncryptionKey] = useState<CryptoKey | null>(null);

  // ── Quick-log drawer ───────────────────────────────────────────────────────
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [quickLogDate, setQuickLogDate] = useState<Date | null>(null);
  const [remindDate, setRemindDate] = useState<string | null>(null);
  const [quickLogIsRecovery, setQuickLogIsRecovery] = useState(false);

  // ── Recovery mode ────────────────────────────────────────────────────────
  const recoveryPlan = profile?.recoveryPlan ?? null;
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryPlanDraft | null>(null);
  const [somaConsult, setSomaConsult] = useState<RecoveryConsultResult | null>(null);
  const [agnesConsult, setAgnesConsult] = useState<RecoveryConsultResult | null>(null);
  const [pendingConsults, setPendingConsults] = useState({ soma: false, agnes: false });
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [recoveryGate, setRecoveryGate] = useState<TrainingGateRequest | null>(null);

  // ── Fast Quick-Log bar (inline natural-language entry) ─────────────────────
  const [quickLogBarInput, setQuickLogBarInput] = useState('');
  const [pendingLogEntries, setPendingLogEntries] = useState<ParsedEntry[]>([]);
  const [quickLogCommitError, setQuickLogCommitError] = useState<string | null>(null);

  // ── AI Proposal handling ──────────────────────────────────────────────────
  const [activeProposal, setActiveProposal] = useState<TitanProposal | null>(null);

  const existingExercises = useMemo(() => {
    const names = new Set<string>();
    for (const session of profile?.workoutSessions ?? []) {
      for (const ex of session.exercises) {
        names.add(ex.exerciseName);
      }
    }
    for (const routine of profile?.routines ?? []) {
      for (const ex of routine.exercises) {
        names.add(ex.name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [profile?.workoutSessions, profile?.routines]);

  useEffect(() => {
    let cancelled = false;
    getMasterKey().then((key) => {
      if (!cancelled) setSomaEncryptionKey(key);
    });
    return () => { cancelled = true; };
  }, [getMasterKey]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeSomaProfile({ userId: user.uid, encryptionKey: somaEncryptionKey }, setSomaProfile);
    return unsub;
  }, [user?.uid, somaEncryptionKey]);

  const trainingGateState = useMemo(() => getTitanTrainingGateState({
    profile,
    somaProfile,
    recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
    cnsFatigue: globalSoul?.crossFunctionalState?.biological?.cnsFatigue ?? null,
    isRecoveryActive,
  }), [
    profile,
    somaProfile,
    globalSoul?.crossFunctionalState?.biological?.recoveryScore,
    globalSoul?.crossFunctionalState?.biological?.cnsFatigue,
    isRecoveryActive,
  ]);

  const loadLatestPersistedProfile = useCallback(async (): Promise<TitanProfile | null> => {
    if (!user?.uid || !encryptionKey) return profile;
    try {
      return await loadTitanProfile({ userId: user.uid, encryptionKey }) ?? profile;
    } catch (error) {
      console.error('[Titan] Failed to load latest profile before save:', error);
      return profile;
    }
  }, [user?.uid, encryptionKey, profile]);

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

  const ai = useModuleAI({
    moduleId: 'titan',
    systemPrompt,
    encryptionKey
  });

  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const resolvedDebtSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || !user?.uid || !encryptionKey) return;
    if (trainingGateState.latestClearance?.status !== 'granted') return;

    const resolution = resolveSystemDebtsForGrantedClearance(profile, trainingGateState.latestClearance);
    if (resolution.resolvedIds.length === 0) return;

    const signature = `${trainingGateState.latestClearance.id}:${resolution.resolvedIds.join(',')}`;
    if (resolvedDebtSignatureRef.current === signature) return;
    resolvedDebtSignatureRef.current = signature;

    saveTitanProfile(resolution.profile, { userId: user.uid, encryptionKey }).catch((error) => {
      console.error('[Titan] Failed to resolve system debt after clearance grant:', error);
    });
  }, [profile, user?.uid, encryptionKey, trainingGateState.latestClearance]);

  // ── Watch for AI proposals in messages ────────────────────────────────────
  useEffect(() => {
    if (!ai.messages.length) return;
    // Check only the last assistant message
    const lastMsg = ai.messages[ai.messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    
    const content = typeof lastMsg.content === 'string' 
      ? lastMsg.content 
      : Array.isArray(lastMsg.content) 
        ? lastMsg.content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('')
        : '';
    
    const proposal = extractProposalFromMessage(content);
    if (proposal) {
      setActiveProposal(proposal);
    }
  }, [ai.messages]);

  // ── Handle proposal actions via ActionHub ─────────────────────────────────
  const handleProposalAction = useCallback(async (handler: string, data?: Record<string, unknown>) => {
    if (!user?.uid || !encryptionKey) {
      throw new Error('Not authenticated');
    }

    // Map proposal handlers to ActionHub action types
    const actionMap: Record<string, string> = {
      log_sleep: 'log_sleep',
      saveSleepLog: 'log_sleep',
      log_workout_session: 'log_workout_session',
      commitWorkoutSession: 'log_workout_session',
      update_routine: 'update_routine',
      createRoutine: 'update_routine',
    };

    const actionType = actionMap[handler] ?? handler;

    // Normalize payload per action type to bridge any schema mismatch between
    // the proposal's generatedData and what the handler expects.
    let resolvedPayload: Record<string, unknown> = data ?? {};
    if (actionType === 'update_routine') {
      // update_routine handler requires { routines: Routine[] }.
      // If generatedData is a single routine object (has weekday but no routines array),
      // wrap it so the handler doesn't silently return early.
      if (!Array.isArray(resolvedPayload.routines)) {
        resolvedPayload = { routines: [resolvedPayload] };
      }
    }
    
    const success = await ActionHub.execute('titan', actionType, {
      moduleId: 'titan',
      payload: resolvedPayload,
      userId: user.uid,
      isGuest: isGuest,
      encryptionKey,
      getLatestNSV: () => globalSoul?.crossFunctionalState ?? {},
      pushAssistantMessage: (msg: string) => {
        console.log('[Titan Proposal]', msg);
      },
      emitSpineEvent: (type, payload) => {
        Spine.emit({ type, source: 'titan', domain: 'B', data: payload, cascadeDepth: 0, priority: 'info' });
      },
      updateGlobalSoul: async () => {
        // NSV updates handled by the action handlers themselves via queueNSVUpdate
      },
      delegateToModule: () => {
        // Delegation handled by action handlers
      },
    });

    if (!success) {
      throw new Error(`Action "${actionType}" could not be found. Please try again.`);
    }
    // Success — dismiss the proposal card
    setActiveProposal(null);
  }, [user?.uid, isGuest, encryptionKey, globalSoul?.crossFunctionalState]);

  const openChatAndSend = useCallback((prompt: string) => {
    setIsChatCollapsed(false);
    ai.handleSendMessage(prompt);
  }, [ai.handleSendMessage]);

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
          setSomaConsult(parsed);
          setPendingConsults((prev) => ({ ...prev, soma: false }));
        } else {
          setAgnesConsult(parsed);
          setPendingConsults((prev) => ({ ...prev, agnes: false }));
        }
        return;
      }
    }

    if (handoff.type === 'delegate') {
      if (handoff.type === 'delegate' && handoff.sourceModuleId === 'agnes') {
        openChatAndSend(`[Context from Agnes] ${handoff.content}`);
      } else if (handoff.sourceModuleId === 'atlas') {
        openChatAndSend(
          `[Atlas] A physical commitment was missed: "${handoff.content}". ` +
          `Should we reschedule or adjust the training plan?`
        );
      } else if (handoff.type === 'delegate') {
        openChatAndSend(`[${handoff.sourceModuleId ?? 'System'}] ${handoff.content}`);
      }
      return;
    }

    if (handoff.type === 'query_result' && handoff.content) {
      openChatAndSend(
        `[Query Result from ${handoff.sourceModuleId ?? 'module'}] ${handoff.content}`
      );
    }
  }, [openChatAndSend, parseRecoveryConsult]);

  // ── Direct Write (Logbook) Mode ────────────────────────────────────────────
  const directWrite = profile?.directWriteMode ?? false;
  const [advisoryBanner, setAdvisoryBanner] = useState<string | null>(null);

  const handleToggleDirectWrite = useCallback(async () => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = { ...profile, directWriteMode: !directWrite, updatedAt: new Date().toISOString() };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, directWrite, encryptionKey, user]);

  const openRecoveryModal = useCallback((draft?: RecoveryPlanDraft | null) => {
    setRecoveryDraft(draft ?? null);
    setSomaConsult(null);
    setAgnesConsult(null);
    setPendingConsults({ soma: false, agnes: false });
    setIsRecoveryModalOpen(true);
  }, []);

  const handledSpineEventsRef = useRef<Set<string>>(new Set());
  useSpineEvent('COMPOUND_STRESS', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `compound-stress-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    if (!isRecoveryActive) {
      openRecoveryModal({
        reasons: ['stress'],
        type: 'rest',
        durationDays: 7,
      });
      return;
    }
    const stressLoad = event.data?.stressLoad as number | undefined;
    const prompt = stressLoad != null && stressLoad >= 8
      ? `Agnes has flagged critical compound stress (level ${stressLoad}/10) across domains. Review my current training load and recommend a deload protocol or active recovery day. Consider adjusting this week's plan.`
      : `Agnes has flagged elevated compound stress. Should I scale back training intensity this week? Review my schedule and recovery state.`;
    ai.handleSendMessage(prompt);
  }, [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal]));

  useSpineEvent('BURNOUT_WARNING', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `burnout-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    if (!isRecoveryActive) {
      openRecoveryModal({
        reasons: ['stress'],
        type: 'rest',
        durationDays: 10,
      });
      return;
    }
    ai.handleSendMessage(
      'Agnes has detected a burnout warning signal. Please reduce training volume immediately and suggest a 3–5 day active recovery protocol based on my current state.'
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal]));

  useSpineEvent('COMMITMENT_MISSED', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `commitment-missed-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    if (event.data?.domain !== 'physical' && event.domain !== 'B') return;
    const title = event.data?.commitmentTitle ?? event.data?.title ?? 'a physical commitment';
    ai.handleSendMessage(
      `[System] You missed ${title as string}. ` +
      `Should we adjust your training plan or reschedule this session?`
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  useSpineEvent('FINANCIAL_STRESS', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `financial-stress-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    const rawLevel = (event.data?.stressLevel ?? event.data?.level) as number | undefined;
    const stressLevel = rawLevel ?? 0;
    if (stressLevel < 7) return;
    ai.handleSendMessage(
      `[System] Financial stress detected at ${stressLevel}/10. ` +
      `This is a cortisol contributor that compresses recovery capacity. ` +
      `Please factor this into today's training intensity and recovery recommendations.`
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  useSpineEvent('REDUCE_TRAINING_LOAD', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `reduce-load-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    if (!isRecoveryActive) {
      openRecoveryModal({
        reasons: ['overtraining'],
        type: 'deload',
        durationDays: 7,
      });
      return;
    }
    const reason = event.data?.reason as string | undefined;
    const capacity = event.data?.capacityPercent as number | undefined;
    const contextMsg = reason === 'atlas_recovery_day'
      ? `Atlas has scheduled a recovery day. Training capacity is capped at ${capacity ?? 50}% today.`
      : reason === 'high_rpe_session'
      ? `Your last session had very high RPE. Your next session should be at ${capacity ?? 60}% capacity — prioritise technique, mobility, or active recovery.`
      : `A load reduction signal was received (${reason ?? 'system'}, ${capacity ?? 60}% capacity). Recommend adjusting today's training accordingly.`;
    ai.handleSendMessage(`[System] ${contextMsg} Please update my plan for today or tomorrow.`);
  }, [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal]));

  useSpineEvent('RECOVERY_AVAILABLE', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `recovery-available-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    ai.handleSendMessage(
      '[System] Recovery metrics have improved — a performance window is open. ' +
      'Based on my current readiness, what high-quality training session do you recommend for today?'
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  const isAutoAdvancingRef = useRef(false);
  const isCommittingQuickLogRef = useRef(false);

  useEffect(() => {
    if (isAutoAdvancingRef.current) return;
    if (!profile?.cycles?.length || !user || !encryptionKey) return;

    const today = new Date().toISOString().slice(0, 10);
    let needsUpdate = false;

    const updatedCycles = profile.cycles.map(cycle => {
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
        return {
          ...cycle,
          currentPhaseIndex: nextPhaseIndex,
          currentPhaseStartDate: today,
          updatedAt: now,
        };
      }
      return cycle;
    });

    if (!needsUpdate) return;

    isAutoAdvancingRef.current = true;
    const updated: TitanProfile = {
      ...profile,
      cycles: updatedCycles,
      updatedAt: new Date().toISOString(),
    };
    saveTitanProfile(updated, { userId: user.uid, encryptionKey })
      .catch(e => console.error('cycle auto-advance failed:', e))
      .finally(() => { isAutoAdvancingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cycles, user, encryptionKey]);

  useEffect(() => {
    const handoff = NexusHandoffService.consume('titan');
    if (!handoff) return;
    handleIncomingHandoff(handoff);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRecoveryModalOpen) return;
    const interval = window.setInterval(() => {
      const handoff = NexusHandoffService.consume('titan');
      if (handoff) handleIncomingHandoff(handoff);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [isRecoveryModalOpen, handleIncomingHandoff]);

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      const hasRoutine = profile.routines && profile.routines.length > 0;
      ai.setMessages([
        {
          role: 'assistant',
          content: hasRoutine
            ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
            : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?"
        }
      ]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, profile?.routines]);

  useEffect(() => {
    const hasMedicalData = (
      (profile?.labSummaries?.length ?? 0) > 0 ||
      (profile?.medicalImageAnalyses?.length ?? 0) > 0 ||
      (profile?.medications?.length ?? 0) > 0
    );
    if (!hasMedicalData) return;
    if (!profile?.onboardingComplete) return;
    const isAccessible = isModuleAccessible('titan');
    if (!isAccessible) return;

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
        sourceModuleId: 'titan',
        createdAt: new Date().toISOString()
      });
      const route = NexusRoutingService.getRoute(owner as ModuleId);
      if (route) navigate(route);
    },
    [navigate]
  );

  const handleAnalyzeRoutine = useCallback(
    (routine: Routine) => {
      const exerciseList = routine.exercises
        .map((ex, i) => `${i + 1}. **${ex.name}** — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`)
        .join('\n');

      const prompt = [
        `Analyze my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}":`,
        routine.rationale ? `Rationale: ${routine.rationale}` : '',
        `\nExercises:\n${exerciseList}`,
        '\nIs this well-balanced? Any improvements for injury prevention or performance?'
      ].filter(Boolean).join('\n');

      openChatAndSend(prompt);
    },
    [openChatAndSend]
  );

  const handleGeneratePlan = useCallback(() => {
    openChatAndSend('Generate a personalized weekly training routine based on my profile, goals, and current recovery state.');
  }, [openChatAndSend]);

  const handleImportRoutine = useCallback(() => {
    openChatAndSend("I already have a training routine I'd like to log. Let me describe it to you.");
  }, [openChatAndSend]);

  const handleSubmitRoutineForApproval = useCallback((routine: Routine) => {
    const isEdit = (profile?.routines ?? []).some(r => r.id === routine.id);
    const exerciseList = routine.exercises
      .map((ex: Exercise, i: number) =>
        `  ${i + 1}. ${ex.name} — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`
      )
      .join('\n');

    const meta = [
      routine.rationale ? `Rationale: ${routine.rationale}` : null,
      routine.timeframe ? `Duration: ${routine.timeframe}` : null,
    ].filter(Boolean).join(' | ');

    const prompt = [
      isEdit
        ? `I've edited my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}".`
        : `I've manually built a new ${routine.weekday?.toUpperCase() || ''} routine: "${routine.name}".`,
      meta,
      `\nExercises:\n${exerciseList}`,
      '\nPlease review this against my current goals, recovery state, and training history.',
      'If it is appropriate and well-structured, commit it now using the update_routine action.',
      'If you have concerns or improvements, raise them first — but be concise.',
    ].filter(Boolean).join('\n');

    openChatAndSend(prompt);
  }, [profile?.routines, openChatAndSend]);

  const handleSubmitCustomFieldsForApproval = useCallback((
    values: Record<string, unknown>,
    categoryLabel: string,
  ) => {
    const nonEmpty = Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (nonEmpty.length === 0) return;

    const lines = nonEmpty.map(([key, val]) => `  • ${key}: ${val}`).join('\n');
    const prompt = [
      `I want to update my custom ${categoryLabel} tracking fields:`,
      lines,
      'Please review these values against my current goals and nutrition context.',
      'If they look correct and relevant, commit them via the update_titan_profile action.',
      'Flag anything that looks inconsistent or out of range.',
    ].join('\n');

    openChatAndSend(prompt);
  }, [openChatAndSend]);

  // ── Fast Quick-Log bar handlers ────────────────────────────────────────────
  const handleQuickLogBarSubmit = useCallback((input: string) => {
    const result = parseQuickLogInput(input);
    if (result.isEmpty) return;
    const prs = profile?.personalRecords ?? {};
    const annotated = result.entries.map(entry => {
      if (!entry.weight || !entry.reps) return entry;
      const key = entry.exerciseName.toLowerCase().trim();
      const storedPR = prs[key];
      const candidateE1RM = calculateE1RM(entry.weight, entry.reps);
      const isPR = !storedPR || candidateE1RM > storedPR.e1RM;
      return {
        ...entry,
        isPR,
        prDelta: isPR && storedPR ? Math.round((candidateE1RM - storedPR.e1RM) * 10) / 10 : null,
      };
    });
    setPendingLogEntries(annotated);
  }, [profile?.personalRecords]);

  const handleQuickLogBarCommit = useCallback(async (mode?: 'recovery' | 'full') => {
    if (!profile || !encryptionKey || !user || pendingLogEntries.length === 0) return;
    if ((trainingGateState.shouldBlockFullTraining || isRecoveryActive) && !mode) {
      setRecoveryGate({
        onLight: () => handleQuickLogBarCommit('recovery'),
        onFull: () => handleQuickLogBarCommit('full'),
        mode: trainingGateState.shouldBlockFullTraining ? 'clearance' : 'recovery',
        message: trainingGateState.enforcementReason ?? "You're in recovery mode. Log this as a light recovery session or continue with full training.",
        allowOverride: trainingGateState.shouldRequireExplicitOverride,
      });
      return;
    }
    if (isCommittingQuickLogRef.current) return;
    isCommittingQuickLogRef.current = true;
    setQuickLogCommitError(null);
    try {
      const latestProfile = await loadLatestPersistedProfile();
      if (!latestProfile) return;
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const sessionId = `ql-fast-${crypto.randomUUID()}`;

      const exercises: ExerciseLog[] = pendingLogEntries.map(entry => ({
        exerciseName: entry.exerciseName,
        plannedSets: entry.sets,
        plannedReps: entry.reps ? String(entry.reps) : '—',
        sets: Array.from({ length: entry.sets }, (_, i) => ({
          setNumber: i + 1,
          weight: entry.weight ?? undefined,
          repsCompleted: entry.reps ?? 0,
          completed: true,
        })),
      }));

      const totalVolume = exercises.reduce(
        (total, ex) =>
          total + ex.sets.reduce((st, s) =>
            s.completed && s.weight ? st + s.weight * s.repsCompleted : st, 0),
        0,
      );

      const session: WorkoutSession = {
        id: sessionId,
        routineId: 'quick-log',
        routineName: 'Quick Log',
        date: today,
        startedAt: now,
        completedAt: now,
        exercises,
        totalVolume: totalVolume > 0 ? Math.round(totalVolume) : undefined,
        recoverySession: mode === 'recovery',
        status: 'completed',
      };

      const updatedSessions = [session, ...(latestProfile.workoutSessions ?? [])].slice(0, 500);
      const updatedPRs: Record<string, PersonalRecord> = { ...(latestProfile.personalRecords ?? {}) };

      for (const exLog of session.exercises) {
        const key = exLog.exerciseName.toLowerCase().trim();
        for (const s of exLog.sets) {
          if (!s.completed || !s.weight || !s.repsCompleted) continue;
          const e1RM = calculateE1RM(s.weight, s.repsCompleted);
          const existing = updatedPRs[key];
          if (!existing || e1RM > existing.e1RM) {
            updatedPRs[key] = {
              exerciseName: exLog.exerciseName,
              maxWeight: s.weight,
              repsAtMax: s.repsCompleted,
              e1RM,
              achievedDate: today,
              sessionId,
            };
          }
        }
      }

      const updated: TitanProfile = {
        ...latestProfile,
        workoutSessions: updatedSessions,
        personalRecords: updatedPRs,
        updatedAt: now,
      };

      await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
      setPendingLogEntries([]);
      setQuickLogBarInput('');
    } catch (err) {
      console.error('[QuickLogBar] commit failed:', err);
      setQuickLogCommitError('Failed to save. Tap retry.');
    } finally {
      isCommittingQuickLogRef.current = false;
    }
  }, [
    profile,
    encryptionKey,
    user,
    pendingLogEntries,
    isRecoveryActive,
    trainingGateState.shouldBlockFullTraining,
    trainingGateState.shouldRequireExplicitOverride,
    trainingGateState.enforcementReason,
    loadLatestPersistedProfile,
  ]);

  // ── Direct-write handlers ──────────────────────────────────────────────────
  const handleDirectSaveBodyWeight = useCallback(async (entry: BodyWeightEntry) => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = {
      ...profile,
      bodyWeightLog: [entry, ...(profile.bodyWeightLog ?? [])].slice(0, 1000),
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectSaveCardio = useCallback(async (session: CardioSession) => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = {
      ...profile,
      cardioLog: [session, ...(profile.cardioLog ?? [])].slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectSaveSleep = useCallback(async (entry: SleepEntry) => {
    if (!profile || !encryptionKey || !user) return;
    const updatedLog = [entry, ...(profile.sleepLog ?? [])].slice(0, 365);
    const updated: TitanProfile = {
      ...profile,
      sleepLog: updatedLog,
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectCreateMacros = useCallback(async (fields: CustomField[]) => {
    if (!profile || !encryptionKey || !user) return;
    const existing = profile.customFields ?? [];
    const existingNames = new Set(existing.map(f => f.name.toLowerCase()));
    const newFields = fields.filter(f => !existingNames.has(f.name.toLowerCase()));
    if (newFields.length === 0) return;
    const updated: TitanProfile = {
      ...profile,
      customFields: [...existing, ...newFields].slice(0, 20),
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectCreateCycle = useCallback(async (cycle: CycleEntry) => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = {
      ...profile,
      cycles: [...(profile.cycles ?? []), cycle],
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

  const handleDirectDeleteCycle = useCallback(async (cycleId: string) => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = {
      ...profile,
      cycles: (profile.cycles ?? []).filter(c => c.id !== cycleId),
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user]);

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
          updatedPRs[key] = {
            exerciseName: exLog.exerciseName,
            maxWeight: s.weight,
            repsAtMax: s.repsCompleted,
            e1RM,
            achievedDate: sessionWithFlag.date,
            sessionId: sessionWithFlag.id,
          };
        }
      }
    }
    const updated: TitanProfile = {
      ...latestProfile,
      workoutSessions: updatedSessions,
      personalRecords: updatedPRs,
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, encryptionKey, user, loadLatestPersistedProfile]);

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const daysRemaining = useMemo(() => {
    if (!recoveryPlan?.active) return 0;
    const today = new Date(todayIso());
    const end = new Date(recoveryPlan.endDate);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(diff, 0);
  }, [recoveryPlan]);

  const recoveryCheckins = profile?.recoveryCheckins ?? [];
  const hasCheckinToday = recoveryCheckins.some(c => c.date === todayIso());

  const handleSaveRecoveryPlan = useCallback(async (plan: TitanRecoveryPlan) => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = {
      ...profile,
      recoveryPlan: plan,
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

    // Emit TITAN_RECOVERY_NEEDED → cascades to SOMATIC_SUPPORT_REQUESTED (Soma notified)
    Spine.emit({
      type: 'TITAN_RECOVERY_NEEDED',
      source: 'titan',
      domain: 'B',
      data: {
        type: plan.type,
        reasons: plan.reasons,
        durationDays: plan.suggestedDurationDays,
        bodyRegion: plan.bodyRegion ?? null,
        startDate: plan.startDate,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    // Update NSV biological state — lower recovery score reflects impaired state
    const recoveryScoreOnStart =
      plan.type === 'rehab' ? 2 : plan.type === 'rest' ? 4 : plan.type === 'active' ? 5 : 6;
    queueNSVUpdate(user.uid, { biological: { recoveryScore: recoveryScoreOnStart, cnsFatigue: 8 } }, 'recovery_start');

    setIsRecoveryModalOpen(false);
    setActiveTab('recovery');
    setRecoveryDraft(null);
    setSomaConsult(null);
    setAgnesConsult(null);
    setPendingConsults({ soma: false, agnes: false });
  }, [profile, encryptionKey, user]);

  const handleSaveRecoveryCheckin = useCallback(async (payload: Omit<TitanRecoveryCheckin, 'date'> & { date?: string }) => {
    if (!profile || !encryptionKey || !user) return;
    const date = payload.date ?? todayIso();
    const nextEntry: TitanRecoveryCheckin = {
      date,
      pain: payload.pain,
      fatigue: payload.fatigue,
      sleepQuality: payload.sleepQuality,
      mood: payload.mood,
      notes: payload.notes,
      skipped: payload.skipped,
    };
    const filtered = (profile.recoveryCheckins ?? []).filter(c => c.date !== date);
    const updated: TitanProfile = {
      ...profile,
      recoveryCheckins: [nextEntry, ...filtered].slice(0, 180),
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

    // Compute recovery score: pain/fatigue are impairment (inverted), sleep is positive
    if (!payload.skipped) {
      const checkinRecoveryScore = Math.min(10, Math.max(0, Math.round(
        (10 - nextEntry.pain) * 0.3 +
        (10 - nextEntry.fatigue) * 0.4 +
        nextEntry.sleepQuality * 0.3
      )));
      queueNSVUpdate(user.uid, {
        biological: {
          recoveryScore: checkinRecoveryScore,
          sleepQuality: nextEntry.sleepQuality,
        },
      }, 'recovery_checkin');

      // Early recovery signal — notify other modules if score is high
      if (checkinRecoveryScore >= 8) {
        Spine.emit({
          type: 'RECOVERY_AVAILABLE',
          source: 'titan',
          domain: 'B',
          data: {
            recoveryScore: checkinRecoveryScore,
            source: 'daily_checkin',
            date,
          },
          cascadeDepth: 0,
          priority: 'info',
        });
      }
    }
  }, [profile, encryptionKey, user]);

  const handleResumeTraining = useCallback(async () => {
    if (!profile || !encryptionKey || !user || !profile.recoveryPlan) return;
    const prevPlan = profile.recoveryPlan;
    const updated: TitanProfile = {
      ...profile,
      recoveryPlan: { ...prevPlan, active: false },
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

    // Notify all modules that recovery is complete and training can resume
    Spine.emit({
      type: 'RECOVERY_AVAILABLE',
      source: 'titan',
      domain: 'B',
      data: {
        previousType: prevPlan.type,
        durationDays: prevPlan.suggestedDurationDays,
        source: 'manual_resume',
      },
      cascadeDepth: 0,
      priority: 'info',
    });

    // Restore biological NSV to baseline recovered state
    queueNSVUpdate(user.uid, { biological: { recoveryScore: 7, cnsFatigue: 2 } }, 'resume_training');

    setIsResumeModalOpen(false);
    setActiveTab('train');
  }, [profile, encryptionKey, user]);

  const requestRecoveryConsults = useCallback((reasons: TitanRecoveryReason[], bodyRegion?: TitanRecoveryBodyRegion) => {
    if (!user || isGuest) return;
    const recoveryScore = globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null;
    const baseContext = {
      reasons,
      bodyRegion,
      recoveryScore,
      summary: profile?.summary ?? '',
      injuries: profile?.history?.injuries ?? [],
      sleepSummary: profile?.activity?.sleepHours ?? null,
      medicalSummary: somaProfile?.medicalSummary ?? profile?.medicalSummary ?? null,
      clearances: somaProfile?.clearances?.slice(0, 2) ?? [],
      biomarkers: somaProfile?.biomarkers?.slice(0, 2) ?? [],
      labSummaries: somaProfile?.labSummaries?.slice(0, 2) ?? [],
    };
    const prompt = [
      'RECOVERY_CONSULT_REQUEST',
      'Respond ONLY with JSON: {"summary": "...", "suggestedType": "rest|active|rehab|deload", "suggestedDurationDays": number, "rehabTemplateId": "optional", "severity": "low|medium|high"}',
      `Context: ${JSON.stringify(baseContext)}`
    ].join('\n');

    if (reasons.includes('injury')) {
      NexusHandoffService.store({
        moduleId: 'soma',
        type: 'query',
        content: prompt,
        reason: 'recovery_consult',
        sourceModuleId: 'titan',
        createdAt: new Date().toISOString(),
      });
      setPendingConsults((prev) => ({ ...prev, soma: true }));
    }
    if (reasons.includes('stress')) {
      NexusHandoffService.store({
        moduleId: 'agnes',
        type: 'query',
        content: prompt,
        reason: 'recovery_consult',
        sourceModuleId: 'titan',
        createdAt: new Date().toISOString(),
      });
      setPendingConsults((prev) => ({ ...prev, agnes: true }));
    }
  }, [user, isGuest, globalSoul?.crossFunctionalState?.biological?.recoveryScore, profile, somaProfile]);

  const guardRecoveryAction = useCallback((onLight: () => void, onFull: () => void) => {
    if (trainingGateState.shouldBlockFullTraining) {
      setRecoveryGate({
        onLight,
        onFull,
        mode: 'clearance',
        message: trainingGateState.enforcementReason ?? 'Soma clearance is restricting full training.',
        allowOverride: trainingGateState.shouldRequireExplicitOverride,
      });
      return;
    }
    if (!isRecoveryActive) {
      onFull();
      return;
    }
    setRecoveryGate({
      onLight,
      onFull,
      mode: 'recovery',
      message: "You're in recovery mode. Log this as a light recovery session or continue with full training.",
      allowOverride: false,
    });
  }, [
    isRecoveryActive,
    trainingGateState.shouldBlockFullTraining,
    trainingGateState.shouldRequireExplicitOverride,
    trainingGateState.enforcementReason,
  ]);

  const handleOverrideSomaVeto = useCallback(async () => {
    if (!recoveryGate || !profile || !encryptionKey || !user) return;

    const outcome = recordSomaVetoOverride(profile, {
      activity: trainingGateState.activity,
      clearance: trainingGateState.latestClearance,
      note: recoveryGate.message,
    });

    await saveTitanProfile(outcome.profile, { userId: user.uid, encryptionKey });

    Spine.emit({
      type: 'SOMA_VETO_OVERRIDDEN',
      source: 'titan',
      target: 'soma',
      domain: 'system',
      data: {
        activity: outcome.override.activity,
        clearanceStatus: outcome.override.clearanceStatus,
        reason: outcome.override.reason,
        overrideId: outcome.override.id,
        debtId: outcome.debt.id,
        mutations: outcome.debt.vectorImpact,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    Spine.emit({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'titan',
      target: 'atlas',
      domain: 'system',
      data: {
        reason: 'soma_veto_override',
        activity: outcome.override.activity,
        debtId: outcome.debt.id,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    const currentRecovery = globalSoul?.crossFunctionalState?.biological?.recoveryScore;
    const currentFatigue = globalSoul?.crossFunctionalState?.biological?.cnsFatigue;
    queueNSVUpdate(user.uid, {
      biological: {
        recoveryScore: Math.max(0, Math.min(10, (typeof currentRecovery === 'number' ? currentRecovery : 7) - 1)),
        cnsFatigue: Math.max(0, Math.min(10, (typeof currentFatigue === 'number' ? currentFatigue : 4) + 1)),
      },
    }, 'soma_veto_override');

    setAdvisoryBanner(outcome.alertMessage);
    const action = recoveryGate.onFull;
    setRecoveryGate(null);
    await action?.();
  }, [recoveryGate, profile, encryptionKey, user, trainingGateState, globalSoul?.crossFunctionalState?.biological?.recoveryScore, globalSoul?.crossFunctionalState?.biological?.cnsFatigue]);

  const activeCycleCount = (profile?.cycles ?? []).filter(c => c.status === 'active').length;
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
            daysRemaining={daysRemaining}
            hasCheckinToday={hasCheckinToday}
            onResume={() => setIsResumeModalOpen(true)}
            onSaveCheckin={handleSaveRecoveryCheckin}
            onOpenQuickLog={() => {
              setQuickLogIsRecovery(true);
              setQuickLogDate(new Date());
              setIsQuickLogOpen(true);
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
          />
        );

      default: // train
        return (
          <TrainTab
            profile={profile}
            somaProfile={somaProfile}
            globalSoul={globalSoul}
            isLocked={isLocked}
            isRecoveryActive={isRecoveryActive}
            clearanceStatus={trainingGateState.clearanceStatus}
            clearanceMessage={trainingGateState.enforcementReason}
            activeDebtCount={trainingGateState.activeDebtCount}
            readinessPresentationMode={trainingGateState.presentationMode}
            directWriteMode={directWrite}
            advisoryBanner={advisoryBanner}
            onDismissAdvisory={() => setAdvisoryBanner(null)}
            calendarSelectedRoutine={calendarSelectedRoutine}
            onCalendarRoutineSelect={setCalendarSelectedRoutine}
            onOpenQuickLog={(date, isRecovery) => {
              setQuickLogDate(date);
              setQuickLogIsRecovery(isRecovery);
              setIsQuickLogOpen(true);
            }}
            onRemindDate={setRemindDate}
            onCalibrate={handleCalibrate}
            onOpenChatAndSend={openChatAndSend}
            guardRecoveryAction={guardRecoveryAction}
            commitWorkoutSession={commitWorkoutSession}
            onSetAdvisoryBanner={setAdvisoryBanner}
          />
        );
    }
  };

  // ── Strip proposal JSON from chat display ─────────────────────────────────
  // The AI embeds the TitanProposal JSON at the end of its message for extraction,
  // but we don't want raw JSON visible in the chat bubble. Strip it for display;
  // the detection useEffect above still reads from the original ai.messages.
  const displayAi = useMemo(() => {
    const stripProposalJson = (text: string): string => {
      const markerIdx = text.indexOf('"__isTitanProposal"');
      if (markerIdx === -1) return text;
      const openBrace = text.lastIndexOf('{', markerIdx);
      return openBrace === -1 ? text : text.substring(0, openBrace).trim();
    };

    const cleanContent = (content: unknown): import('@/lib/types').MessageContent => {
      if (typeof content === 'string') return stripProposalJson(content);
      if (Array.isArray(content)) {
        return content.map((part) => {
          if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
            return { ...part, text: stripProposalJson((part as { text: string }).text) };
          }
          return part;
        }) as import('@/lib/types').MessageContentPart[];
      }
      return typeof content === 'string' ? content : '';
    };

    return {
      ...ai,
      messages: ai.messages.map((msg) =>
        msg.role === 'assistant' ? { ...msg, content: cleanContent(msg.content) } : msg
      ),
      streamingText: stripProposalJson(ai.streamingText ?? ''),
    };
  }, [ai]);

  // ── Inline proposal card — rendered below the last assistant message ─────
  const lastAssistantIndex = useMemo(() => {
    for (let i = displayAi.messages.length - 1; i >= 0; i--) {
      if (displayAi.messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [displayAi.messages]);

  // Detect when the AI is actively streaming a proposal JSON block.
  // Uses original ai.streamingText (not displayAi which is already stripped).
  const isGeneratingProposal = useMemo(
    () => ai.isProcessing && ai.streamingText.includes('"__isTitanProposal"'),
    [ai.isProcessing, ai.streamingText]
  );

  const renderProposalMessageActions = useCallback(
    (msg: import('@/lib/types').Message, index: number) => {
      // Skeleton below the transient streaming bubble (NexusChat appends it at
      // index > lastAssistantIndex while streaming, so this targets exactly that slot).
      if (isGeneratingProposal && !activeProposal && msg.role === 'assistant' && index > lastAssistantIndex) {
        return <TitanProposalSkeleton />;
      }
      // Real card below the last committed assistant message.
      if (activeProposal && index === lastAssistantIndex) {
        return (
          <TitanProposalCard
            proposal={activeProposal}
            onAction={handleProposalAction}
            onDismiss={() => setActiveProposal(null)}
          />
        );
      }
      return null;
    },
    [isGeneratingProposal, activeProposal, lastAssistantIndex, handleProposalAction]
  );

  return (
    <>
      <SingleAgentLayout
        moduleId="titan"
        agentName={agentAlias}
        themeColor="module"
        ai={displayAi}
        authMode="titan"
        placeholder="Input training data or queries..."
        isChatCollapsed={isChatCollapsed}
        onToggleChat={setIsChatCollapsed}
        hideChatTrigger={activeTab === 'train'}
        renderMessageActions={renderProposalMessageActions}
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
                daysRemaining={daysRemaining}
                onOpenCheckin={() => setActiveTab('recovery')}
                onViewPlan={() => setActiveTab('recovery')}
                onResume={() => setIsResumeModalOpen(true)}
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

              {/* Module controls */}
              <div className="flex flex-col gap-2 sm:gap-3 xl:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <ModuleReminderEntry
                    title="Titan"
                    themeColor="orange"
                    panel={<TitanNotificationSettingsPanel />}
                    compact
                    iconOnly
                  />
                  {!isRecoveryActive && (
                    <NeuralButton
                      variant="secondary"
                      size="sm"
                      onClick={() => openRecoveryModal(null)}
                      className="min-h-10 rounded-xl px-3.5 text-[11px] font-semibold tracking-[0.02em] sm:min-h-9"
                    >
                      Start Recovery
                    </NeuralButton>
                  )}
                </div>

                {!isRecoveryActive && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] sm:w-auto sm:justify-end sm:gap-2.5 sm:py-1.5 sm:text-xs">
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
                )}
              </div>
            </div>
          </div>

          <div
            role="tabpanel"
            id={`tab-panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className={cn(
              "flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-visible no-scrollbar pt-4 sm:pt-5 md:pt-6",
              activeTab === 'train' && "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
            )}
            style={activeTab === 'train' && quickLogBarHeight > 0
              ? { paddingBottom: Math.max(quickLogBarHeight, 16) }
              : undefined}
          >
            <div className="flex-1 w-full overflow-x-hidden flex flex-col min-h-0">
              {renderTabContent()}
            </div>
            {/* Quick-log bar footer — sticky within the Titan tab panel */}
            {activeTab === 'train' && (
              <div
                className="fixed left-0 bottom-0 z-[var(--z-fab)] transition-[right] duration-300 ease-out"
                style={{
                  right: 'var(--spine-sidebar-width, 0px)',
                  ...(keyboardOffset > 0 ? { bottom: `${keyboardOffset}px` } : {}),
                }}
              >
                <div className="relative w-full">
                  <AnimatePresence>
                    {pendingLogEntries.length > 0 && (
                      <LogConfirmCard
                        entries={pendingLogEntries}
                        onCommit={handleQuickLogBarCommit}
                        onEdit={() => {
                          setPendingLogEntries([]);
                        }}
                        onDismiss={() => {
                          setPendingLogEntries([]);
                          setQuickLogCommitError(null);
                        }}
                        commitError={quickLogCommitError}
                      />
                    )}
                  </AnimatePresence>
                  <div ref={quickLogBarRef}>
                    <QuickLogBar
                      value={quickLogBarInput}
                      onChange={setQuickLogBarInput}
                      onSubmit={handleQuickLogBarSubmit}
                      onOpenChat={() => setIsChatCollapsed(false)}
                      onManualLog={() => {
                        setQuickLogDate(new Date());
                        setQuickLogIsRecovery(isRecoveryActive);
                        setIsQuickLogOpen(true);
                      }}
                      onCardioLog={() => setActiveTab('body')}
                      recentSessions={profile?.workoutSessions ?? []}
                      disabled={pendingLogEntries.length > 0}
                      onFocusChange={setIsQuickLogFocused}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SingleAgentLayout>

      <RecoveryPlanModal
        isOpen={isRecoveryModalOpen}
        onClose={() => {
          setIsRecoveryModalOpen(false);
          setPendingConsults({ soma: false, agnes: false });
        }}
        onConfirm={handleSaveRecoveryPlan}
        recoveryScore={globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null}
        draft={recoveryDraft}
        somaConsult={somaConsult}
        agnesConsult={agnesConsult}
        pendingConsults={pendingConsults}
        onRequestConsults={requestRecoveryConsults}
        onOpenModule={(moduleId) => {
          const route = NexusRoutingService.getRoute(moduleId);
          if (route) navigate(route);
        }}
      />

      <NeuralModal
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        title="Resume Training"
        subtitle="Final recovery check-in"
        icon={ShieldAlert}
        themeColor="module"
        maxWidth="md"
      >
        <RecoveryCheckinPanel
          allowSkip={false}
          onSubmit={async (payload) => {
            await handleSaveRecoveryCheckin(payload);
            await handleResumeTraining();
          }}
          onSkip={() => {}}
        />
      </NeuralModal>

      <NeuralModal
        isOpen={!!recoveryGate}
        onClose={() => setRecoveryGate(null)}
        title={recoveryGate?.mode === 'clearance' ? 'Soma Clearance Enforcement' : 'Recovery Mode Active'}
        subtitle={recoveryGate?.mode === 'clearance' ? 'Choose a compliant response' : 'Choose how to log this session'}
        icon={ShieldAlert}
        themeColor="module"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            {recoveryGate?.message ?? "You're in recovery mode. Log this as a light recovery session or continue with full training."}
          </p>
          <div className="flex flex-col gap-2">
            <NeuralButton
              variant="primary"
              onClick={async () => {
                const action = recoveryGate?.onLight;
                setRecoveryGate(null);
                await action?.();
              }}
            >
              {recoveryGate?.mode === 'clearance' ? 'Log Recovery Instead' : 'Log Light Recovery Session'}
            </NeuralButton>
            {recoveryGate?.mode === 'clearance' ? (
              <NeuralButton
                variant="secondary"
                onClick={handleOverrideSomaVeto}
                disabled={!recoveryGate.allowOverride}
              >
                Override Soma Veto
              </NeuralButton>
            ) : (
              <NeuralButton
                variant="secondary"
                onClick={async () => {
                  const action = recoveryGate?.onFull;
                  setRecoveryGate(null);
                  await action?.();
                }}
              >
                Proceed with Full Training
              </NeuralButton>
            )}
            <NeuralButton variant="ghost" onClick={() => setRecoveryGate(null)}>
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      <QuickReminderModal
        open={!!remindDate}
        moduleId="titan"
        defaultTitle={remindDate ? `Workout session: ${remindDate}` : ''}
        defaultNote="Reminder to log or complete your workout session."
        deepLink={
          remindDate
            ? { route: '/titan', focusId: `session:${remindDate}` }
            : undefined
        }
        source={
          remindDate
            ? { moduleId: 'titan', entityType: 'session', entityId: remindDate, label: `Workout ${remindDate}` }
            : undefined
        }
        onClose={() => setRemindDate(null)}
      />

      <QuickLogDrawer
        isOpen={isQuickLogOpen}
        onClose={() => {
          setIsQuickLogOpen(false);
          setQuickLogIsRecovery(false);
        }}
        selectedDate={quickLogDate}
        existingExercises={existingExercises}
        recoverySession={quickLogIsRecovery}
        onCommit={async (payload: QuickLogPayload) => {
          if (!profile || !encryptionKey || !user) return;
          const handleCommit = async (isRecovery: boolean) => {
            if ('exercises' in payload) {
              const session = payload;
              await commitWorkoutSession({ ...session, recoverySession: isRecovery }, isRecovery);
            } else {
              const latestProfile = await loadLatestPersistedProfile();
              if (!latestProfile) return;
              const record = payload;
              const updatedPRs: Record<string, PersonalRecord> = { ...(latestProfile.personalRecords ?? {}) };
              const key = record.exerciseName.toLowerCase().trim();
              const existing = updatedPRs[key];
              if (!existing || record.e1RM > existing.e1RM) {
                updatedPRs[key] = {
                  exerciseName: record.exerciseName,
                  maxWeight: record.weight,
                  repsAtMax: record.reps,
                  e1RM: record.e1RM,
                  achievedDate: record.date,
                  sessionId: record.exerciseId,
                };
              }
              const now = new Date().toISOString();
              const session: WorkoutSession = {
                id: `ql-${Date.now()}`,
                routineId: 'quick-log',
                routineName: 'Quick Log',
                date: record.date,
                startedAt: now,
                completedAt: now,
                exercises: [
                  {
                    exerciseName: record.exerciseName,
                    plannedSets: 1,
                    plannedReps: String(record.reps),
                    sets: [
                      {
                        setNumber: 1,
                        weight: record.weight,
                        repsCompleted: record.reps,
                        completed: true,
                      },
                    ],
                  },
                ],
                recoverySession: isRecovery,
                status: 'completed',
              };
              const updatedSessions = [session, ...(latestProfile.workoutSessions ?? [])].slice(0, 500);
              const updated: TitanProfile = {
                ...latestProfile,
                workoutSessions: updatedSessions,
                personalRecords: updatedPRs,
                updatedAt: new Date().toISOString(),
              };
              await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
            }
          };

          if ((trainingGateState.shouldBlockFullTraining || isRecoveryActive) && !quickLogIsRecovery) {
            setRecoveryGate({
              onLight: () => handleCommit(true),
              onFull: () => handleCommit(false),
              mode: trainingGateState.shouldBlockFullTraining ? 'clearance' : 'recovery',
              message: trainingGateState.enforcementReason ?? "You're in recovery mode. Log this as a light recovery session or continue with full training.",
              allowOverride: trainingGateState.shouldRequireExplicitOverride,
            });
            return;
          }
          await handleCommit(quickLogIsRecovery);
        }}
      />

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
                <p className="text-xs text-white/80 font-bold leading-snug">
                  Medical data is unprotected
                </p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  Your Titan profile contains lab reports or clinical data. Lock the vault to encrypt it.
                </p>
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
