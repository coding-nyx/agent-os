import React, { useCallback, useEffect, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { PULSE_PERSONA } from './personas';
import { PulseDashboard } from './components/PulseDashboard';
import {
  PulseProfile,
  loadPulseProfile,
  savePulseProfile,
  subscribePulseProfile,
  syncGuestPulseProfileToUser
} from './services/pulse-profile-service';
import { generateNewsBriefs } from './services/pulse-news-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerPulseActions } from './services/actions';

registerPulseActions();

export default function PulsePage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('pulse');

  return (
    <UnifiedModulePage<PulseProfile>
      moduleId="pulse"
      requireVault={false}
      profileOptions={{
        loadProfile: (params) => loadPulseProfile({ userId: params.userId }),
        subscribeProfile: (params, onUpdate) => subscribePulseProfile({ userId: params.userId }, onUpdate),
        syncGuestProfile: (params) => syncGuestPulseProfileToUser({ userId: params.userId })
      }}
      renderContent={({ profile, encryptionKey }) => {
        const agentAlias = globalSoul?.displayNames?.pulse || 'Pulse';
        const [isRefreshingNews, setIsRefreshingNews] = useState(false);

        const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
          moduleId: 'pulse',
          systemPrompt: PULSE_PERSONA,
          encryptionKey
        });

        useEffect(() => {
          if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
            setMessages([
              {
                role: 'assistant',
                content:
                  `Trend link active. I am ${agentAlias}. ` +
                  `Share topics you care about and I will map rising, stable, and cooling momentum.`
              }
            ]);
          }
        }, [messages.length, isProcessing, streamingText, profile?.onboardingComplete, setMessages, agentAlias]);

        const persistUpdate = useCallback((nextProfile: PulseProfile) => {
            nextProfile.updatedAt = new Date().toISOString();
            savePulseProfile(nextProfile, { userId: user?.uid }).catch((saveError) => {
              console.error('Failed to persist pulse action update:', saveError);
            });
        }, [user?.uid]);

        const refreshNewsBriefs = useCallback(async () => {
          if (!profile || profile.interests.length === 0 || isRefreshingNews) return;
          const lastUpdated = profile.newsUpdatedAt ? Date.parse(profile.newsUpdatedAt) : 0;
          const cooldownMs = 30 * 60 * 1000;
          if (lastUpdated && Date.now() - lastUpdated < cooldownMs) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: 'Trend briefs were refreshed recently. Try again in a bit.' }
            ]);
            return;
          }

          setIsRefreshingNews(true);
          try {
            const briefs = await generateNewsBriefs(profile.interests, { maxTopics: 5 });
            const now = new Date().toISOString();
            const next: PulseProfile = {
              ...profile,
              newsBriefs: briefs,
              newsUpdatedAt: now,
              updatedAt: now
            };
            persistUpdate(next);
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: briefs.length ? 'Pulse briefs refreshed.' : 'No new briefs found for current topics.' }
            ]);
          } catch (err) {
            console.error('Pulse news refresh failed:', err);
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Pulse brief refresh failed. Check search backend.' }]);
          } finally {
            setIsRefreshingNews(false);
          }
        }, [profile, isRefreshingNews, setMessages, persistUpdate]);

        return (
          <div className="h-full flex flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto no-scrollbar">
                <PulseDashboard
                  soul={globalSoul}
                  profile={profile}
                  onRefreshNews={refreshNewsBriefs}
                  isRefreshingNews={isRefreshingNews}
                  isLocked={isLocked}
                />
              </div>

              <div className="flex-1 h-1/2 md:h-full overflow-hidden">
                <NexusChat
                  ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                  agentName={agentAlias}
                  themeColor="cyan"
                  placeholder="Tell me topics to track, trend shifts you suspect, or ask for a signal synthesis..."
                />
              </div>
            </div>
        );
      }}
    />
  );
}
