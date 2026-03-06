import React, { useCallback, useEffect, useMemo } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { ATLAS_PERSONA } from './personas';
import { AtlasOnboarding } from './onboarding/AtlasOnboarding';
import { AtlasDashboard } from './components/AtlasDashboard';
import {
  AtlasProfile,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile,
  subscribeAtlasProfile,
  syncGuestAtlasProfileToUser
} from './services/atlas-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerAtlasActions } from './services/actions';

registerAtlasActions();

function buildRecoveryWindow(reason: string): RecoveryWindow {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'Recovery Window',
    start: new Date(now).toISOString(),
    end: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    reason,
    status: 'planned'
  };
}

export default function AtlasPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('atlas');

  const baseContext = useMemo(() => IntakeBaseContextService.buildForAtlas({ coreProfile }), [coreProfile]);

  return (
    <UnifiedModulePage<AtlasProfile>
      moduleId="atlas"
      profileOptions={{
        loadProfile: loadAtlasProfile,
        saveProfile: saveAtlasProfile,
        subscribeProfile: subscribeAtlasProfile,
        syncGuestProfile: syncGuestAtlasProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <AtlasOnboarding
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
      renderContent={({ profile, encryptionKey }) => {
        const agentAlias = globalSoul?.displayNames?.atlas || 'Atlas';

        const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
          moduleId: 'atlas',
          systemPrompt: ATLAS_PERSONA,
          encryptionKey
        });

        useEffect(() => {
          if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
            setMessages([
              {
                role: 'assistant',
                content:
                  `Cognitive link active. I am ${agentAlias}. ` +
                  `Share task pressure, schedule constraints, or focus instability and I will reshape your wave.`
              }
            ]);
          }
        }, [messages.length, isProcessing, streamingText, agentAlias, setMessages, profile?.onboardingComplete]);

        const persistUpdate = useCallback((nextProfile: AtlasProfile) => {
            nextProfile.updatedAt = new Date().toISOString();
            saveAtlasProfile(nextProfile, { userId: user?.uid, encryptionKey }).catch((saveError) => {
              console.error('Failed to persist atlas action update:', saveError);
            });
        }, [user?.uid, encryptionKey]);

        useSpineEvent('BURNOUT_WARNING', (event) => {
          if (!profile) return;
          const window = buildRecoveryWindow('burnout_warning');
          const next: AtlasProfile = {
            ...profile,
            recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
            flattenedUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date().toISOString()
          };
          persistUpdate(next);
        });

        useSpineEvent('BLOCK_HIGH_INTENSITY', (event) => {
          if (!profile) return;
          const window = buildRecoveryWindow('cns_fatigue_block');
          const next: AtlasProfile = {
            ...profile,
            recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
            flattenedUntil: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date().toISOString()
          };
          persistUpdate(next);
        });

        useSpineEvent('FLATTEN_ENERGY_WAVE', (event) => {
          if (!profile) return;
          const window = buildRecoveryWindow('energy_wave_flatten');
          const now = Date.now();
          const nextFlattenUntil = new Date(now + 2 * 60 * 60 * 1000).toISOString();
          const existingUntil = profile.flattenedUntil ? Date.parse(profile.flattenedUntil) : 0;
          const resolvedUntil = existingUntil > now ? new Date(Math.max(existingUntil, Date.parse(nextFlattenUntil))).toISOString() : nextFlattenUntil;
          const next: AtlasProfile = {
            ...profile,
            recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
            flattenedUntil: resolvedUntil,
            updatedAt: new Date().toISOString()
          };
          persistUpdate(next);
        });

        return (
          <div className="h-full flex flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto no-scrollbar">
                <AtlasDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
              </div>

              <div className="flex-1 h-1/2 md:h-full overflow-hidden">
                <NexusChat
                  ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                  agentName={agentAlias}
                  themeColor="cyan"
                  placeholder="Share your schedule pressure, focus bottlenecks, or request load flattening..."
                />
              </div>
            </div>
        );
      }}
    />
  );
}
