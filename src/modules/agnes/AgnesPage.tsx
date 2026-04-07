import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { AgnesOnboarding } from './onboarding/AgnesOnboarding';
import { LogOut, Brain, Clock, MessageSquare, Shield, Settings, CheckSquare } from 'lucide-react';
import { SomaticSessionPicker } from './components/somatic/SomaticSessionPicker';
import { BreathworkExercise } from './components/somatic/BreathworkExercise';
import { GroundingExercise } from './components/somatic/GroundingExercise';
import { AgnesTelemetryHeader } from './components/AgnesTelemetryHeader';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { AnimatePresence, motion } from 'framer-motion';
import { NexusChat } from '@/core/components/NexusChat';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { AgnesClosingBar } from './components/AgnesClosingBar';
import { Agnes3DEnvironment } from './components/Agnes3DEnvironment';
import { AgnesSettingsPanel } from './components/AgnesSettingsPanel';
import { AgnesDashboard } from './components/AgnesDashboard';
import { AgnesSanctuarySidebar } from './components/AgnesSanctuarySidebar';
import { AgnesSanctuaryContent } from './components/AgnesSanctuaryContent';
import { AgnesEngagementModeControl } from './components/AgnesEngagementModeControl';
import {
  createEmptyAgnesProfile,
  loadAgnesProfile,
  saveAgnesProfile,
  subscribeAgnesProfile,
  TherapyIntakeProfile,
} from './services/agnes-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import type { ContentRenderProps } from '@/core/components/UnifiedModulePage';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { AgnesNotificationSettingsPanel } from './components/AgnesNotificationSettingsPanel';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { SanctuaryBackground } from './components/SanctuaryBackground';
import type { Message } from '@/lib/types';
import type { AgnesState } from './hooks/types';

// Extracted hooks
import { useAgnesEngagement } from './hooks/useAgnesEngagement';
import { useAgnesBeliefs } from './hooks/useAgnesBeliefs';
import { useAgnesSomatic } from './hooks/useAgnesSomatic';
import { useAgnesSystemPrompt } from './hooks/useAgnesSystemPrompt';
import { useAgnesSession } from './hooks/useAgnesSession';

const AgnesSidebar = React.memo(function AgnesSidebar({
  profile,
  agentAlias,
  onSave,
}: {
  profile: TherapyIntakeProfile | null;
  agentAlias: string;
  onSave: (updated: TherapyIntakeProfile) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const toggleCollapsed = React.useCallback(() => setCollapsed((c) => !c), []);

  return (
    <AgnesSanctuarySidebar
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      agentAlias={agentAlias}
      profile={profile}
    />
  );
});

interface AgnesContentProps extends ContentRenderProps<TherapyIntakeProfile> {}

function AgnesContent({
  profile,
  encryptionKey,
  setSessionActive,
}: AgnesContentProps) {
  const { user } = useAuth();
  const { isModuleAccessible } = useVault();
  const isAccessible = isModuleAccessible('agnes');

  // ── Lifted shared state ─────────────────────────────────────────────────
  // These are shared across multiple hooks and must be owned at the component level.
  const [currentState, setCurrentState] = useState<AgnesState>('selecting');
  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());

  // Ref for messages — populated by session hook's return, read at call-time by
  // engagement and system-prompt hooks without creating circular deps.
  const messagesRef = useRef<Message[]>([]);

  // ── 1. Engagement mode management ───────────────────────────────────────
  const engagement = useAgnesEngagement({
    profile,
    encryptionKey,
    sessionType,
    messagesRef,
  });

  // ── 2. Beliefs ──────────────────────────────────────────────────────────
  const beliefs = useAgnesBeliefs({
    encryptionKey,
    currentState,
  });

  // ── 3. System prompt ────────────────────────────────────────────────────
  const prompt = useAgnesSystemPrompt({
    profile,
    engagementMode: engagement.engagementMode,
    modeContinuity: engagement.modeContinuity,
    isImpromptu: engagement.isImpromptu,
    activeBeliefContext: beliefs.activeBeliefContext,
    sessionStartedAt,
    messagesRef,
  });

  // ── 4. Session lifecycle (orchestrator) ─────────────────────────────────
  const session = useAgnesSession({
    profile,
    encryptionKey,
    setSessionActive,
    currentState,
    setCurrentState,
    sessionType,
    setSessionType,
    sessionStartedAt,
    setSessionStartedAt,
    engagementMode: engagement.engagementMode,
    preferredPersistentMode: engagement.preferredPersistentMode,
    isImpromptu: engagement.isImpromptu,
    resetEngagementToPreferred: engagement.resetEngagementToPreferred,
    setEngagementForImpromptu: engagement.setEngagementForImpromptu,
    setEngagementForSession: engagement.setEngagementForSession,
    resetOnLogout: engagement.resetOnLogout,
    activeBeliefContext: beliefs.activeBeliefContext,
    setActiveBeliefContext: beliefs.setActiveBeliefContext,
    flushPendingPostSessionWorkflow: beliefs.flushPendingPostSessionWorkflow,
    autoHandlePendingBeliefSuggestions: beliefs.autoHandlePendingBeliefSuggestions,
    acceptBeliefInvitationAndGetContext: beliefs.acceptBeliefInvitationAndGetContext,
    systemPrompt: prompt.systemPrompt,
    getSessionProgressBlock: prompt.getSessionProgressBlock,
  });

  // Keep messagesRef live so engagement & prompt hooks read current messages at call-time.
  messagesRef.current = session.messages;

  // ── 5. Somatic ──────────────────────────────────────────────────────────
  const somatic = useAgnesSomatic({
    currentState,
    onboardingComplete: profile?.onboardingComplete,
    setCurrentState,
  });

  // ── Destructure for JSX readability ─────────────────────────────────────
  const {
    agentAlias,
    hasActiveSession,
    detectedPhase,
    isSettingsOpen,
    setIsSettingsOpen,
    isSummarizing,
    isClosingSession,
    isCompactingMemory,
    compactMemoryStatus,
    sessionSummary,
    setSessionSummary,
    setCompactMemoryStatus,
    messages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    routingSuggestion,
    pendingApprovals,
    approveAction,
    dismissAction,
    startSession,
    endSession,
    handleSendMessageWithArcCheck,
    handleMergeAndClose,
    handleDiscardAndClose,
    handleCompactCurrentMemory,
    handleAcceptBeliefInvitation,
    handleRouteConfirm,
    handleRouteDismiss,
  } = session;

  const userName = (typeof profile?.baseContext?.identity === 'object'
    ? profile?.baseContext?.identity?.name
    : profile?.baseContext?.identity) || (user as unknown as { displayName?: string })?.displayName || 'User';

  // ── JSX ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full relative">
      <SanctuaryBackground />

      <div className="absolute inset-0 pointer-events-none">
        <Agnes3DEnvironment activeSession={currentState === 'session'} isProcessing={isProcessing} />
      </div>

      <div className={cn(
        "flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)] w-full min-w-0"
      )}>
        <AnimatePresence mode="wait">
          {currentState === 'selecting' ? (
            <motion.div
              key="selecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0 h-full"
            >
              {isHydrating ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/50">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
                  <span className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-400/70">Restoring Session</span>
                </div>
              ) : (
                <AgnesSanctuaryContent
                  onStartSession={startSession}
                  onConfirmBeliefProposal={beliefs.handleConfirmBeliefProposal}
                  onDismissBeliefProposal={beliefs.handleDismissBeliefProposal}
                  onAcceptInvitation={handleAcceptBeliefInvitation}
                  onDismissInvitation={beliefs.handleDismissBeliefInvitation}
                  onCompactBeliefGraph={beliefs.handleCompactBeliefGraph}
                  selectedPersistentMode={engagement.preferredPersistentMode}
                  onPersistentModeChange={engagement.handlePreferredPersistentModeChange}
                  agentAlias={agentAlias}
                  userName={userName}
                  somaticEnabled={engagement.somaticEnabled}
                  isAccessible={isAccessible}
                  hasActiveSession={hasActiveSession}
                  beliefGraph={beliefs.beliefGraph}
                  beliefWorkflow={beliefs.beliefWorkflow}
                  beliefInvitationSnapshot={beliefs.beliefInvitationSnapshot}
                  beliefWorkflowBusy={beliefs.beliefWorkflowBusy}
                  compactBeliefGraphBusy={beliefs.isCompactingBeliefGraph}
                  compactBeliefGraphStatus={beliefs.compactBeliefGraphStatus}
                />
              )}
            </motion.div>
          ) : currentState === 'somatic' ? (
            <motion.div
              key="somatic"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)] overflow-hidden"
            >
              <div className="flex-1 flex flex-col min-h-0 h-full items-center justify-center p-4">
                {somatic.selectedSomaticExercise === 'breathwork' ? (
                  <BreathworkExercise
                    onComplete={somatic.handleSomaticComplete}
                    onExit={somatic.handleSomaticExit}
                  />
                ) : somatic.selectedSomaticExercise === 'grounding' ? (
                  <GroundingExercise
                    onComplete={somatic.handleSomaticComplete}
                    onExit={somatic.handleSomaticExit}
                  />
                ) : (
                  <SomaticSessionPicker
                    onSelect={somatic.handleSomaticSelect}
                    onExit={somatic.handleSomaticExit}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="session"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)]"
            >
              <div className="flex-1 flex flex-col min-h-0 h-full relative">
                <AnimatePresence mode="wait">
                  {isHydrating ? (
                    <motion.div
                      key="hydrating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin" />
                      <span className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-400/70">
                        Synchronizing Neural Link
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="chat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col min-h-0 h-full"
                    >
                      {/* Session Telemetry & Control Bar */}
                      <div className="shrink-0 flex flex-col gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.09] bg-slate-900/70 backdrop-blur-2xl z-[var(--z-content)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <AgnesTelemetryHeader />
                          </div>
                          <div className="shrink-0 ml-2 sm:ml-4 flex items-center gap-1.5 sm:gap-2">
                            <ModuleReminderEntry
                              title="Agnes"
                              themeColor="indigo"
                              panel={<AgnesNotificationSettingsPanel />}
                              compact
                            />
                            <NeuralButton
                              size="sm"
                              variant="ghost"
                              onClick={endSession}
                              loading={isSummarizing}
                              className="flex items-center gap-2 px-4 rounded-full border-white/[0.09] hover:border-rose-500/20 hover:text-rose-400"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline font-bold uppercase tracking-widest text-[11px] ml-2">End</span>
                            </NeuralButton>
                          </div>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-white/60">
                            <span className="px-3 py-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-100/80">
                              {engagement.activeModeDefinition.label}
                            </span>
                            <span className="px-3 py-1 rounded-full border border-white/[0.12] bg-white/[0.045] text-white/60">
                              {engagement.isImpromptu ? 'Off the Record' : 'Vault Continuity'}
                            </span>
                            {engagement.engagementMode === 'somatic' && (
                              <span className="px-3 py-1 rounded-full border border-white/[0.12] bg-white/[0.045] text-white/60">
                                Somatic Inquiry {engagement.somaticEnabled ? 'Enabled' : 'Adapted'}
                              </span>
                            )}
                          </div>
                          <AgnesEngagementModeControl
                            compact
                            value={engagement.engagementMode}
                            onChange={(mode) => { void engagement.handleEngagementModeChange(mode); }}
                            modes={engagement.sessionModeOptions}
                            label="Switch Agnes engagement mode"
                            className="lg:justify-end"
                            disabled={currentState === 'session'}
                          />
                        </div>
                      </div>

                      <NexusChat
                        ai={{ messages, setMessages: session.setMessages, isProcessing, streamingText, error, quota, handleSendMessage: handleSendMessageWithArcCheck, pendingApprovals, approveAction, dismissAction }}
                        agentName={agentAlias}
                        themeColor="indigo"
                        placeholder="Communicate..."
                        authMode="agnes"
                      />
                      <AgnesClosingBar
                        visible={detectedPhase === 'CLOSING' && !isSummarizing && !isClosingSession && !engagement.isImpromptu}
                        onClose={endSession}
                        isBusy={isSummarizing}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <RoutingSuggestion
                  target={routingSuggestion?.target || 'titan'}
                  reason={routingSuggestion?.reason}
                  onConfirm={handleRouteConfirm}
                  onDismiss={handleRouteDismiss}
                  visible={routingSuggestion !== null && currentState !== 'session'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isSummarizing && (
          <motion.div
            key="summary-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center bg-[#05050a]/90 backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Synthesizing</h3>
                <p className="text-[11px] text-white/50 uppercase tracking-[0.15em]">Neural link distillation in progress</p>
              </div>
            </div>
          </motion.div>
        )}

        <NeuralModal
          key="session-summary-modal"
          isOpen={!!sessionSummary}
          onClose={() => {
            setSessionSummary(null);
            setCompactMemoryStatus(null);
          }}
          title="Session Complete"
          subtitle="Neural synthesis finalized"
          icon={Brain}
          maxWidth="lg"
        >
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="p-4 rounded-2xl sm:rounded-[2rem] bg-white/[0.045] border border-white/[0.09] shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white/68">Exchanges</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {messages.filter((m) => m.role === 'user').length}
                </span>
              </div>
              <div className="p-4 rounded-2xl sm:rounded-[2rem] bg-white/[0.045] border border-white/[0.09] shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white/68">Duration</span>
                </div>
                <span className="text-2xl font-black text-white tabular-nums">
                  {(() => {
                    const mins = Math.round((Date.now() - sessionStartedAt) / 60000);
                    return mins < 1 ? '<1m' : `${mins}m`;
                  })()}
                </span>
              </div>
            </div>

            <div className="relative p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-indigo-500/[0.04] border border-indigo-500/10">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-400/80">Reflection</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed font-medium italic">"{sessionSummary}"</p>
            </div>

            <div className="space-y-3">
              {sessionType !== 'impromptu' && (
                <NeuralButton size="xl" className="w-full rounded-full" loading={isClosingSession} onClick={handleMergeAndClose}>
                  <CheckSquare className="w-4 h-4 mr-2" /> End Session
                </NeuralButton>
              )}
              {sessionType !== 'impromptu' && (
                <NeuralButton
                  variant="ghost"
                  className="w-full rounded-full"
                  loading={isCompactingMemory}
                  disabled={isClosingSession}
                  onClick={handleCompactCurrentMemory}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Compact Memory (Temporary)
                </NeuralButton>
              )}
              {compactMemoryStatus && (
                <p className="text-[11px] text-white/55 px-1">
                  {compactMemoryStatus}
                </p>
              )}
              <NeuralButton
                variant="ghost"
                onClick={handleDiscardAndClose}
                disabled={isClosingSession || isCompactingMemory}
                className={cn(
                  "w-full h-auto text-[11px] font-black uppercase tracking-[0.15em] text-white/50 hover:text-white/70 hover:bg-transparent border-none transition-colors disabled:opacity-30",
                  sessionType === 'impromptu' ? "py-2" : "py-3"
                )}
              >
                {sessionType === 'impromptu' ? 'End to End' : 'Discard Session'}
              </NeuralButton>
            </div>
          </div>
        </NeuralModal>

        <NeuralModal
          key="agnes-settings-modal"
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="Agnes Settings"
          subtitle="Neural calibration and reminders"
          icon={Settings}
          maxWidth="lg"
        >
          <AgnesSettingsPanel
            profile={profile}
            onSave={async (updated) => {
              await saveAgnesProfile(updated, { userId: user?.uid, encryptionKey });
            }}
          />
        </NeuralModal>
      </AnimatePresence>
    </div>
  );
}

function AgnesOnboardingWrapper({ profile, onComplete }: { profile: TherapyIntakeProfile | null; onComplete: (profile: TherapyIntakeProfile) => void }) {
  const { profile: coreProfile } = useAuth();
  return (
    <AgnesOnboarding
      initialBaseContext={IntakeBaseContextService.buildForAgnes({ coreProfile, agnesContext: profile?.baseContext })}
      onComplete={(ctx) => {
        const now = new Date().toISOString();
        const completedProfile: TherapyIntakeProfile = {
          ...(profile ?? createEmptyAgnesProfile()),
          onboardingComplete: true,
          baseContext: ctx,
          updatedAt: now,
        };
        onComplete(completedProfile);
      }}
    />
  );
}

export default function AgnesPage() {
  const agentAlias = useGlobalSoulStore((s) => s.globalSoul?.displayNames?.agnes || 'Agnes');

  return (
    <UnifiedModulePage<TherapyIntakeProfile>
      moduleId="agnes"
      workspaceType="focus"
      requireVault={false}
      noContainer={true}
      profileOptions={{
        loadProfile: loadAgnesProfile,
        saveProfile: saveAgnesProfile,
        subscribeProfile: subscribeAgnesProfile,
        refreshProfile: loadAgnesProfile,
      }}
      renderOnboarding={AgnesOnboardingWrapper}
      renderContent={AgnesContent}
      renderLeftRail={({ profile, persistProfile }) => (
        <AgnesSidebar profile={profile} agentAlias={agentAlias} onSave={persistProfile} />
      )}
      renderDashboard={({ profile, encryptionKey }) => (
        <AgnesDashboard profile={profile} encryptionKey={encryptionKey} />
      )}
      renderMobileFooter={({ sessionActive }) => {
        if (sessionActive) return null;
        return (
          <div className="flex items-center justify-center p-3">
            <NeuralButton
              variant="ghost"
              themeColor="indigo"
              onClick={() => window.dispatchEvent(new Event('agnes:open-settings'))}
              className="w-full flex items-center justify-center gap-3 min-h-[44px] px-6 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black uppercase tracking-[0.12em] text-[11px] hover:bg-indigo-500/20 hover:border-indigo-500/30 active:scale-95 transition-all"
            >
              <Settings size={14} />
              Agnes Settings
            </NeuralButton>
          </div>
        );
      }}
    />
  );
}
