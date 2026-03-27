import React from 'react';
import { CalendarClock, ShieldAlert, Stethoscope, Sparkles } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { TitanRecoveryPlan } from '@/lib/types';
import { getRecoveryTemplate } from '../data/recovery-templates';

interface RecoveryDashboardProps {
  plan: TitanRecoveryPlan;
  daysRemaining: number;
  onResume: () => void;
}

export function RecoveryDashboard({ plan, daysRemaining, onResume }: RecoveryDashboardProps) {
  const template = getRecoveryTemplate(plan.type, plan.bodyRegion);
  return (
    <div className="space-y-5 sm:space-y-6">
      <SurfaceCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-glow)]">
              <ShieldAlert className="w-5 h-5 text-[var(--module-color-400)]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Recovery Overview</p>
              <p className="text-lg font-black text-white/90">{template.label}</p>
              <p className="mt-1 text-xs text-white/50">
                {plan.reasons.join(', ')} · {daysRemaining} days remaining
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <NeuralButton variant="primary" size="sm" onClick={onResume}>
              Resume Training
            </NeuralButton>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:gap-4 lg:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Start</p>
            <p className="text-white/80">{plan.startDate}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">End</p>
            <p className="text-white/80">{plan.endDate}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Suggested</p>
            <p className="text-white/80">{plan.suggestedDurationDays} days</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Region</p>
            <p className="text-white/80">{plan.bodyRegion ?? 'n/a'}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--module-color-400)]" />
          <h3 className="text-[13px] uppercase tracking-wider text-white/80 font-black">
            Recovery Protocol
          </h3>
        </div>
        <p className="mb-4 text-sm text-white/70">{template.description}</p>
        <ul className="space-y-2 text-sm text-white/70">
          {template.steps.map((step) => (
            <li key={step} className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--module-color-400)]" />
              <span>{step}</span>
            </li>
          ))}
        </ul>

        {(plan.aiSummary || plan.somaSummary || plan.agnesSummary) && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plan.somaSummary && (
              <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Stethoscope className="w-4 h-4 text-emerald-300" />
                  <span className="text-[11px] uppercase tracking-wider text-white/50">Soma</span>
                </div>
                <p className="text-xs text-white/70">{plan.somaSummary}</p>
              </div>
            )}
            {plan.agnesSummary && (
              <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                  <span className="text-[11px] uppercase tracking-wider text-white/50">Agnes</span>
                </div>
                <p className="text-xs text-white/70">{plan.agnesSummary}</p>
              </div>
            )}
            {plan.aiSummary && (
              <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-3 sm:col-span-2 xl:col-span-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-[var(--module-color-300)]" />
                  <span className="text-[11px] uppercase tracking-wider text-white/50">Titan Overlay</span>
                </div>
                <p className="text-xs text-white/70">{plan.aiSummary}</p>
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
