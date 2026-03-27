/**
 * RoutineProgress - Visualize planned routine structure + actual session performance
 */

import React, { useMemo } from 'react';
import { Activity, Zap, Calendar, TrendingUp } from 'lucide-react';
import type { Routine, WorkoutSession, Weekday, TitanExerciseEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { BarChart, type BarChartDataPoint } from '@/core/components/viz/BarChart';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { SectionHeader } from '@/core/components/SectionHeader';

interface RoutineProgressProps {
  routines: Routine[];
  workoutSessions?: WorkoutSession[];
  exerciseLibrary?: TitanExerciseEntry[];
  className?: string;
}

function extractReps(repsStr: string | number): number {
  if (typeof repsStr === 'number') return repsStr;
  const match = String(repsStr).match(/\d+/);
  return match ? parseInt(match[0]) : 10;
}

function plannedVolume(routine: Routine): number {
  return routine.exercises.reduce((t, ex) => t + ex.sets * extractReps(ex.reps ?? 10), 0);
}

export function RoutineProgress({ routines, workoutSessions = [], exerciseLibrary, className }: RoutineProgressProps) {
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

    // Weekly volume by muscle group (sets)
    const muscleVolume = new Map<string, number>();
    routines.forEach(routine => {
      routine.exercises.forEach(ex => {
        const sets = ex.sets;
        const muscles = ex.muscleGroups || [];
        // If no muscle group specified, maybe skip or categorize as 'other'
        // If multiple, split sets? Or count for all? Usually count for all primary.
        muscles.forEach(m => {
            muscleVolume.set(m, (muscleVolume.get(m) || 0) + sets);
        });
      });
    });

    const muscleDistribution: BarChartDataPoint[] = Array.from(muscleVolume.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value); // Sort highest volume first

    // Actual volume by muscle group (Last 7 days)
    const actualMuscleVolume = new Map<string, number>();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    sessions.filter(s => new Date(s.date) >= oneWeekAgo).forEach(session => {
       session.exercises.forEach(ex => {
          // Count sets where at least one rep was done
          // session.exercises is TitanWorkoutLog['sets'] ?? No, wait. 
          // WorkoutSession definition needs verification.
          // Assuming structure: { exerciseName, sets: [{completed, repsCompleted}] }
          const sets = ex.sets.filter(s => s.completed || (s.repsCompleted ?? 0) > 0).length;
          if (sets === 0) return;

          // Find muscles
          let muscles: string[] = [];
          
          // Try library first
          const libEntry = exerciseLibrary?.find(e => e.name.toLowerCase() === ex.exerciseName.toLowerCase());
          if (libEntry) {
             muscles = libEntry.muscleGroups;
          } else {
             // Try to guess from routines
             const routineMatch = routines.flatMap(r => r.exercises).find(re => re.name.toLowerCase() === ex.exerciseName.toLowerCase());
             if (routineMatch && routineMatch.muscleGroups) {
                muscles = routineMatch.muscleGroups;
             }
          }
          
          if (muscles.length === 0) muscles = ['other'];
          
          muscles.forEach(m => {
             actualMuscleVolume.set(m, (actualMuscleVolume.get(m) || 0) + sets);
          });
       });
    });

    const actualMuscleDistribution: BarChartDataPoint[] = Array.from(actualMuscleVolume.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);

    return { totalPlannedReps, avgExercises, totalActualVolume, avgRpe, weeklyDistribution, volumeTrend, muscleDistribution, actualMuscleDistribution };
  }, [routines, sessions, exerciseLibrary]);

  if (routines.length === 0) return null;

  return (
    <div className={cn('space-y-5 sm:space-y-6 md:space-y-8', className)}>
      <SectionHeader
        label="Training Progress"
        title="Routine Analytics"
        subtitle="Volume tracking and session performance"
        accentClassName="text-[var(--module-color-400)]"
      />

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            color="orange"
            trendDirection="up"
          />
        ) : (
          <MetricCard
            label="Planned Volume"
            value={stats.totalPlannedReps}
            unit="reps"
            color="orange"
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

      {/* Muscle Volume Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats.muscleDistribution.length > 0 && (
          <SurfaceCard className="p-6">
            <div className="mb-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-1 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--module-color-400)]" />
                Planned Volume
              </h3>
              <p className="text-xs text-white/50">Weekly target sets by muscle</p>
            </div>
            <BarChart
              data={stats.muscleDistribution}
              orientation="horizontal"
              height={Math.max(160, stats.muscleDistribution.length * 32)}
              color="indigo"
              showValues
              animate
            />
          </SurfaceCard>
        )}

        {stats.actualMuscleDistribution.length > 0 && (
          <SurfaceCard className="p-6">
            <div className="mb-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-1 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                Actual Volume (7d)
              </h3>
              <p className="text-xs text-white/50">Completed sets by muscle</p>
            </div>
            <BarChart
              data={stats.actualMuscleDistribution}
              orientation="horizontal"
              height={Math.max(160, stats.actualMuscleDistribution.length * 32)}
              color="emerald"
              showValues
              animate
            />
          </SurfaceCard>
        )}
      </div>

      {/* Session volume trend (when sessions exist) */}
      {sessions.length > 0 && stats.volumeTrend.some(d => d.value > 0) && (
        <SurfaceCard className="p-6">
          <div className="mb-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-white/90 mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--module-color-400)]" />
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
        <SurfaceCard className="p-4 sm:p-5 md:p-6">
          <h3 className="text-[13px] sm:text-sm font-black uppercase tracking-wide text-white/90 mb-3 sm:mb-4">
            Recent Sessions
          </h3>
          <div className="space-y-2">
            {sessions.slice(0, 7).map((session, idx) => (
              <div
                key={session.id || idx}
                className="flex items-center justify-between p-3 min-h-[2.75rem] rounded-xl bg-white/[0.045] border border-white/[0.09] gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[11px] sm:text-xs font-bold text-white/80 truncate">{session.routineName}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider',
                      session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' :
                      session.status === 'partial' ? 'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]' :
                      'bg-white/[0.045] text-white/30'
                    )}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-[11px] text-white/40 flex-wrap">
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
                      session.rpe >= 9 ? 'text-rose-400' : session.rpe >= 7 ? 'text-[var(--module-color-400)]' : 'text-green-400'
                    )}>
                      {session.rpe}
                    </div>
                    <div className="text-[11px] text-white/30 uppercase tracking-wider">RPE</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {/* Routine details fallback removed — Weekly Plan above shows the same data */}
    </div>
  );
}
