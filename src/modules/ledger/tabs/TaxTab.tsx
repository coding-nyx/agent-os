import React from 'react';
import { TaxTracker } from '../components/TaxTracker';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';

interface TaxTabProps {
  profile: LedgerIntakeProfile;
  onUpdateProfile: (updates: Partial<LedgerIntakeProfile>) => void;
}

export function TaxTab({ profile, onUpdateProfile }: TaxTabProps) {
  return (
    <div className="px-4 md:px-8">
      <TaxTracker
        profile={profile}
        onUpdateProfile={onUpdateProfile}
      />
    </div>
  );
}
