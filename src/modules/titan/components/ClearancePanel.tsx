import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { TitanProfile, GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';

// ---------------------------------------------------------------------------
// ClearancePanel — Recovery tab for the merged Titan dashboard
// Shows recovery score, hormonal context, clearance status & history.
// ---------------------------------------------------------------------------

interface ClearancePanelProps {
  profile: TitanProfile | null;
  soul: GlobalProjection | null;
  isLocked?: boolean;
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
  if (score >= 7) return 'text-emerald-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-rose-400';
}

function recoveryBg(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'border-white/10 bg-white/[0.03]';
  if (score >= 7) return 'border-emerald-500/20 bg-emerald-500/5';
  if (score >= 4) return 'border-amber-500/20 bg-amber-500/5';
  return 'border-rose-500/20 bg-rose-500/5';
}

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; badge: string; label: string }> = {
  granted: {
    icon: CheckCircle2,
    badge: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
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
// Component
// ---------------------------------------------------------------------------

export function ClearancePanel({ profile, soul, isLocked = false }: ClearancePanelProps) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Titan to view recovery and clearance data."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

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
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 italic">
              Recovery Score
            </span>
            <div className="flex items-end gap-2">
              <span className={cn('text-5xl font-black tabular-nums tracking-tight', recoveryColor(recoveryScore))}>
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
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 italic">
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
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
          Current Clearance
        </h4>
        {!latestClearance ? (
          <EmptyState
            size="sm"
            icon={ShieldCheck}
            title="No clearance records"
            description="Clearance decisions will appear here after Titan evaluates activity readiness."
            className="bg-transparent border-white/10"
          />
        ) : (() => {
          const cfg = STATUS_CONFIG[latestClearance.status] ?? STATUS_CONFIG.denied;
          const StatusIcon = cfg.icon;
          return (
            <SurfaceCard className="p-5">
              <div className="flex items-start gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  latestClearance.status === 'granted'
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : latestClearance.status === 'conditional'
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-rose-500/10 border border-rose-500/20'
                )}>
                  <StatusIcon
                    className={cn(
                      'w-5 h-5',
                      latestClearance.status === 'granted'
                        ? 'text-emerald-400'
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
            </SurfaceCard>
          );
        })()}
      </section>

      {/* Clearance History Timeline */}
      <section className="space-y-3" aria-label="Clearance history">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
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
                          ? 'border-emerald-500/40 bg-emerald-500/10'
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
                            ? 'text-emerald-400'
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
