import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { GuidedIntakeStep, IntakeThemeColor } from './types';

interface GuidedIntakeFrameProps {
  title: string;
  subtitle: string;
  statusLabel: string;
  steps: GuidedIntakeStep[];
  currentStep: number;
  themeColor: IntakeThemeColor;
  children: React.ReactNode;
  prelude?: React.ReactNode;
  preludeCollapsible?: boolean;
}

const THEME_MAP: Record<IntakeThemeColor, { accent: string; soft: string }> = {
  indigo: { accent: 'text-indigo-400', soft: 'bg-indigo-500/30' },
  orange: { accent: 'text-orange-400', soft: 'bg-orange-500/30' },
  cyan: { accent: 'text-cyan-400', soft: 'bg-cyan-500/30' },
  emerald: { accent: 'text-emerald-400', soft: 'bg-emerald-500/30' },
  sky: { accent: 'text-sky-400', soft: 'bg-sky-500/30' },
  lime: { accent: 'text-lime-400', soft: 'bg-lime-500/30' },
  rose: { accent: 'text-rose-400', soft: 'bg-rose-500/30' },
  fuchsia: { accent: 'text-fuchsia-400', soft: 'bg-fuchsia-500/30' },
  slate: { accent: 'text-slate-400', soft: 'bg-slate-500/30' },
  violet: { accent: 'text-violet-400', soft: 'bg-violet-500/30' }
};

export function GuidedIntakeFrame({
  title,
  subtitle,
  statusLabel,
  steps,
  currentStep,
  themeColor,
  children,
  prelude,
  preludeCollapsible = true
}: GuidedIntakeFrameProps) {
  const theme = THEME_MAP[themeColor];
  const safeStep = Math.min(Math.max(currentStep, 0), steps.length - 1);
  const [preludeOpen, setPreludeOpen] = useState(false);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-0 sm:p-4">
      <div className="relative w-full h-full sm:h-[84vh] flex flex-col bg-slate-900/70 backdrop-blur-xl rounded-none sm:rounded-panel border-x-0 border-y sm:border border-white/[0.12] overflow-hidden shadow-2xl">
        {/* Simplified Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 border-b border-white/[0.09] bg-gradient-to-r from-white/[0.04] to-transparent shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {statusLabel && (
                <>
                  <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50">{statusLabel}</span>
                  <div className="h-1 w-1 rounded-full bg-white/20" />
                </>
              )}
              <span className={cn('text-[11px] font-black uppercase tracking-[0.3em]', theme.accent)}>
                Step {safeStep + 1} of {steps.length}
              </span>
            </div>
            <h2 className={cn('text-lg sm:text-xl font-black italic uppercase tracking-widest', theme.accent)}>{title}</h2>
            <p className="text-[11px] sm:text-[11px] text-white/50 leading-relaxed max-w-xl">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {steps.map((step, index) => (
              <React.Fragment key={step.key}>
                <div
                  className={cn(
                    'h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full transition-all duration-300',
                    index === safeStep ? `${theme.soft} scale-125` : index < safeStep ? 'bg-white/30' : 'bg-white/10'
                  )}
                  title={step.label}
                />
                {index < steps.length - 1 && <div className="h-px w-2 sm:w-3 bg-white/10" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Current Step Helper */}
        <div className="px-4 sm:px-6 py-2 sm:py-3 border-b border-white/[0.09] bg-white/[0.045] flex items-center justify-between shrink-0">
           <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
             Current Focus: <span className="text-white">{steps[safeStep]?.label || 'Intake'}</span>
           </p>
           <p className="text-[11px] text-white/40 hidden sm:block">
             {steps[safeStep]?.helperText || ''}
           </p>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {prelude && preludeCollapsible && (
            <div className="border-b border-white/[0.09] bg-slate-900/60 shrink-0">
              <button
                onClick={() => setPreludeOpen(prev => !prev)}
                className={cn(
                  'w-full flex items-center justify-between px-6 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors hover:bg-white/[0.045]',
                  theme.accent
                )}
              >
                <span className="flex items-center gap-2 opacity-70">⚡ Fast Track Available</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200 opacity-50', preludeOpen && 'rotate-180')} />
              </button>
              {preludeOpen && <div>{prelude}</div>}
            </div>
          )}
          {prelude && !preludeCollapsible && (
            <div className="border-b border-white/[0.09] bg-slate-900/60 shrink-0">{prelude}</div>
          )}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
