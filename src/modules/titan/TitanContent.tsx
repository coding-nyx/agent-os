import React, { useState, useRef, useCallback } from 'react';
import { AnalyticsTab } from './components/AnalyticsTab';
import { QuickLogDrawer } from './components/QuickLogDrawer';
import type { QuickLogPayload } from './components/QuickLogDrawer';
import { QuickLogBar } from './components/QuickLogBar';
import { LogConfirmCard } from './components/LogConfirmCard';
import { TitanProposalCard } from './components/TitanProposalCard';
import { RecoveryPlanModal } from './components/RecoveryPlanModal';
import { RecoveryBanner } from './components/RecoveryBanner';
import { RecoveryCheckinPanel } from './components/RecoveryCheckinPanel';
import { RecoveryManager } from './components/RecoveryManager';
import { TrainTab } from './tabs/TrainTab';
import { PlanTab } from './tabs/PlanTab';
import { BodyTab } from './tabs/BodyTab';
import { CyclesTab } from './tabs/CyclesTab';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  TitanProfile,
  WorkoutSession,
  PersonalRecord,
} from '@/lib/types';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { NeuralModal } from '@/core/components/NeuralModal';
import { Activity, RefreshCw, Zap, X, ShieldAlert, TrendingUp, Scale, Dumbbell, Trophy } from 'lucide-react';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { TitanNotificationSettingsPanel } from './components/TitanNotificationSettingsPanel';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';
import { saveTitanProfile } from './services/titan-profile-service';
import { calculateE1RM } from './utils/e1rm';

// ── Custom hooks ──────────────────────────────────────────────────────────────
import type { TitanTab } from './hooks/types';
import { useTitanKeyboardLayout } from './hooks/useTitanKeyboardLayout';
import { useTitanSomaSync } from './hooks/useTitanSomaSync';
import { useTitanClearanceGate } from './hooks/useTitanClearanceGate';
import { useTitanRecovery } from './hooks/useTitanRecovery';
import { useTitanQuickLog } from './hooks/useTitanQuickLog';
import { useTitanDirectWrite } from './hooks/useTitanDirectWrite';
import { useTitanProgram } from './hooks/useTitanProgram';
import { useTitanSpineEvents } from './hooks/useTitanSpineEvents';
import { useTitanCycleAutoAdvance } from './hooks/useTitanCycleAutoAdvance';
import { useTitanChat } from './hooks/useTitanChat';
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
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const globalSoulRef = useRef(globalSoul);
  globalSoulRef.current = globalSoul;
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

  const chat = useTitanChat({
    profile,
    encryptionKey,
    user: user ?? null,
    somaProfile,
    globalSoul,
    isRecoveryActive,
    isModuleAccessible,
    lockVault,
    setIsChatCollapsed,
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
    ai: { handleSendMessage: (msg: string) => chat.ai.handleSendMessage(msg) },
  });

  const directWriteHook = useTitanDirectWrite({
    profile,
    encryptionKey,
    user: user ?? null,
  });

  const quickLog = useTitanQuickLog({
    profile,
    encryptionKey,
    user,
    isRecoveryActive,
    trainingGateState: clearanceGate.trainingGateState,
    loadLatestPersistedProfile: directWriteHook.loadLatestPersistedProfile,
    setRecoveryGate: clearanceGate.setRecoveryGate,
  });

  const program = useTitanProgram({
    profile,
    encryptionKey,
    user: user ?? null,
  });

  const spineEvents = useTitanSpineEvents({
    profile,
    encryptionKey,
    user: user ?? null,
    isGuest,
    globalSoulRef,
    openChatAndSend: chat.openChatAndSend,
    handleSendMessage: chat.ai.handleSendMessage,
    setSomaConsult: recovery.setSomaConsult,
    setAgnesConsult: recovery.setAgnesConsult,
    setPendingConsults: recovery.setPendingConsults,
    setActiveTab,
    locationState: location.state,
  });

  useTitanCycleAutoAdvance({ profile, encryptionKey, user: user ?? null });

  // ── Biomarker migration (Titan → Soma, one-shot per profile load) ──────────
  const migrationRanRef = React.useRef(false);
  React.useEffect(() => {
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

  const handleOpenResumeModal = useCallback(() => recovery.setIsResumeModalOpen(true), [recovery]);
  const handleOpenRecoveryQuickLog = useCallback(() => {
    quickLog.setQuickLogIsRecovery(true);
    quickLog.setQuickLogDate(new Date());
    quickLog.setIsQuickLogOpen(true);
  }, [quickLog]);
  const handleDismissAdvisoryBanner = useCallback(() => clearanceGate.setAdvisoryBanner(null), [clearanceGate]);
  const handleOpenQuickLogForDate = useCallback((date: Date, isRecovery: boolean) => {
    quickLog.setQuickLogDate(date);
    quickLog.setQuickLogIsRecovery(isRecovery);
    quickLog.setIsQuickLogOpen(true);
  }, [quickLog]);
  const handleDismissProposal = useCallback(() => spineEvents.setActiveProposal(null), [spineEvents]);
  const handleOpenRecoveryModal = useCallback(() => recovery.openRecoveryModal(null), [recovery]);
  const handleOpenManualLog = useCallback(() => {
    quickLog.setQuickLogDate(new Date());
    quickLog.setQuickLogIsRecovery(isRecoveryActive);
    quickLog.setIsQuickLogOpen(true);
  }, [quickLog, isRecoveryActive]);
  const handleOpenChatCollapsed = useCallback(() => setIsChatCollapsed(false), [setIsChatCollapsed]);
  const handleCardioTab = useCallback(() => setActiveTab('body'), [setActiveTab]);
  const handleCloseQuickLog = useCallback(() => {
    quickLog.setIsQuickLogOpen(false);
    quickLog.setQuickLogIsRecovery(false);
  }, [quickLog]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'recovery':
        return (
          <RecoveryManager
            recoveryPlan={recoveryPlan}
            daysRemaining={recovery.daysRemaining}
            hasCheckinToday={recovery.hasCheckinToday}
            onResume={handleOpenResumeModal}
            onSaveCheckin={recovery.handleSaveRecoveryCheckin}
            onOpenQuickLog={handleOpenRecoveryQuickLog}
          />
        );
      case 'analytics':
        return <AnalyticsTab profile={profile} />;
      case 'body':
        return (
          <BodyTab
            profile={profile}
            encryptionKey={encryptionKey}
            directWriteMode={directWriteHook.directWrite}
            onAnalyze={chat.openChatAndSend}
            onDirectSaveBodyWeight={directWriteHook.handleDirectSaveBodyWeight}
            onDirectSaveCardio={directWriteHook.handleDirectSaveCardio}
            onDirectSaveSleep={directWriteHook.handleDirectSaveSleep}
            mealLog={profile?.mealLog}
            macroTargets={profile?.nutrition?.macroEstimate}
            onDirectSaveMeal={directWriteHook.handleDirectSaveMeal}
            onDirectSaveInjury={directWriteHook.handleDirectSaveInjury}
            onDirectUpdateInjury={directWriteHook.handleDirectUpdateInjury}
            goals={profile?.goals}
            onDirectSaveGoal={directWriteHook.handleDirectSaveGoal}
            onDirectUpdateGoal={directWriteHook.handleDirectUpdateGoal}
          />
        );
      case 'cycles':
        return (
          <CyclesTab
            cycles={profile?.cycles ?? []}
            directWriteMode={directWriteHook.directWrite}
            onSubmitForApproval={chat.openChatAndSend}
            onDirectCreate={directWriteHook.handleDirectCreateCycle}
            onDirectDelete={directWriteHook.handleDirectDeleteCycle}
          />
        );
      case 'plan':
        return (
          <PlanTab
            key={`plan-${program.planResetVersion}`}
            profile={profile}
            directWriteMode={directWriteHook.directWrite}
            onAnalyzeRoutine={chat.handleAnalyzeRoutine}
            onGeneratePlan={chat.handleGeneratePlan}
            onImportRoutine={chat.handleImportRoutine}
            onSubmitRoutineForApproval={chat.handleSubmitRoutineForApproval}
            onStartSession={(routine) => {
              setCalendarSelectedRoutine(routine);
              setActiveTab('train');
            }}
            onSubmitCustomFieldsForApproval={chat.handleSubmitCustomFieldsForApproval}
            onDirectCreateMacros={directWriteHook.handleDirectCreateMacros}
            onApplyProgram={program.handleApplyProgram}
            onClearProgram={program.handleClearProgram}
            onUpdateProgram={program.handleUpdateProgram}
            plannedWorkouts={profile?.plannedWorkouts}
            completedSessions={profile?.workoutSessions}
            onDirectSavePlan={directWriteHook.handleDirectSavePlan}
            onDirectUpdatePlan={directWriteHook.handleDirectUpdatePlan}
            onAnalyzePlan={chat.ai.handleSendMessage}
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
            directWriteMode={directWriteHook.directWrite}
            advisoryBanner={clearanceGate.advisoryBanner}
            onDismissAdvisory={handleDismissAdvisoryBanner}
            calendarSelectedRoutine={calendarSelectedRoutine}
            onCalendarRoutineSelect={setCalendarSelectedRoutine}
            plannedWorkouts={profile?.plannedWorkouts}
            onOpenQuickLog={handleOpenQuickLogForDate}
            onRemindDate={quickLog.setRemindDate}
            onCalibrate={chat.handleCalibrate}
            onOpenChatAndSend={chat.openChatAndSend}
            guardRecoveryAction={clearanceGate.guardRecoveryAction}
            commitWorkoutSession={directWriteHook.commitWorkoutSession}
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
        agentName={chat.agentAlias}
        themeColor="module"
        ai={chat.ai}
        authMode="titan"
        placeholder="Input training data or queries..."
        isChatCollapsed={isChatCollapsed}
        onToggleChat={setIsChatCollapsed}
        hideChatTrigger={activeTab === 'train'}
        aboveInput={
          spineEvents.activeProposal ? (
            <div className="px-3 sm:px-4 pb-2">
              <TitanProposalCard
                proposal={spineEvents.activeProposal}
                onAction={spineEvents.handleProposalAction}
                onDismiss={handleDismissProposal}
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
                onResume={handleOpenResumeModal}
              />
            </div>
          )}

          <div className="shrink-0 border-b border-white/[0.09] px-4 pb-4 sm:px-6 sm:pb-5 md:px-8 md:pb-6">
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
                      onClick={handleOpenRecoveryModal}
                      className="min-h-9 rounded-xl px-3.5 text-[11px] font-semibold tracking-[0.02em]"
                    >
                      Start Recovery
                    </NeuralButton>

                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-[11px] sm:text-xs">
                      <span className="font-medium text-white/45">
                        {directWriteHook.directWrite ? 'Direct Logbook' : 'Coach Review'}
                      </span>
                      <NeuralToggle
                        checked={directWriteHook.directWrite}
                        onChange={directWriteHook.handleToggleDirectWrite}
                        color="orange"
                        label={directWriteHook.directWrite ? 'Direct Logbook Mode: sessions save instantly' : 'Coach Review Mode: Titan reviews session updates before commit'}
                      />
                      <Zap className={cn('h-3.5 w-3.5 transition-colors', directWriteHook.directWrite ? 'text-[var(--module-color-400)]' : 'text-white/30')} />
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
                      onOpenChat={handleOpenChatCollapsed}
                      onManualLog={handleOpenManualLog}
                      onCardioLog={handleCardioTab}
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
        isOpen={program.isClearProgramModalOpen}
        onClose={() => program.setIsClearProgramModalOpen(false)}
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
              onClick={() => program.setIsClearProgramModalOpen(false)}
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="danger"
              onClick={() => void program.handleConfirmClearProgram()}
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
        onClose={handleCloseQuickLog}
        selectedDate={quickLog.quickLogDate}
        existingExercises={chat.existingExercises}
        recoverySession={quickLog.quickLogIsRecovery}
        onCommit={async (payload: QuickLogPayload) => {
          if (!profile || !encryptionKey || !user) return;

          const handleCommit = async (isRecovery: boolean) => {
            if ('exercises' in payload) {
              await directWriteHook.commitWorkoutSession({ ...payload, recoverySession: isRecovery }, isRecovery);
            } else {
              const latestProfile = await directWriteHook.loadLatestPersistedProfile();
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
        {chat.showAdvisory && (
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
                  onClick={() => { lockVault(); chat.setShowAdvisory(false); }}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-[var(--module-accent-muted)] hover:bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] text-[11px] font-semibold text-[var(--module-color-300)] transition-colors"
                  aria-label="Lock vault now"
                >
                  Lock Vault
                </button>
              </div>
              <button
                onClick={() => chat.setShowAdvisory(false)}
                className="w-6 h-6 rounded-lg bg-white/[0.045] hover:bg-white/10 flex items-center justify-center shrink-0 transition-colors"
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
