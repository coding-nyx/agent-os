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
import { registerLedgerFieldActions } from '@/modules/ledger/actions/ledger-field-actions';
import { registerLedgerTransactionActions } from '@/modules/ledger/actions/transaction-actions';
import { registerLedgerAccountActions } from '@/modules/ledger/actions/account-actions';
import { registerLedgerRecurringActions } from '@/modules/ledger/actions/recurring-actions';
import { registerLedgerSubscriptionActions } from '@/modules/ledger/actions/subscription-actions';
import { registerLedgerInvestmentActions } from '@/modules/ledger/actions/investment-actions';
import { registerLedgerAlertActions } from '@/modules/ledger/actions/alert-actions';
import { registerLedgerTaxActions } from '@/modules/ledger/actions/tax-actions';
import { registerLedgerExportActions } from '@/modules/ledger/actions/export-actions';
import { registerLedgerCreditActions } from '@/modules/ledger/actions/credit-actions';
import { registerLedgerInsuranceActions } from '@/modules/ledger/actions/insurance-actions';
import { registerLedgerRetirementActions } from '@/modules/ledger/actions/retirement-actions';
import { registerLedgerAutomationActions } from '@/modules/ledger/actions/automation-actions';
import { registerLedgerReceiptActions } from '@/modules/ledger/actions/receipt-actions';
import { registerLedgerCascadeRules } from '@/lib/spine/cascade-rules';
import { LedgerContent } from './LedgerContent';

registerDiagnosisSpec(ledgerDiagnosisSpec);
registerLedgerFieldActions();
registerLedgerTransactionActions();
registerLedgerAccountActions();
registerLedgerRecurringActions();
registerLedgerSubscriptionActions();
registerLedgerInvestmentActions();
registerLedgerAlertActions();
registerLedgerTaxActions();
registerLedgerExportActions();
registerLedgerCreditActions();
registerLedgerInsuranceActions();
registerLedgerRetirementActions();
registerLedgerAutomationActions();
registerLedgerReceiptActions();
registerLedgerCascadeRules();

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
