import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, CheckCircle2, Flame, Dumbbell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProfile } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EveningCheckInProps {
  /** Atlas profile used to compute today's completion stats. Nullable for safety. */
  profile: AtlasProfile | null;
  /** Optional user ID — used to scope the localStorage dismissal key. */
  userId?: string | null;
  /** Called after the user picks a mood or taps dismiss; caller owns persistence. */
  onDismiss: () => void;
}

/** The three mood options the user can select. */
type DayMood = 'tough' | 'okay' | 'good';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD in local time. */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** localStorage key scoped to user identity. */
function eveningKey(userId?: string | null): string {
  return `atlas_last_evening_checkin_${userId ?? 'guest'}`;
}

/**
 * Returns true when the evening check-in should be shown.
 *
 * Conditions (both must hold):
 *   1. Local hour is ≥ 19 and < 22  (7 PM – 10 PM).
 *   2. The check-in has not yet been dismissed today.
 *
 * Pure function — safe to call outside React (e.g. in EnhancedAtlasDashboard guard).
 */
export function shouldShowEveningCheckIn(userId?: string | null): boolean {
  try {
    const hour = new Date().getHours();
    if (hour < 19 || hour >= 22) return false;
    const stored = localStorage.getItem(eveningKey(userId));
    return stored !== todayISO();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stat derivation helpers
// ---------------------------------------------------------------------------

/** Count tasks marked done today. */
function countTasksCompletedToday(profile: AtlasProfile | null): number {
  if (!profile) return 0;
  return profile.tasks.filter(
    (t) => t.status === 'done' && t.completedAt?.startsWith(todayISO()),
  ).length;
}

/** Count active habits that were logged today (lastCompleted is today). */
function countHabitsLoggedToday(profile: AtlasProfile | null): number {
  if (!profile) return 0;
  return profile.habits.filter(
    (h) => h.status === 'active' && h.lastCompleted?.startsWith(todayISO()),
  ).length;
}

/**
 * Heuristic: did the user log a workout today?
 * Checks for any completed task today whose title contains fitness keywords,
 * or any active habit with a fitness keyword logged today.
 */
function detectWorkoutToday(profile: AtlasProfile | null): boolean {
  if (!profile) return false;
  const KEYWORDS = /workout|gym|lift|run|train|cardio|swim|ride|yoga|hiit|squat|deadlift|bench/i;
  const taskWorkout = profile.tasks.some(
    (t) =>
      t.status === 'done' &&
      t.completedAt?.startsWith(todayISO()) &&
      KEYWORDS.test(t.title),
  );
  if (taskWorkout) return true;
  return profile.habits.some(
    (h) =>
      h.status === 'active' &&
      h.lastCompleted?.startsWith(todayISO()) &&
      KEYWORDS.test(h.title),
  );
}

// ---------------------------------------------------------------------------
// StatPill — small colourised metric badge
// ---------------------------------------------------------------------------

interface StatPillProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  accent: string;
}

function StatPill({ icon: Icon, label, value, accent }: StatPillProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 min-w-0">
      <Icon className={cn('w-3.5 h-3.5 shrink-0', accent)} aria-hidden="true" />
      <span className={cn('text-sm font-bold tabular-nums', accent)}>{value}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 truncate text-center">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoodButton
// ---------------------------------------------------------------------------

interface MoodButtonProps {
  emoji: string;
  label: string;
  mood: DayMood;
  selected: boolean;
  onSelect: (mood: DayMood) => void;
}

function MoodButton({ emoji, label, mood, selected, onSelect }: MoodButtonProps) {
  return (
    <button
      onClick={() => onSelect(mood)}
      aria-pressed={selected}
      aria-label={`Mood: ${label}`}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border px-3 py-2 flex-1',
        'text-xs font-bold transition-all focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-transparent',
        selected
          ? 'border-violet-500/60 bg-violet-500/20 text-violet-200'
          : 'border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white/70',
      )}
    >
      <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-[9px] uppercase tracking-[0.15em]">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// EveningCheckIn — Main export
// ---------------------------------------------------------------------------

const MOOD_OPTIONS: { emoji: string; label: string; mood: DayMood }[] = [
  { emoji: '😤', label: 'Tough', mood: 'tough' },
  { emoji: '😐', label: 'Okay',  mood: 'okay'  },
  { emoji: '😊', label: 'Good',  mood: 'good'  },
];

export function EveningCheckIn({ profile, userId, onDismiss }: EveningCheckInProps) {
  const [selectedMood, setSelectedMood] = useState<DayMood | null>(null);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const tasksCompleted = countTasksCompletedToday(profile);
  const habitsLogged   = countHabitsLoggedToday(profile);
  const workoutToday   = detectWorkoutToday(profile);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Persist the dismissal key so we don't show again today, then notify parent. */
  function persistAndDismiss(mood?: DayMood) {
    try {
      localStorage.setItem(eveningKey(userId), todayISO());
      if (mood) {
        // Session-only mood preference — no Firestore write needed.
        sessionStorage.setItem('atlas_evening_mood', mood);
      }
    } catch {
      // Non-fatal; dismissal still propagates.
    }
    onDismiss();
  }

  function handleMoodSelect(mood: DayMood) {
    setSelectedMood(mood);
    // Brief visual flash so the user sees the selection before the card closes.
    setTimeout(() => persistAndDismiss(mood), 280);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-violet-500/20 bg-violet-500/5 backdrop-blur-sm p-4 space-y-4"
        role="region"
        aria-label="Evening check-in"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Moon className="w-4 h-4 text-violet-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold text-white/90 tracking-wide truncate">
              Evening Review
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              {dateLabel}
            </span>
            <button
              onClick={() => persistAndDismiss()}
              aria-label="Dismiss evening check-in"
              className="rounded-lg p-1 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-3 gap-2" aria-label="Today's activity summary">
          <StatPill
            icon={CheckCircle2}
            label="Tasks done"
            value={String(tasksCompleted)}
            accent={tasksCompleted > 0 ? 'text-emerald-300' : 'text-white/40'}
          />
          <StatPill
            icon={Flame}
            label="Habits logged"
            value={String(habitsLogged)}
            accent={habitsLogged > 0 ? 'text-amber-300' : 'text-white/40'}
          />
          <StatPill
            icon={Dumbbell}
            label="Workout"
            value={workoutToday ? 'Yes' : '—'}
            accent={workoutToday ? 'text-sky-300' : 'text-white/40'}
          />
        </div>

        {/* ── Mood question ── */}
        <div className="space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
            How did the day feel?
          </p>
          <div className="flex gap-2" role="group" aria-label="Day mood selection">
            {MOOD_OPTIONS.map(({ emoji, label, mood }) => (
              <MoodButton
                key={mood}
                emoji={emoji}
                label={label}
                mood={mood}
                selected={selectedMood === mood}
                onSelect={handleMoodSelect}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
