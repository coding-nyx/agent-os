/**
 * EnhancedAtlasDashboard Component
 * Unified Timeline UI for the Atlas Module
 * Reverted visual style to original dashboard sections while keeping unified logic.
 */

import React, { useState } from 'react';
import { GlobalProjection } from '@/lib/types';
import {
  CalendarRange,
  Inbox,
  Clock,
  GitCommitVertical,
  SlidersHorizontal,
  Lock,
  History,
  Target,
  Zap
} from 'lucide-react';
import {
  AtlasProfile,
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
  AtlasRoutine,
  DailyIntention,
} from '../services/atlas-profile-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { AtlasAIPanel } from './AtlasAIPanel';
import { TaskManager } from './TaskManager';
import { GoalTracker } from './GoalTracker';
import { HabitBuilder } from './HabitBuilder';
import { RoutineEditor } from './RoutineEditor';

// Original dashboard components
import { EnergyWaveChart } from './EnergyWaveChart';
import { StatCard } from '@/core/components/StatCard';
import { TaskTimeline } from './TaskTimeline';
import { GoalProgress } from './GoalProgress';
import { HabitTracker } from './HabitTracker';
import { FieldsTab } from './FieldsTab';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { QuickAddForm } from './QuickAddForm';
import { TodaysPlanCard } from './TodaysPlanCard';
import { FocusView } from './FocusView';
import { ViewSwitcher } from './ViewSwitcher';

type AtlasTab = 'dashboard' | 'backlog' | 'routines' | 'fields' | 'review';
type AtlasView = 'today' | 'week' | 'focus';

interface EnhancedAtlasDashboardProps {
  soul: GlobalProjection | null;
  profile: AtlasProfile | null;
  isLocked?: boolean;
  activeTab?: AtlasTab;
  onTabChange?: (tab: AtlasTab) => void;
  onCompleteTask?: (taskId: string) => void;
  onCompleteHabit?: (habitId: string) => void;
  onUpdateGoalProgress?: (goalId: string, milestoneId: string) => void;
  onPauseHabit?: (habitId: string) => void;
  onCreateTask?: (task: Partial<AtlasTask>) => void;
  onCreateHabit?: (habit: Partial<AtlasHabit>) => void;
  onCreateGoal?: (goal: Partial<AtlasGoal>) => void;
  onUpdateTask?: (taskId: string, updates: Partial<AtlasTask>) => void;
  onUpdateHabit?: (habitId: string, updates: Partial<AtlasHabit>) => void;
  onUpdateGoal?: (goalId: string, updates: Partial<AtlasGoal>) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteHabit?: (habitId: string) => void;
  onDeleteGoal?: (goalId: string) => void;
  onUpdateRoutine?: (updates: Partial<AtlasRoutine>) => void;
  onUpdateIntention?: (updates: Partial<DailyIntention>) => void;
  /** Extension field management */
  extensions?: import('@/lib/field-system/types').FieldDefinition[];
  fieldValues?: Record<string, import('@/lib/field-system/types').FieldValue>;
  onAddField?: () => void;
  onDeleteField?: (fieldId: string) => void;
}

const noop = () => {};

export function EnhancedAtlasDashboard({
  soul,
  profile,
  isLocked = false,
  activeTab = 'dashboard',
  onTabChange = noop,
  onCompleteTask = noop,
  onCompleteHabit = noop,
  onUpdateGoalProgress = noop,
  onPauseHabit = noop,
  onCreateTask = noop,
  onCreateHabit = noop,
  onCreateGoal = noop,
  onUpdateTask = noop,
  onUpdateHabit = noop,
  onUpdateGoal = noop,
  onDeleteTask = noop,
  onDeleteHabit = noop,
  onDeleteGoal = noop,
  onUpdateRoutine = noop,
  onUpdateIntention = noop,
  extensions = [],
  fieldValues = {},
  onAddField = noop,
  onDeleteField,
}: EnhancedAtlasDashboardProps) {
  const [isEditingIntention, setIsEditingIntention] = useState(false);
  const [intentionForm, setIntentionForm] = useState({ theme: '', focusDomain: '', energyTarget: 5 });
  const [activeView, setActiveView] = useState<AtlasView>('today');

  const tabs: NeuralTabItem<AtlasTab>[] = [
    { id: 'dashboard', label: 'Dashboard', icon: CalendarRange },
    { id: 'backlog', label: 'Backlog', icon: Inbox, badge: profile?.tasks.filter(t => t.status === 'queued').length || undefined },
    { id: 'routines', label: 'Routines & Habits', icon: Clock },
    { id: 'fields', label: 'Fields', icon: SlidersHorizontal },
    { id: 'review', label: 'Review', icon: GitCommitVertical },
  ];

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Atlas"
        moduleDescription="Energy mapping and goal architecture."
      />
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

  const cognitive = soul.crossFunctionalState.cognitive || {};
  const energyBudget = typeof cognitive.energyBudget === 'number' ? cognitive.energyBudget : 5;
  const focusScore = typeof cognitive.focusScore === 'number' ? cognitive.focusScore : 5;
  const activeLoad = typeof cognitive.activeLoad === 'number' ? cognitive.activeLoad : 5;

  const tasks = profile?.tasks ?? [];
  const habits = profile?.habits ?? [];
  const goals = profile?.goals ?? [];
  const energyWave = profile?.energyWave ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
        <SectionHeader
          label="Cognitive Domain"
          title="Atlas Energy & Planning"
          subtitle="Energy management, routines, and cross-module execution."
          accentClassName="text-sky-400"
        />
      </div>

      {/* ── Tab Navigation ── */}
      <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
        <NeuralTabGroup
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          themeColor="sky"
        />
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 md:pt-6 space-y-6 no-scrollbar">
        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* ── Sub-view navigation: Today / Week / Focus ── */}
            <ViewSwitcher activeView={activeView} onViewChange={setActiveView} />

            {/* ── Focus Mode (Zen / Pomodoro) ── */}
            {activeView === 'focus' && (
              <FocusView
                activeTask={tasks.find(t => t.status === 'active' || t.status === 'queued') ?? null}
                energyLevel={energyBudget}
                onComplete={onCompleteTask}
                onDefer={(id) => onUpdateTask(id, { status: 'deferred' })}
                onOpenChat={noop}
              />
            )}

            {/* ── Today plan card (Today view only) ── */}
            {activeView === 'today' && (
              <TodaysPlanCard profile={profile} isLocked={isLocked} />
            )}

            {/* ── Quick-add FAB (Today & Week views) ── */}
            {activeView !== 'focus' && (
              <div className="relative">
                <QuickAddForm
                  projects={profile?.projects ?? []}
                  onCreateTask={(t) => onCreateTask(t)}
                  onCreateHabit={(h) => onCreateHabit(h)}
                  onCreateGoal={(g) => onCreateGoal(g)}
                />
              </div>
            )}

            {/* ── Normal dashboard content (Today & Week views) ── */}
            {activeView !== 'focus' && (
              <div className="space-y-6">
            {/* Daily Intention & Focus */}
            {profile?.dailyIntentions && profile.dailyIntentions.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                    Today's Intent
                  </h4>
                  {!isEditingIntention && (
                    <button 
                      onClick={() => {
                        const current = profile.dailyIntentions[0];
                        setIntentionForm({ 
                          theme: current.theme, 
                          focusDomain: current.focusDomain, 
                          energyTarget: current.energyTarget 
                        });
                        setIsEditingIntention(true);
                      }}
                      className="text-[10px] text-sky-400 font-bold hover:text-sky-300 transition-colors"
                    >
                      EDIT INTENT
                    </button>
                  )}
                </div>
                <div className="p-5 rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] backdrop-blur-md">
                   {isEditingIntention ? (
                     <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Theme</label>
                          <input 
                            type="text" 
                            value={intentionForm.theme}
                            onChange={(e) => setIntentionForm({ ...intentionForm, theme: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Focus Domain</label>
                            <input 
                              type="text" 
                              value={intentionForm.focusDomain}
                              onChange={(e) => setIntentionForm({ ...intentionForm, focusDomain: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Energy Target</label>
                            <input 
                              type="number" 
                              value={intentionForm.energyTarget}
                              onChange={(e) => setIntentionForm({ ...intentionForm, energyTarget: parseInt(e.target.value) })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                           <button 
                             onClick={() => setIsEditingIntention(false)}
                             className="text-[10px] font-bold text-white/40 hover:text-white/60 px-3 py-1"
                           >
                             CANCEL
                           </button>
                           <button 
                             onClick={() => {
                               onUpdateIntention(intentionForm);
                               setIsEditingIntention(false);
                             }}
                             className="text-[10px] font-black bg-sky-500 text-white px-4 py-1 rounded-full hover:bg-sky-400 transition-colors"
                           >
                             SAVE INTENT
                           </button>
                        </div>
                     </div>
                   ) : (
                     <>
                      <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-sky-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">Focus Domain</span>
                          </div>
                          <span className="text-[10px] text-white/30 font-bold uppercase tabular-nums">
                            {profile.dailyIntentions[0].date}
                          </span>
                      </div>
                      <h3 className="text-xl font-black italic text-white/90 tracking-tight uppercase leading-tight">
                          {profile.dailyIntentions[0].theme}
                      </h3>
                      <div className="mt-4 flex items-center gap-4">
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">{profile.dailyIntentions[0].focusDomain}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] font-black text-white/30">Target: {profile.dailyIntentions[0].energyTarget}/10</span>
                          </div>
                      </div>
                     </>
                   )}
                </div>
              </section>
            )}

            {/* AI Insights Panel */}
            <AtlasAIPanel
              profile={profile}
              tasks={tasks}
              goals={goals}
              habits={habits}
              energyBudget={energyBudget}
              focusScore={focusScore}
              activeLoad={activeLoad}
            />

            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Energy Budget"
                value={energyBudget}
                isEmpty={false}
                accentClassName={energyBudget < 4 ? 'text-amber-300' : 'text-sky-300'}
              />
              <StatCard
                label="Focus Score"
                value={focusScore}
                isEmpty={false}
                accentClassName={focusScore < 4 ? 'text-red-400' : 'text-sky-300'}
              />
              <StatCard
                label="Active Load"
                value={activeLoad}
                isEmpty={false}
                accentClassName={activeLoad > 7 ? 'text-red-400' : 'text-sky-300'}
              />
              <StatCard
                label="Routine Status"
                value={profile?.routine?.isActive ? 'Active' : 'Paused'}
                isEmpty={!profile}
                accentClassName="text-emerald-300"
              />
            </div>

            {/* Energy wave chart */}
            <section className="space-y-3" aria-label="Energy wave visualization">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                48-Hour Energy Forecast
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

            {/* Unified Timeline / Task timeline */}
            <section className="space-y-3">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                Daily Timeline
              </h4>
              <TaskTimeline
                tasks={tasks}
                scheduledTasks={profile?.scheduledTasks ?? []}
                energyWave={energyWave}
                onComplete={onCompleteTask}
                onExpand={noop}
              />
            </section>

            {/* Active habits snapshot */}
            <section className="space-y-3">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                Today's Habits
              </h4>
              <HabitTracker
                habits={habits.filter((h) => h.status === 'active').slice(0, 5)}
                onComplete={onCompleteHabit}
                onPause={onPauseHabit}
              />
            </section>

            {/* Active goals snapshot */}
            <section className="space-y-3">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                Active Goals
              </h4>
              <GoalProgress
                goals={goals.filter((g) => g.status === 'active').slice(0, 3)}
                onUpdateProgress={onUpdateGoalProgress}
                onExpandGoal={noop}
              />
            </section>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ BACKLOG TAB ══════════════ */}
        {activeTab === 'backlog' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                  <h3 className="text-lg font-black text-white/90">Task Backlog</h3>
                  <TaskManager
                    tasks={tasks}
                    projects={profile?.projects ?? []}
                    onCreateTask={onCreateTask}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onCompleteTask={onCompleteTask}
                  />
              </div>
              <div className="space-y-4">
                  <h3 className="text-lg font-black text-white/90">Active Goals</h3>
                  <GoalTracker
                    goals={goals}
                    tasks={tasks}
                    onCreateGoal={onCreateGoal}
                    onUpdateGoal={onUpdateGoal}
                    onDeleteGoal={onDeleteGoal}
                    onUpdateGoalProgress={onUpdateGoalProgress}
                  />
              </div>
           </div>
        )}

        {/* ══════════════ ROUTINES TAB ══════════════ */}
        {activeTab === 'routines' && (
           <div className="space-y-8">
              <section className="space-y-3">
                 <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                    Weekly Routine Skeleton
                 </h4>
                 {profile && (
                    <RoutineEditor 
                      routine={profile.routine}
                      onUpdate={onUpdateRoutine}
                    />
                 )}
              </section>
              
              <section className="space-y-3">
                  <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">
                     Habit Builder
                  </h4>
                  <HabitBuilder
                    habits={habits}
                    onCreateHabit={onCreateHabit}
                    onUpdateHabit={onUpdateHabit}
                    onDeleteHabit={onDeleteHabit}
                    onCompleteHabit={onCompleteHabit}
                    onPauseHabit={onPauseHabit}
                  />
              </section>
           </div>
        )}

        {/* ══════════════ FIELDS TAB ══════════════ */}
        {activeTab === 'fields' && (
          <FieldsTab
            extensions={extensions}
            fieldValues={fieldValues}
            onAddField={onAddField}
            onDeleteField={onDeleteField}
          />
        )}

        {/* ══════════════ REVIEW TAB ══════════════ */}
        {activeTab === 'review' && (
          <div className="space-y-6">
            <h3 className="text-lg font-black text-white/90">Temporal Reviews</h3>
            {profile?.reviews && profile.reviews.length > 0 ? (
              <div className="space-y-4">
                {profile.reviews.map((review: any) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-white/90 capitalize">
                        {review.scope} Review · {new Date(review.periodStart).toLocaleDateString()}
                      </h4>
                      <span className="text-xs text-white/40">
                        {review.totalCompleted}/{review.totalScheduled} completed
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-xs mb-4">
                      <div>
                        <span className="text-white/40">Completion</span>
                        <p className="text-lg font-bold text-emerald-400 mt-1">
                          {Math.round(review.completionRate * 100)}%
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">Avg Energy</span>
                        <p className="text-lg font-bold text-sky-400 mt-1">
                          {review.nsvTrend?.energyBudgetAvg ?? '-'}/10
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">Avg Focus</span>
                        <p className="text-lg font-bold text-sky-400 mt-1">
                          {review.nsvTrend?.focusScoreAvg ?? '-'}/10
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">Drift Score</span>
                        <p className="text-lg font-bold text-rose-400 mt-1">
                          {review.driftScore ?? '-'}
                        </p>
                      </div>
                    </div>
                    
                    {review.insights && review.insights.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <span className="text-[10px] text-white/40 uppercase tracking-wider">Generated Insights</span>
                            <ul className="list-disc pl-4 mt-2 space-y-1">
                                {review.insights.map((ins: string, i: number) => (
                                    <li key={i} className="text-xs text-sky-200/80">{ins}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No reviews yet"
                description="Trigger a daily or weekly wrap-up in the Atlas chat."
                icon={History}
                size="lg"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
