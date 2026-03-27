/**
 * GoalVelocityChart — Sprint B
 *
 * SVG area chart showing tasks-completed-per-day over the last 30 days.
 * Zero external chart libraries — pure SVG + Tailwind.
 *
 * Color semantics (7-day rolling average):
 *   ≥ 3 tasks/day → emerald  (#34d399)
 *   1–2 tasks/day → amber    (#fbbf24)
 *   < 1 task/day  → red      (#f87171)
 */

import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { AtlasTask, AtlasGoal } from '../services/atlas-profile-service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoalVelocityChartProps {
  tasks: AtlasTask[];
  goals?: AtlasGoal[];
}

interface ChartData {
  isEmpty: boolean;
  pathD: string;
  fillD: string;
  color: string;
  xLabels: ReadonlyArray<{ x: number; label: string; anchor: 'start' | 'end' }>;
  /** Y-axis label: max tasks in a single day over the window */
  maxCount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEWBOX_W = 300;
const VIEWBOX_H = 100;
/** Vertical space reserved for X-axis labels (px, within viewBox units) */
const X_LABEL_H = 14;
/** Usable chart height */
const CHART_H = VIEWBOX_H - X_LABEL_H;
/** Top padding so the peak point isn't clipped */
const TOP_PAD = 6;

const COLOR_HIGH = '#34d399';   // emerald — ≥ 3/day
const COLOR_MID  = '#fbbf24';   // amber   — 1–2/day
const COLOR_LOW  = '#f87171';   // red     — < 1/day

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Return YYYY-MM-DD for a Date (local timezone). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a YYYY-MM-DD date string as "Mon D" (e.g. "Mar 1"). */
function fmtShortDate(dateStr: string): string {
  // Parse as local noon to avoid timezone edge-cases
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d, 12);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Build 30-element array: one entry per day (oldest → newest).
 * Time complexity: O(tasks) for map building, O(30) for array fill → O(n + 30).
 */
function buildDailyCounts(tasks: AtlasTask[]): { days: string[]; counts: number[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build date→count lookup in O(tasks)
  const countMap = new Map<string, number>();
  for (const task of tasks) {
    if (task.completedAt) {
      const key = task.completedAt.slice(0, 10);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
  }

  const days: string[] = [];
  const counts: number[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toDateStr(d);
    days.push(key);
    counts.push(countMap.get(key) ?? 0);
  }

  return { days, counts };
}

/**
 * Pick chart accent colour from the 7-day rolling average.
 * Uses last 7 days of the counts array (O(7) = O(1)).
 */
function pickColor(counts: number[]): string {
  const last7 = counts.slice(-7);
  const avg = last7.reduce((a, b) => a + b, 0) / last7.length;

  if (avg >= 3) return COLOR_HIGH;
  if (avg >= 1) return COLOR_MID;
  return COLOR_LOW;
}

/**
 * Convert daily counts to an SVG polyline path string.
 * Maps count values linearly into [TOP_PAD … CHART_H].
 * Complexity: O(n).
 */
function buildPaths(
  counts: number[],
  maxCount: number,
): { pathD: string; fillD: string } {
  const n = counts.length;
  const xStep = VIEWBOX_W / Math.max(n - 1, 1);
  const yRange = CHART_H - TOP_PAD;

  const pts = counts.map((c, i) => ({
    x: parseFloat((i * xStep).toFixed(2)),
    y: parseFloat((CHART_H - (c / maxCount) * yRange).toFixed(2)),
  }));

  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const lastX = pts[n - 1].x;
  const fillD = `${pathD} L ${lastX} ${CHART_H} L 0 ${CHART_H} Z`;

  return { pathD, fillD };
}

// ─── Projection ──────────────────────────────────────────────────────────────

interface ProjectionResult {
  daysToCompletion: number | null;
  nearestDeadline: string | null;
  onTrack: boolean;
  projectedDate: string | null;
  velocity: number;
}

function computeProjection(tasks: AtlasTask[], goals: AtlasGoal[]): ProjectionResult {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCompletions = tasks.filter(t =>
    t.completedAt && new Date(t.completedAt).getTime() > sevenDaysAgo
  ).length;
  const velocity = recentCompletions / 7;

  const activeGoalsWithDeadlines = goals
    .filter(g => g.status === 'active' && g.deadline)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));

  if (activeGoalsWithDeadlines.length === 0 || velocity === 0) {
    return { daysToCompletion: null, nearestDeadline: null, onTrack: false, projectedDate: null, velocity };
  }

  const nearestGoal = activeGoalsWithDeadlines[0];
  const nearestDeadline = nearestGoal.deadline!;
  const remaining = 100 - nearestGoal.progressPercent;
  const tasksRemaining = Math.ceil((remaining / 100) * Math.max(1, tasks.filter(t => t.goalId === nearestGoal.id && t.status !== 'done').length));
  const daysToCompletion = velocity > 0 ? Math.ceil(tasksRemaining / velocity) : null;

  const deadlineDays = (new Date(nearestDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const onTrack = daysToCompletion !== null && daysToCompletion <= deadlineDays;

  const projectedDate = daysToCompletion !== null
    ? new Date(Date.now() + daysToCompletion * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return { daysToCompletion, nearestDeadline, onTrack, projectedDate, velocity };
}

// ─── Derived chart data ───────────────────────────────────────────────────────

function deriveChartData(tasks: AtlasTask[]): ChartData {
  const { days, counts } = buildDailyCounts(tasks);
  const isEmpty = counts.every((c) => c === 0);

  if (isEmpty) {
    return {
      isEmpty: true,
      pathD: '',
      fillD: '',
      color: COLOR_LOW,
      xLabels: [],
      maxCount: 0,
    };
  }

  const maxCount = Math.max(...counts, 1);
  const color = pickColor(counts);
  const { pathD, fillD } = buildPaths(counts, maxCount);

  const xLabels = [
    { x: 0,          label: fmtShortDate(days[0]),              anchor: 'start' as const },
    { x: VIEWBOX_W,  label: fmtShortDate(days[days.length - 1]), anchor: 'end'   as const },
  ] as const;

  return { isEmpty, pathD, fillD, color, xLabels, maxCount };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GoalVelocityChart({ tasks, goals = [] }: GoalVelocityChartProps) {
  const chart = useMemo(() => deriveChartData(tasks), [tasks]);
  const projection = useMemo(() => computeProjection(tasks, goals), [tasks, goals]);

  return (
    <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-white/[0.045] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-[var(--module-color-400)]" aria-hidden="true" />
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em]">
          Goal Velocity
        </h4>
        <span className="ml-auto text-[11px] text-white/40 tabular-nums">
          Last 30 days
        </span>
      </div>

      {chart.isEmpty ? (
        <div
          className="flex items-center justify-center h-24 text-xs text-white/30 italic"
          role="status"
        >
          Complete tasks to see your velocity
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <svg
            className="block h-auto w-full"
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            role="img"
            aria-label="Task completion velocity over the last 30 days"
          >
            <defs>
              <linearGradient
                id="velocityFill"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={chart.color}
                  stopOpacity="0.35"
                />
                <stop
                  offset="100%"
                  stopColor={chart.color}
                  stopOpacity="0.0"
                />
              </linearGradient>
            </defs>

            {/* Gradient area fill */}
            <path d={chart.fillD} fill="url(#velocityFill)" />

            {/* Line */}
            <path
              d={chart.pathD}
              fill="none"
              stroke={chart.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* X-axis date labels */}
            {chart.xLabels.map(({ x, label, anchor }) => (
              <text
                key={label}
                x={x}
                y={VIEWBOX_H - 1}
                textAnchor={anchor}
                fontSize="7"
                fill="rgba(255,255,255,0.35)"
                fontFamily="system-ui, sans-serif"
              >
                {label}
              </text>
            ))}
          </svg>
        </div>
      )}

      {!chart.isEmpty && projection.velocity > 0 && (
        <div className="flex items-center justify-between mt-2 text-[11px] text-white/50">
          <span>
            Velocity: <span className="text-white/70 font-semibold">{projection.velocity.toFixed(1)} tasks/day</span>
          </span>
          {projection.projectedDate && (
            <span className={projection.onTrack ? 'text-emerald-400' : 'text-amber-400'}>
              {projection.onTrack ? '✓ On track' : '⚠ At risk'} — projected {fmtShortDate(projection.projectedDate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
