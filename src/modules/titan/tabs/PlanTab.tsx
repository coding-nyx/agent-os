import React, { useState } from 'react';
import { ChevronDown, Library } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TitanRoutinePanel } from '../components/TitanRoutinePanel';
import { RoutineProgress } from '../components/RoutineProgress';
import { CustomFieldManager } from '../components/CustomFieldManager';
import { ExerciseLibraryBrowser } from '../components/ExerciseLibraryBrowser';
import { WorkoutScheduler } from '../components/WorkoutScheduler';
import type { TitanProfile, Routine, CustomField, PlannedWorkout, WorkoutSession } from '@/lib/types';

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
  onApplyProgram?: (routines: Routine[], programName: string, programId?: string, durationWeeks?: number, phases?: { name: string; weeks: [number, number] }[]) => void;
  /** Planned workouts from profile.plannedWorkouts */
  plannedWorkouts?: PlannedWorkout[];
  /** Completed sessions from profile.workoutSessions */
  completedSessions?: WorkoutSession[];
  /** Direct-write: save a new planned workout */
  onDirectSavePlan?: (plan: PlannedWorkout) => Promise<void>;
  /** Direct-write: update an existing planned workout */
  onDirectUpdatePlan?: (plan: PlannedWorkout) => Promise<void>;
  /** AI path: send a scheduling prompt */
  onAnalyzePlan?: (prompt: string) => void;
  /** Clear current program */
  onClearProgram?: () => void;
  /** Update active program metadata (e.g. shift schedule) */
  onUpdateProgram?: (updates: Partial<NonNullable<TitanProfile['activeProgram']>>) => void;
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
  onApplyProgram,
  plannedWorkouts,
  completedSessions,
  onDirectSavePlan,
  onDirectUpdatePlan,
  onAnalyzePlan,
  onClearProgram,
  onUpdateProgram,
}: PlanTabProps) {
  /** Controls the collapsible Exercise Library panel. */
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <>
      {/* ── Workout Scheduler (4-week calendar) ──────────────────────────── */}
      <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-4 sm:pt-5">
        <WorkoutScheduler
          plannedWorkouts={plannedWorkouts ?? []}
          completedSessions={completedSessions ?? []}
          routines={profile?.routines ?? []}
          onAnalyze={onAnalyzePlan}
          directWriteMode={profile?.directWriteMode ?? false}
          onDirectSave={onDirectSavePlan}
          onDirectUpdate={onDirectUpdatePlan}
          onStartSession={onStartSession}
        />
      </div>

      {/* Routine management with manual builder */}
      <TitanRoutinePanel
        routines={profile?.routines || []}
        activeProgram={profile?.activeProgram}
        plannedWorkouts={plannedWorkouts}
        onAnalyzeRoutine={onAnalyzeRoutine}
        onGeneratePlan={onGeneratePlan}
        onImportRoutine={onImportRoutine}
        onSubmitForApproval={onSubmitRoutineForApproval}
        onStartSession={onStartSession}
        onApplyProgram={onApplyProgram}
        onClearProgram={onClearProgram}
        onUpdateProgram={onUpdateProgram}
      />

      {/* Volume analytics */}
      {profile?.routines && profile.routines.length > 0 && (
        <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 md:pb-6 pt-4 sm:pt-5">
          <RoutineProgress
            routines={profile.routines}
            workoutSessions={profile.workoutSessions ?? []}
            exerciseLibrary={profile.exerciseLibrary}
          />
        </div>
      )}

      {/* ── Exercise Library ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-2 sm:pt-3">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => setLibraryOpen(prev => !prev)}
          aria-expanded={libraryOpen}
          aria-controls="exercise-library-panel"
          className={cn(
            'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--module-accent-ring)]',
            libraryOpen
              ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)]'
              : 'bg-white/[0.045] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.12]',
          )}
        >
          {/* Left side: icon + labels */}
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-7 h-7 rounded-xl flex items-center justify-center transition-colors duration-200',
                libraryOpen
                  ? 'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]'
                  : 'bg-white/[0.06] text-white/40',
              )}
            >
              <Library className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <p
                className={cn(
                  'text-[11px] font-bold uppercase tracking-[0.12em] transition-colors duration-200',
                  libraryOpen ? 'text-[var(--module-color-300)]' : 'text-white/50',
                )}
              >
                Exercise Library
              </p>
              {!libraryOpen && (
                <p className="text-[11px] text-white/25 leading-tight mt-0.5">
                  Browse &amp; search exercises by muscle group or equipment
                </p>
              )}
            </div>
          </div>

          {/* Right side: animated chevron */}
          <motion.div
            animate={{ rotate: libraryOpen ? 180 : 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="shrink-0 text-white/30"
            aria-hidden
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </button>

        {/* Collapsible browser */}
        <AnimatePresence initial={false}>
          {libraryOpen && (
            <motion.div
              id="exercise-library-panel"
              key="library"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-3">
                <ExerciseLibraryBrowser profileEquipment={profile?.activity?.equipment} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
