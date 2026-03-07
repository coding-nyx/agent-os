import React, { useMemo, useState, useCallback } from 'react';
import { CalendarClock, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import {
  AtlasProfile,
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
} from '../services/atlas-profile-service';
import { EnergyWaveChart } from './EnergyWaveChart';
import { ViewSwitcher } from './ViewSwitcher';
import { TaskTimeline } from './TaskTimeline';
import { WeekGrid } from './WeekGrid';
import { FocusView } from './FocusView';
import { QuickAddForm, type TaskInput, type HabitInput, type GoalInput } from './QuickAddForm';
import { HabitTracker } from './HabitTracker';
import { GoalProgress } from './GoalProgress';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

type AtlasView = 'today' | 'week' | 'focus';

interface AtlasDashboardProps {
  soul: GlobalProjection | null;
  profile: AtlasProfile | null;
  isLocked?: boolean;
  onCompleteTask?: (taskId: string) => void;
  onCompleteHabit?: (habitId: string) => void;
  onUpdateGoalProgress?: (goalId: string, milestoneId: string) => void;
  onPauseHabit?: (habitId: string) => void;
  onCreateTask?: (task: Partial<AtlasTask>) => void;
  onCreateHabit?: (habit: Partial<AtlasHabit>) => void;
  onCreateGoal?: (goal: Partial<AtlasGoal>) => void;
  onDeferTask?: (taskId: string) => void;
}

const noop = () => {};

export function AtlasDashboard({
  soul,
  profile,
  isLocked = false,
  onCompleteTask = noop,
  onCompleteHabit = noop,
  onUpdateGoalProgress = noop,
  onPauseHabit = noop,
  onCreateTask = noop,
  onCreateHabit = noop,
  onCreateGoal = noop,
  onDeferTask = noop,
}: AtlasDashboardProps) {
  const [activeView, setActiveView] = useState<AtlasView>('today');
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>();

  // ---- Early returns for locked / no-soul states ----

  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Atlas to view cognitive telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
    );
  }

  if (!soul) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Cognitive link pending"
          description="Share your task load to activate the Atlas waveboard."
          size="lg"
        />
      </div>
    );
  }

  // ---- Derived data ----

  const cognitive = soul.crossFunctionalState.cognitive;
  const lastUpdated = soul.crossFunctionalState.lastUpdated || {};
  const activeWindows =
    profile?.recoveryWindows.filter((w) => w.status === 'active').length || 0;

  const tasks = profile?.tasks ?? [];
  const scheduledTasks = profile?.scheduledTasks ?? [];
  const habits = profile?.habits ?? [];
  const goals = profile?.goals ?? [];
  const projects = profile?.projects ?? [];
  const energyWave = profile?.energyWave ?? [];

  // First active task for FocusView
  const focusTask = tasks.find((t) => t.status === 'active') ?? null;
  const currentEnergy =
    energyWave.length > 0
      ? energyWave[Math.floor(energyWave.length / 2)]?.energy ?? 5
      : typeof cognitive.energyBudget === 'number'
        ? cognitive.energyBudget
        : 5;

  // ---- Stat card helpers ----

  const toneWhenBelow = (
    value: number | null | undefined,
    threshold: number,
    lowClass: string,
    highClass: string
  ) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value < threshold ? lowClass : highClass;
  };

  const toneWhenAbove = (
    value: number | null | undefined,
    threshold: number,
    highClass: string,
    lowClass: string
  ) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value > threshold ? highClass : lowClass;
  };

  // ---- Risk flags ----

  const riskFlags: string[] = [];
  if (typeof cognitive.activeLoad === 'number' && cognitive.activeLoad > 7) {
    riskFlags.push('Task load is elevated. Trigger schedule flattening.');
  }
  if (typeof cognitive.focusScore === 'number' && cognitive.focusScore < 4) {
    riskFlags.push(
      'Low focus signal. Insert a recovery window before deep work.'
    );
  }
  if (
    typeof cognitive.energyBudget === 'number' &&
    cognitive.energyBudget < 4
  ) {
    riskFlags.push(
      'Energy budget is constrained. Prioritize critical tasks only.'
    );
  }

  // ---- QuickAddForm bridges (adapt specific input types → Partial<Domain>) ----

  const handleCreateTask = (input: TaskInput) => {
    onCreateTask({
      title: input.title,
      priority: input.priority,
      energyCost: input.energyCost,
      deadline: input.deadline,
      projectId: input.projectId,
    });
  };

  const handleCreateHabit = (input: HabitInput) => {
    onCreateHabit({ title: input.title, energyCost: input.energyCost });
  };

  const handleCreateGoal = (input: GoalInput) => {
    onCreateGoal({ title: input.title, deadline: input.deadline });
  };

  // ---- Render ----

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Cognitive Domain"
        title="Atlas Waveboard"
        subtitle="Schedule stabilization, cognitive load, and recovery windows."
        accentClassName="text-sky-400"
      />

      <ViewSwitcher activeView={activeView} onViewChange={setActiveView} />

      {/* ══════════════ TODAY VIEW ══════════════ */}
      {activeView === 'today' && (
        <div
          className="space-y-8"
          role="tabpanel"
          id="atlas-panel-today"
          aria-labelledby="atlas-tab-today"
        >
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Energy Budget"
              value={
                typeof cognitive.energyBudget === 'number'
                  ? cognitive.energyBudget
                  : null
              }
              isEmpty={
                cognitive.energyBudget === undefined ||
                cognitive.energyBudget === null
              }
              accentClassName={toneWhenBelow(
                cognitive.energyBudget,
                4,
                'text-amber-300',
                'text-sky-300'
              )}
              isDerived={
                NSV_DERIVED_METRICS.includes('cognitive.energyBudget') ||
                isMetricStale(lastUpdated['cognitive.energyBudget'], 7)
              }
            />
            <StatCard
              label="Focus Score"
              value={
                typeof cognitive.focusScore === 'number'
                  ? cognitive.focusScore
                  : null
              }
              isEmpty={
                cognitive.focusScore === undefined ||
                cognitive.focusScore === null
              }
              accentClassName={toneWhenBelow(
                cognitive.focusScore,
                4,
                'text-red-400',
                'text-sky-300'
              )}
              isDerived={
                NSV_DERIVED_METRICS.includes('cognitive.focusScore') ||
                isMetricStale(lastUpdated['cognitive.focusScore'], 7)
              }
            />
            <StatCard
              label="Active Load"
              value={
                typeof cognitive.activeLoad === 'number'
                  ? cognitive.activeLoad
                  : null
              }
              isEmpty={
                cognitive.activeLoad === undefined ||
                cognitive.activeLoad === null
              }
              accentClassName={toneWhenAbove(
                cognitive.activeLoad,
                7,
                'text-red-400',
                'text-sky-300'
              )}
              isDerived={
                NSV_DERIVED_METRICS.includes('cognitive.activeLoad') ||
                isMetricStale(lastUpdated['cognitive.activeLoad'], 7)
              }
            />
            <StatCard
              label="Recovery Windows"
              value={activeWindows || null}
              isEmpty={!profile}
              accentClassName="text-emerald-300"
            />
          </div>

          {/* Energy wave chart */}
          <section className="space-y-3" aria-label="Energy wave visualization">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Energy Wave
            </h4>
            {energyWave.length > 0 ? (
              <EnergyWaveChart
                points={energyWave.slice(0, 10)}
                flattenedUntil={profile?.flattenedUntil}
              />
            ) : (
              <EmptyState
                size="sm"
                title="No energy wave points yet"
                description="Atlas will build this as you chat."
                className="bg-transparent border-white/10"
              />
            )}
          </section>

          {/* Task timeline */}
          <section className="space-y-3">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Task Timeline
            </h4>
            <TaskTimeline
              tasks={tasks}
              scheduledTasks={scheduledTasks}
              energyWave={energyWave}
              onComplete={onCompleteTask}
              onExpand={noop}
            />
          </section>

          {/* Habit tracker */}
          <section className="space-y-3">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Habits
            </h4>
            <HabitTracker
              habits={habits}
              onComplete={onCompleteHabit}
              onPause={onPauseHabit}
            />
          </section>

          {/* Goal progress */}
          <section className="space-y-3">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Goals
            </h4>
            <GoalProgress
              goals={goals}
              onUpdateProgress={onUpdateGoalProgress}
              onExpandGoal={noop}
            />
          </section>

          {/* Recovery windows */}
          <section className="space-y-3" aria-label="Recovery windows">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Recovery Windows
            </h4>
            {(profile?.recoveryWindows ?? []).slice(0, 3).map((window) => (
              <SurfaceCard
                key={window.id}
                className="p-3 text-xs border-emerald-500/20 bg-emerald-500/5"
              >
                <div className="flex items-center justify-between text-emerald-300">
                  <span>{window.title}</span>
                  <CalendarClock className="w-4 h-4" aria-hidden="true" />
                </div>
                <p className="mt-1 text-emerald-100/70">{window.reason}</p>
              </SurfaceCard>
            ))}
            {(profile?.recoveryWindows ?? []).length === 0 && (
              <EmptyState
                size="sm"
                title="No recovery windows scheduled"
                description="Atlas will recommend recovery windows as load spikes."
                className="bg-transparent border-white/10"
              />
            )}
          </section>

          {/* Risk flags */}
          <section className="space-y-3" aria-label="Cognitive risk flags">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Risk Flags
            </h4>
            {riskFlags.length === 0 ? (
              <div
                role="status"
                className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300"
              >
                Cognitive profile stable.
              </div>
            ) : (
              riskFlags.map((flag, index) => (
                <div
                  key={index}
                  role="alert"
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-100/80"
                >
                  {flag}
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {/* ══════════════ WEEK VIEW ══════════════ */}
      {activeView === 'week' && (
        <div
          className="space-y-8"
          role="tabpanel"
          id="atlas-panel-week"
          aria-labelledby="atlas-tab-week"
        >
          <WeekGrid
            tasks={tasks}
            scheduledTasks={scheduledTasks}
            habits={habits}
            onDaySelect={setSelectedWeekDate}
            selectedDate={selectedWeekDate}
          />

          <section className="space-y-3">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
              Goals
            </h4>
            <GoalProgress
              goals={goals}
              onUpdateProgress={onUpdateGoalProgress}
              onExpandGoal={noop}
            />
          </section>
        </div>
      )}

      {/* ══════════════ FOCUS VIEW ══════════════ */}
      {activeView === 'focus' && (
        <div
          role="tabpanel"
          id="atlas-panel-focus"
          aria-labelledby="atlas-tab-focus"
        >
          <FocusView
            activeTask={focusTask}
            energyLevel={currentEnergy}
            onComplete={onCompleteTask}
            onDefer={onDeferTask}
            onOpenChat={noop}
          />
        </div>
      )}

      {/* ══════════════ QUICK-ADD FAB (always visible) ══════════════ */}
      <QuickAddForm
        projects={projects}
        onCreateTask={handleCreateTask}
        onCreateHabit={handleCreateHabit}
        onCreateGoal={handleCreateGoal}
      />
    </div>
  );
}
