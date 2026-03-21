import React from 'react';
import { TitanRoutinePanel } from '../components/TitanRoutinePanel';
import { RoutineProgress } from '../components/RoutineProgress';
import { CustomFieldManager } from '../components/CustomFieldManager';
import type { TitanProfile, Routine, CustomField } from '@/lib/types';

export interface PlanTabProps {
  profile: TitanProfile | null;
  directWriteMode: boolean;
  onAnalyzeRoutine: (routine: Routine) => void;
  onGeneratePlan: () => void;
  onImportRoutine: () => void;
  onSubmitRoutineForApproval: (routine: Routine) => void;
  onStartSession: (routine: Routine) => void;
  onSubmitCustomFieldsForApproval: (values: Record<string, unknown>, categoryLabel: string) => void;
  onDirectCreateMacros: (fields: CustomField[]) => Promise<void>;
}

export function PlanTab({
  profile,
  onAnalyzeRoutine,
  onGeneratePlan,
  onImportRoutine,
  onSubmitRoutineForApproval,
  onStartSession,
  onSubmitCustomFieldsForApproval,
  onDirectCreateMacros,
}: PlanTabProps) {
  return (
    <>
      {/* Routine management with manual builder */}
      <TitanRoutinePanel
        routines={profile?.routines || []}
        onAnalyzeRoutine={onAnalyzeRoutine}
        onGeneratePlan={onGeneratePlan}
        onImportRoutine={onImportRoutine}
        onSubmitForApproval={onSubmitRoutineForApproval}
        onStartSession={onStartSession}
      />

      {/* Volume analytics */}
      {profile?.routines && profile.routines.length > 0 && (
        <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 md:pb-6 pt-4 sm:pt-5">
          <RoutineProgress
            routines={profile.routines}
            workoutSessions={profile.workoutSessions ?? []}
          />
        </div>
      )}

      {/* Custom tracking fields */}
      {profile && (
        <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-2 sm:pt-3">
          <CustomFieldManager
            currentValues={profile.nutrition || {}}
            onSubmitForApproval={onSubmitCustomFieldsForApproval}
            customFields={profile.customFields}
            onDirectCreateMacros={onDirectCreateMacros}
          />
        </div>
      )}
    </>
  );
}
