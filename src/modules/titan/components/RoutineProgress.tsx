/**
 * RoutineProgress - Visualize planned routine structure + actual session performance
 */

import React, { useMemo } from 'react';
import { Activity, Zap, Calendar, TrendingUp } from 'lucide-react';
import type { Routine, WorkoutSession, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { SectionHeader } from '@/core/components/SectionHeader';
import { BarChart, BarChartDataPoint } from '@/core/components/viz/BarChart';
import { MetricCard } from '@/core/components/viz/MetricCard';

interface RoutineProgressProps {
  routines: Routine[];
  workoutSessions?: WorkoutSession[];
  className?: string;
}

function extractReps(repsStr: string): number {
  const match = repsStr.match(/\d+/);
  return match ? parseInt(match[0]) : 10;
}

function plannedVolume(routine: Routine): number {
  return routine.exercises.reduce((t, ex) => t + ex.sets * extractReps(ex.reps ?? ''), 0);
}

export function RoutineProgress({ routines, workoutSessions = [], className }: RoutineProgressProps) {
  const sessions = workoutSessions.slice(0, 14); // last 14 sessions

  const stats = useMemo(() => {
    const totalPlannedReps = routines.reduce((t, r) => t + plannedVolume(r), 0);
    const avgExercises = routines.length > 0
      ? (routines.reduce((t, r) => t + r.exercises.length, 0) / routines.length).toFixed(1)
      : '0';

    const totalActualVolume = sessions.reduce((t, s) => t + (s.totalVolume ?? 0), 0);
    const avgRpe = sessions.length > 0
      ? (sessions.reduce((t, s) => t + (s.rpe ?? 7), 0) / sessions.length).toFixed(1)
      : null;

    // Weekly distribution — training days scheduled
    const weekdayOrder: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const scheduled = new Set(routines.map(r => r.weekday).filter(Boolean));
    const weeklyDistribution: BarChartDataPoint[] = weekdayOrder.map(day => ({
      category: day.slice(0, 3).toUpperCase(),
      value: scheduled.has(day) ? 1 : 0,
    }));

    // Session volume trend — last 7 sessions as bar chart
    const volumeTrend: BarChartDataPoint[] = [...sessions].reverse().slice(0, 7).map(s => ({
      category: s.date.slice(5), // MM-DD
      value: s.totalVolume ?? 0,
    }));

    return { totalPlannedReps, avgExercises, totalActualVolume, avgRpe, weeklyDistribution, volumeTrend };
  }, [routines, sessions]);

  if (routines.length === 0) return null;

  return (
    <div className={cn('space-y-6', className)}>
      <SectionHeader
        label="Training Progress"
        title="Routine Analytics"
        subtitle="Volume tracking and session performance"
        accentClassName="text-orange-400"
      />

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Training Days"
          value={routines.length}
          unit="/ week"
          color="orange"
          trendDirection="stable"
        />
        <MetricCard
          label="Avg Exercises"
          value={stats.avgExercises}
          color="amber"
          trendDirection="stable"
        />
        {sessions.length > 0 ? (
          <MetricCard
            label="Total Volume Lifted"
            value={stats.totalActualVolume}
            unit="kg"
            color="cyan"
            trendDirection="up"
          />
        ) : (
          <MetricCard
            label="Planned Volume"
            value={stats.totalPlannedReps}
            unit="reps"
            color="cyan"
            trendDirection="stable"
          />
        )}
        {stats.avgRpe ? (
          <MetricCard
            label="Avg RPE"
            value={stats.avgRpe}
            unit="/ 10"
            color={Number(stats.avgRpe) >= 8 ? 'orange' : 'emerald'}
            trendDirection="stable"
          />
        ) : (
          <MetricCard
            label="Sessions Logged"
            value={0}
            color="emerald"
            trendDirection="stable"
          />
        )}
      </div>

      {/* Session volume trend (when sessions exist) */}
      {sessions.length > 0 && stats.volumeTrend.some(d => d.value > 0) && (
        <SurfaceCard className="p-6">
          <div className="mb-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              Session Volume Trend
            </h3>
            <p className="text-xs text-white/50">Total weight lifted per session (kg)</p>
          </div>
          <BarChart
            data={stats.volumeTrend}
            orientation="vertical"
            height={200}
            color="orange"
            showValues
            animate
          />
        </SurfaceCard>
      )}

      {/* Weekly schedule distribution */}
      <SurfaceCard className="p-6">
        <div className="mb-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-1">
            Weekly Schedule
          </h3>
          <p className="text-xs text-white/50">Scheduled training days</p>
        </div>
        <BarChart
          data={stats.weeklyDistribution}
          orientation="vertical"
          height={160}
          color="orange"
          animate
        />
      </SurfaceCard>

      {/* Recent sessions list */}
      {sessions.length > 0 && (
        <SurfaceCard className="p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-4">
            Recent Sessions
          </h3>
          <div className="space-y-2">
            {sessions.slice(0, 7).map((session, idx) => (
              <div
                key={session.id || idx}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-white/80 truncate">{session.routineName}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider',
                      session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' :
                      session.status === 'partial' ? 'bg-amber-500/10 text-amber-300' :
                      'bg-white/5 text-white/30'
                    )}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-white/40">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {session.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {session.exercises.length} exercises
                    </span>
                    {session.totalVolume != null && session.totalVolume > 0 && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {session.totalVolume}kg
                      </span>
                    )}
                  </div>
                </div>
                {session.rpe != null && (
                  <div className="shrink-0 ml-4 text-right">
                    <div className={cn(
                      'text-sm font-black tabular-nums',
                      session.rpe >= 9 ? 'text-rose-400' : session.rpe >= 7 ? 'text-orange-400' : 'text-green-400'
                    )}>
                      {session.rpe}
                    </div>
                    <div className="text-[9px] text-white/30 uppercase tracking-wider">RPE</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {/* Routine details (fallback when no session data) */}
      {sessions.length === 0 && (
        <SurfaceCard className="p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-4">
            Routine Details
          </h3>
          <div className="space-y-2">
            {routines.map((routine, idx) => {
              const vol = plannedVolume(routine);
              return (
                <div
                  key={routine.id || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/30 w-10">
                      {routine.weekday?.slice(0, 3).toUpperCase() || '—'}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white/80">{routine.name}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">
                        {routine.exercises.length} ex · {vol} planned reps
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
