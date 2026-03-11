import React, { useEffect, useState, useCallback } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SomaDashboard } from './components/SomaDashboard';
import type { VitalReading, PhysicalAssessment } from './components/SomaDashboard';
import {
  loadSomaProfile,
  saveSomaProfile,
  subscribeSomaProfile,
  syncGuestSomaProfileToUser
} from './services/soma-profile-service';
import { useSomaHealth } from './hooks/use-soma-health';
import { SomaProfile } from './types';
import { SOMA_MEDICAL_DISCLAIMER } from './prompts/soma-prompt-builder';

import { registerSomaFieldActions } from './actions/soma-field-actions';

registerSomaFieldActions();

interface SomaContentProps {
  profile: SomaProfile | null;
  encryptionKey: CryptoKey | null;
  agentAlias: string;
}

function SomaContent({ profile, encryptionKey, agentAlias }: SomaContentProps) {
  const { user } = useAuth();
  const ai = useModuleAI({
    moduleId: 'soma',
    systemPrompt: `IDENTITY: You are SOMA, the biological authority of the Nexus ecosystem. 
          Your tone is objective, analytical, and supportive but medically conservative.
          You help users understand your biomarkers, labs, and recovery state.
          
          [CAPABILITIES]
          - Analyze biomarker trends over time and flag notable changes
          - Explain lab values in plain language with reference ranges
          - Correlate multiple biomarkers to surface potential patterns
          - Suggest specific areas the user should discuss with their doctor
          - Extract and structure data from lab reports and medical images
          - Issue readiness scores and clearance recommendations
          
          ${SOMA_MEDICAL_DISCLAIMER}`,
    encryptionKey
  });

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

  // Fix 3: Wire useSomaHealth hook — was never called before
  const { readinessScore } = useSomaHealth(user?.uid, encryptionKey);

  // Fix 2: Local in-session history state (real schema does not persist these arrays yet)
  const [vitalHistory, setVitalHistory] = useState<VitalReading[]>([]);
  const [assessmentHistory, setAssessmentHistory] = useState<PhysicalAssessment[]>([]);

  // Fix 2: Wire onUpdateProfile to actually save to Firestore
  const handleUpdateProfile = useCallback(async (updates: Partial<SomaProfile>) => {
    if (!profile || !user?.uid || !encryptionKey) return;
    const updated: SomaProfile = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    await saveSomaProfile(updated, { userId: user.uid, encryptionKey });
  }, [profile, user?.uid, encryptionKey]);

  // Fix 2: Wire onAddVitalReading to update local session state
  const handleAddVitalReading = useCallback((reading: VitalReading) => {
    setVitalHistory(prev => [...prev, reading]);
  }, []);

  // Fix 2: Wire onAddAssessment to update local session state
  const handleAddAssessment = useCallback((assessment: PhysicalAssessment) => {
    setAssessmentHistory(prev => [...prev, assessment]);
  }, []);

  const { globalSoul } = useGlobalSoul();

  return (
    <SingleAgentLayout
      moduleId="soma"
      agentName={agentAlias}
      themeColor="emerald"
      ai={ai}
      authMode="soma"
      placeholder="Ask about biomarkers, labs, or recovery..."
    >
      <div className="h-full overflow-y-auto no-scrollbar pb-20">
        <SomaDashboard
          profile={profile}
          soul={globalSoul}
          isLocked={false}
          readinessScore={readinessScore}
          vitalHistory={vitalHistory}
          assessmentHistory={assessmentHistory}
          onUpdateProfile={handleUpdateProfile}
          onAddVitalReading={handleAddVitalReading}
          onAddAssessment={handleAddAssessment}
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
