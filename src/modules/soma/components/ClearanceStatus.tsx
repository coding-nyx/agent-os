/**
 * ClearanceStatus - Enhanced clearance dashboard with visual indicators and AI recommendations
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck, 
  Activity,
  Heart,
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import type { TitanProfile, GlobalProjection, ClearanceRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { SectionHeader } from '@/core/components/SectionHeader';
import { ProgressRing } from '@/core/components/viz/ProgressRing';

interface ClearanceStatusProps {
  profile: TitanProfile | null;
  soul: GlobalProjection | null;
}

interface ClearanceRequirement {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  currentValue: number | null;
  threshold: number;
  comparison: 'gte' | 'lte';
  met: boolean;
  severity: 'low' | 'medium' | 'high';
}

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

export function ClearanceStatus({ profile, soul }: ClearanceStatusProps) {
  const bio = soul?.crossFunctionalState.biological;
  const emo = soul?.crossFunctionalState.emotional;
  const cog = soul?.crossFunctionalState.cognitive;

  const recoveryScore = bio?.recoveryScore ?? null;
  const cnsFatigue = bio?.cnsFatigue ?? null;
  const sleepQuality = bio?.sleepQuality ?? null;
  const emotionalResilience = emo?.emotionalResilience ?? null;
  const hormonalContext = bio?.hormonalContext ?? null;

  // Define clearance requirements
  const requirements: ClearanceRequirement[] = useMemo(() => {
    return [
      {
        id: 'recovery',
        label: 'Recovery Score',
        description: 'Biological readiness for high-intensity training',
        icon: Activity,
        currentValue: recoveryScore,
        threshold: 6,
        comparison: 'gte',
        met: recoveryScore !== null && recoveryScore >= 6,
        severity: 'high',
      },
      {
        id: 'cns',
        label: 'CNS Fatigue',
        description: 'Central nervous system stress level',
        icon: Brain,
        currentValue: cnsFatigue,
        threshold: 6,
        comparison: 'lte',
        met: cnsFatigue !== null && cnsFatigue <= 6,
        severity: 'high',
      },
      {
        id: 'sleep',
        label: 'Sleep Quality',
        description: 'Rest and recovery adequacy',
        icon: Heart,
        currentValue: sleepQuality,
        threshold: 6,
        comparison: 'gte',
        met: sleepQuality !== null && sleepQuality >= 6,
        severity: 'medium',
      },
      {
        id: 'emotional',
        label: 'Emotional Resilience',
        description: 'Mental readiness and stress handling',
        icon: Zap,
        currentValue: emotionalResilience,
        threshold: 5,
        comparison: 'gte',
        met: emotionalResilience !== null && emotionalResilience >= 5,
        severity: 'medium',
      },
    ];
  }, [recoveryScore, cnsFatigue, sleepQuality, emotionalResilience]);

  const metRequirements = requirements.filter(r => r.met);
  const unmetRequirements = requirements.filter(r => !r.met);
  const clearancePercentage = (metRequirements.length / requirements.length) * 100;

  // Determine overall clearance status
  const clearanceStatus: 'granted' | 'conditional' | 'denied' = useMemo(() => {
    const highSeverityUnmet = unmetRequirements.filter(r => r.severity === 'high').length;
    
    if (clearancePercentage === 100) return 'granted';
    if (highSeverityUnmet > 0) return 'denied';
    return 'conditional';
  }, [clearancePercentage, unmetRequirements]);

  // Get clearance history
  const clearances = profile?.clearances ?? [];
  const recentClearances = useMemo(
    () => [...clearances]
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      .slice(0, 5),
    [clearances]
  );

  // AI Recommendations
  const recommendations = useMemo(() => {
    const recs: string[] = [];

    if (cnsFatigue !== null && cnsFatigue > 6) {
      recs.push('Reduce training volume by 30-40% to allow CNS recovery');
      recs.push('Focus on technique work and mobility rather than heavy compounds');
    }

    if (recoveryScore !== null && recoveryScore < 6) {
      recs.push('Prioritize sleep (target 8+ hours) and active recovery');
      recs.push('Consider deload week with 50% volume reduction');
    }

    if (sleepQuality !== null && sleepQuality < 6) {
      recs.push('Assess sleep hygiene: room temperature, light exposure, caffeine timing');
      recs.push('Consider magnesium supplementation before bed');
    }

    if (emotionalResilience !== null && emotionalResilience < 5) {
      recs.push('Avoid max effort lifts; focus on RPE 6-7 training');
      recs.push('Integrate stress management: meditation, breathwork, or light yoga');
    }

    if (hormonalContext?.toLowerCase().includes('luteal')) {
      recs.push('Luteal phase detected: consider reducing training intensity by 10-15%');
    }

    if (recs.length === 0) {
      recs.push('All systems optimal. You are cleared for high-intensity training.');
      recs.push('Monitor intra-session RPE and terminate if fatigue spikes unexpectedly.');
    }

    return recs;
  }, [cnsFatigue, recoveryScore, sleepQuality, emotionalResilience, hormonalContext]);

  // Status colors
  const statusConfig = {
    granted: {
      color: 'emerald',
      bgClass: 'bg-[var(--module-accent-muted)]',
      borderClass: 'border-[var(--module-accent-border)]',
      textClass: 'text-[var(--module-color-300)]',
      icon: CheckCircle2,
      label: 'CLEARED',
      description: 'Full clearance for high-intensity training',
    },
    conditional: {
      color: 'amber',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/30',
      textClass: 'text-amber-300',
      icon: AlertTriangle,
      label: 'CONDITIONAL',
      description: 'Proceed with modified intensity/volume',
    },
    denied: {
      color: 'rose',
      bgClass: 'bg-rose-500/10',
      borderClass: 'border-rose-500/30',
      textClass: 'text-rose-300',
      icon: XCircle,
      label: 'HOLD',
      description: 'Active recovery recommended',
    },
  };

  const currentStatus = statusConfig[clearanceStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-6 px-6 pt-4 pb-8">
      <SectionHeader
        label="Training Clearance Status"
        title="Real-time biometric clearance assessment"
        accentClassName="text-orange-400"
      />

      {/* Primary Status Card */}
      <SurfaceCard className={cn('p-6', currentStatus.bgClass, currentStatus.borderClass)}>
        <div className="flex items-start gap-6">
          {/* Progress Ring */}
          <div className="shrink-0">
            <ProgressRing
              percentage={clearancePercentage}
              size={140}
              strokeWidth={10}
              color={currentStatus.color as any}
              showPercentage
              animate
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <motion.h3
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 280 }}
                  className={cn(
                  'text-2xl font-bold uppercase tracking-tight font-display',
                  currentStatus.textClass
                )}>
                  {currentStatus.label}
                </motion.h3>
              </div>
              <p className="text-sm text-white/70">{currentStatus.description}</p>
            </div>

            {/* Requirements Met Summary */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/50">
                <span>Requirements Met</span>
                <span className="tabular-nums">{metRequirements.length}/{requirements.length}</span>
              </div>
              <div className="h-2 bg-white/[0.045] rounded-full overflow-hidden border border-white/[0.12]">
                <div
                  className={cn(
                    'h-full transition-all duration-700',
                    clearanceStatus === 'granted' && 'bg-gradient-to-r from-[var(--module-accent)] to-[var(--module-color-400)]',
                    clearanceStatus === 'conditional' && 'bg-gradient-to-r from-amber-500 to-amber-400',
                    clearanceStatus === 'denied' && 'bg-gradient-to-r from-rose-500 to-rose-400'
                  )}
                  style={{ width: `${clearancePercentage}%` }}
                />
              </div>
            </div>

            {hormonalContext && (
              <div className="flex items-center gap-2 text-[11px] text-white/50 pt-1">
                <Info className="w-3 h-3" />
                <span>Hormonal Context: <span className="text-white/70 capitalize">{hormonalContext}</span></span>
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Requirements Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {requirements.map((req) => {
          const ReqIcon = req.icon;
          const isMet = req.met;
          const trend = req.comparison === 'gte' ? 'up' : 'down';

          return (
            <SurfaceCard
              key={req.id}
              className={cn(
                'p-4 transition-all',
                isMet 
                  ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]' 
                  : 'border-white/[0.12] bg-white/[0.045]'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  isMet 
                    ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]' 
                    : 'bg-white/[0.045] border border-white/[0.12]'
                )}>
                  <ReqIcon className={cn(
                    'w-5 h-5',
                    isMet ? 'text-[var(--module-color-400)]' : 'text-white/40'
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className={cn(
                      'text-sm font-bold',
                      isMet ? 'text-[var(--module-color-300)]' : 'text-white/70'
                    )}>
                      {req.label}
                    </h4>
                    {isMet ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--module-color-400)] shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-white/30 shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-white/50 leading-relaxed mb-2">
                    {req.description}
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {trend === 'up' ? (
                        <TrendingUp className="w-3 h-3 text-white/40" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-white/40" />
                      )}
                      <span className="text-[11px] text-white/40">
                        {req.comparison === 'gte' ? '≥' : '≤'} {req.threshold}
                      </span>
                    </div>
                    
                    <div className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-bold tabular-nums',
                      isMet 
                        ? 'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]' 
                        : 'bg-white/[0.045] text-white/50'
                    )}>
                      {req.currentValue !== null ? req.currentValue.toFixed(1) : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </SurfaceCard>
          );
        })}
      </div>

      {/* AI Recommendations */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/90 font-display">
            AI Recommendations
          </h3>
        </div>

        <div className="space-y-2">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.045] border border-white/[0.09]">
              <div className="w-5 h-5 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-orange-400">{idx + 1}</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed flex-1">
                {rec}
              </p>
            </div>
          ))}
        </div>
      </SurfaceCard>

      {/* Historical Clearances */}
      {recentClearances.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
            Recent Clearances
          </h3>
          
          <div className="space-y-2">
            {recentClearances.map((clearance) => {
              const historyStatusConfig = {
                granted: { color: 'emerald', icon: CheckCircle2 },
                denied: { color: 'rose', icon: XCircle },
                conditional: { color: 'amber', icon: AlertTriangle },
              };

              const config = historyStatusConfig[clearance.status];
              const HistoryIcon = config.icon;

              return (
                <SurfaceCard key={clearance.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <HistoryIcon className={cn(
                      'w-4 h-4 shrink-0 mt-0.5',
                      `text-${config.color}-400`
                    )} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-bold text-white/90 capitalize">
                          {clearance.activity}
                        </span>
                        <span className="text-[11px] text-white/40 tabular-nums shrink-0">
                          {formatRelativeTime(clearance.issuedAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        {clearance.reason}
                      </p>
                    </div>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
