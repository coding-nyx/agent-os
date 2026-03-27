/**
 * PRBoard — Top-6 Personal Records displayed as visual cards with mini sparklines.
 *
 * Data flow:
 *   - `personalRecords` comes from `TitanProfile.personalRecords` (Record<string, PersonalRecord>),
 *     converted to an array by the caller via `Object.values(...)`.
 *   - `workoutLogs` comes from `TitanProfile.workoutLogs` (TitanWorkoutLog[]) and is used
 *     to derive per-session e1RM history for the sparkline trend lines.
 *
 * Architecture:
 *   - PRBoard      → layout, empty-state, top-6 selection          O(n log n)
 *   - PRCard       → single card display, exercise library lookup   O(L)  L = library size ≈ 30
 *   - Sparkline    → pure SVG trend line, no charting library       O(W × S)  W = logs, S = sets/log
 *   - PlaceholderCard → fills remaining slots when fewer than 6 PRs exist
 *
 * Complexity:
 *   - Sorting personalRecords: O(n log n), n ≤ total exercises (≈ 30)
 *   - Sparkline derivation: O(W × S) per card, W = workout logs, S = avg sets per log
 *   - Total: effectively O(W × S × 6) ≈ O(W) for typical usage
 */

import React, { useMemo, useState } from 'react';
import { Trophy, Share2 } from 'lucide-react';
import type { PersonalRecord, TitanWorkoutLog } from '@/lib/types';
import type { ExerciseCategory } from '../types';
import { EXERCISE_LIBRARY } from '../data/exercise-library';
import { calculateE1RM } from '../utils/e1rm';
import { cn } from '@/lib/utils';
import { ShareCard } from './ShareCard';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PRBoardProps {
  /** Array of personal records — pass `Object.values(profile.personalRecords ?? {})` */
  personalRecords: PersonalRecord[];
  /** Structured workout logs for sparkline history derivation */
  workoutLogs?: TitanWorkoutLog[];
}

// ---------------------------------------------------------------------------
// Styling constants
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<ExerciseCategory, string> = {
  compound:  'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
  isolation: 'bg-blue-500/20  text-blue-300',
  cardio:    'bg-green-500/20  text-green-300',
  mobility:  'bg-purple-500/20 text-purple-300',
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string to short display form, e.g. "Mar 10". */
function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  // Guard against invalid dates coming from legacy data
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Look up an exercise from EXERCISE_LIBRARY by the legacy `exerciseName` string.
 * Tries exact match first, then partial contains match, to survive name drift.
 * Returns `undefined` when no match is found.
 * Time: O(L × A) where L = library size (30) and A = avg alias count.
 */
function lookupExerciseByName(exerciseName: string) {
  const query = exerciseName.toLowerCase().trim();
  // 1. Exact name match
  const exact = EXERCISE_LIBRARY.find(e => e.name.toLowerCase() === query);
  if (exact) return exact;
  // 2. Alias exact match
  const byAlias = EXERCISE_LIBRARY.find(
    e => (e.aliases ?? []).some(a => a.toLowerCase() === query),
  );
  if (byAlias) return byAlias;
  // 3. Partial name match (library name contains query)
  const partial = EXERCISE_LIBRARY.find(e => e.name.toLowerCase().includes(query));
  if (partial) return partial;
  // 4. Reverse partial (query contains library name)
  return EXERCISE_LIBRARY.find(e => query.includes(e.name.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Sparkline (pure SVG — no charting library)
// ---------------------------------------------------------------------------

interface SparklineProps {
  /** Canonical exercise library ID used to filter workout log sets */
  exerciseId: string;
  /** Current e1RM value used as the flat-line fallback */
  currentE1RM: number;
  /** Full workout log history */
  workoutLogs: TitanWorkoutLog[];
}

/**
 * Renders a mini sparkline showing the last 5 e1RM data points for an exercise.
 *
 * Algorithm:
 *   1. Scan all logs; for each set matching exerciseId, compute e1RM and keep the
 *      session maximum (one point per session).
 *   2. Sort sessions chronologically and take the last 5.
 *   3. Normalise values to SVG coordinates within viewBox "0 0 100 40".
 *   4. Render a polyline (line) and filled polygon (area) with a gradient.
 *
 * Edge case: fewer than 2 data points → render a flat line at currentE1RM.
 */
function Sparkline({ exerciseId, currentE1RM, workoutLogs }: SparklineProps) {
  const dataPoints = useMemo<number[]>(() => {
    // Map from log date → max e1RM for this exercise in that session
    const sessionBest = new Map<string, number>();

    for (const log of workoutLogs) {
      for (const set of log.sets) {
        if (set.exerciseId !== exerciseId) continue;
        const e1rm = calculateE1RM(set.weight, set.reps);
        const current = sessionBest.get(log.date) ?? 0;
        if (e1rm > current) sessionBest.set(log.date, e1rm);
      }
    }

    const sorted = [...sessionBest.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-5)
      .map(([, v]) => v);

    return sorted;
  }, [exerciseId, workoutLogs]);

  // Fewer than 2 data points → flat line at current e1RM
  const series: number[] = dataPoints.length >= 2 ? dataPoints : [currentE1RM, currentE1RM];

  const n = series.length;
  const minVal = Math.min(...series);
  const maxVal = Math.max(...series);
  const valueRange = maxVal - minVal || 1; // guard divide-by-zero on flat series

  // Map to SVG coords:  x: 2..98,  y: 4..36  (36 = bottom, 4 = top — inverted y-axis)
  const svgPts = series.map((v, i): [number, number] => {
    const x = (i / (n - 1)) * 96 + 2;
    const y = 36 - ((v - minVal) / valueRange) * 32;
    return [x, y];
  });

  const polylinePoints = svgPts.map(([x, y]) => `${x},${y}`).join(' ');

  // Closed polygon for gradient fill: trace the line, then close along the bottom
  const areaPoints = [
    ...svgPts,
    [svgPts[svgPts.length - 1][0], 40] as [number, number],
    [svgPts[0][0], 40] as [number, number],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  // Each gradient id must be unique per card to avoid cross-card bleed
  const gradientId = `sparkGradient-${exerciseId}`;

  return (
    <svg
      width="100%"
      height="40"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(52,211,153,0.3)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)"   />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      {/* Trend line */}
      <polyline
        points={polylinePoints}
        stroke="#34d399"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PRCard
// ---------------------------------------------------------------------------

interface PRCardProps {
  pr: PersonalRecord;
  workoutLogs: TitanWorkoutLog[];
}

function PRCard({ pr, workoutLogs }: PRCardProps) {
  const exercise = useMemo(() => lookupExerciseByName(pr.exerciseName), [pr.exerciseName]);
  const [showShare, setShowShare] = useState(false);

  const displayName  = exercise?.name ?? pr.exerciseName;
  // Sanitise exerciseId so it's always a valid DOM id fragment
  const exerciseId   = exercise?.id ?? pr.exerciseName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const category: ExerciseCategory = exercise?.category ?? 'compound';

  return (
    <>
    <div
      className={cn(
        'bg-white/[0.045] border border-white/[0.12] rounded-2xl p-4',
        'hover:bg-white/[0.08] transition-colors flex flex-col gap-1',
      )}
    >
      {/* ── Header: exercise name + category badge ── */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-white/90 leading-tight line-clamp-2">
          {displayName}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize',
              CATEGORY_STYLES[category],
            )}
          >
            {category}
          </span>
          <button
            type="button"
            onClick={() => setShowShare(true)}
            aria-label={`Share ${displayName} PR`}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── e1RM: large value ── */}
      <p className="text-2xl font-black text-white mt-1">
        {pr.e1RM}
        <span className="text-sm font-semibold text-white/40 ml-1">kg</span>
      </p>

      {/* ── Weight × reps + PR date ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">
          {pr.maxWeight}&thinsp;kg&thinsp;×&thinsp;{pr.repsAtMax}
        </p>
        <p className="text-[11px] text-white/40">{formatShortDate(pr.achievedDate)}</p>
      </div>

      {/* ── Sparkline ── */}
      <div className="mt-2">
        <Sparkline
          exerciseId={exerciseId}
          currentE1RM={pr.e1RM}
          workoutLogs={workoutLogs}
        />
      </div>
    </div>

    {/* Share Card */}
    <ShareCard
      type="pr"
      prExercise={displayName}
      prWeight={pr.maxWeight}
      prReps={pr.repsAtMax}
      prDate={pr.achievedDate}
      isOpen={showShare}
      onClose={() => setShowShare(false)}
    />
    </>
  );
}

// ---------------------------------------------------------------------------
// PlaceholderCard — fills remaining grid slots
// ---------------------------------------------------------------------------

function PlaceholderCard() {
  return (
    <div
      className={cn(
        'bg-white/[0.045] border border-dashed border-white/[0.09] rounded-2xl p-4',
        'flex items-center justify-center min-h-[160px]',
      )}
      aria-hidden="true"
    >
      <p className="text-[11px] text-white/20 text-center leading-relaxed">
        Log more exercises<br />to track PRs
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRBoard — public export
// ---------------------------------------------------------------------------

/**
 * Renders up to 6 personal-record cards sorted by e1RM descending,
 * with sparkline history and placeholder cards to fill a 2×3 grid.
 */
export function PRBoard({ personalRecords, workoutLogs = [] }: PRBoardProps) {
  /** Sort all PRs by e1RM descending and keep the top 6. O(n log n). */
  const topSix = useMemo(
    () => [...personalRecords].sort((a, b) => b.e1RM - a.e1RM).slice(0, 6),
    [personalRecords],
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (personalRecords.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Log your first workout to start tracking PRs</p>
      </div>
    );
  }

  const placeholderCount = Math.max(0, 6 - topSix.length);

  return (
    <section aria-label="Personal Record Board" className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-emerald-400" />
        <h2 className="text-sm font-black text-white/80 uppercase tracking-wider">
          PR Board
        </h2>
      </div>

      {/* 2×3 grid (3 columns × 2 rows) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {topSix.map(pr => (
          <PRCard
            key={pr.exerciseName}
            pr={pr}
            workoutLogs={workoutLogs}
          />
        ))}
        {Array.from({ length: placeholderCount }, (_, i) => (
          <PlaceholderCard key={`pr-placeholder-${i}`} />
        ))}
      </div>
    </section>
  );
}
