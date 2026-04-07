import React, { useEffect, useCallback, useRef } from 'react';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useAI } from '@/cortex-bridge/ai-context';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { SomaDashboard } from './components/SomaDashboard';
import type { VitalReading as UIVitalReading, PhysicalAssessment as UIPhysicalAssessment } from './components/SomaDashboard';
import type { PhysicalAssessment as StoredPhysicalAssessment } from '@/lib/types';
import type { MessageContent } from '@/cortex-bridge/types';
import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { SpineEventType } from '@/lib/types';
import {
  loadSomaProfile,
  saveSomaProfile,
  subscribeSomaProfile,
  syncGuestSomaProfileToUser,
  addVitalReading,
  addPhysicalAssessment,
} from './services/soma-profile-service';
import { SomaDataService } from './services/soma-data-service';
import { useSomaHealth } from './hooks/use-soma-health';
import { SomaProfile } from './types';
import { buildSomaAgentSystemPrompt, SOMA_MEDICAL_DISCLAIMER } from './prompts/soma-prompt-builder';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { useExtensionFieldValues } from '@/lib/hooks/use-extension-field-values';
import { SomaOnboarding } from './onboarding/SomaOnboarding';

import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { somaDiagnosisSpec } from './diagnosis/soma-diagnosis-spec';
import { ModuleReminderEntry } from '@/core/components/ModuleReminderEntry';
import { SomaNotificationSettingsPanel } from './components/SomaNotificationSettingsPanel';

registerDiagnosisSpec(somaDiagnosisSpec);

interface SomaContentProps {
  profile: SomaProfile | null;
  encryptionKey: CryptoKey | null;
  agentAlias: string;
}

function SomaContent({ profile, encryptionKey, agentAlias }: SomaContentProps) {
  const { user } = useAuth();
  const { sendMessage, analyzeImage } = useAI();
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const [queuedUpload, setQueuedUpload] = React.useState<File | null>(null);

  // Extension fields — custom user-defined biomarker fields
  const { extensions } = useSchemaRegistry('soma');
  const { fieldValues } = useExtensionFieldValues('soma');

  const latestVital = profile?.vitalReadings?.slice(-1)[0];
  const systemPrompt = buildSomaAgentSystemPrompt({
    coreFields: {
      restingHeartRate: latestVital?.heartRate ?? profile?.restingHeartRate,
      bloodPressure: latestVital?.bloodPressure ?? profile?.bloodPressure,
      weight: latestVital?.weight ?? profile?.weight,
      temperature: latestVital?.temperature,
      spo2: latestVital?.spo2,
      readinessScore: profile?.readinessScore,
      clearanceStatus: profile?.clearanceStatus,
      lastCheckup: profile?.lastCheckup,
    },
    extensionFields: extensions.map((f) => ({
      id: f.id,
      name: f.name,
      value: fieldValues[f.id]?.value ?? null,
      type: f.type,
      unit: (f.metadata as Record<string, unknown> | undefined)?.unit as string | undefined,
      range: (f.validation?.minimum != null && f.validation?.maximum != null)
        ? `${f.validation.minimum}–${f.validation.maximum}`
        : undefined,
    })),
    nsvBiological: (globalSoul?.crossFunctionalState?.biological as Record<string, unknown>) ?? undefined,
    clearanceStatus: profile?.clearanceStatus ?? undefined,
    lastCheckup: profile?.lastCheckup,
    nextCheckup: profile?.nextCheckup,
    knownConditions: profile?.knownConditions,
    medications: profile?.medications,
    biomarkers: profile?.biomarkers,
    labSummaries: profile?.labSummaries,
    clearanceDetails: profile?.clearances,
    allergies: profile?.allergies,
    medicalSummary: profile?.medicalSummary,
    physicalAssessments: profile?.physicalAssessments,
  });

  const ai = useModuleAI({
    moduleId: 'soma',
    systemPrompt,
    encryptionKey,
    moduleContext: {
      medical_profile: {
        knownConditions: profile?.knownConditions,
        readinessScore: profile?.readinessScore,
        biomarkers: profile?.biomarkers,
      },
    },
  });

  const handleAnalyzeDocument = useCallback(async (content: MessageContent): Promise<string> => {
    try {
      const { response } = await sendMessage(content, {
        moduleId: 'soma',
        systemPrompt: 'You are a medical document analysis engine. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Document analysis.',
        history: [],
      });
      return response.publicText;
    } catch (error) {
      console.error('[SomaPage] Document analysis failed:', error);
      return '';
    }
  }, [sendMessage]);

  const handleChatDocumentUploads = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'soma',
        systemPrompt: 'You are a medical document triage analyst. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Soma document triage.',
        history: [],
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'soma',
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
  const [chatCollapsed, setChatCollapsed] = React.useState(true);

  const handleUpdateProfile = useCallback(async (updates: Partial<SomaProfile>) => {
    if (!profile || !user?.uid || !encryptionKey) return;
    const updated: SomaProfile = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    await saveSomaProfile(updated, { userId: user.uid, encryptionKey });
    SomaDataService.invalidateCache(user.uid);
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

  /**
   * Dedicated clearance request flow — bypasses CommandIntelligenceService routing
   * so the request stays in Soma and doesn't get misrouted to another module.
   */
  const handleClearanceRequest = useCallback(async (prompt: string) => {
    setChatCollapsed(false);

    const timestamp = new Date().toISOString();
    const userMsg = { role: 'user' as const, content: prompt, timestamp };
    ai.setMessages([...ai.messages, userMsg]);

    try {
      const { response } = await sendMessage(prompt, {
        systemPrompt,
        memoryContext: [],
        summary: 'Medical activity clearance evaluation.',
        history: ai.messages.slice(-10),
      });

      const assistantMsg = { role: 'assistant' as const, content: response.publicText, timestamp: new Date().toISOString() };
      ai.setMessages(prev => [...prev, assistantMsg]);

      // Find the issue_clearance action from the LLM engine's parsed actions
      const clearanceAction = response.actions.find(a => a.type === 'issue_clearance');
      if (clearanceAction) {
        try {
          await ActionHub.execute('soma', 'issue_clearance', {
            userId: user?.uid,
            isGuest: !user?.uid,
            moduleId: 'soma',
            payload: clearanceAction.payload,
            encryptionKey,
            emitSpineEvent: (type: SpineEventType, data: Record<string, unknown>) => {
              Spine.emit({ type, source: 'soma', domain: 'B', data, cascadeDepth: 0, priority: 'info' });
            },
            updateGlobalSoul: async (patch) => {
              if (user?.uid) {
                await GlobalProjectionService.updateCrossFunctionalState(user.uid, patch);
              }
            },
            delegateToModule: () => {},
            pushAssistantMessage: (msg: string) => {
              ai.setMessages(prev => [...prev, { role: 'assistant' as const, content: msg, timestamp: new Date().toISOString() }]);
            },
          });
        } catch (err) {
          console.error('[SomaPage] Failed to execute issue_clearance directly:', err);
        }
      }
    } catch (err) {
      console.error('[SomaPage] Clearance evaluation failed:', err);
      ai.setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: 'Medical clearance evaluation failed. Please try again or ask Soma directly in the chat.',
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [user?.uid, encryptionKey, sendMessage, systemPrompt, ai, setChatCollapsed]);

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
      isChatCollapsed={chatCollapsed}
      onToggleChat={(collapsed) => setChatCollapsed(collapsed)}
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
          queuedUpload={queuedUpload}
          onQueuedUploadHandled={() => setQueuedUpload(null)}
          onAnalyze={handleClearanceRequest}
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
  // Primitive selector — only re-renders when the display name string changes.
  const agentAlias = useGlobalSoulStore(s => s.globalSoul?.displayNames?.soma || 'Soma');

  // Register diagnosis specialization
  // moved to module scope to avoid race condition with useDiagnosis hook
  // useEffect(() => {
  //   registerDiagnosisSpec(somaDiagnosisSpec);
  // }, []);

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
