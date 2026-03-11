import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Zap, CheckCircle2, X, Stars, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProfile } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EveningCheckInProps {
  profile: AtlasProfile;
  userId?: string;
  onSendMessage: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD in local time. */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns the localStorage key scoped to the current user (or guest). */
function eveningKey(userId?: string): string {
  return `atlas_evening_date_${userId ?? 'guest'}`;
}

/**
 * Returns true when the evening check-in card should be shown.
 *
 * Conditions:
 * 1. Current local hour is ≥ 17 (5 PM – midnight).
 * 2. The user has not yet dismissed the card today.
 *
 * Pure function — safe to call outside React (e.g. in route guards).
 */
export function shouldShowEveningCheckIn(userId?: string): boolean {
  try {
    const hour = new Date().getHours();
    if (hour < 17) return false;
    const stored = localStorage.getItem(eveningKey(userId));
    return stored !== todayISO();
  } catch {
    // localStorage may be unavailable (SSR, private browsing restrictions).
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildEveningReviewPrompt(profile: AtlasProfile): string {
  const completedToday = profile.tasks
    .filter(
      (t) =>
        t.status === 'done' &&
        t.completedAt &&
        t.completedAt.startsWith(todayISO()),
    )
    .map((t) => t.title);

  const stillPending = profile.tasks
    .filter((t) => t.status !== 'done' && t.status !== 'deferred')
    .slice(0, 5)
    .map((t) => t.title);

  const activeHabits = profile.habits
    .filter((h) => h.status === 'active')
    .slice(0, 6)
    .map((h) => {
      const completedToday =
        h.lastCompleted && h.lastCompleted.startsWith(todayISO());
      return `${h.title} (${completedToday ? '✓ done' : '✗ pending'}, streak: ${h.currentStreak})`;
    });

  const scheduledToday = profile.scheduledTasks
    .filter((t) => t.scheduledAt.startsWith(todayISO()))
    .map((t) => `${t.title} [${t.status}]`);

  return (
    `Good evening. Please run my daily review for ${todayISO()}.\n` +
    `Tasks completed today: ${completedToday.length > 0 ? completedToday.join(', ') : 'none'}.\n` +
    `Still pending: ${stillPending.length > 0 ? stillPending.join(', ') : 'none'}.\n` +
    `Today's habits: ${activeHabits.length > 0 ? activeHabits.join('; ') : 'none tracked'}.\n` +
    `Scheduled blocks today: ${scheduledToday.length > 0 ? scheduledToday.join(', ') : 'none'}.\n` +
    `Please: (1) summarise what I accomplished, (2) flag any habits still at risk of breaking, ` +
    `(3) suggest what to carry forward to tomorrow, and (4) recommend any wind-down adjustments ` +
    `based on my day.`
  );
}

// ---------------------------------------------------------------------------
// TaskRow — compact completed / pending task preview
// ---------------------------------------------------------------------------

interface TaskRowProps {
  title: string;
  done: boolean;
}

function TaskRow({ title, done }: TaskRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <CheckCircle2
        className={cn(
          'w-3.5 h-3.5 shrink-0',
          done ? 'text-emerald-400' : 'text-white/20',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-xs font-medium truncate',
          done ? 'text-white/50 line-through' : 'text-white/70',
        )}
      >
        {title}
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
      aria-label="Starting evening review"
    >
      <Loader2
        className="w-5 h-5 text-indigo-400 animate-spin"
        aria-hidden="true"
      />
      <span className="text-xs font-bold text-white/50 animate-pulse tracking-wide">
        Starting your review…
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EveningCheckIn — Main export
// ---------------------------------------------------------------------------

export function EveningCheckIn({
  profile,
  userId,
  onSendMessage,
}: EveningCheckInProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Guard: don't render if already dismissed today or outside the time window.
  if (dismissed || !shouldShowEveningCheckIn(userId)) return null;

  // ── Derived data ──────────────────────────────────────────────────────────

  const completedToday = profile.tasks.filter(
    (t) =>
      t.status === 'done' &&
      t.completedAt &&
      t.completedAt.startsWith(todayISO()),
  );

  const stillPending = profile.tasks
    .filter((t) => t.status !== 'done' && t.status !== 'deferred')
    .slice(0, 3);

  const previewTasks = [
    ...completedToday.slice(0, 2).map((t) => ({ title: t.title, done: true })),
    ...stillPending
      .slice(0, 2)
      .map((t) => ({ title: t.title, done: false })),
  ];

  const activeHabits = profile.habits.filter((h) => h.status === 'active');
  const pendingHabitCount = activeHabits.filter(
    (h) => !h.lastCompleted || !h.lastCompleted.startsWith(todayISO()),
  ).length;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function persist() {
    try {
      localStorage.setItem(eveningKey(userId), todayISO());
    } catch {
      // Storage failure is non-fatal; UI dismissal still proceeds.
    }
    setDismissed(true);
  }

  async function handleStartReview() {
    setIsLoading(true);
    onSendMessage(buildEveningReviewPrompt(profile));
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    setIsLoading(false);
    persist();
  }

  function handleSkip() {
    persist();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm p-4 space-y-4"
        role="region"
        aria-label="Evening check-in"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Moon
              className="w-4 h-4 text-indigo-400 shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-bold text-white/90 tracking-wide truncate">
              Evening Review
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              {dateLabel}
            </span>
            <button
              onClick={handleSkip}
              aria-label="Skip evening check-in"
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
            {/* Task preview */}
            {previewTasks.length > 0 && (
              <div className="space-y-1.5" aria-label="Today's task summary">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                  Today's Tasks
                </p>
                {previewTasks.map((item, index) => (
                  <TaskRow key={index} title={item.title} done={item.done} />
                ))}
              </div>
            )}

            {/* Habit callout */}
            {pendingHabitCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <Zap
                  className="w-3.5 h-3.5 text-amber-400 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-[10px] text-amber-300/80 font-medium">
                  {pendingHabitCount} habit
                  {pendingHabitCount !== 1 ? 's' : ''} still pending — log
                  them before sleep
                </p>
              </div>
            )}

            {/* Completion summary badge */}
            {completedToday.length > 0 && (
              <div className="flex items-center gap-2">
                <Stars
                  className="w-3.5 h-3.5 text-indigo-400 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[10px] font-bold text-indigo-300/70">
                  {completedToday.length} task
                  {completedToday.length !== 1 ? 's' : ''} completed today
                </span>
              </div>
            )}

            {/* CTAs */}
            <div className="flex gap-2">
              <button
                onClick={handleStartReview}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-xl',
                  'bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30',
                  'text-indigo-300 text-xs font-bold uppercase tracking-[0.15em]',
                  'py-2.5 px-4 transition-colors focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                  'focus-visible:ring-offset-transparent',
                )}
                aria-label="Start my evening review with Atlas"
              >
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                Start Review
              </button>

              <button
                onClick={handleSkip}
                className={cn(
                  'flex items-center justify-center rounded-xl',
                  'border border-white/10 hover:bg-white/5',
                  'text-white/40 hover:text-white/60 text-xs font-bold',
                  'py-2.5 px-4 transition-colors focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2',
                  'focus-visible:ring-offset-transparent',
                )}
                aria-label="Skip tonight's review"
              >
                Skip Tonight
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
