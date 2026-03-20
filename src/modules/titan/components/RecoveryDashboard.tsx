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
    <div className="space-y-4 sm:space-y-5">
      <SurfaceCard className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)] flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-[var(--module-color-400)]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Recovery Overview</p>
            <p className="text-lg font-black text-white/90">{template.label}</p>
            <p className="text-xs text-white/50 mt-1">
              {plan.reasons.join(', ')} · {daysRemaining} days remaining
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Start</p>
            <p className="text-white/80">{plan.startDate}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">End</p>
            <p className="text-white/80">{plan.endDate}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Suggested</p>
            <p className="text-white/80">{plan.suggestedDurationDays} days</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Region</p>
            <p className="text-white/80">{plan.bodyRegion ?? 'n/a'}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <NeuralButton variant="primary" size="sm" onClick={onResume}>
            Resume Training
          </NeuralButton>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-[var(--module-color-400)]" />
          <h3 className="text-[13px] uppercase tracking-wider text-white/80 font-black">
            Recovery Protocol
          </h3>
        </div>
        <p className="text-sm text-white/70 mb-3">{template.description}</p>
        <ul className="space-y-2 text-sm text-white/70">
          {template.steps.map((step) => (
            <li key={step} className="flex items-start gap-2">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--module-color-400)]" />
              <span>{step}</span>
            </li>
          ))}
        </ul>

        {(plan.aiSummary || plan.somaSummary || plan.agnesSummary) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {plan.somaSummary && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Stethoscope className="w-4 h-4 text-emerald-300" />
                  <span className="text-[11px] uppercase tracking-wider text-white/50">Soma</span>
                </div>
                <p className="text-xs text-white/70">{plan.somaSummary}</p>
              </div>
            )}
            {plan.agnesSummary && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                  <span className="text-[11px] uppercase tracking-wider text-white/50">Agnes</span>
                </div>
                <p className="text-xs text-white/70">{plan.agnesSummary}</p>
              </div>
            )}
            {plan.aiSummary && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2">
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
