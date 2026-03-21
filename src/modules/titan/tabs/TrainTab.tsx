import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TitanDashboard } from '../components/TitanReadiness';
import { WorkoutSessionLogger } from '../components/WorkoutSessionLogger';
import { ClearanceWidget } from '../components/ClearanceWidget';
import TrainingCalendar from '../components/TrainingCalendar';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { GlobalProjection, TitanProfile, SomaProfile, Routine, WorkoutSession } from '@/lib/types';

export interface TrainTabProps {
  profile: TitanProfile | null;
  somaProfile: SomaProfile | null;
  globalSoul: GlobalProjection | null;
  isLocked: boolean;
  isRecoveryActive: boolean;
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
  return (
    <>
      {/* Advisory banner — surfaced after high-RPE direct-write sessions */}
      <AnimatePresence>
        {advisoryBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 sm:mx-6 md:mx-8 mb-3 sm:mb-4 flex items-start justify-between p-3 sm:p-4 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]"
          >
            <p className="text-[11px] sm:text-xs text-[var(--module-color-300)] leading-relaxed">{advisoryBanner}</p>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={onDismissAdvisory}
              className="ml-3 h-6 w-6 p-0 text-white/30 hover:text-white/60"
            >
              <X className="w-3.5 h-3.5" />
            </NeuralButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7-day calendar — primary training view */}
      <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-2 sm:pt-3">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <span className="text-[11px] sm:text-xs font-bold text-white/40 uppercase tracking-wider">This Week</span>
        </div>
        <TrainingCalendar
          workoutLogs={profile?.workoutLogs ?? []}
          sessions={profile?.workoutSessions}
          onQuickLog={(isoDate) => {
            onOpenQuickLog(new Date(`${isoDate}T12:00:00`), isRecoveryActive);
          }}
          onRemind={(isoDate) => onRemindDate(isoDate)}
        />
      </div>

      {/* Quick session logger for calendar-selected routine */}
      {calendarSelectedRoutine && (
        <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-0">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs text-white/40 uppercase tracking-wider font-bold truncate mr-2">
              Session: {calendarSelectedRoutine.name}
            </span>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => onCalendarRoutineSelect(null)}
              className="text-[11px] sm:text-xs text-white/30 hover:text-white/60 transition-colors shrink-0 min-h-[2.25rem] px-2 flex items-center justify-center"
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
        </div>
      )}

      {/* Clearance snapshot + warning banner (from Soma) */}
      <ClearanceWidget
        clearanceStatus={somaProfile?.clearances?.[0]?.status as 'granted' | 'pending' | 'denied' | undefined ?? null}
        lastBiomarkerDate={somaProfile?.biomarkers?.[0]?.recordedAt ?? null}
        className="px-4 sm:px-6 md:px-8 mb-2 sm:mb-3"
      />

      {/* Readiness — sets daily training context */}
      <TitanDashboard soul={globalSoul} isLocked={isLocked} onCalibrate={onCalibrate} />

      {/* Session logger — shows all routines when no specific routine is selected */}
      {!calendarSelectedRoutine && profile?.routines && profile.routines.length > 0 && (
        <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 md:pb-6 pt-4 sm:pt-5">
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
        </div>
      )}

      {/* Bottom padding so content isn't flush against the QuickLogBar */}
      <div className="h-4" aria-hidden="true" />
    </>
  );
}
