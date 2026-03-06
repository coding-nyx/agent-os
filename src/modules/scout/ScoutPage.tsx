import { useEffect, useMemo } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SCOUT_PERSONA } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
import { ScoutOnboarding } from './onboarding/ScoutOnboarding';
import {
  ScoutProfile,
  loadScoutProfile,
  saveScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser
} from './services/scout-knowledge-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerScoutActions } from './services/actions';

registerScoutActions();

function ScoutContent({ profile, encryptionKey }: { profile: ScoutProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
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
      themeColor="lime"
      placeholder="Share a claim to verify, a topic to map, or ask for a research synthesis..."
    />
  );
}

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
        saveProfile: saveScoutProfile,
        subscribeProfile: subscribeScoutProfile,
        syncGuestProfile: syncGuestScoutProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <ScoutOnboarding
          initialProfile={profile}
          initialBaseContext={baseContext}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            onComplete(completed);
          }}
        />
      )}
      renderDashboard={({ profile }) => (
        <ScoutDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <ScoutContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
