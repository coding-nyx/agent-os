import React from 'react';
import { cn } from '@/lib/utils';
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
}

const THEME_MAP: Record<IntakeThemeColor, { accent: string; soft: string }> = {
  indigo: { accent: 'text-indigo-400', soft: 'bg-indigo-500/30' },
  orange: { accent: 'text-orange-400', soft: 'bg-orange-500/30' },
  cyan: { accent: 'text-cyan-400', soft: 'bg-cyan-500/30' }
};

export function GuidedIntakeFrame({
  title,
  subtitle,
  statusLabel,
  steps,
  currentStep,
  themeColor,
  children,
  prelude
}: GuidedIntakeFrameProps) {
  const theme = THEME_MAP[themeColor];
  const safeStep = Math.min(Math.max(currentStep, 0), steps.length - 1);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[82vh] flex flex-col bg-black/40 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/5 bg-white/5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className={cn('text-xl font-black italic uppercase tracking-widest', theme.accent)}>{title}</h2>
              <p className="text-xs text-white/50 tracking-tight">{subtitle}</p>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{statusLabel}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {steps.map((step, index) => (
                <React.Fragment key={step.key}>
                  <div
                    className={cn(
                      'h-2.5 w-2.5 rounded-full transition-all duration-300',
                      index === safeStep ? `${theme.soft} scale-110` : index < safeStep ? 'bg-white/30' : 'bg-white/10'
                    )}
                  />
                  {index < steps.length - 1 && <div className="h-px flex-1 bg-white/10" />}
                </React.Fragment>
              ))}
            </div>

            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{steps[safeStep]?.label || 'Intake'}</p>
              <p className="text-[11px] text-white/50 max-w-xl text-right leading-relaxed">{steps[safeStep]?.helperText || ''}</p>
            </div>
          </div>
        </div>

        {prelude && <div className="border-b border-white/5 bg-black/30">{prelude}</div>}

        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
