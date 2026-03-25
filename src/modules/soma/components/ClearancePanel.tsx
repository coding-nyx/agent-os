import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2, Lock, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NeuralButton } from '@/core/components/NeuralButton';

// ---------------------------------------------------------------------------
// ClearancePanel — Recovery tab for the merged Titan dashboard
// Shows recovery score, hormonal context, clearance status & history.
// ---------------------------------------------------------------------------

type ClearanceProfileShape = {
  medicalOnboardingComplete?: boolean;
  biomarkers?: readonly { id?: string }[] | { id?: string }[];
  vitalReadings?: readonly unknown[] | unknown[];
  knownConditions?: readonly string[] | string[];
  clearances?: Array<{ id: string; status: string; issuedAt: string; activity?: string; notes?: string; reason?: string }>;
} | null;

interface ClearancePanelProps {
  profile: ClearanceProfileShape;
  soul: GlobalProjection | null;
  isLocked?: boolean;
  onAnalyze?: (prompt: string) => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function recoveryColor(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'text-white/40';
  if (score >= 7) return 'text-[var(--module-color-400)]';
  if (score >= 4) return 'text-amber-400';
  return 'text-rose-400';
}

function recoveryBg(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'border-white/10 bg-white/[0.03]';
  if (score >= 7) return 'border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]';
  if (score >= 4) return 'border-amber-500/20 bg-amber-500/5';
  return 'border-rose-500/20 bg-rose-500/5';
}

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; badge: string; label: string }> = {
  granted: {
    icon: CheckCircle2,
    badge: 'bg-[var(--module-accent-glow)] border-[var(--module-accent-border)] text-[var(--module-color-300)]',
    label: 'Granted',
  },
  denied: {
    icon: XCircle,
    badge: 'bg-rose-500/20 border-rose-500/30 text-rose-300',
    label: 'Denied',
  },
  conditional: {
    icon: ShieldAlert,
    badge: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
    label: 'Conditional',
  },
};

// ---------------------------------------------------------------------------
// ClearanceChecklist — shown when no clearance record exists
// ---------------------------------------------------------------------------

const CLEARANCE_PROMPT =
  'Please review my complete medical profile — conditions, medications, biomarkers, vital readings, and history — ' +
  'then issue an activity clearance decision for "high_intensity" training using the issue_clearance action. ' +
  'Base your decision on available data. If I have no known conditions, confirm that and issue clearance accordingly.';

function ClearanceChecklist({
  profile,
  onAnalyze,
}: {
  profile: ClearanceProfileShape;
  onAnalyze?: (prompt: string) => Promise<void> | void;
}) {
  const [noConditionsConfirmed, setNoConditionsConfirmed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const hasVitals = (profile?.vitalReadings?.length ?? 0) > 0 || (profile?.biomarkers?.length ?? 0) > 0;
  const hasConditions = (profile?.knownConditions?.length ?? 0) > 0;

  const steps = [
    {
      label: 'Complete medical intake',
      done: !!profile?.medicalOnboardingComplete,
      hint: 'Answer the health history questions in your Soma profile.',
      action: null,
    },
    {
      label: 'Log at least one vital or biomarker',
      done: hasVitals,
      hint: 'Go to Vitals and log blood pressure, resting HR, weight, or any biomarker.',
      action: null,
    },
    {
      label: 'Declare conditions (or confirm none)',
      done: hasConditions || noConditionsConfirmed,
      hint: 'Tell Soma about any medical conditions, injuries, or medications.',
      action: !hasConditions && !noConditionsConfirmed ? (
        <button
          className="text-[10px] text-[var(--module-color-400)] hover:text-[var(--module-color-300)] underline underline-offset-2 mt-1"
          onClick={() => setNoConditionsConfirmed(true)}
        >
          I have no known conditions →
        </button>
      ) : null,
    },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;

  const handleRequest = async () => {
    if (!onAnalyze) return;
    setIsRequesting(true);
    try {
      await onAnalyze(CLEARANCE_PROMPT);
    } finally {
      setIsRequesting(false);
    }
  };

  if (isRequesting) {
    return (
      <SurfaceCard className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[var(--module-color-400)] animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white/80">Soma AI is evaluating your profile…</p>
            <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
              Review the AI chat panel to see the evaluation and result.
            </p>
          </div>
        </div>
        <button
          className="text-[11px] text-white/30 hover:text-white/50 underline underline-offset-2"
          onClick={() => setIsRequesting(false)}
        >
          Cancel
        </button>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Get Cleared for Training</p>
          <p className="text-[11px] text-white/40 mt-0.5">{completedCount} of {steps.length} steps complete</p>
        </div>
        <ShieldCheck className="w-7 h-7 text-white/10" />
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className={cn(
            'flex items-start gap-3 p-3 rounded-xl border transition-colors',
            step.done
              ? 'bg-[var(--module-accent-faint,rgba(255,255,255,0.04))] border-[var(--module-accent-border)]'
              : 'bg-white/[0.02] border-white/5',
          )}>
            {step.done
              ? <CheckCircle2 className="w-4 h-4 text-[var(--module-color-400)] mt-0.5 shrink-0" />
              : <Circle className="w-4 h-4 text-white/20 mt-0.5 shrink-0" />
            }
            <div className="min-w-0">
              <p className={cn('text-[12px] font-semibold', step.done ? 'text-white/80' : 'text-white/50')}>
                {step.label}
              </p>
              {!step.done && (
                <>
                  <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">{step.hint}</p>
                  {step.action}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {onAnalyze && (
        <NeuralButton
          onClick={handleRequest}
          disabled={!allDone}
          className="w-full"
          title={!allDone ? `Complete all ${steps.length} steps first` : undefined}
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          {allDone ? 'Request Clearance from Soma AI' : `${steps.length - completedCount} step${steps.length - completedCount !== 1 ? 's' : ''} remaining`}
        </NeuralButton>
      )}
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClearancePanel({ profile, soul, isLocked = false, onAnalyze }: ClearancePanelProps) {
  const bio = soul?.crossFunctionalState.biological;
  const recoveryScore = bio?.recoveryScore ?? null;
  const hormonalContext = bio?.hormonalContext ?? null;

  const clearances = profile?.clearances ?? [];

  const sortedClearances = useMemo(
    () =>
      [...clearances]
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
        .slice(0, 5),
    [clearances]
  );

  const latestClearance = sortedClearances[0] ?? null;

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Soma Clearance"
        moduleDescription="Medical clearance and physiological boundary management."
      />
    );
  }

  return (
    <div
      className="p-6 md:p-8 space-y-8"
      role="tabpanel"
      id="titan-panel-recovery"
      aria-labelledby="titan-tab-recovery"
    >
      <SectionHeader
        label="Recovery Intelligence"
        title="Clearance & Recovery"
        subtitle="Biological readiness, hormonal context, and activity clearances."
        accentClassName="text-orange-400"
      />

      {/* Recovery Score Card */}
      <SurfaceCard className={cn('p-6', recoveryBg(recoveryScore))}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
              Recovery Score
            </span>
            <div className="flex items-end gap-2">
              <span className={cn('text-5xl font-bold tabular-nums tracking-tight', recoveryColor(recoveryScore))}>
                {typeof recoveryScore === 'number' ? recoveryScore.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-white/30 mb-2">/10</span>
            </div>
            <p className="text-[11px] text-white/40 mt-1">
              {typeof recoveryScore === 'number'
                ? recoveryScore >= 7
                  ? 'Full readiness — cleared for high-intensity training.'
                  : recoveryScore >= 4
                    ? 'Moderate readiness — moderate intensity recommended.'
                    : 'Low readiness — prioritize rest and recovery.'
                : 'Awaiting biological data to compute recovery score.'}
            </p>
          </div>
          <ShieldCheck
            className={cn('w-12 h-12 shrink-0', recoveryColor(recoveryScore), 'opacity-30')}
            aria-hidden="true"
          />
        </div>
      </SurfaceCard>

      {/* Hormonal Context */}
      {hormonalContext && (
        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
                Hormonal Context
              </span>
              <p className="text-xs font-bold text-white/80 uppercase tracking-wider">
                {hormonalContext}
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-300 uppercase tracking-wider">
              Active
            </span>
          </div>
        </SurfaceCard>
      )}

      {/* Current Clearance Status */}
      <section className="space-y-3" aria-label="Clearance status">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Current Clearance
        </h4>
        {!latestClearance ? (
          <ClearanceChecklist profile={profile} onAnalyze={onAnalyze} />
        ) : (() => {
          const cfg = STATUS_CONFIG[latestClearance.status] ?? STATUS_CONFIG.denied;
          const StatusIcon = cfg.icon;
          return (
            <SurfaceCard className="p-5">
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  latestClearance.status === 'granted'
                    ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]'
                    : latestClearance.status === 'conditional'
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-rose-500/10 border border-rose-500/20'
                )}>
                  <StatusIcon
                    className={cn(
                      'w-5 h-5',
                      latestClearance.status === 'granted'
                        ? 'text-[var(--module-color-400)]'
                        : latestClearance.status === 'conditional'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    )}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white/90">{latestClearance.activity}</span>
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
                      cfg.badge
                    )}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">{latestClearance.reason}</p>
                  <span className="text-[10px] text-white/30">{formatRelativeTime(latestClearance.issuedAt)}</span>
                </div>
              </div>
              {onAnalyze && (latestClearance.status === 'denied' || latestClearance.status === 'conditional') && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <NeuralButton
                    onClick={() => onAnalyze(
                      `My previous ${latestClearance.activity} clearance was "${latestClearance.status}"` +
                      (latestClearance.reason ? ` with reason: "${latestClearance.reason}".` : '.') +
                      ' Please re-evaluate my current medical profile and biomarkers and issue an updated clearance decision using the issue_clearance action.'
                    )}
                    variant="ghost"
                    size="sm"
                    className="w-full"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Request Re-evaluation
                  </NeuralButton>
                </div>
              )}
            </SurfaceCard>
          );
        })()}
      </section>

      {/* Clearance History Timeline */}
      <section className="space-y-3" aria-label="Clearance history">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">
          Clearance History
        </h4>
        {sortedClearances.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Clock}
            title="No clearance history"
            description="Past clearance decisions will populate this timeline."
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="relative pl-6">
            {/* Timeline line */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-white/10" aria-hidden="true" />

            <div className="space-y-4">
              {sortedClearances.map((record, idx) => {
                const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.denied;
                const StatusIcon = cfg.icon;
                return (
                  <div key={record.id} className="relative flex items-start gap-3">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute -left-6 top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                        record.status === 'granted'
                          ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]'
                          : record.status === 'conditional'
                            ? 'border-amber-500/40 bg-amber-500/10'
                            : 'border-rose-500/40 bg-rose-500/10'
                      )}
                      aria-hidden="true"
                    >
                      <StatusIcon
                        className={cn(
                          'w-2.5 h-2.5',
                          record.status === 'granted'
                            ? 'text-[var(--module-color-400)]'
                            : record.status === 'conditional'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                        )}
                      />
                    </div>

                    <SurfaceCard className="p-3 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white/80">{record.activity}</span>
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider',
                            cfg.badge
                          )}>
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/30 shrink-0 ml-2">
                          {formatRelativeTime(record.issuedAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40 leading-relaxed">{record.reason}</p>
                    </SurfaceCard>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Medical Disclaimer */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200/80">
        <p className="font-semibold text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          Medical Disclaimer
        </p>
        <p className="mt-1">
          Titan provides informational guidance only. It does not provide medical diagnoses,
          treatment plans, or replace professional medical advice. Always consult a qualified
          healthcare provider for medical decisions.
        </p>
      </div>
    </div>
  );
}
