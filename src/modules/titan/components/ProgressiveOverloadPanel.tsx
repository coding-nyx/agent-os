/**
 * ProgressiveOverloadPanel — visualizes the output of the Progressive Overload Engine.
 *
 * Sections:
 *  A. ACWR Banner — Acute:Chronic Workload Ratio with colour-coded status,
 *     displaying numeric ratio, acute load (7-day), and chronic load (4-wk avg).
 *  B. Volume by Muscle Group — pure SVG horizontal bar chart comparing
 *     this week's completed sets against MEV / MAV / MRV landmarks for up to
 *     6 most relevant muscle groups.
 *  C. Progression Recommendations — per-exercise cards grouped by type
 *     (🔺 Add Weight | ➕ Add Reps | ✓ Maintain | 🔽 Deload).
 *
 * Renders an EmptyState when no sessions have been logged.
 * Uses pure SVG for charts — no external charting library.
 */

import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { WorkoutSession, PersonalRecord } from '@/lib/types';
import { EmptyState } from '@/core/components/EmptyState';
import {
  computeACWR,
  computeWeeklyVolumeByMuscle,
  generateProgressionRecommendations,
  muscleGroupsForExercise,
  type ACWRResult,
  type MuscleVolumeWeek,
  type ExerciseProgressionRec,
} from '../utils/progressive-overload';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProgressiveOverloadPanelProps {
  sessions: WorkoutSession[];
  personalRecords: Record<string, PersonalRecord>;
}

// ── ACWR status display config ────────────────────────────────────────────────

interface ACWRMeta {
  bg: string;
  border: string;
  textColor: string;
  label: string;
}

const ACWR_META: Record<ACWRResult['status'], ACWRMeta> = {
  optimal:      { bg: 'rgba(34,197,94,0.07)',  border: 'rgba(34,197,94,0.28)',  textColor: '#22c55e', label: 'Optimal'      },
  undertrained: { bg: 'rgba(234,179,8,0.07)',  border: 'rgba(234,179,8,0.28)',  textColor: '#eab308', label: 'Undertrained'  },
  overreaching: { bg: 'rgba(251,146,60,0.07)', border: 'rgba(251,146,60,0.28)', textColor: '#fb923c', label: 'Overreaching'  },
  danger:       { bg: 'rgba(239,68,68,0.07)',  border: 'rgba(239,68,68,0.28)',  textColor: '#ef4444', label: 'Danger Zone'  },
};

// ── SVG bar chart constants (viewBox units = px at 1× scale) ─────────────────

const LABEL_W  = 72;                        // left label column width
const BAR_W    = 172;                       // bar track width
const COUNT_W  = 28;                        // right count column width
const CHART_W  = LABEL_W + BAR_W + COUNT_W; // total SVG width = 272
const ROW_H    = 26;                        // height per muscle-group row
const FOOTER_H = 22;                        // legend area below bars

/** Bar fill colour keyed by volume status. */
const STATUS_BAR_COLOR: Record<MuscleVolumeWeek['status'], string> = {
  below_mev: 'rgba(148,163,184,0.35)',
  in_mav:    'rgba(34,197,94,0.65)',
  above_mav: 'rgba(234,179,8,0.65)',
  above_mrv: 'rgba(239,68,68,0.65)',
};

/** Human-readable display names for muscle groups. */
const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps',
  triceps: 'Triceps', forearms: 'Forearms', core: 'Core', glutes: 'Glutes',
  quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves', traps: 'Traps',
  lats: 'Lats', full_body: 'Full Body',
};

// ── Recommendation display config ─────────────────────────────────────────────

type RecType = ExerciseProgressionRec['recommendation'];

interface RecGroupMeta {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const REC_META: Record<RecType, RecGroupMeta> = {
  add_weight: {
    label: '🔺 Add Weight',
    color: '#4ade80',
    bgColor: 'rgba(74,222,128,0.05)',
    borderColor: 'rgba(74,222,128,0.18)',
  },
  add_reps: {
    label: '➕ Add Reps',
    color: '#60a5fa',
    bgColor: 'rgba(96,165,250,0.05)',
    borderColor: 'rgba(96,165,250,0.18)',
  },
  maintain: {
    label: '✓ Maintain',
    color: '#fbbf24',
    bgColor: 'rgba(251,191,36,0.05)',
    borderColor: 'rgba(251,191,36,0.18)',
  },
  deload: {
    label: '🔽 Deload',
    color: '#f87171',
    bgColor: 'rgba(248,113,113,0.05)',
    borderColor: 'rgba(248,113,113,0.18)',
  },
};

/** Display in a logical priority order — most immediately actionable first. */
const REC_ORDER: RecType[] = ['add_weight', 'add_reps', 'maintain', 'deload'];

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A. Colour-coded banner showing ACWR value, 7-day acute load,
 *    4-week chronic load, and a natural-language recommendation.
 */
function ACWRBanner({ result }: { result: ACWRResult }) {
  const meta = ACWR_META[result.status];
  const hasHistory = result.chronicLoad > 0;

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ backgroundColor: meta.bg, borderColor: meta.border }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: numeric ACWR + status label */}
        <div className="flex items-center gap-3">
          <span
            className="text-3xl font-black tabular-nums leading-none"
            style={{ color: meta.textColor }}
          >
            {hasHistory ? result.acwr.toFixed(2) : '–'}
          </span>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-0.5">
              ACWR
            </div>
            <div className="text-[11px] font-bold" style={{ color: meta.textColor }}>
              {meta.label}
            </div>
          </div>
        </div>

        {/* Right: load stats */}
        <div className="flex gap-5 text-right">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-white/30 font-semibold mb-0.5">
              Acute (7 d)
            </div>
            <div className="text-[12px] text-white/70 font-bold tabular-nums">
              {Math.round(result.acuteLoad).toLocaleString()} kg
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-white/30 font-semibold mb-0.5">
              Chronic (4 wk avg)
            </div>
            <div className="text-[12px] text-white/70 font-bold tabular-nums">
              {hasHistory ? `${Math.round(result.chronicLoad).toLocaleString()} kg/wk` : '–'}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation text */}
      <p className="text-[11px] text-white/42 mt-2.5 leading-relaxed">
        {result.recommendation}
      </p>
    </div>
  );
}

/**
 * B. Pure SVG horizontal bar chart showing weekly sets per muscle group
 *    against MEV / MAV / MRV threshold markers.
 */
function VolumeBarsChart({ muscles }: { muscles: MuscleVolumeWeek[] }) {
  if (muscles.length === 0) {
    return (
      <p className="text-[11px] text-white/30 text-center py-3">
        No training volume this week. Log a session to see your muscle coverage.
      </p>
    );
  }

  const svgH = muscles.length * ROW_H + FOOTER_H;

  // Scale so that the highest MRV (or actual sets if exceeded) fills the bar width.
  const maxScale = Math.max(
    ...muscles.map(m => Math.max(m.landmarks.mrv, m.sets)),
    1,
  );
  const toX = (value: number): number => (value / maxScale) * BAR_W;

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_W} ${svgH}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ width: '100%', height: 'auto' }}
        aria-label="Weekly volume by muscle group vs MEV / MAV / MRV landmarks"
        role="img"
      >
        {muscles.map((m, i) => {
          const rowY    = i * ROW_H;
          const barTop  = rowY + ROW_H / 2 - 5;
          const barH    = 10;
          const fillW   = Math.min(toX(m.sets), BAR_W);
          const mevX    = toX(m.landmarks.mev);
          const mavX    = toX(m.landmarks.mav);
          const mrvX    = toX(m.landmarks.mrv);
          const barFill = STATUS_BAR_COLOR[m.status];
          const textY   = rowY + ROW_H / 2 + 4;

          return (
            <g key={m.muscleGroup}>
              {/* Muscle group label */}
              <text
                x={LABEL_W - 6}
                y={textY}
                textAnchor="end"
                fill="rgba(255,255,255,0.44)"
                fontSize={9.5}
                fontFamily="system-ui,-apple-system,sans-serif"
              >
                {MUSCLE_LABEL[m.muscleGroup] ?? m.muscleGroup}
              </text>

              {/* Background track */}
              <rect
                x={LABEL_W}
                y={barTop}
                width={BAR_W}
                height={barH}
                rx={3}
                fill="rgba(255,255,255,0.05)"
              />

              {/* Filled portion (capped at track width) */}
              {fillW > 0 && (
                <rect
                  x={LABEL_W}
                  y={barTop}
                  width={fillW}
                  height={barH}
                  rx={3}
                  fill={barFill}
                />
              )}

              {/* MEV marker — dashed white */}
              <line
                x1={LABEL_W + mevX} y1={barTop - 3}
                x2={LABEL_W + mevX} y2={barTop + barH + 3}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />

              {/* MAV marker — solid white */}
              <line
                x1={LABEL_W + mavX} y1={barTop - 3}
                x2={LABEL_W + mavX} y2={barTop + barH + 3}
                stroke="rgba(255,255,255,0.44)"
                strokeWidth={1}
              />

              {/* MRV marker — red */}
              <line
                x1={LABEL_W + mrvX} y1={barTop - 4}
                x2={LABEL_W + mrvX} y2={barTop + barH + 4}
                stroke="rgba(239,68,68,0.55)"
                strokeWidth={1.2}
              />

              {/* Set count */}
              <text
                x={LABEL_W + BAR_W + 5}
                y={textY}
                fill="rgba(255,255,255,0.36)"
                fontSize={9}
                fontFamily="system-ui,-apple-system,sans-serif"
              >
                {Math.round(m.sets)}
              </text>
            </g>
          );
        })}

        {/* Threshold legend */}
        <g transform={`translate(${LABEL_W}, ${muscles.length * ROW_H + 6})`}>
          <line x1={0} y1={6} x2={10} y2={6} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="2 2" />
          <text x={13} y={10} fill="rgba(255,255,255,0.28)" fontSize={8} fontFamily="system-ui,sans-serif">MEV</text>

          <line x1={40} y1={6} x2={50} y2={6} stroke="rgba(255,255,255,0.44)" strokeWidth={1} />
          <text x={53} y={10} fill="rgba(255,255,255,0.28)" fontSize={8} fontFamily="system-ui,sans-serif">MAV</text>

          <line x1={80} y1={6} x2={90} y2={6} stroke="rgba(239,68,68,0.55)" strokeWidth={1.2} />
          <text x={93} y={10} fill="rgba(255,255,255,0.28)" fontSize={8} fontFamily="system-ui,sans-serif">MRV</text>
        </g>
      </svg>

      {/* Bar fill colour legend */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {(
          [
            { status: 'below_mev' as const, label: 'Below MEV' },
            { status: 'in_mav'    as const, label: 'In MAV ✓' },
            { status: 'above_mav' as const, label: 'Above MAV' },
            { status: 'above_mrv' as const, label: 'Above MRV' },
          ]
        ).map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1">
            <div
              className="w-3 h-2 rounded-sm"
              style={{ backgroundColor: STATUS_BAR_COLOR[status] }}
            />
            <span className="text-[9px] text-white/28">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * C. Per-exercise recommendation cards grouped by type in priority order:
 *    🔺 Add Weight → ➕ Add Reps → ✓ Maintain → 🔽 Deload
 */
function RecommendationsList({ recs }: { recs: ExerciseProgressionRec[] }) {
  if (recs.length === 0) {
    return (
      <p className="text-[11px] text-white/30 text-center py-3">
        Log 3+ sessions per exercise to unlock personalized recommendations.
      </p>
    );
  }

  const byType = new Map<RecType, ExerciseProgressionRec[]>(
    REC_ORDER.map(type => [type, recs.filter(r => r.recommendation === type)]),
  );

  return (
    <div className="space-y-4">
      {REC_ORDER.map(type => {
        const group = byType.get(type) ?? [];
        if (group.length === 0) return null;
        const meta = REC_META[type];

        return (
          <div key={type}>
            {/* Group header */}
            <div
              className="text-[10px] font-black uppercase tracking-widest mb-2"
              style={{ color: meta.color }}
            >
              {meta.label}
            </div>

            {/* Exercise cards */}
            <div className="space-y-2">
              {group.map(rec => (
                <div
                  key={rec.exerciseName}
                  className="rounded-lg px-3 py-2.5 border"
                  style={{ backgroundColor: meta.bgColor, borderColor: meta.borderColor }}
                >
                  {/* Name + metric badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-white/82">
                      {rec.exerciseName
                        .split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </span>

                    <div className="flex items-center gap-2 text-[10px] shrink-0">
                      <span className="text-white/32">
                        e1RM{' '}
                        <span className="text-white/60 font-semibold tabular-nums">
                          {rec.currentE1RM} kg
                        </span>
                      </span>

                      {rec.suggestedWeightKg != null && (
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: meta.color }}
                        >
                          → {rec.suggestedWeightKg} kg
                        </span>
                      )}

                      {rec.suggestedReps != null && (
                        <span className="font-bold" style={{ color: meta.color }}>
                          → {rec.suggestedReps} reps
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reasoning */}
                  <p className="text-[10px] text-white/35 mt-1 leading-relaxed">
                    {rec.reasoning}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * ProgressiveOverloadPanel — self-contained, memoized visualization of the
 * overload engine. All hooks are called unconditionally (Rules of Hooks).
 *
 * @param sessions        Full chronological workout session history.
 * @param personalRecords Personal record map keyed by lowercase exercise name.
 */
export function ProgressiveOverloadPanel({
  sessions,
  personalRecords,
}: ProgressiveOverloadPanelProps) {
  // ── All hooks called unconditionally before any early return ────────────────

  const acwrResult = useMemo(() => computeACWR(sessions), [sessions]);

  const weeklyVolume = useMemo(
    () => computeWeeklyVolumeByMuscle(sessions),
    [sessions],
  );

  /**
   * Select up to 6 most relevant muscle groups:
   *   • those with any volume this week (sets > 0), OR
   *   • those targeted by exercises in the user's PR collection
   * Sorted by weekly sets descending; tie-broken by PR relevance.
   */
  const relevantMuscles = useMemo<MuscleVolumeWeek[]>(() => {
    const prMuscleGroups = new Set<string>();
    for (const exerciseName of Object.keys(personalRecords)) {
      for (const g of muscleGroupsForExercise(exerciseName)) {
        prMuscleGroups.add(g);
      }
    }

    return weeklyVolume
      .filter(m => m.sets > 0 || prMuscleGroups.has(m.muscleGroup))
      .sort((a, b) => {
        if (b.sets !== a.sets) return b.sets - a.sets;
        // Tie-break: prefer muscles that have PR history
        return (
          (prMuscleGroups.has(b.muscleGroup) ? 1 : 0) -
          (prMuscleGroups.has(a.muscleGroup) ? 1 : 0)
        );
      })
      .slice(0, 6);
  }, [weeklyVolume, personalRecords]);

  const recommendations = useMemo(
    () => generateProgressionRecommendations(sessions, personalRecords),
    [sessions, personalRecords],
  );

  // ── Empty state (after hooks) ────────────────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No workout data yet"
        description="Log your first session to activate the Progressive Overload Engine."
      />
    );
  }

  // ── Populated view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* A. ACWR Banner */}
      <ACWRBanner result={acwrResult} />

      {/* B. Volume by Muscle Group */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/38">
            Weekly Volume — Sets vs Landmarks
          </p>
          <p className="text-[9px] text-white/20">Mon – today</p>
        </div>
        <VolumeBarsChart muscles={relevantMuscles} />
      </div>

      {/* C. Progression Recommendations */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/38 mb-2.5">
          Progression Recommendations
        </p>
        <RecommendationsList recs={recommendations} />
      </div>
    </div>
  );
}
