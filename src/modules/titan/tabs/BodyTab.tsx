import React from 'react';
import { PRBoard } from '../components/PRBoard';
import { ProgressTab } from '../components/ProgressTab';
import { BodyWeightTracker } from '../components/BodyWeightTracker';
import { CardioLogger } from '../components/CardioLogger';
import { SleepTracker } from '../components/SleepTracker';
import type { TitanProfile, SleepEntry, BodyWeightEntry, CardioSession } from '@/lib/types';

export interface BodyTabProps {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  directWriteMode: boolean;
  onAnalyze: (prompt: string) => void;
  onDirectSaveBodyWeight: (entry: BodyWeightEntry) => Promise<void>;
  onDirectSaveCardio: (session: CardioSession) => Promise<void>;
  onDirectSaveSleep: (entry: SleepEntry) => Promise<void>;
}

export function BodyTab({
  profile,
  encryptionKey,
  directWriteMode,
  onAnalyze,
  onDirectSaveBodyWeight,
  onDirectSaveCardio,
  onDirectSaveSleep,
}: BodyTabProps) {
  return (
    <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-5 sm:space-y-6 md:space-y-8">
      <PRBoard
        personalRecords={Object.values(profile?.personalRecords ?? {})}
        workoutLogs={profile?.workoutLogs ?? []}
      />
      <ProgressTab
        profile={profile}
        encryptionKey={encryptionKey}
      />
      <BodyWeightTracker
        bodyWeightLog={profile?.bodyWeightLog ?? []}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveBodyWeight}
      />
      <CardioLogger
        cardioLog={profile?.cardioLog ?? []}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveCardio}
      />
      <SleepTracker
        sleepLog={profile?.sleepLog ?? []}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveSleep}
      />
    </div>
  );
}
