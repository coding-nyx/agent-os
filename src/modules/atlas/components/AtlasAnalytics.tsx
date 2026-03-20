/**
 * AtlasAnalytics
 *
 * Dedicated analytics view for the Atlas module.
 * All charts are pure SVG — zero external chart dependencies.
 *
 * Sections:
 *   1. Weekly Summary Stats   — completion rate, streak health, avg energy (with delta)
 *   2. Task Velocity          — tasks completed per week over last 8 weeks (bar chart)
 *   3. Habit Completion Rate  — 30-day rolling completion % per active habit (sparkline)
 *   4. Energy Trend           — 7-day rolling average of energy wave points (area chart)
 */

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Zap, Target, Flame, CheckCircle2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import type { AtlasProfile, AtlasTask, AtlasHabit, EnergyWavePoint } from '../services/atlas-profile-service';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AtlasAnalyticsProps {
  profile: AtlasProfile | null;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Stat card delta indicator ─────────────────────────────────────────────────

function DeltaIndicator({ delta, unit = '' }: { delta: number; unit?: string }) {
  if (Math.abs(delta) < 0.1) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-white/30 font-medium">
        <Minus className="w-3 h-3" />
        No change
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-[10px] font-medium',
        positive ? 'text-emerald-400' : 'text-rose-400',
      )}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{delta.toFixed(1)}{unit} vs last week
    </span>
  );
}

// ─── Analytics summary card ────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string | number;
  delta?: number;
  unit?: string;
  icon: LucideIcon;
  accentClass: string;
}

function SummaryCard({ label, value, delta, unit, icon: Icon, accentClass }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5', accentClass)} aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <p className={cn('text-2xl font-black tabular-nums', accentClass)}>{value}</p>
      {delta !== undefined && <DeltaIndicator delta={delta} unit={unit} />}
    </div>
  );
}

// ─── Bar chart (task velocity) ─────────────────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number }[];
  color: string;
  maxValue?: number;
  height?: number;
}

function BarChart({ data, color, maxValue, height = 80 }: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);
  const barWidth = 100 / (data.length * 2);

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="w-full"
      style={{ height }}
    >
      {data.map((d, i) => {
        const barH = max > 0 ? (d.value / max) * (height - 10) : 0;
        const x = i * (100 / data.length) + barWidth / 2;
        return (
          <g key={i}>
            <rect
              x={`${x}%`}
              y={height - barH - 2}
              width={`${barWidth}%`}
              height={barH}
              rx="2"
              fill={color}
              opacity={0.7 + (d.value / max) * 0.3}
            />
            {d.value > 0 && (
              <text
                x={`${x + barWidth / 2}%`}
                y={height - barH - 5}
                textAnchor="middle"
                fontSize="5"
                fill="rgba(255,255,255,0.5)"
              >
                {d.value}
              </text>
            )}
          </g>
        );
      })}
      {/* Baseline */}
      <line x1="0" y1={height - 2} x2="100%" y2={height - 2} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  );
}

// ─── Sparkline (habit completion rate) ────────────────────────────────────────

interface SparklineProps {
  values: number[];
  color: string;
  height?: number;
  showArea?: boolean;
}

function Sparkline({ values, color, height = 40, showArea = true }: SparklineProps) {
  if (values.length < 2) {
    return <div style={{ height }} className="w-full flex items-center justify-center">
      <span className="text-[10px] text-white/20">Not enough data</span>
    </div>;
  }

  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `M 0,${height - 2} L ${pts.join(' L ')} L 100,${height - 2} Z`;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="w-full"
      style={{ height }}
    >
      {showArea && (
        <path d={areaPath} fill={color} opacity="0.12" />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Latest value dot */}
      {(() => {
        const last = pts[pts.length - 1].split(',');
        return (
          <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
        );
      })()}
    </svg>
  );
}

// ─── Habit row ─────────────────────────────────────────────────────────────────

interface HabitAnalyticsRowProps {
  habit: AtlasHabit;
  completionRates: number[];
  avgRate: number;
}

function HabitAnalyticsRow({ habit, completionRates, avgRate }: HabitAnalyticsRowProps) {
  const color = avgRate >= 0.8 ? '#34d399' : avgRate >= 0.5 ? '#fbbf24' : '#f87171';
  const textClass = avgRate >= 0.8 ? 'text-emerald-400' : avgRate >= 0.5 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 grid grid-cols-[1fr_auto_80px] items-center gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate">{habit.title}</p>
        <p className="text-[10px] text-white/30 capitalize">{habit.frequency} · streak {habit.currentStreak}d</p>
      </div>
      <p className={cn('text-lg font-black tabular-nums', textClass)}>
        {Math.round(avgRate * 100)}%
      </p>
      <Sparkline values={completionRates} color={color} height={32} />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AtlasAnalytics({ profile }: AtlasAnalyticsProps) {
  const tasks = profile?.tasks ?? [];
  const habits = profile?.habits ?? [];
  const energyWave = profile?.energyWave ?? [];
  const habitRecords = profile?.habitRecords ?? [];
  const dailyCheckIns = profile?.dailyCheckIns ?? [];

  // ── 1. Weekly Summary Stats ────────────────────────────────────────────────

  const weeklySummary = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    // This week's task completions
    const thisWeekDone = tasks.filter(t =>
      t.status === 'done' && t.completedAt &&
      now - new Date(t.completedAt).getTime() < weekMs
    ).length;
    const lastWeekDone = tasks.filter(t =>
      t.status === 'done' && t.completedAt && (() => {
        const age = now - new Date(t.completedAt).getTime();
        return age >= weekMs && age < 2 * weekMs;
      })()
    ).length;

    // This week's avg energy from daily check-ins
    const thisWeekCheckIns = dailyCheckIns.filter(c =>
      now - new Date(c.loggedAt ?? c.date).getTime() < weekMs
    );
    const lastWeekCheckIns = dailyCheckIns.filter(c => {
      const age = now - new Date(c.loggedAt ?? c.date).getTime();
      return age >= weekMs && age < 2 * weekMs;
    });

    const avgEnergy = (arr: typeof dailyCheckIns) =>
      arr.length > 0
        ? arr.reduce((s, c) => s + (c.energyLevel ?? 3), 0) / arr.length
        : 0;

    const thisEnergy = avgEnergy(thisWeekCheckIns);
    const lastEnergy = avgEnergy(lastWeekCheckIns);

    // Active habits with at least one completion this week
    const activeHabits = habits.filter(h => h.status === 'active');
    const streakHealth =
      activeHabits.length > 0
        ? activeHabits.reduce((s, h) => s + (h.currentStreak ?? 0), 0) / activeHabits.length
        : 0;

    return {
      thisWeekDone,
      taskDelta: thisWeekDone - lastWeekDone,
      thisEnergy,
      energyDelta: thisEnergy - lastEnergy,
      streakHealth,
    };
  }, [tasks, dailyCheckIns, habits]);

  // ── 2. Task Velocity (last 8 weeks) ───────────────────────────────────────

  const taskVelocity = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const weekStart = startOfWeek(addDays(now, -w * 7));
      const weekEnd = addDays(weekStart, 7);
      const label = `W${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      const count = tasks.filter(t => {
        if (t.status !== 'done' || !t.completedAt) return false;
        const d = new Date(t.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push({ label, value: count });
    }
    return weeks;
  }, [tasks]);

  // ── 3. Habit Completion Rates (last 30 days per active habit) ──────────────

  const habitAnalytics = useMemo(() => {
    const activeHabits = habits.filter(h => h.status === 'active');
    const now = new Date();
    const DAYS = 30;

    return activeHabits.map(habit => {
      // Build set of completion dates from habitRecords
      const completedDates = new Set(
        habitRecords
          .filter(r => r.habitId === habit.id && r.completed)
          .map(r => r.loggedAt?.slice(0, 10))
          .filter((d): d is string => !!d)
      );

      // Also count from lastCompleted if no habitRecords
      if (habit.lastCompleted) {
        completedDates.add(habit.lastCompleted.slice(0, 10));
      }

      // Build 30-day completion array (7-day rolling rate)
      const daily: number[] = [];
      for (let d = DAYS - 1; d >= 0; d--) {
        const date = toDateStr(addDays(now, -d));
        daily.push(completedDates.has(date) ? 1 : 0);
      }

      // 7-day rolling averages
      const rollingRates: number[] = [];
      for (let i = 6; i < daily.length; i++) {
        const window = daily.slice(i - 6, i + 1);
        rollingRates.push(window.reduce((s, v) => s + v, 0) / 7);
      }

      const avgRate = daily.reduce((s, v) => s + v, 0) / DAYS;

      return { habit, completionRates: rollingRates, avgRate };
    });
  }, [habits, habitRecords]);

  // ── 4. Energy Trend (7-day rolling average) ────────────────────────────────

  const energyTrend = useMemo(() => {
    // Combine energyWave points and daily check-in energy levels
    const byDate = new Map<string, number[]>();

    for (const point of energyWave) {
      const dateKey = point.slot?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(point.energy);
    }

    for (const checkIn of dailyCheckIns) {
      const v = checkIn.energyLevel;
      if (typeof v !== 'number') continue;
      const scaled = (v / 5) * 10;
      if (!byDate.has(checkIn.date)) byDate.set(checkIn.date, []);
      byDate.get(checkIn.date)!.push(scaled);
    }

    const now = new Date();
    const DAYS = 14;
    const daily: number[] = [];
    for (let d = DAYS - 1; d >= 0; d--) {
      const date = toDateStr(addDays(now, -d));
      const vals = byDate.get(date);
      if (vals && vals.length > 0) {
        daily.push(vals.reduce((s, v) => s + v, 0) / vals.length);
      } else {
        daily.push(0);
      }
    }

    // 3-day rolling average to smooth gaps
    const smoothed: number[] = daily.map((_, i) => {
      const window = daily.slice(Math.max(0, i - 2), i + 1).filter(v => v > 0);
      return window.length > 0 ? window.reduce((s, v) => s + v, 0) / window.length : 0;
    });

    return smoothed;
  }, [energyWave, dailyCheckIns]);

  const hasAnyData = tasks.length > 0 || habits.length > 0 || energyWave.length > 0 || dailyCheckIns.length > 0;

  if (!profile || !hasAnyData) {
    return (
      <EmptyState
        title="No data to analyse yet"
        description="Complete tasks, log habits, and track energy to see your performance trends here."
        icon={TrendingUp}
        size="lg"
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Section 1: Weekly Summary Stats ── */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
          This Week vs Last Week
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryCard
            label="Tasks Done"
            value={weeklySummary.thisWeekDone}
            delta={weeklySummary.taskDelta}
            icon={CheckCircle2}
            accentClass="text-emerald-400"
          />
          <SummaryCard
            label="Avg Energy"
            value={weeklySummary.thisEnergy > 0 ? weeklySummary.thisEnergy.toFixed(1) : '—'}
            delta={weeklySummary.thisEnergy > 0 && weeklySummary.energyDelta !== 0 ? weeklySummary.energyDelta : undefined}
            unit="/5"
            icon={Zap}
            accentClass="text-[var(--module-color-400)]"
          />
          <SummaryCard
            label="Streak Health"
            value={weeklySummary.streakHealth > 0 ? `${weeklySummary.streakHealth.toFixed(1)}d` : '—'}
            icon={Flame}
            accentClass="text-orange-400"
          />
        </div>
      </section>

      {/* ── Section 2: Task Velocity ── */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
          Task Velocity — Last 8 Weeks
        </h4>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {taskVelocity.every(w => w.value === 0) ? (
            <p className="text-xs text-white/30 italic">No completed tasks in the last 8 weeks.</p>
          ) : (
            <>
              <BarChart data={taskVelocity} color="#34d399" height={80} />
              <div className="flex justify-between mt-2">
                {taskVelocity.map((w, i) => (
                  <span key={i} className="text-[9px] text-white/25 tabular-nums">{w.label}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Section 3: Habit Completion Rates ── */}
      {habitAnalytics.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
            Habit Completion — 30-Day Rolling Rate
          </h4>
          <div className="space-y-2">
            {habitAnalytics.map(({ habit, completionRates, avgRate }) => (
              <HabitAnalyticsRow
                key={habit.id}
                habit={habit}
                completionRates={completionRates}
                avgRate={avgRate}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Energy Trend ── */}
      {energyTrend.some(v => v > 0) && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
            Energy Trend — 14-Day Rolling Average
          </h4>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <Sparkline values={energyTrend} color="#0ea5e9" height={64} showArea />
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-white/25">14 days ago</span>
              <span className="text-[9px] text-white/25">Today</span>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 5: Goals Summary ── */}
      {profile.goals.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
            Goal Progress
          </h4>
          <div className="space-y-2">
            {profile.goals.filter(g => g.status === 'active' || g.status === 'completed').map(goal => (
              <div
                key={goal.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-4"
              >
                <Target
                  className={cn(
                    'w-4 h-4 shrink-0',
                    goal.status === 'completed' ? 'text-emerald-400' : 'text-[var(--module-color-400)]',
                  )}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80 truncate">{goal.title}</p>
                  {goal.deadline && (
                    <p className="text-[10px] text-white/30">Due {goal.deadline}</p>
                  )}
                </div>
                {/* Progress bar */}
                <div className="w-24 shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-white/40">{goal.progressPercent}%</span>
                    <span className={cn(
                      'text-[9px] font-bold uppercase',
                      goal.status === 'completed' ? 'text-emerald-400' : 'text-white/30',
                    )}>
                      {goal.status}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        goal.status === 'completed' ? 'bg-emerald-400' : 'bg-[var(--module-color-400)]',
                      )}
                      style={{ width: `${goal.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
