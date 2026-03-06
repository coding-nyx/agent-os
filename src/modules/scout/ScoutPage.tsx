import React, { useEffect, useMemo } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SCOUT_PERSONA } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
import {
  ScoutProfile,
  loadScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser
} from './services/scout-knowledge-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerScoutActions } from './services/actions';

registerScoutActions();

export default function ScoutPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('scout');
  const baseContext = useMemo(() => IntakeBaseContextService.buildForScout({ coreProfile }), [coreProfile]);

  return (
    <UnifiedModulePage<ScoutProfile>
      moduleId="scout"
      workspaceType="command"
      profileOptions={{
        loadProfile: loadScoutProfile,
        subscribeProfile: subscribeScoutProfile,
        syncGuestProfile: syncGuestScoutProfileToUser
      }}
      renderDashboard={({ profile }) => (
        <ScoutDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
      )}
      renderContent={({ profile, encryptionKey }) => {
        const agentAlias = globalSoul?.displayNames?.scout || 'Scout';

        const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
          moduleId: 'scout',
          systemPrompt: SCOUT_PERSONA,
          encryptionKey
        });

        useEffect(() => {
          if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
            setMessages([
              {
                role: 'assistant',
                content:
                  `Research link active. I am ${agentAlias}. ` +
                  `Share claims, topics, or evidence requests and I will build your verification graph.`
              }
            ]);
          }
        }, [messages.length, isProcessing, streamingText, profile?.onboardingComplete, setMessages, agentAlias]);

        return (
          <NexusChat
            moduleId="scout"
            ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
            agentName={agentAlias}
            themeColor="cyan"
            placeholder="Share a claim to verify, a topic to map, or ask for a research synthesis..."
          />
        );
      }}
    />
  );
}
