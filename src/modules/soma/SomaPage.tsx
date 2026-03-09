import React, { useEffect } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SomaDashboard } from './components/SomaDashboard';
import { 
  loadSomaProfile, 
  saveSomaProfile, 
  subscribeSomaProfile, 
  syncGuestSomaProfileToUser 
} from './services/soma-profile-service';
import { SomaProfile } from './types';
import { SOMA_MEDICAL_DISCLAIMER } from './prompts/soma-prompt-builder';

import { registerSomaFieldActions } from './actions/soma-field-actions';

registerSomaFieldActions();

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
        syncGuestProfile: syncGuestSomaProfileToUser
      }}
      renderContent={({ profile, encryptionKey }) => {
        // AI Logic for Soma
        const ai = useModuleAI({
          moduleId: 'soma',
          systemPrompt: `IDENTITY: You are SOMA, the biological authority of the Nexus ecosystem. 
          Your tone is objective, analytical, and supportive but medically conservative.
          You help users understand their biomarkers, labs, and recovery state.
          
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
              />
            </div>
          </SingleAgentLayout>
        );
      }}
    />
  );
}
