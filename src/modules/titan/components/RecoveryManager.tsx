import React from 'react';
import { RecoveryDashboard } from './RecoveryDashboard';
import { RecoveryCheckinPanel } from './RecoveryCheckinPanel';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { TitanRecoveryPlan, TitanRecoveryCheckin } from '@/lib/types';

interface RecoveryManagerProps {
  recoveryPlan: TitanRecoveryPlan | null;
  daysRemaining: number;
  hasCheckinToday: boolean;
  onResume: () => void;
  onSaveCheckin: (payload: Omit<TitanRecoveryCheckin, 'date'> & { date?: string }) => void;
  onOpenQuickLog: () => void;
}

/**
 * Composite component that owns the recovery tab UI:
 * RecoveryDashboard + RecoveryCheckinPanel (when no check-in today) + light activity prompt.
 */
export function RecoveryManager({
  recoveryPlan,
  daysRemaining,
  hasCheckinToday,
  onResume,
  onSaveCheckin,
  onOpenQuickLog,
}: RecoveryManagerProps) {
  return (
    <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-4 sm:space-y-5">
      {recoveryPlan && (
        <RecoveryDashboard
          plan={recoveryPlan}
          daysRemaining={daysRemaining}
          onResume={onResume}
        />
      )}

      {!hasCheckinToday && (
        <RecoveryCheckinPanel
          isNudge
          onSubmit={(payload) => onSaveCheckin(payload)}
          onSkip={() => onSaveCheckin({
            pain: 0,
            fatigue: 0,
            sleepQuality: 0,
            mood: 0,
            skipped: true,
          })}
        />
      )}

      <SurfaceCard className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Light Activity</p>
            <p className="text-sm text-white/70">Log a recovery-safe session (walk, mobility, rehab).</p>
          </div>
          <NeuralButton
            variant="secondary"
            size="sm"
            onClick={onOpenQuickLog}
          >
            Log Session
          </NeuralButton>
        </div>
      </SurfaceCard>
    </div>
  );
}
