import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, CheckCircle2, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProfile } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EveningCheckInSubmitData {
  tasksCompleted: number;
  totalTasks: number;
  /** Energy level on a 1-5 scale. */
  energyLevel: number;
  /** Optional free-text blocker description. */
  blockers: string;
  date: string; // YYYY-MM-DD
}

export interface EveningCheckInProps {
  profile: AtlasProfile | null;
  userId?: string | null;
  /** Called on dismiss or submit. Receives submission data when user submits. */
  onDismiss: (data?: EveningCheckInSubmitData) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** localStorage key matching the spec key pattern: nexus_evening_checkin_date. */
function eveningKey(userId?: string | null): string {
  return `nexus_evening_checkin_date_${userId ?? 'guest'}`;
}

/**
 * Returns true when the evening check-in should be shown.
 * Conditions: local hour >= 19 and < 22, and not dismissed today.
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
// Stat helpers
// ---------------------------------------------------------------------------

function countTasksCompletedToday(profile: AtlasProfile | null): number {
  if (!profile) return 0;
  return profile.tasks.filter(
    (t) => t.status === 'done' && t.completedAt?.startsWith(todayISO()),
  ).length;
}

function countTotalActiveTasks(profile: AtlasProfile | null): number {
  if (!profile) return 0;
  return profile.tasks.filter((t) => t.status !== 'deferred').length;
}

// ---------------------------------------------------------------------------
// EnergySelector — 1-5 pill bar
// ---------------------------------------------------------------------------

interface EnergySelectorProps {
  value: number | null;
  onChange: (v: number) => void;
}

const ENERGY_LABELS: Record<number, string> = {
  1: 'Drained',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'High',
};

function energyColor(level: number): string {
  if (level <= 2) return 'border-rose-500/60 bg-rose-500/20 text-rose-200';
  if (level === 3) return 'border-amber-500/60 bg-amber-500/20 text-amber-200';
  return 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200';
}

function EnergySelector({ value, onChange }: EnergySelectorProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
        Energy Level
      </p>
      <div className="flex gap-1.5" role="group" aria-label="Energy level 1 to 5">
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            aria-pressed={value === level}
            aria-label={`Energy ${level}: ${ENERGY_LABELS[level]}`}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-all',
              'text-xs font-bold focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2',
              'focus-visible:ring-offset-transparent',
              value === level
                ? energyColor(level)
                : 'border-white/10 bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/60',
            )}
          >
            <span className="text-base leading-none tabular-nums">{level}</span>
            <span className="text-[8px] uppercase tracking-[0.1em] truncate">
              {ENERGY_LABELS[level]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EveningCheckIn — Main export
// ---------------------------------------------------------------------------

export function EveningCheckIn({ profile, userId, onDismiss }: EveningCheckInProps) {
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [blockers, setBlockers] = useState('');

  const tasksCompleted = countTasksCompletedToday(profile);
  const totalTasks     = countTotalActiveTasks(profile);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  function persistAndDismiss(data?: EveningCheckInSubmitData) {
    try { localStorage.setItem(eveningKey(userId), todayISO()); } catch { /* non-fatal */ }
    onDismiss(data);
  }

  function handleSubmit() {
    if (!energyLevel) return;
    persistAndDismiss({
      tasksCompleted,
      totalTasks,
      energyLevel,
      blockers: blockers.trim(),
      date: todayISO(),
    });
  }

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
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Moon className="w-4 h-4 text-violet-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold text-white/90 tracking-wide truncate">
              How did today go?
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

        {/* Tasks completed stat */}
        <div
          className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
          aria-label="Tasks completed today"
        >
          <CheckCircle2
            className={cn(
              'w-4 h-4 shrink-0',
              tasksCompleted > 0 ? 'text-emerald-400' : 'text-white/30',
            )}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-white/70">Tasks completed:</span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums ml-auto',
              tasksCompleted > 0 ? 'text-emerald-300' : 'text-white/40',
            )}
          >
            {tasksCompleted}/{totalTasks}
          </span>
        </div>

        {/* Energy level selector (1-5) */}
        <EnergySelector value={energyLevel} onChange={setEnergyLevel} />

        {/* What blocked you today? */}
        <div className="space-y-1.5">
          <label
            htmlFor="evening-blockers"
            className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 block"
          >
            What blocked you today?{' '}
            <span className="text-white/20 normal-case">(optional)</span>
          </label>
          <textarea
            id="evening-blockers"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Distractions, unclear priorities, low energy..."
            rows={2}
            className={cn(
              'w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2',
              'text-xs text-white/70 placeholder:text-white/25 resize-none',
              'focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.05] transition-colors',
            )}
          />
        </div>

        {/* Submit CTA */}
        <button
          onClick={handleSubmit}
          disabled={!energyLevel}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl',
            'bg-violet-500/20 border border-violet-500/30 hover:bg-violet-500/30 text-violet-300',
            'text-xs font-bold uppercase tracking-[0.15em] py-2.5 px-4 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          aria-label="Submit evening check-in"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          Log Day
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
