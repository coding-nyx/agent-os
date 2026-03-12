import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { TitanDashboard } from './components/TitanReadiness';
import { TitanRoutinePanel } from './components/TitanRoutinePanel';
import { CustomFieldManager } from './components/CustomFieldManager';
import { RoutineProgress } from './components/RoutineProgress';
import { CycleManager } from './components/CycleManager';
import { WorkoutSessionLogger } from './components/WorkoutSessionLogger';
import { SomaSnapshotWidget } from './components/SomaSnapshotWidget';
import { ClearanceBanner } from './components/ClearanceBanner';
import { ProgressTab } from './components/ProgressTab';
import { PRBoard } from './components/PRBoard';
import { TrainingCalendar } from './components/TrainingCalendar';
import { QuickLogDrawer } from './components/QuickLogDrawer';
import type { QuickLogPayload } from './components/QuickLogDrawer';
import { QuickLogBar } from './components/QuickLogBar';
import { LogConfirmCard } from './components/LogConfirmCard';
import { parseQuickLogInput, annotatePRs } from './utils/quick-log-parser';
import type { ParsedEntry } from './utils/quick-log-parser';
import { calculateE1RM } from './utils/e1rm';
import { SleepTracker } from './components/SleepTracker';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { TitanProfile, Routine, Exercise, WorkoutSession, PersonalRecord, SomaProfile, ExerciseLog, SleepEntry, CycleEntry } from '@/lib/types';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { subscribeSomaProfile } from '../soma/services/soma-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { Activity, BarChart3, RefreshCw, Zap, X, Plus, Moon, ShieldAlert } from 'lucide-react';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { titanDiagnosisSpec } from './diagnosis/titan-diagnosis-spec';
import { TITAN_PERSONA } from './personas';

type TitanTab = 'training' | 'progress' | 'cycles' | 'sleep';

registerDiagnosisSpec(titanDiagnosisSpec);

function resolveInitialTab(searchParams: URLSearchParams): TitanTab {
  const param = searchParams.get('tab');
  if (param === 'training' || param === 'progress' || param === 'cycles' || param === 'sleep') return param;
  return 'training';
}

function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible, getModuleKey, lockVault } = useVault();
  const { user } = useAuth();
  const isLocked = !isModuleAccessible('titan');

  // ── Medical-data vault advisory (S21-015) ─────────────────────────────────
  // Shown once per session when vault is accessible AND profile has medical data.
  const [showAdvisory, setShowAdvisory] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams));
  const [calendarSelectedRoutine, setCalendarSelectedRoutine] = useState<Routine | null>(null);
  const [somaProfile, setSomaProfile] = useState<SomaProfile | null>(null);
  const [somaEncryptionKey, setSomaEncryptionKey] = useState<CryptoKey | null>(null);

  // ── Quick-log drawer ───────────────────────────────────────────────────────
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [quickLogDate, setQuickLogDate] = useState<Date | null>(null);

  // ── Fast Quick-Log bar (inline natural-language entry) ─────────────────────
  const [quickLogBarInput, setQuickLogBarInput] = useState('');
  const [pendingLogEntries, setPendingLogEntries] = useState<ParsedEntry[]>([]);
  const [quickLogCommitError, setQuickLogCommitError] = useState<string | null>(null);

  /** Unique exercise names from session history + routines — fed to autocomplete. */
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

  // Resolve the Soma module's own encryption key independently of the Titan
  // key that TitanContent receives as a prop. Even though both currently
  // resolve to the same master key, fetching it via getModuleKey('soma')
  // keeps the subscription semantically correct and resilient to any future
  // per-module key derivation.
  useEffect(() => {
    let cancelled = false;
    getModuleKey('soma').then((key) => {
      if (!cancelled) setSomaEncryptionKey(key);
    });
    return () => { cancelled = true; };
  }, [getModuleKey]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeSomaProfile({ userId: user.uid, encryptionKey: somaEncryptionKey }, setSomaProfile);
    return unsub;
  }, [user?.uid, somaEncryptionKey]);

  // Derive prompt mode from active tab — always training now
  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PERSONA;
    return buildTitanSessionPrompt(profile, {
      mode: 'training',
      recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
      hormonalContext: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
    });
  }, [profile, globalSoul?.crossFunctionalState?.biological?.recoveryScore, globalSoul?.crossFunctionalState?.biological?.hormonalContext]);

  const ai = useModuleAI({
    moduleId: 'titan',
    systemPrompt,
    encryptionKey
  });

  // ── Direct Write (Logbook) Mode ────────────────────────────────────────────
  // Bypasses AI validation for session logging; persists directly to Firestore.
  const directWrite = profile?.directWriteMode ?? false;
  const [advisoryBanner, setAdvisoryBanner] = useState<string | null>(null);

  const handleToggleDirectWrite = useCallback(async () => {
    if (!profile || !encryptionKey || !user) return;
    const updated: TitanProfile = { ...profile, directWriteMode: !directWrite, updatedAt: new Date().toISOString() };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, directWrite, encryptionKey, user]);

  // Phase 6 — Agnes→Titan reactive Spine: auto-suggest deload on high stress events
  // Use a Set so COMPOUND_STRESS, BURNOUT_WARNING, COMMITMENT_MISSED, and FINANCIAL_STRESS deduplicate independently
  const handledSpineEventsRef = useRef<Set<string>>(new Set());
  useSpineEvent('COMPOUND_STRESS', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `compound-stress-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    const stressLoad = event.data?.stressLoad as number | undefined;
    const prompt = stressLoad != null && stressLoad >= 8
      ? `Agnes has flagged critical compound stress (level ${stressLoad}/10) across domains. Review my current training load and recommend a deload protocol or active recovery day. Consider adjusting this week's plan.`
      : `Agnes has flagged elevated compound stress. Should I scale back training intensity this week? Review my schedule and recovery state.`;
    ai.handleSendMessage(prompt);
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  useSpineEvent('BURNOUT_WARNING', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `burnout-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    ai.handleSendMessage(
      'Agnes has detected a burnout warning signal. Please reduce training volume immediately and suggest a 3–5 day active recovery protocol based on my current state.'
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  useSpineEvent('COMMITMENT_MISSED', useCallback((event) => {
    if (!profile?.onboardingComplete) return;
    const eventKey = `commitment-missed-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);
    // Only react to physical domain commitments (domain 'B' at event level, or 'physical' in data)
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

    // Only react when stress level is significant (≥7/10)
    const rawLevel = (event.data?.stressLevel ?? event.data?.level) as number | undefined;
    const stressLevel = rawLevel ?? 0;
    if (stressLevel < 7) return;

    ai.handleSendMessage(
      `[System] Financial stress detected at ${stressLevel}/10. ` +
      `This is a cortisol contributor that compresses recovery capacity. ` +
      `Please factor this into today's training intensity and recovery recommendations.`
    );
  }, [profile?.onboardingComplete, ai.handleSendMessage]));

  // ── Cycle auto-advance on load ───────────────────────────────────────
  // Guard ref: prevents a concurrent or double-invoke save if the profile
  // subscription fires before the first save resolves.
  const isAutoAdvancingRef = useRef(false);
  // Guard ref: prevents duplicate sessions from a rapid double-tap on Commit.
  const isCommittingQuickLogRef = useRef(false);

  useEffect(() => {
    // Prevent concurrent saves from multiple rapid subscription updates.
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

    // Nothing stale — no write needed, avoids any re-render churn.
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
  // Depend on the cycles array identity (not the whole profile) so we only
  // re-run when cycle data actually changes, not on every profile mutation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cycles, user, encryptionKey]);

  // ── NexusHandoff consume on mount (S21-010) ───────────────────────────────
  // Picks up any pending cross-module handoff stored for 'titan' (from Agnes,
  // Atlas, or any other module) and routes it to the AI as a prefixed context
  // message. The service clears the stored entry on consume automatically.
  useEffect(() => {
    const handoff = NexusHandoffService.consume('titan');
    if (!handoff) return;

    // Case 1 — Stress context delegated from Agnes
    if (handoff.type === 'delegate' && handoff.sourceModuleId === 'agnes') {
      ai.handleSendMessage(
        `[Context from Agnes] Stress context: ${handoff.content}. ` +
        `Please factor this into training recommendations.`
      );
    }
    // Case 2 — Commitment failure delegated from Atlas
    else if (handoff.sourceModuleId === 'atlas') {
      ai.handleSendMessage(
        `[Atlas] A physical commitment was missed: "${handoff.content}". ` +
        `Should we reschedule or adjust the training plan?`
      );
    }
    // Case 3 — Generic delegate with a content message
    else if (handoff.type === 'delegate') {
      ai.handleSendMessage(`[${handoff.sourceModuleId ?? 'System'}] ${handoff.content}`);
    }
    // Case 4 — Query result (response to a previous Titan query)
    else if (handoff.type === 'query_result') {
      ai.handleSendMessage(
        `[Query Result from ${handoff.sourceModuleId ?? 'module'}] ${handoff.content}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Medical-data vault advisory (S21-015) ─────────────────────────────────
  // Fires once per session when: onboarding complete + medical data present
  // + vault is currently accessible (not locked). Uses sessionStorage to ensure
  // it shows at most once per browser session, per user (prevents cross-user
  // leakage on shared devices).
  useEffect(() => {
    const hasMedicalData = (
      (profile?.labSummaries?.length ?? 0) > 0 ||
      (profile?.medicalImageAnalyses?.length ?? 0) > 0 ||
      (profile?.medications?.length ?? 0) > 0
    );
    if (!hasMedicalData) return;
    if (!profile?.onboardingComplete) return;

    // isModuleAccessible returns true when vault is open OR module has no vault
    // policy — in both cases the raw data is readable, so the advisory applies.
    const isAccessible = isModuleAccessible('titan');
    if (!isAccessible) return; // vault is locked — data is already protected

    const sessionKey = `titan-vault-advisory-${user?.uid ?? 'guest'}`;
    if (sessionStorage.getItem(sessionKey)) return; // already shown this session

    sessionStorage.setItem(sessionKey, '1');
    setShowAdvisory(true);
  }, [
    profile?.labSummaries?.length,
    profile?.medicalImageAnalyses?.length,
    profile?.medications?.length,
    profile?.onboardingComplete,
    // isModuleAccessible and user?.uid are intentionally omitted from the
    // dependency array: the session-storage guard means even if vault state
    // changes during the session the toast only fires once. Adding them would
    // cause the toast to re-trigger on every vault state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Auto-dismiss the advisory after 8 seconds
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

      ai.handleSendMessage(prompt);
    },
    [ai.handleSendMessage]
  );

  const handleGeneratePlan = useCallback(() => {
    ai.handleSendMessage('Generate a personalized weekly training routine based on my profile, goals, and current recovery state.');
  }, [ai.handleSendMessage]);

  const handleImportRoutine = useCallback(() => {
    ai.handleSendMessage("I already have a training routine I'd like to log. Let me describe it to you.");
  }, [ai.handleSendMessage]);

  // Send a manually-built routine to Titan AI for validation before it is committed.
  // Titan reviews it against the user's goals, recovery state, and training history,
  // then emits <action type="update_routine"> to persist it — keeping base context accurate.
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

    ai.handleSendMessage(prompt);
  }, [profile?.routines, ai.handleSendMessage]);

  // Send custom tracking field values to Titan AI for validation before commit.
  // The AI checks relevance to goals/nutrition/cycle context then emits update_titan_profile.
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

    ai.handleSendMessage(prompt);
  }, [ai.handleSendMessage]);

  // ── Fast Quick-Log bar handlers ────────────────────────────────────────────
  const handleQuickLogBarSubmit = useCallback((input: string) => {
    const result = parseQuickLogInput(input);
    if (result.isEmpty) return;
    // Annotate PR badges inline using the name-keyed profile.personalRecords.
    // (annotatePRs expects titan/types.PersonalRecord keyed by exerciseId, but
    //  stored PRs use lib/types.PersonalRecord keyed by exerciseName, so we do
    //  the comparison here to avoid a cross-type mismatch.)
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

  const handleQuickLogBarCommit = useCallback(async () => {
    if (!profile || !encryptionKey || !user || pendingLogEntries.length === 0) return;
    // Guard against duplicate sessions from rapid double-tap on the Commit button.
    if (isCommittingQuickLogRef.current) return;
    isCommittingQuickLogRef.current = true;
    setQuickLogCommitError(null);
    try {
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
        status: 'completed',
      };

      const updatedSessions = [session, ...(profile.workoutSessions ?? [])].slice(0, 500);
      const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };

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
        ...profile,
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
  }, [profile, encryptionKey, user, pendingLogEntries]);

  // Tab data
  const activeCycleCount = (profile?.cycles ?? []).filter(c => c.status === 'active').length;

  const tabs: NeuralTabItem<TitanTab>[] = [
    { id: 'training', label: 'Training', icon: Activity },
    { id: 'progress', label: 'Progress', icon: BarChart3, badge: (profile?.personalRecords ? Object.keys(profile.personalRecords).length : undefined) },
    { id: 'sleep', label: 'Sleep', icon: Moon, badge: (profile?.sleepLog?.length) || undefined },
    { id: 'cycles', label: 'Cycles', icon: RefreshCw, badge: activeCycleCount || undefined },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'progress':
        return (
          <div className="px-4 md:px-8 pb-8 pt-4 space-y-6">
            <PRBoard
              personalRecords={Object.values(profile?.personalRecords ?? {})}
              workoutLogs={profile?.workoutLogs ?? []}
            />
            <ProgressTab
              profile={profile}
              encryptionKey={encryptionKey}
            />
          </div>
        );

      case 'cycles':
        return (
          <div className="px-8 pb-8 pt-4">
            <CycleManager
              cycles={profile?.cycles ?? []}
              onSubmitForApproval={ai.handleSendMessage}
              directWriteMode={directWrite}
              onDirectCreate={async (cycle: CycleEntry) => {
                if (!profile || !encryptionKey || !user) return;
                const updated: TitanProfile = {
                  ...profile,
                  cycles: [...(profile.cycles ?? []), cycle],
                  updatedAt: new Date().toISOString(),
                };
                await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
              }}
              onDirectDelete={async (cycleId: string) => {
                if (!profile || !encryptionKey || !user) return;
                const updated: TitanProfile = {
                  ...profile,
                  cycles: (profile.cycles ?? []).filter(c => c.id !== cycleId),
                  updatedAt: new Date().toISOString(),
                };
                await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
              }}
            />
          </div>
        );

      case 'sleep':
        return (
          <div className="pb-8">
            <SleepTracker
              sleepLog={profile?.sleepLog ?? []}
              onAnalyze={directWrite ? undefined : (prompt: string) => { ai.handleSendMessage(prompt); }}
              directWriteMode={directWrite}
              onDirectSave={async (entry: SleepEntry) => {
                if (!profile || !encryptionKey || !user) return;
                const updatedLog = [entry, ...(profile.sleepLog ?? [])].slice(0, 365);
                const updated: TitanProfile = {
                  ...profile,
                  sleepLog: updatedLog,
                  updatedAt: new Date().toISOString(),
                };
                await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
              }}
            />
          </div>
        );

      default: // training
        return (
          <>
            {/* Advisory banner — surfaced after high-RPE direct-write sessions */}
            <AnimatePresence>
              {advisoryBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-4 md:mx-8 mb-3 flex items-start justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
                >
                  <p className="text-xs text-amber-300">{advisoryBanner}</p>
                  <button type="button" onClick={() => setAdvisoryBanner(null)} className="ml-3 text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 7-day calendar — primary training view */}
            <div className="px-4 md:px-8 pb-4 pt-2">
              {/* Quick Log CTA — prominent button to open drawer for today */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider">This Week</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuickLogDate(new Date());
                    setIsQuickLogOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Quick Log
                </button>
              </div>
              <TrainingCalendar
                workoutLogs={profile?.workoutLogs ?? []}
                sessions={profile?.workoutSessions}
                onQuickLog={(isoDate) => {
                  // QuickLogDrawer expects a Date; parse the ISO string at noon
                  // local time to avoid midnight UTC-offset shifts.
                  setQuickLogDate(new Date(`${isoDate}T12:00:00`));
                  setIsQuickLogOpen(true);
                }}
              />
            </div>

            {/* Quick session logger for calendar-selected routine */}
            {calendarSelectedRoutine && (
              <div className="px-8 pb-4 pt-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">
                    Session: {calendarSelectedRoutine.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedRoutine(null)}
                    className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    ✕ Dismiss
                  </button>
                </div>
                <WorkoutSessionLogger
                  routines={[calendarSelectedRoutine]}
                  recentSessions={profile?.workoutSessions ?? []}
                  onSubmitSession={(prompt) => {
                    ai.handleSendMessage(prompt);
                    setCalendarSelectedRoutine(null);
                  }}
                  directWriteMode={directWrite}
                  onDirectCommit={async (session) => {
                    if (!profile || !encryptionKey || !user) return;
                    const updatedSessions = [session, ...(profile.workoutSessions ?? [])].slice(0, 500);
                    const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };
                    for (const exLog of session.exercises) {
                      const key = exLog.exerciseName.toLowerCase().trim();
                      for (const s of exLog.sets) {
                        if (!s.completed || !s.weight || !s.repsCompleted) continue;
                        const e1RM = calculateE1RM(s.weight, s.repsCompleted);
                        const existing = updatedPRs[key];
                        if (!existing || e1RM > existing.e1RM) {
                          updatedPRs[key] = { exerciseName: exLog.exerciseName, maxWeight: s.weight, repsAtMax: s.repsCompleted, e1RM, achievedDate: session.date, sessionId: session.id };
                        }
                      }
                    }
                    const updated: TitanProfile = { ...profile, workoutSessions: updatedSessions, personalRecords: updatedPRs, updatedAt: new Date().toISOString() };
                    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
                    setCalendarSelectedRoutine(null);
                    if (session.rpe != null && session.rpe >= 9) {
                      setAdvisoryBanner(`High RPE (${session.rpe}) detected — consider scheduling a deload day tomorrow.`);
                    }
                  }}
                />
              </div>
            )}

            {/* Soma health snapshot — deep-links to Soma module */}
            <div className="px-4 md:px-8 mb-2">
              <SomaSnapshotWidget
                clearanceStatus={somaProfile?.clearances?.[0]?.status as 'granted' | 'pending' | 'denied' | undefined ?? null}
                lastBiomarkerDate={somaProfile?.biomarkers?.[0]?.recordedAt ?? null}
              />
            </div>

            {/* Clearance warning banner — only shown when denied/pending */}
            <ClearanceBanner
              status={somaProfile?.clearances?.[0]?.status as 'granted' | 'pending' | 'denied' | undefined}
              className="mx-4 md:mx-8 mb-4"
            />

            {/* Readiness first — sets daily training context */}
            <TitanDashboard soul={globalSoul} isLocked={isLocked} onCalibrate={handleCalibrate} />

            {/* Routine management with manual builder */}
            <TitanRoutinePanel
              routines={profile?.routines || []}
              onAnalyzeRoutine={handleAnalyzeRoutine}
              onGeneratePlan={handleGeneratePlan}
              onImportRoutine={handleImportRoutine}
              onSubmitForApproval={handleSubmitRoutineForApproval}
              onStartSession={(routine) => setCalendarSelectedRoutine(routine)}
            />

            {/* Session logger — shows all routines when no specific routine is selected via Start Session */}
            {!calendarSelectedRoutine && profile?.routines && profile.routines.length > 0 && (
              <div className="px-8 pb-4 pt-4">
                <WorkoutSessionLogger
                  routines={profile.routines}
                  recentSessions={profile?.workoutSessions ?? []}
                  onSubmitSession={ai.handleSendMessage}
                  directWriteMode={directWrite}
                  onDirectCommit={async (session) => {
                    if (!profile || !encryptionKey || !user) return;
                    const updatedSessions = [session, ...(profile.workoutSessions ?? [])].slice(0, 500);
                    const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };
                    for (const exLog of session.exercises) {
                      const key = exLog.exerciseName.toLowerCase().trim();
                      for (const s of exLog.sets) {
                        if (!s.completed || !s.weight || !s.repsCompleted) continue;
                        const e1RM = calculateE1RM(s.weight, s.repsCompleted);
                        const existing = updatedPRs[key];
                        if (!existing || e1RM > existing.e1RM) {
                          updatedPRs[key] = { exerciseName: exLog.exerciseName, maxWeight: s.weight, repsAtMax: s.repsCompleted, e1RM, achievedDate: session.date, sessionId: session.id };
                        }
                      }
                    }
                    const updated: TitanProfile = { ...profile, workoutSessions: updatedSessions, personalRecords: updatedPRs, updatedAt: new Date().toISOString() };
                    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
                    if (session.rpe != null && session.rpe >= 9) {
                      setAdvisoryBanner(`High RPE (${session.rpe}) detected — consider scheduling a deload day tomorrow.`);
                    }
                  }}
                />
              </div>
            )}

            {/* Volume analytics */}
            {profile?.routines && profile.routines.length > 0 && (
              <div className="px-8 pb-4 pt-4">
                <RoutineProgress routines={profile.routines} workoutSessions={profile.workoutSessions} />
              </div>
            )}

            {/* Custom tracking fields */}
            {profile && (
              <div className="px-8 pb-8 pt-2">
                <CustomFieldManager
                  currentValues={profile.nutrition || {}}
                  onSubmitForApproval={handleSubmitCustomFieldsForApproval}
                />
              </div>
            )}

            {/* Bottom padding so content isn't flush against the QuickLogBar */}
            <div className="h-4" aria-hidden="true" />
          </>
        );
    }
  };

  return (
    <>
      <SingleAgentLayout
        moduleId="titan"
        agentName={agentAlias}
        themeColor="orange"
        ai={ai}
        authMode="titan"
        placeholder="Input training data or queries..."
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <SectionHeader
              label="Performance Domain"
              title="Titan Strategy & Readiness"
              subtitle="Elite physical performance optimization and biometric clearance."
              accentClassName="text-orange-400"
            />
            {/* Direct Write / Logbook Mode toggle */}
            <div className="flex items-center gap-2 text-xs mt-1 shrink-0">
              <span className="text-white/40">{directWrite ? 'Logbook' : 'Coach'}</span>
              <NeuralToggle
                checked={directWrite}
                onChange={handleToggleDirectWrite}
                color="orange"
                label={directWrite ? 'Logbook Mode: sessions save instantly' : 'Coach Mode: AI reviews your sessions'}
              />
              <Zap className={cn('w-3 h-3 transition-colors', directWrite ? 'text-orange-400' : 'text-white/30')} />
            </div>
          </div>
        </div>

        <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
          <NeuralTabGroup
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            themeColor="orange"
          />
        </div>

        <div
          role="tabpanel"
          id={`tab-panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pt-4 md:pt-6"
          )}>
          {renderTabContent()}
        </div>

        {/* Quick-log bar footer — constrained to left panel, not fixed to viewport */}
        {activeTab === 'training' && (
          <>
            {/* Log confirm card — slides up after parse */}
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
            <QuickLogBar
              value={quickLogBarInput}
              onChange={setQuickLogBarInput}
              onSubmit={handleQuickLogBarSubmit}
              recentSessions={profile?.workoutSessions ?? []}
              disabled={pendingLogEntries.length > 0}
            />
          </>
        )}
      </div>
      </SingleAgentLayout>

      {/* Quick-log drawer — rendered at root level so it overlays everything */}
      <QuickLogDrawer
        isOpen={isQuickLogOpen}
        onClose={() => setIsQuickLogOpen(false)}
        selectedDate={quickLogDate}
        existingExercises={existingExercises}
        onCommit={async (payload: QuickLogPayload) => {
          if (!profile || !encryptionKey || !user) return;
          const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };

          if ('exercises' in payload) {
            // ── WorkoutSession path (free-text exercise) ──────────────────
            const session = payload;
            const updatedSessions = [session, ...(profile.workoutSessions ?? [])].slice(0, 500);
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
                    achievedDate: session.date,
                    sessionId: session.id,
                  };
                }
              }
            }
            const updated: TitanProfile = {
              ...profile,
              workoutSessions: updatedSessions,
              personalRecords: updatedPRs,
              updatedAt: new Date().toISOString(),
            };
            await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
          } else {
            // ── QuickLogRecord path (library exercise with e1RM) ──────────
            const record = payload;
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
            // Also add a minimal WorkoutSession so the calendar is populated.
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
              status: 'completed',
            };
            const updatedSessions = [session, ...(profile.workoutSessions ?? [])].slice(0, 500);
            const updated: TitanProfile = {
              ...profile,
              workoutSessions: updatedSessions,
              personalRecords: updatedPRs,
              updatedAt: new Date().toISOString(),
            };
            await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
          }
        }}
      />

      {/* ── Medical-data vault advisory toast (S21-015) ───────────────────
          Shown once per session when vault is accessible and the profile
          contains lab reports, clinical flags, or medications. Purely
          advisory — no forced migration or breaking changes.                */}
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
            className="fixed bottom-6 right-6 z-[var(--z-toast)] w-[340px] max-w-[calc(100vw-3rem)] rounded-2xl border border-amber-500/30 bg-[#05050a]/95 backdrop-blur-xl p-4 shadow-2xl pointer-events-auto"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-bold leading-snug">
                  Medical data is unprotected
                </p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  Your Titan profile contains lab reports or clinical data. Lock the vault to encrypt it.
                </p>
                <button
                  onClick={() => { lockVault(); setShowAdvisory(false); }}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-[11px] font-semibold text-amber-300 transition-colors"
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

export default function TitanPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<TitanProfile>
      moduleId="titan"
      profileOptions={{
        loadProfile: loadTitanProfile,
        saveProfile: saveTitanProfile,
        subscribeProfile: subscribeTitanProfile,
        refreshProfile: loadTitanProfile,
        syncGuestProfile: syncGuestTitanProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <TitanOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForTitan({ coreProfile, titanProfile: profile })}
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
              console.error('Titan onboarding completion sync failed:', e);
            }
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <TitanContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
