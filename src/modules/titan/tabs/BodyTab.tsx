import React from 'react';
import { PRBoard } from '../components/PRBoard';
import { ProgressTab } from '../components/ProgressTab';
import { BodyWeightTracker } from '../components/BodyWeightTracker';
import { CardioLogger } from '../components/CardioLogger';
import { SleepTracker } from '../components/SleepTracker';
import { DailyMacroLogger } from '../components/DailyMacroLogger';
import { InjuryTracker } from '../components/InjuryTracker';
import { GoalTracker } from '../components/GoalTracker';
import type { TitanProfile, SleepEntry, BodyWeightEntry, CardioSession, MealEntry, TitanMacroEstimate, Injury, WorkoutGoal } from '@/lib/types';

export interface BodyTabProps {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  directWriteMode: boolean;
  onAnalyze: (prompt: string) => void;
  onDirectSaveBodyWeight: (entry: BodyWeightEntry) => Promise<void>;
  onDirectSaveCardio: (session: CardioSession) => Promise<void>;
  onDirectSaveSleep: (entry: SleepEntry) => Promise<void>;
  macroTargets?: TitanMacroEstimate;
  mealLog?: MealEntry[];
  onDirectSaveMeal?: (entry: MealEntry) => Promise<void>;
  onDirectSaveInjury?: (injury: Injury) => Promise<void>;
  onDirectUpdateInjury?: (injury: Injury) => Promise<void>;
  goals?: WorkoutGoal[];
  onDirectSaveGoal?: (goal: WorkoutGoal) => Promise<void>;
  onDirectUpdateGoal?: (goal: WorkoutGoal) => Promise<void>;
}

export function BodyTab({
  profile,
  encryptionKey,
  directWriteMode,
  onAnalyze,
  onDirectSaveBodyWeight,
  onDirectSaveCardio,
  onDirectSaveSleep,
  macroTargets,
  mealLog,
  onDirectSaveMeal,
  onDirectSaveInjury,
  onDirectUpdateInjury,
  goals,
  onDirectSaveGoal,
  onDirectUpdateGoal,
}: BodyTabProps) {
  // Safely extract structured Injury[] — filter out any legacy string values from migration
  const injuries = (profile?.history?.injuries ?? []).filter(
    (inj): inj is Injury => typeof inj === 'object' && inj !== null && 'id' in inj
  );

  return (
    <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-5 sm:space-y-6 md:space-y-8">
      <GoalTracker
        goals={goals ?? []}
        personalRecords={profile?.personalRecords}
        bodyWeightLog={profile?.bodyWeightLog}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveGoal}
        onDirectUpdate={onDirectUpdateGoal}
      />
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
      <DailyMacroLogger
        mealLog={mealLog ?? []}
        macroTargets={macroTargets}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveMeal}
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
      <InjuryTracker
        injuries={injuries}
        onAnalyze={directWriteMode ? undefined : onAnalyze}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSaveInjury}
        onDirectUpdate={onDirectUpdateInjury}
      />
    </div>
  );
}
