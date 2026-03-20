import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sunrise, Zap, Brain, Activity, X, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { AtlasProfile } from '../services/atlas-profile-service';
import type { GlobalProjection } from '@/lib/types';
import type { AtlasState } from '../services/atlas-predictive-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MorningCheckInProps {
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  userId?: string | null;
  onDismiss: () => void;
  onSendMessage: (message: string) => void;
  /** Current Atlas predictive state - adjusts header tone and brief prompt. */
  predictiveState?: AtlasState | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function briefKey(userId?: string | null): string {
  return `atlas_brief_date_${userId ?? 'guest'}`;
}

/**
 * Returns true when the morning check-in card should be shown.
 * Conditions (both must hold):
 *   1. Local hour is >= 5 and < 11  (05:00 - 11:00 window).
 *   2. The check-in has not been dismissed today.
 */
export function shouldShowMorningCheckIn(userId?: string | null): boolean {
  try {
    const hour = new Date().getHours();
    if (hour < 5 || hour >= 11) return false;
    const stored = localStorage.getItem(briefKey(userId));
    return stored !== todayISO();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildMorningBriefPrompt(
  profile: AtlasProfile | null,
  soul: GlobalProjection | null,
  predictiveState?: AtlasState | null,
): string {
  const energyBudget = soul?.crossFunctionalState?.cognitive?.energyBudget;
  const focusScore = soul?.crossFunctionalState?.cognitive?.focusScore;
  const cnsFatigue = soul?.crossFunctionalState?.biological?.cnsFatigue;
  const emotionalResilience = soul?.crossFunctionalState?.emotional?.emotionalResilience;
  const stressLoad = soul?.crossFunctionalState?.emotional?.stressLoad;

  const activeTasks =
    profile?.tasks?.filter(
      (t) => t.status !== 'done' && t.status !== 'deferred',
    ) ?? [];
  const topTasks = activeTasks
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((t) => t.title)
    .join(', ');

  const activeHabits = profile?.habits?.filter((h) => h.status === 'active') ?? [];
  const atRiskHabits = activeHabits
    .filter((h) => {
      const lc = h.lastCompleted;
      if (!lc) return h.currentStreak > 0;
      return Date.now() - new Date(lc).getTime() > TWENTY_HOURS_MS;
    })
    .map((h) => h.title)
    .join(', ');

  const stateNote = predictiveState === 'Overloaded'
    ? '\nCRITICAL: Atlas state is OVERLOADED - prioritize recovery and deferral of non-essential tasks.'
    : predictiveState === 'Recovery'
    ? '\nCAUTION: Atlas state is RECOVERY - keep load minimal, protect energy reserves.'
    : predictiveState === 'Compressed'
    ? '\nNOTE: Atlas state is COMPRESSED - apply soft schedule compression and avoid new high-load commitments.'
    : '';

  return `Good morning. Please give me my daily brief for today. 
Context: Energy budget ${energyBudget ?? 'unknown'}/10, Focus score ${focusScore ?? 'unknown'}/10, CNS fatigue ${cnsFatigue ?? 'unknown'}/10, Emotional resilience ${emotionalResilience ?? 'unknown'}/10, Stress load ${stressLoad ?? 'unknown'}/10.${stateNote}
Active tasks (top priority): ${topTasks || 'none'}.
Habits at risk today: ${atRiskHabits || 'none'}.
Please: (1) assess my capacity for today, (2) recommend my one non-negotiable focus task, (3) flag any at-risk habits, (4) suggest any schedule adjustments based on my current state.`;
}

// ---------------------------------------------------------------------------
// StatPill
// ---------------------------------------------------------------------------

interface StatPillProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number | string | undefined | null;
}

function statColor(value: number | string | undefined | null): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (isNaN(n)) return 'text-white/50';
  if (n >= 7) return 'text-emerald-300';
  if (n >= 4) return 'text-amber-300';
  return 'text-rose-300';
}

function StatPill({ icon: Icon, label, value }: StatPillProps) {
  const display = value != null ? String(value) : '\u2014';
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-white/40 shrink-0" aria-hidden="true" />
      <span className={cn('text-sm font-bold tabular-nums', statColor(value))}>{display}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 truncate">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-6"
      role="status"
      aria-live="polite"
      aria-label="Generating your brief"
    >
      <Loader2 className="w-5 h-5 text-[var(--module-color-400)] animate-spin" aria-hidden="true" />
      <span className="text-xs font-bold text-white/50 animate-pulse tracking-wide">
        Generating your brief\u2026
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MorningCheckIn - Main export
// ---------------------------------------------------------------------------

export function MorningCheckIn({
  profile,
  soul,
  userId,
  onDismiss,
  onSendMessage,
  predictiveState,
}: MorningCheckInProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Guard: don't render outside the morning window or if already dismissed.
  if (!shouldShowMorningCheckIn(userId)) return null;

  const cognitive = soul?.crossFunctionalState?.cognitive;
  const emotional = soul?.crossFunctionalState?.emotional;

  const activeTasks =
    profile?.tasks?.filter(
      (t) => t.status !== 'done' && t.status !== 'deferred',
    ) ?? [];
  const previewTasks = [...activeTasks]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);

  const activeHabits = profile?.habits?.filter((h) => h.status === 'active') ?? [];
  const atRiskCount = activeHabits.filter((h) => {
    const lc = h.lastCompleted;
    if (!lc) return h.currentStreak > 0;
    return Date.now() - new Date(lc).getTime() > TWENTY_HOURS_MS;
  }).length;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Dynamic styling based on predictive state
  const isElevated = predictiveState === 'Overloaded' || predictiveState === 'Recovery';
  const isCompressed = predictiveState === 'Compressed';
  const borderClass = isElevated
    ? 'border-orange-500/20'
    : isCompressed
    ? 'border-amber-500/20'
    : 'border-[var(--module-accent-border)]';
  const bgClass = isElevated
    ? 'bg-orange-500/5'
    : isCompressed
    ? 'bg-amber-500/5'
    : 'bg-[var(--module-accent-faint)]';
  const iconClass = isElevated
    ? 'text-orange-400'
    : isCompressed
    ? 'text-amber-400'
    : 'text-[var(--module-color-400)]';
  const headerText =
    predictiveState === 'Overloaded'
      ? 'Overloaded \u2014 Light Day Recommended'
      : predictiveState === 'Recovery'
      ? 'Recovery Mode Active'
      : predictiveState === 'Compressed'
      ? 'Schedule Compressed'
      : 'Good Morning';

  function handleDismiss() {
    try { localStorage.setItem(briefKey(userId), todayISO()); } catch { /* ignore */ }
    onDismiss();
  }

  async function handleGetBrief() {
    setIsLoading(true);
    onSendMessage(buildMorningBriefPrompt(profile, soul, predictiveState));
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsLoading(false);
    handleDismiss();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={cn('rounded-2xl border backdrop-blur-sm p-4 space-y-4', borderClass, bgClass)}
        role="region"
        aria-label="Morning check-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isElevated ? (
              <AlertTriangle className={cn('w-4 h-4 shrink-0', iconClass)} aria-hidden="true" />
            ) : (
              <Sunrise className={cn('w-4 h-4 shrink-0', iconClass)} aria-hidden="true" />
            )}
            <span className="text-sm font-bold text-white/90 tracking-wide truncate">
              {headerText}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              {dateLabel}
            </span>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              aria-label="Dismiss morning check-in"
              className="w-8 h-8 p-0 min-h-0 min-w-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </NeuralButton>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" aria-label="Current state overview">
              <StatPill icon={Zap} label="Energy" value={cognitive?.energyBudget} />
              <StatPill icon={Brain} label="Focus" value={cognitive?.focusScore} />
              <StatPill icon={Activity} label="Stress" value={emotional?.stressLoad} />
            </div>

            {previewTasks.length > 0 && (
              <div className="space-y-1.5" aria-label="Top active tasks">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                  Up Next
                </p>
                {previewTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <span className="text-xs font-medium text-white/70 truncate">
                      {task.title}
                    </span>
                    {typeof task.energyCost === 'number' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Zap className="w-3 h-3 text-[var(--module-color-400)]" aria-hidden="true" />
                        <span className="text-[10px] font-black text-[var(--module-color-300)] tabular-nums">
                          {task.energyCost}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {atRiskCount > 0 && (
              <p className="text-[10px] text-amber-300/80 font-medium">
                {'\u26a0\u00A0'}
                {atRiskCount} habit{atRiskCount !== 1 ? 's' : ''} at risk of breaking today
              </p>
            )}

            <NeuralButton
              onClick={handleGetBrief}
              variant="primary"
              themeColor={isElevated ? 'orange' : isCompressed ? 'amber' : 'module'}
              className="w-full flex items-center justify-center gap-2"
              aria-label="Get my daily brief from Atlas"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Get My Daily Brief
            </NeuralButton>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
