import { useEffect, useState, useCallback } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
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
import { generateNewsBriefs } from './services/pulse-news-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerScoutActions } from './services/actions';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ScoutUploadZone } from './components/ScoutUploadZone';
import { FileUp, Trash2 } from 'lucide-react';
import { buildDocumentAnalysisPrompt, type DocumentParseResult } from './services/scout-document-service';

registerScoutActions();

interface ScoutViewProps {
  profile: ScoutProfile | null;
  encryptionKey: CryptoKey | null;
  isRefreshingNews?: boolean;
  onRefreshNews?: () => void;
}

function ScoutContent({ profile, encryptionKey, isRefreshingNews, onRefreshNews }: ScoutViewProps) {
  const { globalSoul } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.scout || 'Scout';
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage, clearSession } = useModuleAI({
    moduleId: 'scout',
    systemPrompt: SCOUT_PERSONA,
    encryptionKey
  });

  const handleDocumentSubmit = useCallback(
    async (result: DocumentParseResult) => {
      setIsUploadOpen(false);
      const prompt = buildDocumentAnalysisPrompt(result);
      await handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Research link active. I am ${agentAlias}. ` +
            `Share claims, topics, or interest signals and I will map your verification graph and momentum.`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, setMessages, agentAlias]);

  return (
    <>
      <NexusChat
        moduleId="scout"
        ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
        agentName={agentAlias}
        themeColor="lime"
        placeholder="Share a claim to verify, a topic to map, or ask for a research synthesis..."
        headerActions={messages.length > 1 && !isProcessing ? (
          <button
            onClick={() => clearSession()}
            className="w-10 h-10 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-colors group"
            aria-label="Clear research session"
            title="Clear conversation history"
          >
            <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400 transition-colors" />
          </button>
        ) : undefined}
        renderCustomActions={() => (
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-lime-500/10 border border-lime-500/20 hover:bg-lime-500/20 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/50"
            aria-label="Upload evidence document for analysis"
          >
            <FileUp className="w-6 h-6 text-lime-400 group-hover:scale-110 transition-transform" aria-hidden="true" />
            <span className="text-[8px] font-black uppercase tracking-widest text-lime-400/80">Upload Evidence</span>
          </button>
        )}
      />

      <NeuralModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload Evidence"
        subtitle="Submit a document source for claim extraction and verification"
        icon={FileUp}
        themeColor="emerald"
        maxWidth="lg"
      >
        <ScoutUploadZone
          onSubmit={handleDocumentSubmit}
          onCancel={() => setIsUploadOpen(false)}
        />
      </NeuralModal>
    </>
  );
}

export default function ScoutPage() {
  const { globalSoul } = useGlobalSoul();
  const { user } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('scout');
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);

  const handleRefreshNews = useCallback(async (profile: ScoutProfile | null, encryptionKey: CryptoKey | null) => {
    if (!profile || profile.interests.length === 0 || isRefreshingNews) return;
    const lastUpdated = profile.newsUpdatedAt ? Date.parse(profile.newsUpdatedAt) : 0;
    const cooldownMs = 30 * 60 * 1000;
    if (lastUpdated && Date.now() - lastUpdated < cooldownMs) {
      // In a real app we might show a toast here
      return;
    }

    setIsRefreshingNews(true);
    try {
      const topics = profile.interests.map(i => i.topic);
      const briefs = await generateNewsBriefs(topics, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: ScoutProfile = {
        ...profile,
        newsBriefs: briefs,
        newsUpdatedAt: now,
        updatedAt: now
      };
      await saveScoutProfile(next, { userId: user?.uid, encryptionKey });
    } catch (err) {
      console.error('Scout news refresh failed:', err);
    } finally {
      setIsRefreshingNews(false);
    }
  }, [user?.uid, isRefreshingNews]);

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
      renderDashboard={({ profile, encryptionKey }) => (
        <ScoutDashboard 
          soul={globalSoul} 
          profile={profile} 
          isLocked={isLocked}
          isRefreshingNews={isRefreshingNews}
          onRefreshNews={() => handleRefreshNews(profile, encryptionKey)}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <ScoutContent 
          profile={profile} 
          encryptionKey={encryptionKey} 
          isRefreshingNews={isRefreshingNews}
          onRefreshNews={() => handleRefreshNews(profile, encryptionKey)}
        />
      )}
    />
  );
}
