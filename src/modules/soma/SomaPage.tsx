import React, { useEffect, useCallback, useRef } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useAI } from '@/llm-engine/ai-context';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { SomaDashboard } from './components/SomaDashboard';
import type { VitalReading as UIVitalReading, PhysicalAssessment as UIPhysicalAssessment } from './components/SomaDashboard';
import type { PhysicalAssessment as StoredPhysicalAssessment } from '@/lib/types';
import type { MessageContent } from '@/llm-engine/types';
import {
  loadSomaProfile,
  saveSomaProfile,
  subscribeSomaProfile,
  syncGuestSomaProfileToUser,
  addVitalReading,
  addPhysicalAssessment,
} from './services/soma-profile-service';
import { useSomaHealth } from './hooks/use-soma-health';
import { SomaProfile } from './types';
import { buildSomaAgentSystemPrompt, SOMA_MEDICAL_DISCLAIMER } from './prompts/soma-prompt-builder';
import { SomaOnboarding } from './onboarding/SomaOnboarding';

import { registerSomaFieldActions } from './actions/soma-field-actions';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { SomaNotificationSettingsPanel } from './components/SomaNotificationSettingsPanel';

registerSomaFieldActions();

interface SomaContentProps {
  profile: SomaProfile | null;
  encryptionKey: CryptoKey | null;
  agentAlias: string;
}

function SomaContent({ profile, encryptionKey, agentAlias }: SomaContentProps) {
  const { user } = useAuth();
  const { sendMessage, analyzeImage } = useAI();
  const { globalSoul } = useGlobalSoul();
  const [queuedUpload, setQueuedUpload] = React.useState<File | null>(null);

  const latestVital = profile?.vitalReadings?.slice(-1)[0];
  const systemPrompt = buildSomaAgentSystemPrompt({
    coreFields: {
      restingHeartRate: latestVital?.heartRate ?? profile?.restingHeartRate,
      bloodPressure: latestVital?.bloodPressure ?? profile?.bloodPressure,
      weight: latestVital?.weight ?? profile?.weight,
      readinessScore: profile?.readinessScore,
      clearanceStatus: profile?.clearanceStatus,
      lastCheckup: profile?.lastCheckup,
    },
    extensionFields: [],
    nsvBiological: (globalSoul?.crossFunctionalState?.biological as Record<string, unknown>) ?? undefined,
    clearanceStatus: profile?.clearanceStatus ?? undefined,
    lastCheckup: profile?.lastCheckup,
    knownConditions: profile?.knownConditions,
    medications: profile?.medications,
  });

  const ai = useModuleAI({
    moduleId: 'soma',
    systemPrompt,
    encryptionKey
  });

  const handleAnalyzeDocument = useCallback(async (content: MessageContent): Promise<string> => {
    try {
      const { response } = await sendMessage(content, {
        systemPrompt: 'You are a medical document analysis engine. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Document analysis.',
        history: [],
      });
      return response.publicText;
    } catch {
      return '';
    }
  }, [sendMessage]);

  const handleChatDocumentUploads = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a medical document triage analyst. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Soma document triage.',
        history: [],
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return only valid JSON matching the requested schema.',
        memoryContext: [],
        summary: 'Soma document triage fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const { prompt } = await prepareDocumentChatPrompt({
        moduleId: 'soma',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage,
        userContext: request.caption,
      });
      await ai.handleSendMessage(prompt, undefined, { visibleContent: request.visibleContent });
    } catch (error) {
      console.error('[SomaPage] Chat document analysis failed:', error);
      await ai.handleSendMessage('I could not analyze those medical documents. Please try again with a clearer PDF, image, or text file.');
    }
  }, [ai, analyzeImage, sendMessage]);

  useEffect(() => {
    if (ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      ai.setMessages([
        {
          role: 'assistant',
          content: `Biological link active. I am ${agentAlias}. I monitor your biomarkers, labs, and recovery state to ensure systemic stability.\n\n${SOMA_MEDICAL_DISCLAIMER}`
        }
      ]);
    }
  }, [ai.messages.length, ai.isProcessing, ai.streamingText, agentAlias, ai.setMessages]);

  // All hooks must be above any conditional returns (React rules of hooks)
  const { readinessScore } = useSomaHealth(user?.uid, encryptionKey);

  const handleUpdateProfile = useCallback(async (updates: Partial<SomaProfile>) => {
    if (!profile || !user?.uid || !encryptionKey) return;
    const updated: SomaProfile = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    await saveSomaProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, user?.uid, encryptionKey]);

  const handleAddVitalReading = useCallback(async (reading: UIVitalReading) => {
    if (user?.uid && encryptionKey) {
      const { timestamp: _ts, ...fields } = reading;
      await addVitalReading(user.uid, fields, encryptionKey).catch(err =>
        console.error('[SomaPage] addVitalReading failed:', err)
      );
    }
  }, [user?.uid, encryptionKey]);

  // Deduplicate Spine events across re-renders
  const handledSpineEventsRef = useRef<Set<string>>(new Set());

  // ── Titan → Soma physical data sync ────────────────────────────────────────
  // When Titan commits a body weight entry, mirror the weight into Soma's own
  // VitalReading log so the vitals panel and readiness score stay in sync
  // without the user having to re-enter data in two places.
  useSpineEvent('TITAN_BODY_WEIGHT_LOGGED', useCallback((event) => {
    const eventKey = `titan-weight-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);

    const weight = event.data?.weight as number | undefined;
    if (typeof weight !== 'number' || !user?.uid || !encryptionKey) return;

    handleAddVitalReading({ timestamp: Date.now(), weight });
  }, [handleAddVitalReading, user?.uid, encryptionKey]));

  // When a strength or cardio workout completes at high RPE, give Soma context
  // so its readiness assessment reflects the actual training load.
  useSpineEvent('WORKOUT_COMPLETED', useCallback((event) => {
    if (!profile?.medicalOnboardingComplete) return;
    const eventKey = `workout-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);

    const rpe = event.data?.rpe as number | undefined;
    if (rpe == null || rpe < 8) return;

    const isCardio = event.data?.isCardio === true;
    const label = isCardio ? 'cardio' : 'strength';
    ai.handleSendMessage(
      `[System] Titan logged a hard ${label} session (RPE ${rpe}/10) today. ` +
      `Please factor this training load into today's readiness assessment and adjust any recommendations accordingly.`
    );
  }, [profile?.medicalOnboardingComplete, ai.handleSendMessage]));

  const handleAddAssessment = useCallback(async (assessment: UIPhysicalAssessment) => {
    if (user?.uid && encryptionKey) {
      const storedFields: Omit<StoredPhysicalAssessment, 'timestamp'> = {
        ...(assessment.measurements?.vo2max != null ? { vo2Max: assessment.measurements.vo2max } : {}),
        ...(assessment.measurements?.weight != null ? { weight: assessment.measurements.weight } : {}),
        ...(assessment.measurements?.bmi != null ? { bmi: assessment.measurements.bmi } : {}),
        ...(assessment.measurements?.bodyFat != null ? { bodyFatPercentage: assessment.measurements.bodyFat } : {}),
        ...(assessment.measurements?.muscleMass != null ? { muscleMass: assessment.measurements.muscleMass } : {}),
        ...(assessment.type === 'strength' ? { strength: assessment.score } : {}),
        ...(assessment.type === 'flexibility' ? { flexibility: assessment.score } : {}),
        ...(assessment.type === 'endurance' ? { endurance: assessment.score } : {}),
      };
      await addPhysicalAssessment(user.uid, storedFields, encryptionKey).catch(err =>
        console.error('[SomaPage] addPhysicalAssessment failed:', err)
      );
    }
  }, [user?.uid, encryptionKey]);

  // Show onboarding if profile not set up — must be after all hooks
  if (user?.uid && encryptionKey && !profile?.medicalOnboardingComplete) {
    return (
      <div className="h-full">
        <SomaOnboarding
          profile={profile}
          userId={user.uid}
          encryptionKey={encryptionKey}
          onComplete={() => {
            Spine.emit({
              type: 'MODULE_PROFILE_UPDATED',
              source: 'soma',
              domain: 'system',
              data: { moduleId: 'soma', reason: 'onboarding_complete' },
              cascadeDepth: 0,
              priority: 'info',
            });
          }}
        />
      </div>
    );
  }

  return (
    <SingleAgentLayout
      moduleId="soma"
      agentName={agentAlias}
      themeColor="emerald"
      ai={ai}
      authMode="soma"
      placeholder="Ask about biomarkers, labs, or recovery..."
      onUploadDocuments={handleChatDocumentUploads}
    >
      <div className="h-full overflow-y-auto no-scrollbar pb-20">
        <div className="flex items-center justify-end px-4 pt-3 pb-1">
          <ModuleReminderEntry
            title="Soma"
            themeColor="emerald"
            panel={<SomaNotificationSettingsPanel />}
            compact
          />
        </div>
        <SomaDashboard
          profile={profile}
          soul={globalSoul}
          isLocked={false}
          readinessScore={readinessScore}
          onUpdateProfile={handleUpdateProfile}
          onAddVitalReading={handleAddVitalReading}
          onAddAssessment={handleAddAssessment}
          onAnalyzeDocument={handleAnalyzeDocument}
          queuedUpload={queuedUpload}
          onQueuedUploadHandled={() => setQueuedUpload(null)}
        />
      </div>
    </SingleAgentLayout>
  );
}

/**
 * Soma Module — Biological Authority Domain
 *
 * Peer module to Titan, handling all medical and biomarker sovereignty.
 */
export default function SomaPage() {
  const { globalSoul } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.soma || 'Soma';

  return (
    <UnifiedModulePage<SomaProfile>
      moduleId="soma"
      profileOptions={{
        loadProfile: loadSomaProfile,
        saveProfile: saveSomaProfile,
        subscribeProfile: subscribeSomaProfile,
        refreshProfile: loadSomaProfile,
        syncGuestProfile: syncGuestSomaProfileToUser
      }}
      renderContent={({ profile, encryptionKey }) => (
        <SomaContent profile={profile} encryptionKey={encryptionKey} agentAlias={agentAlias} />
      )}
    />
  );
}
