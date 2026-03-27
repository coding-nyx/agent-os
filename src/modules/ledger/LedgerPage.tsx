import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { LedgerOnboarding } from './onboarding/LedgerOnboarding';
import {
  LedgerIntakeProfile,
  loadLedgerProfile,
  saveLedgerProfile,
  subscribeLedgerProfile,
  syncGuestLedgerProfileToUser
} from './services/ledger-intake-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { ledgerDiagnosisSpec } from './diagnosis/ledger-diagnosis-spec';
import { LedgerContent } from './LedgerContent';

registerDiagnosisSpec(ledgerDiagnosisSpec);

export default function LedgerPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<LedgerIntakeProfile>
      moduleId="ledger"
      profileOptions={{
        loadProfile: loadLedgerProfile,
        saveProfile: saveLedgerProfile,
        subscribeProfile: subscribeLedgerProfile,
        refreshProfile: loadLedgerProfile,
        syncGuestProfile: syncGuestLedgerProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <LedgerOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForLedger({ coreProfile })}
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
      renderContent={({ profile, encryptionKey }) => (
        <LedgerContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
