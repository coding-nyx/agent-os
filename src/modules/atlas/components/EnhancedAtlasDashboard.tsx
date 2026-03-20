/**
 * EnhancedAtlasDashboard Component
 * Unified Timeline UI for the Atlas Module
 * Reverted visual style to original dashboard sections while keeping unified logic.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
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
  Zap,
  Settings2
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import {
  AtlasProfile,
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
  AtlasRoutine,
  DailyIntention,
  ScheduledTask,
} from '../services/atlas-profile-service';
import { MorningCheckIn, shouldShowMorningCheckIn } from './MorningCheckIn';
import { EveningCheckIn, shouldShowEveningCheckIn, type EveningCheckInSubmitData } from './EveningCheckIn';
import { PriorityInbox } from './PriorityInbox';
import { WeekGrid } from './WeekGrid';
import { WeeklyReviewModal } from './WeeklyReviewModal';
import { AtlasStateDisplay } from '../services/atlas-predictive-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { cn } from '@/lib/utils';
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
import { GoalVelocityChart } from './GoalVelocityChart';
import { HabitHeatmap } from './HabitHeatmap';
import { FieldsTab } from './FieldsTab';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { TodaysPlanCard } from './TodaysPlanCard';
import { FocusView } from './FocusView';
import { ViewSwitcher } from './ViewSwitcher';
import { MonthPlanner } from './MonthPlanner';
import { DayTaskPanel } from './DayTaskPanel';
import { QuickAddForm } from './QuickAddForm';
import { QuickCaptureBar } from './QuickCaptureBar';
import { JournalTab } from './journal/JournalTab';
import { ManualEnergyLog } from './ManualEnergyLog';
import { AtlasAnalytics } from './AtlasAnalytics';
import { BookOpen, BarChart2 } from 'lucide-react';

type AtlasTab = 'dashboard' | 'backlog' | 'routines' | 'journal' | 'analytics' | 'fields' | 'review';
type AtlasView = 'today' | 'week' | 'month' | 'focus';

interface EnhancedAtlasDashboardProps {
  soul: GlobalProjection | null;
  profile: AtlasProfile | null;
  isLocked?: boolean;
  activeTab?: AtlasTab;
  onTabChange?: (tab: AtlasTab) => void;
  activeView?: AtlasView;
  onViewChange?: (view: AtlasView) => void;
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
  onAddField?: (field?: import('@/lib/field-system/types').FieldDefinition) => void;
  onDeleteField?: (fieldId: string) => void;
  onSendMessage?: (message: string) => void;
  /** Encryption key for vault-gated journal tab */
  encryptionKey?: CryptoKey | null;
  /** S9-005: Weekly review pending indicator */
  weeklyReviewPending?: boolean;
  /** S9-005: Called when user opens the review tab */
  onReviewOpened?: () => void;
  /** Persist weekly review to profile.reviews (Run Weekly Review → Complete review) */
  onSaveWeeklyReview?: () => void;
  /** S9-007: Set true to force-show the morning brief card (from Spine event) */
  morningBriefVisible?: boolean;
  /** S9-007: Called when the morning brief card is dismissed from the parent */
  onMorningBriefDismiss?: () => void;
  /** S9-007: Set true to force-show the evening check-in card (from Spine event) */
  eveningCheckinVisible?: boolean;
  /** S9-007: Called when the evening check-in card is dismissed from the parent */
  onEveningCheckinDismiss?: (data?: EveningCheckInSubmitData) => void;
  /** S9-006: Preference mode for QuickAdd layout */
  preferenceMode?: 'conversational' | 'structured';
  /** S9-006: Toggle callback for preference mode */
  onTogglePreferenceMode?: () => void;
  /** S9-001: Evaluated Atlas predictive state — sourced from useAtlasPredictiveState in AtlasPage. */
  predictiveDisplay: AtlasStateDisplay;
  /** Optional manual energy log callback — shown when energyWave has no data */
  onLogEnergy?: (level: number, timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night') => void;
  /** Optional focus target from deep links (e.g., task:ID, journal:ID). */
  focusId?: string;
}

const noop = () => {};

export function EnhancedAtlasDashboard({
  soul,
  profile,
  isLocked = false,
  activeTab = 'dashboard',
  onTabChange = noop,
  activeView = 'today',
  onViewChange = noop,
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
  onSendMessage = noop,
  encryptionKey = null,
  weeklyReviewPending = false,
  onReviewOpened = noop,
  onSaveWeeklyReview,
  morningBriefVisible = false,
  onMorningBriefDismiss = noop,
  eveningCheckinVisible = false,
  onEveningCheckinDismiss = noop,
  preferenceMode = 'conversational',
  onTogglePreferenceMode = noop,
  predictiveDisplay,
  onLogEnergy,
  focusId,
}: EnhancedAtlasDashboardProps) {
  const [isEditingIntention, setIsEditingIntention] = useState(false);
  const [intentionForm, setIntentionForm] = useState({ theme: '', focusDomain: '', energyTarget: 5 });

  // New Phase-1 state — must live before any early returns (Rules of Hooks)
  const { user } = useAuth();
  const [morningDismissed, setMorningDismissed] = useState(false);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string | undefined>(undefined);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>(undefined);
  const [focusJournalId, setFocusJournalId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!focusId) return;
    if (focusId.startsWith('task:')) {
      const id = focusId.replace('task:', '');
      setFocusTaskId(id);
      onTabChange('backlog');
    } else if (focusId.startsWith('journal:')) {
      const id = focusId.replace('journal:', '');
      setFocusJournalId(id);
      onTabChange('journal');
      onViewChange('history');
    }
  }, [focusId, onTabChange, onViewChange]);

  const queuedCount = profile?.tasks.filter(t => t.status === 'queued').length;
  const tabs = useMemo<NeuralTabItem<AtlasTab>[]>(() => [
    { id: 'dashboard', label: 'Dashboard', icon: CalendarRange },
    { id: 'backlog', label: 'Backlog', icon: Inbox, badge: queuedCount || undefined },
    { id: 'routines', label: 'Routines & Habits', icon: Clock },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'fields', label: 'Fields', icon: SlidersHorizontal },
    {
      id: 'review',
      label: 'Review',
      icon: GitCommitVertical,
      badge: weeklyReviewPending ? '●' : undefined,
      badgeVariant: weeklyReviewPending ? 'warning' : undefined,
    },
  ], [queuedCount, weeklyReviewPending]);

  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Atlas"
        moduleDescription="Energy mapping and goal architecture."
      />
    );
  }

  const cognitive = soul?.crossFunctionalState?.cognitive ?? {};
  const energyBudget = typeof cognitive.energyBudget === 'number' ? cognitive.energyBudget : 5;
  const focusScore = typeof cognitive.focusScore === 'number' ? cognitive.focusScore : 5;
  const activeLoad = typeof cognitive.activeLoad === 'number' ? cognitive.activeLoad : 5;

  const tasks = profile?.tasks ?? [];
  const habits = profile?.habits ?? [];
  const goals = profile?.goals ?? [];
  const energyWave = profile?.energyWave ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header: token-based padding, responsive ── */}
      <header className="px-[var(--atlas-space-page-x)] pt-[var(--atlas-space-page-y)] pb-[var(--atlas-space-block)] flex items-start justify-between gap-4 flex-shrink-0">
        <div className="flex flex-col gap-[var(--atlas-space-block)] min-w-0">
          <SectionHeader
            label="Cognitive Domain"
            title="Atlas Energy & Planning"
            subtitle="Energy management, routines, and cross-module execution."
            accentClassName="text-sky-400"
          />
          <span
            className={cn(
              'self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[length:var(--atlas-type-label)] font-semibold border border-white/10 bg-white/5',
              predictiveDisplay.color
            )}
            title={predictiveDisplay.description}
            aria-label={`Atlas state: ${predictiveDisplay.label}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: predictiveDisplay.hex }}
              aria-hidden="true"
            />
            {predictiveDisplay.label}
          </span>
        </div>
        <NeuralButton
          onClick={onTogglePreferenceMode}
          title={preferenceMode === 'structured' ? 'Switch to conversational mode' : 'Switch to structured mode'}
          variant="secondary"
          size="sm"
          className="shrink-0 h-9 px-3 rounded-full"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{preferenceMode === 'structured' ? 'Structured' : 'Conversational'}</span>
        </NeuralButton>
      </header>

      {/* ── Tab Navigation: scroll padding so first tab isn't clipped on narrow viewports ── */}
      <div
        className="border-b border-white/5 overflow-x-auto no-scrollbar flex-shrink-0"
        style={{ scrollPaddingLeft: 'var(--atlas-space-page-x)' }}
      >
        <div className="px-[var(--atlas-space-page-x)] pb-[var(--atlas-space-section)]">
          <NeuralTabGroup
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => {
            onTabChange(tab);
            if (tab === 'review' && weeklyReviewPending) {
              onReviewOpened();
            }
          }}
          themeColor="sky"
        />
        </div>
      </div>

      {/* ── Dashboard view switcher — always visible on dashboard tab ── */}
      {activeTab === 'dashboard' && (
        <div className="shrink-0 px-[var(--atlas-space-page-x)] pt-[var(--atlas-space-section)] pb-[var(--atlas-space-block)]">
          <ViewSwitcher activeView={activeView} onViewChange={onViewChange} />
        </div>
      )}

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden flex">
        {/* S9-006: Structured mode — persistent sidebar QuickAdd panel (hidden in focus mode) */}
        {preferenceMode === 'structured' && activeTab === 'dashboard' && activeView !== 'focus' && (
          <aside className="hidden md:flex shrink-0 w-72 border-r border-white/5 overflow-y-auto no-scrollbar" style={{ padding: 'var(--atlas-space-section)' }}>
            <QuickAddForm
              projects={profile?.projects ?? []}
              onCreateTask={onCreateTask}
              onCreateHabit={onCreateHabit}
              onCreateGoal={onCreateGoal}
              isOpen
              onOpenChange={() => {}}
              showFAB={false}
              isFluid
            />
          </aside>
        )}

        {/* ── Focus mode: full-bleed wrapper — bypasses padded scroll container ── */}
        {activeTab === 'dashboard' && activeView === 'focus' && (
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <FocusView
              activeTask={tasks.find(t => t.status === 'active' || t.status === 'queued') ?? null}
              energyLevel={energyBudget}
              onComplete={onCompleteTask}
              onDefer={(id) => onUpdateTask(id, { status: 'deferred' })}
              onOpenChat={() => window.dispatchEvent(new CustomEvent('atlas:focus-chat'))}
            />
          </div>
        )}

        {/* ── Normal scroll container: token-based padding, section spacing ── */}
        {!(activeTab === 'dashboard' && activeView === 'focus') && (
        <div
          className="flex-1 overflow-y-auto no-scrollbar space-y-[var(--atlas-space-section)]"
          style={{ padding: 'var(--atlas-space-page-y) var(--atlas-space-page-x)' }}
        >
        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* ── Quick Capture Bar — always visible on Dashboard ── */}
            <QuickCaptureBar
              onAddTask={onCreateTask}
              onAddHabit={onCreateHabit}
              disabled={isLocked}
            />

            {/* ── Today view: MorningCheckIn + PriorityInbox + TodaysPlanCard ── */}
            {activeView === 'today' && (
              <div className="space-y-4">
                {(morningBriefVisible || (!morningDismissed && shouldShowMorningCheckIn(user?.uid))) && (
                  <MorningCheckIn
                    profile={profile}
                    soul={soul}
                    userId={user?.uid ?? null}
                    onDismiss={() => {
                      setMorningDismissed(true);
                      onMorningBriefDismiss();
                    }}
                    onSendMessage={onSendMessage}
                    predictiveState={predictiveDisplay.state}
                  />
                )}
                <PriorityInbox
                  tasks={profile?.tasks ?? []}
                  energyBudget={energyBudget}
                  onCompleteTask={onCompleteTask}
                  onDeferTask={(id) => onUpdateTask(id, { status: 'deferred' as const })}
                  onSendMessage={onSendMessage}
                />
                {(eveningCheckinVisible || shouldShowEveningCheckIn(user?.uid)) && profile && (
                  <EveningCheckIn
                    profile={profile}
                    userId={user?.uid}
                    onDismiss={onEveningCheckinDismiss}
                  />
                )}
                <TodaysPlanCard profile={profile} isLocked={isLocked} />
              </div>
            )}

            {/* ── Week view: 7-day planning grid ── */}
            {activeView === 'week' && (
              <WeekGrid
                tasks={profile?.tasks ?? []}
                scheduledTasks={profile?.scheduledTasks ?? []}
                habits={profile?.habits ?? []}
                onDaySelect={setSelectedWeekDate}
                selectedDate={selectedWeekDate}
              />
            )}

            {/* ── Month view: full month calendar planner ── */}
            {activeView === 'month' && (
              <MonthPlanner
                tasks={profile?.tasks ?? []}
                scheduledTasks={profile?.scheduledTasks ?? []}
                habits={profile?.habits ?? []}
                onDaySelect={setSelectedWeekDate}
                selectedDate={selectedWeekDate}
              />
            )}

            {/* ── Day task panel — shown when a day is selected from week or month view ── */}
            {(activeView === 'week' || activeView === 'month') && selectedWeekDate && (
              <DayTaskPanel
                date={selectedWeekDate}
                tasks={profile?.tasks ?? []}
                scheduledTasks={profile?.scheduledTasks ?? []}
                onClose={() => setSelectedWeekDate(undefined)}
              />
            )}

            {/* ── Today view: main dashboard content ── */}
            {activeView === 'today' && (
              <div className="space-y-6">
            {/* Daily Intention & Focus */}
            {profile?.dailyIntentions && profile.dailyIntentions.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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
                        <NeuralInput 
                          label="Theme"
                          value={intentionForm.theme}
                          onChange={(e) => setIntentionForm({ ...intentionForm, theme: e.target.value })}
                          className="bg-white/5 border-white/10"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <NeuralInput 
                            label="Focus Domain"
                            value={intentionForm.focusDomain}
                            onChange={(e) => setIntentionForm({ ...intentionForm, focusDomain: e.target.value })}
                            className="bg-white/5 border-white/10"
                          />
                          <NeuralInput 
                            type="number"
                            label="Energy Target"
                            value={intentionForm.energyTarget}
                            onChange={(e) => setIntentionForm({ ...intentionForm, energyTarget: parseInt(e.target.value) })}
                            className="bg-white/5 border-white/10"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                           <NeuralButton 
                             onClick={() => setIsEditingIntention(false)}
                             variant="ghost"
                             size="sm"
                             className="text-[10px] font-bold"
                           >
                             CANCEL
                           </NeuralButton>
                           <NeuralButton 
                             onClick={() => {
                               onUpdateIntention(intentionForm);
                               setIsEditingIntention(false);
                             }}
                             themeColor="cyan"
                             size="sm"
                             className="text-[10px] font-bold px-4 h-8"
                           >
                             SAVE INTENT
                           </NeuralButton>
                        </div>
                     </div>
                   ) : (
                     <>
                      <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-sky-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Focus Domain</span>
                          </div>
                          <span className="text-[10px] text-white/30 font-bold uppercase tabular-nums">
                            {profile.dailyIntentions[0].date}
                          </span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-white/90 tracking-tight uppercase leading-tight font-display">
                          {profile.dailyIntentions[0].theme}
                      </h3>
                      <div className="mt-4 flex items-center gap-4">
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            <span className="text-[10px] font-bold text-white/60 uppercase">{profile.dailyIntentions[0].focusDomain}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] font-bold text-white/30">Target: {profile.dailyIntentions[0].energyTarget}/10</span>
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
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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
                  description="Your 48-hour energy forecast will populate here. Log energy data during onboarding or check-ins."
                  className="bg-transparent border-white/10"
                />
              )}
              {/* Manual energy log — always visible on today view for non-AI users */}
              {onLogEnergy && (
                <ManualEnergyLog
                  onLogEnergy={onLogEnergy}
                  lastLoggedAt={
                    energyWave.length > 0
                      ? (energyWave[energyWave.length - 1] as { timestamp?: string }).timestamp
                      : undefined
                  }
                />
              )}
            </section>

            {/* Unified Timeline / Task timeline */}
            <section className="space-y-3">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
                Active Goals
              </h4>
              <GoalProgress
                goals={goals.filter((g) => g.status === 'active').slice(0, 3)}
                onUpdateProgress={onUpdateGoalProgress}
                onExpandGoal={noop}
              />
            </section>

            {/* ── Sprint B: Velocity + Habit Heatmaps ── */}
            <section className="space-y-4" aria-label="Sprint B insights">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
                Insights
              </h4>

              {/* Goal Velocity chart — derived from completed tasks */}
              <GoalVelocityChart tasks={profile?.tasks ?? []} />

              {/* One heatmap per active habit */}
              {habits.filter((h) => h.status === 'active').map((h) => (
                <HabitHeatmap key={h.id} habit={h} />
              ))}
            </section>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ BACKLOG TAB ══════════════ */}
        {activeTab === 'backlog' && (
           <div className="space-y-8">
              <section className="space-y-4">
                  <h3 className="text-lg font-bold font-display text-white/90">Task Backlog</h3>
                  <TaskManager
                    tasks={tasks}
                    projects={profile?.projects ?? []}
                    onCreateTask={onCreateTask}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onCompleteTask={onCompleteTask}
                    focusTaskId={focusTaskId}
                  />
              </section>
              <div className="border-t border-white/5" />
              <section className="space-y-4">
                  <h3 className="text-lg font-bold font-display text-white/90">Active Goals</h3>
                  <GoalTracker
                    goals={goals}
                    tasks={tasks}
                    onCreateGoal={onCreateGoal}
                    onUpdateGoal={onUpdateGoal}
                    onDeleteGoal={onDeleteGoal}
                    onUpdateGoalProgress={onUpdateGoalProgress}
                  />
              </section>
           </div>
        )}

        {/* ══════════════ ROUTINES TAB ══════════════ */}
        {activeTab === 'routines' && (
           <div className="space-y-8">
              <section className="space-y-3">
                 <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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
                  <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
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

        {/* ══════════════ JOURNAL TAB ══════════════ */}
        {activeTab === 'journal' && (
          <JournalTab
            profile={profile}
            userId={user?.uid ?? null}
            encryptionKey={encryptionKey}
            isLocked={isLocked}
            onSendMessage={onSendMessage}
            focusEntryId={focusJournalId}
          />
        )}

        {/* ══════════════ ANALYTICS TAB ══════════════ */}
        {activeTab === 'analytics' && (
          <AtlasAnalytics profile={profile} />
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
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold font-display text-white/90">Temporal Reviews</h3>
              <NeuralButton
                onClick={() => setIsReviewModalOpen(true)}
                themeColor="cyan"
                size="sm"
                className="text-[10px] font-black uppercase tracking-widest px-6"
              >
                Run Weekly Review
              </NeuralButton>
            </div>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
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
                description="Run your first weekly review using the button above to save a snapshot to this list."
                icon={History}
                size="lg"
              />
            )}
          </div>
        )}
      </div>
        )}
      </div>

      {/* ── Weekly Review Modal ── */}
      <WeeklyReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        soul={soul}
        energyWave={energyWave}
        scheduledTasks={profile?.scheduledTasks ?? []}
        predictiveDisplay={predictiveDisplay}
        onCompleteReview={onSaveWeeklyReview}
      />
    </div>
  );
}
