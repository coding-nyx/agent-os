import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { TitanDashboard } from './components/TitanReadiness';
import { TitanDiagnosisPanel } from './components/TitanDiagnosisPanel';
import { BiomarkerDashboard } from '@/modules/soma/components/BiomarkerDashboard';
import { ClearancePanel } from '@/modules/soma/components/ClearancePanel';
import { TitanRoutinePanel } from './components/TitanRoutinePanel';
import { ClearanceStatus } from '@/modules/soma/components/ClearanceStatus';
import { CustomFieldManager } from './components/CustomFieldManager';
import { RoutineProgress } from './components/RoutineProgress';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { TitanProfile } from '@/lib/types';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import type { TitanSessionMode } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { Activity, TestTube2, ShieldCheck, FileText } from 'lucide-react';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { registerTitanActions } from './services/actions';
import { registerSomaFieldActions } from '@/modules/soma/actions/soma-field-actions';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { titanDiagnosisSpec } from './diagnosis/titan-diagnosis-spec';

type TitanTab = 'training' | 'biomarkers' | 'recovery' | 'diagnosis';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

registerTitanActions();
registerSomaFieldActions();
registerDiagnosisSpec(titanDiagnosisSpec);

function resolveInitialTab(searchParams: URLSearchParams): TitanTab {
  const param = searchParams.get('tab');
  if (param === 'biomarkers' || param === 'recovery' || param === 'training' || param === 'diagnosis') return param;
  return 'training';
}

function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible } = useVault();
  const { user } = useAuth();
  const isLocked = !isModuleAccessible('titan');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams));

  // Derive prompt mode from active tab
  const promptMode: TitanSessionMode = activeTab === 'biomarkers' || activeTab === 'recovery' || activeTab === 'diagnosis' ? 'medical' : 'training';

  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PROMPT;
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
    (routine: import('@/lib/types').Routine) => {
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

  // Tab data
  const biomarkerCount = profile?.biomarkers?.length ?? 0;
  const latestClearance = profile?.clearances?.length
    ? [...profile.clearances].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0]
    : null;
  const clearanceStatus = latestClearance?.status ?? null;

  const tabs: NeuralTabItem<TitanTab>[] = [
    { id: 'training', label: 'Training', icon: Activity },
    { id: 'biomarkers', label: 'Biomarkers', icon: TestTube2, badge: biomarkerCount || undefined },
    { id: 'recovery', label: 'Recovery', icon: ShieldCheck, badge: clearanceStatus || undefined, badgeVariant: clearanceStatus === 'granted' ? 'success' : clearanceStatus === 'denied' ? 'error' : 'warning' },
    { id: 'diagnosis', label: 'Diagnosis', icon: FileText },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'biomarkers':
        return (
          <>
            <BiomarkerDashboard
              profile={profile}
              soul={globalSoul}
              isLocked={isLocked}
              onImportLab={handleImportLab}
              onAnalyzeImage={handleAnalyzeImage}
            />
            {profile && (
              <div className="px-8 pb-8 pt-4">
                <CustomFieldManager
                  currentValues={profile?.nutrition || {}}
                  onSave={async (values) => {
                    const updated = { ...profile, nutrition: { ...profile.nutrition, ...values } };
                    await saveTitanProfile(updated, { userId: user?.uid || null, encryptionKey });
                  }}
                />
              </div>
            )}
          </>
        );
      case 'recovery':
        return (
          <>
            <ClearanceStatus
              profile={profile}
              soul={globalSoul}
            />
            <div className="px-8 pb-8 pt-4">
              <ClearancePanel
                profile={profile}
                soul={globalSoul}
                isLocked={isLocked}
              />
            </div>
          </>
        );
      case 'diagnosis':
        return (
          <div className="flex-1 flex flex-col min-h-0">
            <TitanDiagnosisPanel encryptionKey={encryptionKey} profile={profile} />
          </div>
        );
      default:
        return (
          <>
            <TitanRoutinePanel
              routines={profile?.routines || []}
              onAnalyzeRoutine={handleAnalyzeRoutine}
              onGeneratePlan={handleGeneratePlan}
              onImportRoutine={handleImportRoutine}
            />
            {profile?.routines && profile.routines.length > 0 && (
              <div className="px-8 pb-4 pt-4">
                <RoutineProgress routines={profile.routines} />
              </div>
            )}
            <TitanDashboard soul={globalSoul} isLocked={isLocked} onCalibrate={handleCalibrate} />
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
        <div className="px-8 pt-8 pb-4">
           <SectionHeader
            label="Performance Domain"
            title="Titan Strategy & Readiness"
            subtitle="Elite physical performance optimization and biometric clearance."
            accentClassName="text-orange-400"
          />
        </div>
        
        <div className="px-8 pb-6 border-b border-white/5">
          <NeuralTabGroup
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            themeColor="orange"
          />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-6">
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
