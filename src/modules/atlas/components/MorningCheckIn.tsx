import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sunrise, Zap, Brain, Activity, X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProfile } from '../services/atlas-profile-service';
import type { GlobalProjection } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MorningCheckInProps {
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  userId?: string | null;
  onDismiss: () => void;
  onSendMessage: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

/** Returns today's date as YYYY-MM-DD in local time. */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns the localStorage key scoped to the current user (or guest). */
function briefKey(userId?: string | null): string {
  return `atlas_brief_date_${userId ?? 'guest'}`;
}

/**
 * Returns true when the morning check-in card should be shown.
 * Compares the stored dismissal date to today; shows when they differ.
 */
export function shouldShowMorningCheckIn(userId?: string | null): boolean {
  try {
    const stored = localStorage.getItem(briefKey(userId));
    return stored !== todayISO();
  } catch {
    // localStorage may be unavailable in some environments (e.g. SSR).
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildMorningBriefPrompt(
  profile: AtlasProfile | null,
  soul: GlobalProjection | null,
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
      if (!h.lastCompleted) return h.currentStreak > 0;
      return Date.now() - new Date(h.lastCompleted).getTime() > TWENTY_HOURS_MS;
    })
    .map((h) => h.title)
    .join(', ');

  return `Good morning. Please give me my daily brief for today. 
Context: Energy budget ${energyBudget ?? 'unknown'}/10, Focus score ${focusScore ?? 'unknown'}/10, CNS fatigue ${cnsFatigue ?? 'unknown'}/10, Emotional resilience ${emotionalResilience ?? 'unknown'}/10, Stress load ${stressLoad ?? 'unknown'}/10.
Active tasks (top priority): ${topTasks || 'none'}.
Habits at risk today: ${atRiskHabits || 'none'}.
Please: (1) assess my capacity for today, (2) recommend my one non-negotiable focus task, (3) flag any at-risk habits, (4) suggest any schedule adjustments based on my current state.`;
}

// ---------------------------------------------------------------------------
// StatPill — small colourised metric badge
// ---------------------------------------------------------------------------

interface StatPillProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
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
  const display = value != null ? String(value) : '—';
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-white/40 shrink-0" aria-hidden="true" />
      <span className={cn('text-sm font-bold tabular-nums', statColor(value))}>
        {display}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 truncate">
        {label}
      </span>
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
      <Loader2 className="w-5 h-5 text-sky-400 animate-spin" aria-hidden="true" />
      <span className="text-xs font-bold text-white/50 animate-pulse tracking-wide">
        Generating your brief…
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MorningCheckIn — Main export
// ---------------------------------------------------------------------------

export function MorningCheckIn({
  profile,
  soul,
  userId,
  onDismiss,
  onSendMessage,
}: MorningCheckInProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Guard: don't render if already dismissed today.
  if (!shouldShowMorningCheckIn(userId)) return null;

  // ── Derived data ──────────────────────────────────────────────────────────

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
    if (!h.lastCompleted) return h.currentStreak > 0;
    return Date.now() - new Date(h.lastCompleted).getTime() > TWENTY_HOURS_MS;
  }).length;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDismiss() {
    try {
      localStorage.setItem(briefKey(userId), todayISO());
    } catch {
      // Ignore storage failures; dismissal still propagates to the parent.
    }
    onDismiss();
  }

  async function handleGetBrief() {
    setIsLoading(true);
    onSendMessage(buildMorningBriefPrompt(profile, soul));
    // Brief delay to acknowledge the action before the parent takes over the UI.
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsLoading(false);
    handleDismiss();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-sky-500/20 bg-sky-500/5 backdrop-blur-sm p-4 space-y-4"
        role="region"
        aria-label="Morning check-in"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sunrise className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold text-white/90 tracking-wide truncate">
              Good Morning
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              {dateLabel}
            </span>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss morning check-in"
              className="rounded-lg p-1 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Body (idle vs loading) ── */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Quick context stats */}
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Current state overview"
            >
              <StatPill
                icon={Zap}
                label="Energy"
                value={cognitive?.energyBudget}
              />
              <StatPill
                icon={Brain}
                label="Focus"
                value={cognitive?.focusScore}
              />
              <StatPill
                icon={Activity}
                label="Stress"
                value={emotional?.stressLoad}
              />
            </div>

            {/* Task preview */}
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
                        <Zap className="w-3 h-3 text-sky-400" aria-hidden="true" />
                        <span className="text-[10px] font-black text-sky-300 tabular-nums">
                          {task.energyCost}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* At-risk habits callout */}
            {atRiskCount > 0 && (
              <p className="text-[10px] text-amber-300/80 font-medium">
                ⚠{'\u00A0'}
                {atRiskCount} habit{atRiskCount !== 1 ? 's' : ''} at risk of breaking today
              </p>
            )}

            {/* CTA */}
            <button
              onClick={handleGetBrief}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-xl',
                'bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/30',
                'text-sky-300 text-xs font-bold uppercase tracking-[0.15em]',
                'py-2.5 px-4 transition-colors focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2',
                'focus-visible:ring-offset-transparent',
              )}
              aria-label="Get my daily brief from Atlas"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Get My Daily Brief
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
