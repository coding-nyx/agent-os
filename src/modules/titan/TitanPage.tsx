import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { TitanDashboard } from './components/TitanReadiness';
import { TitanDiagnosisPanel } from './components/TitanDiagnosisPanel';
import { BiomarkerDashboard } from '@/modules/soma/components/BiomarkerDashboard';
import { ClearancePanel } from '@/modules/soma/components/ClearancePanel';
import { TitanRoutinePanel } from './components/TitanRoutinePanel';
import { ClearanceStatus } from '@/modules/soma/components/ClearanceStatus';
import { CustomFieldManager } from './components/CustomFieldManager';
import { RoutineProgress } from './components/RoutineProgress';
import { SleepTracker } from './components/SleepTracker';
import { CycleManager } from './components/CycleManager';
import { WorkoutSessionLogger } from './components/WorkoutSessionLogger';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { TitanProfile, Routine, Exercise } from '@/lib/types';
import { subscribeSomaProfile } from '@/modules/soma/services/soma-profile-service';
import type { SomaProfile } from '@/modules/soma/types';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import type { TitanSessionMode } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { Activity, TestTube2, ShieldCheck, FileText, Moon, RefreshCw } from 'lucide-react';
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

type TitanTab = 'training' | 'biomarkers' | 'recovery' | 'sleep' | 'cycles' | 'diagnosis';

registerDiagnosisSpec(titanDiagnosisSpec);

function resolveInitialTab(searchParams: URLSearchParams): TitanTab {
  const param = searchParams.get('tab');
  if (param === 'biomarkers' || param === 'recovery' || param === 'training' || param === 'diagnosis' || param === 'sleep' || param === 'cycles') return param;
  return 'training';
}

function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('titan');
  const navigate = useNavigate();

  // Phase 5 — load SomaProfile for biomarker/recovery tabs (source of truth)
  const [somaProfile, setSomaProfile] = useState<SomaProfile | null>(null);
  useEffect(() => {
    if (!user || !encryptionKey) return;
    return subscribeSomaProfile({ userId: user.uid, encryptionKey }, setSomaProfile);
  }, [user, encryptionKey]);

  useEffect(() => {
    if (!encryptionKey) setSomaProfile(null);
  }, [encryptionKey]);

  // Merged profile for biomarker/recovery tabs: prefer SomaProfile data if available
  const medicalProfile = useMemo((): TitanProfile | null => {
    if (!profile) return null;
    if (!somaProfile) return profile;
    return {
      ...profile,
      knownConditions: somaProfile.knownConditions.length ? somaProfile.knownConditions : profile.knownConditions,
      medications: somaProfile.medications.length ? somaProfile.medications : profile.medications,
      allergies: somaProfile.allergies.length ? somaProfile.allergies : profile.allergies,
      biomarkers: somaProfile.biomarkers.length ? somaProfile.biomarkers : profile.biomarkers,
      labSummaries: somaProfile.labSummaries.length ? somaProfile.labSummaries : profile.labSummaries,
      clearances: somaProfile.clearances.length ? somaProfile.clearances : profile.clearances,
      medicalSummary: somaProfile.medicalSummary || profile.medicalSummary,
    };
  }, [profile, somaProfile]);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams));

  // Derive prompt mode from active tab
  const promptMode: TitanSessionMode = activeTab === 'biomarkers' || activeTab === 'recovery' || activeTab === 'diagnosis' ? 'medical' : 'training';

  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PERSONA;
    return buildTitanSessionPrompt(profile, {
      mode: promptMode,
      recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
      hormonalContext: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
    });
  }, [profile, promptMode, globalSoul?.crossFunctionalState?.biological?.recoveryScore, globalSoul?.crossFunctionalState?.biological?.hormonalContext]);

  const ai = useModuleAI({
    moduleId: 'titan',
    systemPrompt,
    encryptionKey
  });

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

  const handleImportLab = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const sanitizedText = text.replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '[STRIPPED_ACTION_TAG]');
      await ai.handleSendMessage(
        `Lab import received: ${file.name}. Parse the content into structured biomarker records and lab summaries.\n\n---BEGIN LAB DATA---\n${sanitizedText}\n---END LAB DATA---`
      );
    };
    input.click();
  }, [ai.handleSendMessage]);

  const handleAnalyzeImage = useCallback(() => {
    ai.handleSendMessage('I want to analyze a medical image. Please guide me through the process.');
  }, [ai.handleSendMessage]);

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

  // Tab data
  const biomarkerCount = profile?.biomarkers?.length ?? 0;
  const latestClearance = profile?.clearances?.length
    ? [...profile.clearances].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0]
    : null;
  const clearanceStatus = latestClearance?.status ?? null;
  const sleepCount = profile?.sleepLog?.length ?? 0;
  const activeCycleCount = (profile?.cycles ?? []).filter(c => c.status === 'active').length;

  const tabs: NeuralTabItem<TitanTab>[] = [
    { id: 'training', label: 'Training', icon: Activity },
    { id: 'biomarkers', label: 'Biomarkers', icon: TestTube2, badge: biomarkerCount || undefined },
    { id: 'recovery', label: 'Recovery', icon: ShieldCheck, badge: clearanceStatus || undefined, badgeVariant: clearanceStatus === 'granted' ? 'success' : clearanceStatus === 'denied' ? 'error' : 'warning' },
    { id: 'sleep', label: 'Sleep', icon: Moon, badge: sleepCount || undefined },
    { id: 'cycles', label: 'Cycles', icon: RefreshCw, badge: activeCycleCount || undefined },
    { id: 'diagnosis', label: 'Diagnosis', icon: FileText },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'biomarkers':
        return (
          <BiomarkerDashboard
            profile={medicalProfile}
            soul={globalSoul}
            isLocked={isLocked}
            onImportLab={handleImportLab}
            onAnalyzeImage={handleAnalyzeImage}
          />
        );

      case 'recovery':
        return (
          <>
            <ClearanceStatus profile={medicalProfile} soul={globalSoul} />
            <div className="px-8 pb-8 pt-4">
              <ClearancePanel profile={medicalProfile} soul={globalSoul} isLocked={isLocked} />
            </div>
          </>
        );

      case 'sleep':
        return (
          <SleepTracker
            sleepLog={profile?.sleepLog ?? []}
            onAnalyze={ai.handleSendMessage}
          />
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

      case 'diagnosis':
        return (
          <div className="flex-1 flex flex-col min-h-0">
            <TitanDiagnosisPanel encryptionKey={encryptionKey} profile={profile} />
          </div>
        );

      default: // training
        return (
          <>
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
          </>
        );
    }
  };

  return (
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
          <SectionHeader
            label="Performance Domain"
            title="Titan Strategy & Readiness"
            subtitle="Elite physical performance optimization and biometric clearance."
            accentClassName="text-orange-400"
          />
        </div>

        <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
          <NeuralTabGroup
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            themeColor="orange"
          />
        </div>

        <div className={cn(
          "flex-1 no-scrollbar pt-4 md:pt-6",
          activeTab === 'diagnosis' ? "overflow-hidden flex flex-col min-h-0" : "overflow-y-auto"
        )}>
          {renderTabContent()}
        </div>
      </div>
    </SingleAgentLayout>
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
