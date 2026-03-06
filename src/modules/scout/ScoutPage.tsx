import { useEffect } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useVault } from '@/lib/vault-context';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SCOUT_PERSONA } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
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
    if (messages.length === 0 && !isProcessing && !streamingText) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Research link active. I am ${agentAlias}. ` +
            `Share claims, topics, or evidence requests and I will build your verification graph.`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, setMessages, agentAlias]);

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
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('scout');

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
      renderDashboard={({ profile }) => (
        <ScoutDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <ScoutContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
