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
import { SleepTracker } from './components/SleepTracker';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { TitanProfile, Routine, Exercise, WorkoutSession, PersonalRecord, SomaProfile, ExerciseLog } from '@/lib/types';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { subscribeSomaProfile } from '../soma/services/soma-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { Activity, BarChart3, RefreshCw, Zap, X, Plus, Moon } from 'lucide-react';
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
  const { isModuleAccessible, getModuleKey } = useVault();
  const { user } = useAuth();
  const isLocked = !isModuleAccessible('titan');
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
  // Use a Set so COMPOUND_STRESS and BURNOUT_WARNING deduplicate independently
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

  // ── Cycle auto-advance on load ───────────────────────────────────────
  // Guard ref: prevents a concurrent or double-invoke save if the profile
  // subscription fires before the first save resolves.
  const isAutoAdvancingRef = useRef(false);

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
    // Pass empty array for PRs to avoid type mismatch between titan/types and lib/types PersonalRecord
    const annotated = annotatePRs(result.entries, []);
    setPendingLogEntries(annotated);
  }, []);

  const handleQuickLogBarCommit = useCallback(async () => {
    if (!profile || !encryptionKey || !user || pendingLogEntries.length === 0) return;
    setQuickLogCommitError(null);
    try {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const sessionId = `ql-fast-${Date.now()}`;

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
          const e1RM = s.repsCompleted === 1
            ? s.weight
            : Math.round(s.weight * (1 + s.repsCompleted / 30));
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
            />
          </div>
        );

      case 'sleep':
        return (
          <div className="px-4 md:px-8 pb-8 pt-4">
            <SleepTracker
              sleepLog={profile?.sleepLog ?? []}
              onAnalyze={ai.handleSendMessage}
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
                <WorkoutSessionLogger
                  routines={[calendarSelectedRoutine]}
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
                        const e1RM = s.repsCompleted === 1 ? s.weight : Math.round(s.weight * (1 + s.repsCompleted / 30));
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
            />

            {/* Session logger — log actual vs planned performance */}
            {profile?.routines && profile.routines.length > 0 && (
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
                        const e1RM = s.repsCompleted === 1 ? s.weight : Math.round(s.weight * (1 + s.repsCompleted / 30));
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
                const e1RM =
                  s.repsCompleted === 1
                    ? s.weight
                    : Math.round(s.weight * (1 + s.repsCompleted / 30));
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
