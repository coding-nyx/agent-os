import React from 'react';
import { ShieldAlert, CalendarClock, Activity, CheckCircle2 } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { TitanRecoveryPlan } from '@/lib/types';

interface RecoveryBannerProps {
  plan: TitanRecoveryPlan;
  daysRemaining: number;
  onOpenCheckin: () => void;
  onViewPlan: () => void;
  onResume: () => void;
}

export function RecoveryBanner({
  plan,
  daysRemaining,
  onOpenCheckin,
  onViewPlan,
  onResume
}: RecoveryBannerProps) {
  return (
    <SurfaceCard className="mx-4 sm:mx-6 md:mx-8 mb-4 sm:mb-5 md:mb-6 p-3 sm:p-4 border border-[var(--module-accent-border)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-[var(--module-color-400)]" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[var(--module-color-300)] font-semibold">Recovery Mode Active</p>
            <div className="flex items-center gap-2 flex-wrap text-sm text-white/80 mt-1">
              <span className="font-semibold">{plan.type.replace('_', ' ')}</span>
              <span className="text-white/30">•</span>
              <span className="flex items-center gap-1 text-white/60">
                <CalendarClock className="w-3.5 h-3.5" />
                {daysRemaining} days remaining
              </span>
              <span className="text-white/30">•</span>
              <span className="flex items-center gap-1 text-white/50">
                <Activity className="w-3.5 h-3.5" />
                {plan.reasons.join(', ')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <NeuralButton variant="ghost" size="sm" onClick={onOpenCheckin}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Daily Check-in
          </NeuralButton>
          <NeuralButton variant="secondary" size="sm" onClick={onViewPlan}>
            View Plan
          </NeuralButton>
          <NeuralButton variant="primary" size="sm" onClick={onResume}>
            Resume Training
          </NeuralButton>
        </div>
      </div>
    </SurfaceCard>
  );
}
