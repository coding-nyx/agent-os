import React from 'react';
import { TitanContent } from './TitanContent';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useAuth } from '@/lib/auth-context';
import { TitanProfile } from '@/lib/types';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { titanDiagnosisSpec } from './diagnosis/titan-diagnosis-spec';

registerDiagnosisSpec(titanDiagnosisSpec);

export default function TitanPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<TitanProfile>
      moduleId="titan"
      noContainer={true}
      profileOptions={{
        loadProfile: loadTitanProfile,
        saveProfile: saveTitanProfile,
        subscribeProfile: subscribeTitanProfile,
        refreshProfile: loadTitanProfile,
        syncGuestProfile: syncGuestTitanProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <TitanOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForTitan({ coreProfile, titanProfile: profile })}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            try {
              onComplete(completed);
            } catch (e) {
              console.error('Titan onboarding completion sync failed:', e);
            }
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <TitanContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
