import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TitanDashboard } from '../components/TitanReadiness';
import { WorkoutSessionLogger } from '../components/WorkoutSessionLogger';
import { ClearanceWidget } from '../components/ClearanceWidget';
import TrainingCalendar from '../components/TrainingCalendar';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { GlobalProjection, TitanProfile, SomaProfile, Routine, WorkoutSession } from '@/lib/types';

const SECTION_X = 'px-4 sm:px-6 md:px-8';

export interface TrainTabProps {
  profile: TitanProfile | null;
  somaProfile: SomaProfile | null;
  globalSoul: GlobalProjection | null;
  isLocked: boolean;
  isRecoveryActive: boolean;
  clearanceStatus: 'granted' | 'pending' | 'conditional' | 'denied' | null;
  clearanceMessage: string | null;
  activeDebtCount: number;
  readinessPresentationMode: 'performance' | 'recovery';
  directWriteMode: boolean;
  advisoryBanner: string | null;
  onDismissAdvisory: () => void;
  calendarSelectedRoutine: Routine | null;
  onCalendarRoutineSelect: (routine: Routine | null) => void;
  onOpenQuickLog: (date: Date, isRecovery: boolean) => void;
  onRemindDate: (isoDate: string) => void;
  onCalibrate: (metricKey: string) => void;
  onOpenChatAndSend: (prompt: string) => void;
  guardRecoveryAction: (onLight: () => void, onFull: () => void) => void;
  commitWorkoutSession: (session: WorkoutSession, recoverySession?: boolean) => Promise<void>;
  onSetAdvisoryBanner: (msg: string | null) => void;
}

export function TrainTab({
  profile,
  somaProfile,
  globalSoul,
  isLocked,
  isRecoveryActive,
  clearanceStatus,
  clearanceMessage,
  activeDebtCount,
  readinessPresentationMode,
  directWriteMode,
  advisoryBanner,
  onDismissAdvisory,
  calendarSelectedRoutine,
  onCalendarRoutineSelect,
  onOpenQuickLog,
  onRemindDate,
  onCalibrate,
  onOpenChatAndSend,
  guardRecoveryAction,
  commitWorkoutSession,
  onSetAdvisoryBanner,
}: TrainTabProps) {
  const latestBiomarkerDate = React.useMemo(() => {
    const biomarkers = [...(somaProfile?.biomarkers ?? [])];
    biomarkers.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return biomarkers[0]?.recordedAt ?? null;
  }, [somaProfile?.biomarkers]);

  return (
    <div className="flex flex-col gap-4 pb-4 sm:gap-5 sm:pb-5 md:gap-6 md:pb-6">
      <AnimatePresence>
        {advisoryBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 flex items-start justify-between rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] p-3 sm:mx-6 sm:p-4 md:mx-8"
          >
            <p className="text-[11px] leading-relaxed text-[var(--module-color-300)] sm:text-xs">{advisoryBanner}</p>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onDismissAdvisory}
              className="ml-3 h-6 w-6 p-0 text-white/30 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </NeuralButton>
          </motion.div>
        )}
      </AnimatePresence>

      <section className={SECTION_X}>
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">This Week</span>
        </div>
        <TrainingCalendar
          workoutLogs={profile?.workoutLogs ?? []}
          sessions={profile?.workoutSessions}
          onQuickLog={(isoDate) => {
            onOpenQuickLog(new Date(`${isoDate}T12:00:00`), isRecoveryActive);
          }}
          onRemind={(isoDate) => onRemindDate(isoDate)}
        />
      </section>

      {calendarSelectedRoutine && (
        <section className={SECTION_X}>
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
            <span className="mr-2 truncate text-[11px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
              Session: {calendarSelectedRoutine.name}
            </span>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => onCalendarRoutineSelect(null)}
              className="flex min-h-[2.25rem] shrink-0 items-center justify-center px-2 text-[11px] text-white/30 transition-colors hover:text-white/60 sm:text-xs"
            >
              ✕ Dismiss
            </NeuralButton>
          </div>
          <WorkoutSessionLogger
            routines={[calendarSelectedRoutine]}
            recentSessions={profile?.workoutSessions ?? []}
            onSubmitSession={(prompt) => {
              guardRecoveryAction(
                () => {
                  onOpenChatAndSend(`[Recovery Session] ${prompt}`);
                  onCalendarRoutineSelect(null);
                },
                () => {
                  onOpenChatAndSend(prompt);
                  onCalendarRoutineSelect(null);
                }
              );
            }}
            directWriteMode={directWriteMode}
            onDirectCommit={async (session) => {
              guardRecoveryAction(
                async () => {
                  await commitWorkoutSession({ ...session, recoverySession: true }, true);
                  onCalendarRoutineSelect(null);
                },
                async () => {
                  await commitWorkoutSession(session);
                  onCalendarRoutineSelect(null);
                  if (session.rpe != null && session.rpe >= 9) {
                    onSetAdvisoryBanner(`High RPE (${session.rpe}) detected — consider scheduling a deload day tomorrow.`);
                  }
                }
              );
            }}
          />
        </section>
      )}

      <ClearanceWidget
        clearanceStatus={clearanceStatus}
        lastBiomarkerDate={latestBiomarkerDate}
        activeDebtCount={activeDebtCount}
        enforcementMessage={clearanceMessage}
        className={SECTION_X}
      />

      <TitanDashboard
        soul={globalSoul}
        isLocked={isLocked}
        onCalibrate={onCalibrate}
        presentationMode={readinessPresentationMode}
        presentationReason={clearanceMessage}
        activeDebtCount={activeDebtCount}
      />

      {!calendarSelectedRoutine && profile?.routines && profile.routines.length > 0 && (
        <section className={SECTION_X}>
          <WorkoutSessionLogger
            routines={profile.routines}
            recentSessions={profile?.workoutSessions ?? []}
            onSubmitSession={(prompt) => {
              guardRecoveryAction(
                () => onOpenChatAndSend(`[Recovery Session] ${prompt}`),
                () => onOpenChatAndSend(prompt)
              );
            }}
            directWriteMode={directWriteMode}
            onDirectCommit={async (session) => {
              guardRecoveryAction(
                async () => {
                  await commitWorkoutSession({ ...session, recoverySession: true }, true);
                },
                async () => {
                  await commitWorkoutSession(session);
                  if (session.rpe != null && session.rpe >= 9) {
                    onSetAdvisoryBanner(`High RPE (${session.rpe}) detected — consider scheduling a deload day tomorrow.`);
                  }
                }
              );
            }}
          />
        </section>
      )}

      <div className="h-4" aria-hidden="true" />
    </div>
  );
}
