/**
 * AnalyticsTab — Four analytics panels for the Titan module.
 *
 * Panels (all pure SVG/CSS — no external chart library):
 *  1. StrengthProgressionChart — exercise selector → e1RM trend over last 12 sessions
 *  2. MuscleVolumeBreakdown — sets per muscle group over last 4 weeks
 *  3. TrainingHeatmap — GitHub-style grid showing workout days / volume (last 16 weeks)
 *  4. RecoveryTrendPanel — sleep quality + sleep duration over last 30 days
 */

import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, Layers, Grid, Moon, ChevronDown } from 'lucide-react';
import type { TitanProfile, WorkoutSession, SleepEntry } from '@/lib/types';
import { EXERCISE_LIBRARY } from '../data/exercise-library';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AnalyticsTabProps {
  profile: TitanProfile | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function calcE1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Return the ISO date of the Monday that begins the week containing `date`. */
function mondayOf(isoDate: string): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** n days ago as ISO date string. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Look up muscle groups for an exercise name from the canonical library. */
function muscleGroupsForExercise(exerciseName: string): string[] {
  const q = exerciseName.toLowerCase().trim();
  const found =
    EXERCISE_LIBRARY.find(e => e.name.toLowerCase() === q) ??
    EXERCISE_LIBRARY.find(e => (e.aliases ?? []).some(a => a.toLowerCase() === q)) ??
    EXERCISE_LIBRARY.find(e => e.name.toLowerCase().includes(q)) ??
    EXERCISE_LIBRARY.find(e => q.includes(e.name.toLowerCase()));
  return found?.muscleGroups ?? [];
}

// ---------------------------------------------------------------------------
// 1. StrengthProgressionChart
// ---------------------------------------------------------------------------

interface DataPoint { date: string; e1RM: number; weight: number; reps: number }

function StrengthProgressionChart({ sessions, personalRecords }: {
  sessions: WorkoutSession[];
  personalRecords: Record<string, { exerciseName: string; e1RM: number }>;
}) {
  const exerciseNames = Object.keys(personalRecords).sort();
  const [selected, setSelected] = useState<string>(exerciseNames[0] ?? '');

  const dataPoints = useMemo<DataPoint[]>(() => {
    if (!selected) return [];
    const points: DataPoint[] = [];
    for (const session of sessions) {
      for (const log of session.exercises) {
        if (log.exerciseName.toLowerCase().trim() !== selected) continue;
        let best: DataPoint | null = null;
        for (const s of log.sets) {
          if (!s.completed || !s.weight || !s.repsCompleted) continue;
          const e1RM = calcE1RM(s.weight, s.repsCompleted);
          if (!best || e1RM > best.e1RM) {
            best = { date: session.date, e1RM, weight: s.weight, reps: s.repsCompleted };
          }
        }
        if (best) points.push(best);
      }
    }
    return points
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);
  }, [selected, sessions]);

  if (exerciseNames.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No PRs tracked yet"
        description="Log workouts to see your strength progression over time."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Exercise selector */}
      <div className="relative inline-block">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500/50 transition-all cursor-pointer"
        >
          {exerciseNames.map(n => (
            <option key={n} value={n} className="bg-[#0a0a14]">
              {n.replace(/\b\w/g, c => c.toUpperCase())}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40 pointer-events-none" />
      </div>

      {dataPoints.length < 2 ? (
        <p className="text-xs text-white/30 py-4 text-center">
          Need at least 2 logged sessions for this exercise to draw a trend.
        </p>
      ) : (
        <StrengthLineSVG points={dataPoints} />
      )}
    </div>
  );
}

function StrengthLineSVG({ points }: { points: DataPoint[] }) {
  const n = points.length;
  const values = points.map(p => p.e1RM);
  const minV = Math.min(...values) - 2;
  const maxV = Math.max(...values) + 2;
  const range = maxV - minV || 1;

  const W = 500; const H = 120;
  const PAD_X = 8; const PAD_Y = 8;

  const svgPts = points.map((p, i): [number, number] => [
    PAD_X + (i / (n - 1)) * (W - PAD_X * 2),
    H - PAD_Y - ((p.e1RM - minV) / range) * (H - PAD_Y * 2),
  ]);

  const polyline = svgPts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = [
    ...svgPts,
    [svgPts[n - 1][0], H] as [number, number],
    [svgPts[0][0], H] as [number, number],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  const improving = values[n - 1] >= values[0];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28" aria-label="Strength trend">
        <defs>
          <linearGradient id="strGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={improving ? 'rgba(249,115,22,0.3)' : 'rgba(148,163,184,0.2)'} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#strGrad)" />
        <polyline points={polyline} stroke={improving ? '#f97316' : '#94a3b8'} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {svgPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill={improving ? '#f97316' : '#94a3b8'} />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-white/30 px-1 mt-0.5">
        {points.map((p, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="font-bold text-white/60">{p.e1RM}</span>
            <span>{p.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. MuscleVolumeBreakdown
// ---------------------------------------------------------------------------

const MUSCLE_DISPLAY: Record<string, string> = {
  chest: 'Chest', back: 'Back', lats: 'Lats', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', core: 'Core', traps: 'Traps', full_body: 'Full Body',
};

const MUSCLE_COLOR: Record<string, string> = {
  chest: '#f97316', back: '#3b82f6', lats: '#6366f1', shoulders: '#a855f7',
  biceps: '#ec4899', triceps: '#14b8a6', forearms: '#f59e0b',
  quads: '#22c55e', hamstrings: '#84cc16', glutes: '#f43f5e',
  calves: '#06b6d4', core: '#eab308', traps: '#8b5cf6', full_body: '#94a3b8',
};

function MuscleVolumeBreakdown({ sessions }: { sessions: WorkoutSession[] }) {
  const cutoff = daysAgo(28);
  const recentSessions = sessions.filter(s => s.date >= cutoff);

  const volumeMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const session of recentSessions) {
      for (const log of session.exercises) {
        const groups = muscleGroupsForExercise(log.exerciseName);
        const completedSets = log.sets.filter(s => s.completed).length;
        if (completedSets === 0) continue;
        const setsPerGroup = completedSets / (groups.length || 1);
        for (const g of groups) {
          map[g] = (map[g] ?? 0) + setsPerGroup;
        }
      }
    }
    return map;
  }, [recentSessions]);

  const entries = Object.entries(volumeMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No training data"
        description="Log workouts to see your muscle volume distribution."
      />
    );
  }

  const maxSets = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="space-y-2">
      {entries.map(([muscle, sets]) => {
        const pct = (sets / maxSets) * 100;
        const color = MUSCLE_COLOR[muscle] ?? '#94a3b8';
        return (
          <div key={muscle} className="flex items-center gap-3">
            <span className="text-[10px] text-white/50 w-20 shrink-0 text-right">
              {MUSCLE_DISPLAY[muscle] ?? muscle}
            </span>
            <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
              />
            </div>
            <span className="text-[10px] text-white/40 w-8 tabular-nums text-right">
              {Math.round(sets)}
            </span>
          </div>
        );
      })}
      <p className="text-[9px] text-white/30 mt-1">Sets per muscle group — last 28 days</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. TrainingHeatmap
// ---------------------------------------------------------------------------

function TrainingHeatmap({ sessions }: { sessions: WorkoutSession[] }) {
  const WEEKS = 16;
  const today = new Date();

  // Build day → volume map
  const dayVolume = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      const vol = s.totalVolume ?? 1;
      map[s.date] = (map[s.date] ?? 0) + vol;
    }
    return map;
  }, [sessions]);

  // Build grid: WEEKS columns, 7 rows (Mon–Sun), newest week last
  const grid = useMemo<Array<Array<{ date: string; vol: number }>>>(() => {
    const cols: Array<Array<{ date: string; vol: number }>> = [];
    // Start from WEEKS Mondays ago
    const startMonday = new Date(today);
    startMonday.setDate(startMonday.getDate() - ((startMonday.getDay() + 6) % 7) - (WEEKS - 1) * 7);

    for (let week = 0; week < WEEKS; week++) {
      const col: Array<{ date: string; vol: number }> = [];
      for (let day = 0; day < 7; day++) {
        const d = new Date(startMonday);
        d.setDate(startMonday.getDate() + week * 7 + day);
        const iso = d.toISOString().slice(0, 10);
        col.push({ date: iso, vol: dayVolume[iso] ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  }, [dayVolume]);

  const maxVol = Math.max(...Object.values(dayVolume), 1);
  const todayIso = today.toISOString().slice(0, 10);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const hasData = Object.keys(dayVolume).length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={Grid}
        title="No training data"
        description="Log workouts to build your training heatmap."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1.5">
          {dayLabels.map((l, i) => (
            <div key={i} className="w-3 h-3 flex items-center justify-center text-[7px] text-white/25">
              {i % 2 === 0 ? l : ''}
            </div>
          ))}
        </div>
        {/* Heatmap columns */}
        {grid.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {col.map(({ date, vol }) => {
              const intensity = vol > 0 ? Math.max(0.15, Math.min(1, vol / maxVol)) : 0;
              const isToday = date === todayIso;
              const isFuture = date > todayIso;
              return (
                <div
                  key={date}
                  title={vol > 0 ? `${date}: ${Math.round(vol).toLocaleString()} kg volume` : date}
                  className={cn(
                    'w-3 h-3 rounded-sm transition-all cursor-default',
                    isToday && 'ring-1 ring-orange-400/60',
                    isFuture && 'opacity-20',
                  )}
                  style={{
                    backgroundColor: vol > 0
                      ? `rgba(249,115,22,${intensity})`
                      : 'rgba(255,255,255,0.04)',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[9px] text-white/30">Less</span>
        {[0.04, 0.2, 0.4, 0.65, 0.9].map((o, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: i === 0 ? 'rgba(255,255,255,0.04)' : `rgba(249,115,22,${o})` }}
          />
        ))}
        <span className="text-[9px] text-white/30">More</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. RecoveryTrendPanel
// ---------------------------------------------------------------------------

function RecoveryTrendPanel({ sleepLog }: { sleepLog: SleepEntry[] }) {
  const data = useMemo(() => {
    const cutoff = daysAgo(30);
    return [...sleepLog]
      .filter(e => e.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }, [sleepLog]);

  if (data.length < 2) {
    return (
      <EmptyState
        icon={Moon}
        title="Not enough sleep data"
        description="Log at least 2 nights of sleep to see recovery trends."
      />
    );
  }

  const W = 500; const H = 100;
  const PAD_X = 4; const PAD_Y = 4;
  const n = data.length;

  // Quality line (0–10)
  const qualityPts = data.map((e, i): [number, number] => [
    PAD_X + (i / (n - 1)) * (W - PAD_X * 2),
    H - PAD_Y - (e.quality / 10) * (H - PAD_Y * 2),
  ]);

  // Duration line (0–12h, clamped)
  const durationPts = data.map((e, i): [number, number] => [
    PAD_X + (i / (n - 1)) * (W - PAD_X * 2),
    H - PAD_Y - (Math.min(e.durationHours, 12) / 12) * (H - PAD_Y * 2),
  ]);

  const toPolyline = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const toArea = (pts: [number, number][]) => [
    ...pts,
    [pts[n - 1][0], H] as [number, number],
    [pts[0][0], H] as [number, number],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  const avgQuality = data.reduce((s, e) => s + e.quality, 0) / n;
  const avgDuration = data.reduce((s, e) => s + e.durationHours, 0) / n;

  return (
    <div className="space-y-3">
      {/* Mini stats */}
      <div className="flex gap-6">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40">Avg Quality</p>
          <p className="text-lg font-black text-cyan-400">{avgQuality.toFixed(1)}<span className="text-xs text-white/40">/10</span></p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40">Avg Duration</p>
          <p className="text-lg font-black text-indigo-400">{avgDuration.toFixed(1)}<span className="text-xs text-white/40">h</span></p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40">Nights</p>
          <p className="text-lg font-black text-white/70">{n}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24" aria-label="Recovery trend">
        <defs>
          <linearGradient id="qualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.2)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
          <linearGradient id="durGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.15)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
        </defs>
        <polygon points={toArea(durationPts)} fill="url(#durGrad)" />
        <polygon points={toArea(qualityPts)} fill="url(#qualGrad)" />
        <polyline points={toPolyline(durationPts)} stroke="#6366f1" strokeWidth="1.5" fill="none" strokeDasharray="4 2" strokeLinecap="round" />
        <polyline points={toPolyline(qualityPts)} stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="flex items-center gap-4 text-[9px]">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-cyan-400 rounded" />
          <span className="text-white/40">Sleep Quality (0–10)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-indigo-400 rounded" style={{ borderTop: '1.5px dashed' }} />
          <span className="text-white/40">Duration (0–12h)</span>
        </div>
        <span className="ml-auto text-white/30">Last 30 days</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel wrapper
// ---------------------------------------------------------------------------

function AnalyticsPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-black uppercase tracking-wider text-white/80">{title}</h3>
      </div>
      {children}
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export function AnalyticsTab({ profile }: AnalyticsTabProps) {
  const sessions = profile?.workoutSessions ?? [];
  const sleepLog = profile?.sleepLog ?? [];
  const personalRecords = profile?.personalRecords ?? {};

  return (
    <div className="px-4 md:px-8 pb-8 pt-4 space-y-6">
      <AnalyticsPanel icon={TrendingUp} title="Strength Progression">
        <StrengthProgressionChart sessions={sessions} personalRecords={personalRecords} />
      </AnalyticsPanel>

      <AnalyticsPanel icon={Layers} title="Muscle Volume — Last 28 Days">
        <MuscleVolumeBreakdown sessions={sessions} />
      </AnalyticsPanel>

      <AnalyticsPanel icon={Grid} title="Training Heatmap — Last 16 Weeks">
        <TrainingHeatmap sessions={sessions} />
      </AnalyticsPanel>

      <AnalyticsPanel icon={Moon} title="Recovery Trend — Last 30 Days">
        <RecoveryTrendPanel sleepLog={sleepLog} />
      </AnalyticsPanel>
    </div>
  );
}
