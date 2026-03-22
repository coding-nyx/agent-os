/**
 * EnhancedAtlasDashboard Component
 * Unified Timeline UI for the Atlas Module
 * Reverted visual style to original dashboard sections while keeping unified logic.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth-context';
import { GlobalProjection } from '@/lib/types';
import {
  CalendarRange,
  Inbox,
  Clock,
  Target,
  Zap,
  BookOpen,
  BarChart2,
  Settings,
  X,
  ChevronDown,
  Crosshair
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
import { MonthPlanner } from './MonthPlanner';
import { DayTaskPanel } from './DayTaskPanel';
import { QuickCaptureBar } from './QuickCaptureBar';
import { JournalTab } from './journal/JournalTab';
import { AtlasAnalytics } from './AtlasAnalytics';
import { WeeklyReviewCard } from './WeeklyReviewModal';
import { PortalledModal } from './shared/PortalledModal';
import { useAtlasActions } from '../context/AtlasActionsContext';
import { motion } from 'framer-motion';

type AtlasTab = 'dashboard' | 'backlog' | 'rhythms' | 'journal' | 'insights';
type AtlasView = 'today' | 'week' | 'month' | 'focus';

interface EnhancedAtlasDashboardProps {
  soul: GlobalProjection | null;
  profile: AtlasProfile | null;
  isLocked?: boolean;
  activeTab?: AtlasTab;
  activeView?: AtlasView;
  extensions?: import('@/lib/field-system/types').FieldDefinition[];
  fieldValues?: Record<string, import('@/lib/field-system/types').FieldValue>;
  /** Encryption key for vault-gated journal tab */
  encryptionKey?: CryptoKey | null;
  /** S9-005: Weekly review pending indicator */
  weeklyReviewPending?: boolean;
  /** S9-007: Set true to force-show the morning brief card (from Spine event) */
  morningBriefVisible?: boolean;
  /** S9-007: Set true to force-show the evening check-in card (from Spine event) */
  eveningCheckinVisible?: boolean;
  /** S9-001: Evaluated Atlas predictive state — sourced from useAtlasPredictiveState in AtlasPage. */
  predictiveDisplay: AtlasStateDisplay;
  /** Optional focus target from deep links (e.g., task:ID, journal:ID). */
  focusId?: string;
}

function ViewDropdown({ activeView, onViewChange }: { activeView: string; onViewChange: (v: any) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 8, left: rect.left });
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isOpen]);

  return (
    <div className="relative flex items-center ml-1">
      <button
        ref={triggerRef}
        onClick={toggle}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md transition-all duration-200 text-white/40 hover:text-white/90",
          isOpen ? "bg-[var(--module-color-400)]/20 text-white/90" : "hover:bg-white/10"
        )}
        aria-label="View options"
      >
        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && createPortal(
        <div 
          className="fixed w-32 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-1 z-[1000] overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
        >
          {(['today', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={(e) => {
                e.stopPropagation();
                onViewChange(v);
                setIsOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
                activeView === v ? "text-[var(--module-color-400)] bg-white/5" : "text-white/40 hover:text-white/70 hover:bg-white/5"
              )}
            >
              {v}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const noop = () => {};

export function EnhancedAtlasDashboard({
  soul,
  profile,
  isLocked = false,
  activeTab = 'dashboard',
  activeView = 'today',
  extensions = [],
  fieldValues = {},
  encryptionKey = null,
  weeklyReviewPending = false,
  morningBriefVisible = false,
  eveningCheckinVisible = false,
  predictiveDisplay,
  focusId,
}: EnhancedAtlasDashboardProps) {
  const actions = useAtlasActions();
  const [isEditingIntention, setIsEditingIntention] = useState(false);
  const [intentionForm, setIntentionForm] = useState({ theme: '', focusDomain: '', energyTarget: 5 });

  // New Phase-1 state — must live before any early returns (Rules of Hooks)
  const { user } = useAuth();
  const [morningDismissed, setMorningDismissed] = useState(false);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string | undefined>(undefined);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>(undefined);
  const [focusJournalId, setFocusJournalId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!focusId) return;
    if (focusId.startsWith('task:')) {
      const id = focusId.replace('task:', '');
      setFocusTaskId(id);
      actions.onTabChange('backlog');
    } else if (focusId.startsWith('journal:')) {
      const id = focusId.replace('journal:', '');
      setFocusJournalId(id);
      actions.onTabChange('journal');
    }
  }, [focusId, actions]);

  const queuedCount = profile?.tasks.filter(t => t.status === 'queued').length;
  const tabs = useMemo<NeuralTabItem<AtlasTab>[]>(() => [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: CalendarRange,
      renderRight: (isActive) => isActive ? (
        <ViewDropdown activeView={activeView} onViewChange={actions.onViewChange} />
      ) : null
    },
    { id: 'backlog', label: 'Backlog', icon: Inbox, badge: queuedCount || undefined },
    { id: 'rhythms', label: 'Rhythms', icon: Clock },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    {
      id: 'insights',
      label: 'Insights',
      icon: BarChart2,
      badge: weeklyReviewPending ? '●' : undefined,
      badgeVariant: weeklyReviewPending ? 'warning' : undefined,
    },
  ], [queuedCount, weeklyReviewPending, activeView, actions.onViewChange]);

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
            accentClassName="text-[var(--module-color-400)]"
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
        <div className="flex items-center gap-2 shrink-0">
          <NeuralButton
            onClick={() => actions.onViewChange('focus')}
            title="Focus Mode"
            variant={activeView === 'focus' ? 'primary' : 'secondary'}
            size="sm"
            className="h-9 px-3 rounded-full gap-2"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Focus</span>
          </NeuralButton>
          <NeuralButton
            onClick={() => setIsFieldsModalOpen(true)}
            title="Atlas Settings"
            variant="secondary"
            size="sm"
            className="h-9 w-9 p-0 rounded-full"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </NeuralButton>
        </div>
      </header>

      {/* ── Tab Navigation (Desktop) ── */}
      <div className="border-b border-white/5 relative z-10 px-[var(--atlas-space-page-x)]">
        <NeuralTabGroup
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => {
            actions.onTabChange(tab);
            if (tab === 'insights' && weeklyReviewPending) actions.onReviewOpened();
          }}
          themeColor="module"
        />
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden flex">
        {/* ── Focus mode: full-bleed wrapper — bypasses padded scroll container ── */}
        {activeTab === 'dashboard' && activeView === 'focus' && (
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <FocusView
              activeTask={tasks.find(t => t.status === 'active' || t.status === 'queued') ?? null}
              energyLevel={energyBudget}
              onComplete={actions.onCompleteTask}
              onDefer={(id) => actions.onUpdateTask(id, { status: 'deferred' })}
              onOpenChat={() => window.dispatchEvent(new CustomEvent('atlas:focus-chat'))}
            />
          </div>
        )}

        {/* ── Normal scroll container: token-based padding, section spacing ── */}
        {!(activeTab === 'dashboard' && activeView === 'focus') && (
        <div
          className="flex-1 overflow-y-auto no-scrollbar space-y-4"
          style={{ padding: 'var(--atlas-space-block) var(--atlas-space-page-x)' }}
        >
        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* ── Quick Capture Bar — always visible on Dashboard ── */}
            <QuickCaptureBar
              onAddTask={actions.onCreateTask}
              onAddHabit={actions.onCreateHabit}
              onAddGoal={actions.onCreateGoal}
              disabled={isLocked}
            />

            {/* ── Today view: MorningCheckIn + PriorityInbox + TodaysPlanCard ── */}
            {profile && activeView === 'today' && (
              <div className="space-y-6">
                {(morningBriefVisible || (!morningDismissed && shouldShowMorningCheckIn(user?.uid))) && (
                  <MorningCheckIn
                    profile={profile}
                    soul={soul}
                    userId={user?.uid ?? null}
                    onDismiss={() => {
                      setMorningDismissed(true);
                      actions.onMorningBriefDismiss();
                    }}
                    onSendMessage={actions.onSendMessage}
                    predictiveState={predictiveDisplay.state}
                  />
                )}
                <PriorityInbox
                  tasks={profile?.tasks ?? []}
                  energyBudget={energyBudget}
                  onCompleteTask={actions.onCompleteTask}
                  onDeferTask={(id) => actions.onUpdateTask(id, { status: 'deferred' as const })}
                  onSendMessage={actions.onSendMessage}
                />
                {(eveningCheckinVisible || shouldShowEveningCheckIn(user?.uid)) && profile && (
                  <EveningCheckIn
                    profile={profile}
                    userId={user?.uid}
                    onDismiss={actions.onEveningCheckinDismiss}
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
              <div className="space-y-4">
            {/* Daily Intention & Focus */}
            {profile?.dailyIntentions && profile.dailyIntentions.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
                    Today's Intent
                  </h4>
                  {!isEditingIntention && (
                    <NeuralButton 
                      onClick={() => {
                        const current = profile.dailyIntentions[0];
                        setIntentionForm({ 
                          theme: current.theme, 
                          focusDomain: current.focusDomain, 
                          energyTarget: current.energyTarget 
                        });
                        setIsEditingIntention(true);
                      }}
                      variant="ghost" size="sm" themeColor="module" className="text-[10px] text-[var(--module-color-400)] font-bold hover:text-[var(--module-color-300)] transition-colors" aria-label="Edit daily intent"
                    >
                      EDIT INTENT
                    </NeuralButton>
                  )}
                </div>
                <div className="p-5 rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] backdrop-blur-md">
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
                               actions.onUpdateIntention(intentionForm);
                               setIsEditingIntention(false);
                             }}
                             themeColor="module"
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
                            <Target className="w-4 h-4 text-[var(--module-color-400)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--module-color-400)]">Focus Domain</span>
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
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--module-color-400)]" />
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
                accentClassName={energyBudget < 4 ? 'text-amber-300' : 'text-[var(--module-color-300)]'}
              />
              <StatCard
                label="Focus Score"
                value={focusScore}
                isEmpty={false}
                accentClassName={focusScore < 4 ? 'text-red-400' : 'text-[var(--module-color-300)]'}
              />
              <StatCard
                label="Active Load"
                value={activeLoad}
                isEmpty={false}
                accentClassName={activeLoad > 7 ? 'text-red-400' : 'text-[var(--module-color-300)]'}
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
                onComplete={actions.onCompleteTask}
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
                onComplete={actions.onCompleteHabit}
                onPause={actions.onPauseHabit}
              />
            </section>

            {/* Active goals snapshot */}
            <section className="space-y-3">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">
                Active Goals
              </h4>
              <GoalProgress
                goals={goals.filter((g) => g.status === 'active').slice(0, 3)}
                onUpdateProgress={actions.onUpdateGoalProgress}
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
                    onCreateTask={actions.onCreateTask}
                    onUpdateTask={actions.onUpdateTask}
                    onDeleteTask={actions.onDeleteTask}
                    onCompleteTask={actions.onCompleteTask}
                    focusTaskId={focusTaskId}
                  />
              </section>
              <div className="border-t border-white/5" />
              <section className="space-y-4">
                  <h3 className="text-lg font-bold font-display text-white/90">Active Goals</h3>
                  <GoalTracker
                    goals={goals}
                    tasks={tasks}
                    onCreateGoal={actions.onCreateGoal}
                    onUpdateGoal={actions.onUpdateGoal}
                    onDeleteGoal={actions.onDeleteGoal}
                    onUpdateGoalProgress={actions.onUpdateGoalProgress}
                  />
              </section>
           </div>
        )}

        {/* ══════════════ RHYTHMS TAB ══════════════ */}
        {activeTab === 'rhythms' && (
           <div className="space-y-8">
              <section className="space-y-3">
                 <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-bold font-display text-white/90">Weekly Template</h3>
                    <p className="text-xs text-white/40">Define your ideal week structure and recurring time blocks.</p>
                 </div>
                 {profile && (
                    <RoutineEditor 
                      routine={profile.routine}
                      onUpdate={actions.onUpdateRoutine}
                    />
                 )}
              </section>
              
              <section className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-bold font-display text-white/90">Daily Habits</h3>
                    <p className="text-xs text-white/40">Small, consistent actions that build long-term momentum.</p>
                  </div>
                  <HabitBuilder
                    habits={habits}
                    onCreateHabit={actions.onCreateHabit}
                    onUpdateHabit={actions.onUpdateHabit}
                    onDeleteHabit={actions.onDeleteHabit}
                    onCompleteHabit={actions.onCompleteHabit}
                    onPauseHabit={actions.onPauseHabit}
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
            onSendMessage={actions.onSendMessage}
            focusEntryId={focusJournalId}
          />
        )}

        {/* ══════════════ INSIGHTS TAB ══════════════ */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            <WeeklyReviewCard
              soul={soul}
              energyWave={energyWave}
              scheduledTasks={profile?.scheduledTasks ?? []}
              predictiveDisplay={predictiveDisplay}
              weeklyReviewPending={weeklyReviewPending}
              onOpenReview={() => setIsReviewModalOpen(true)}
            />
            
            <div className="border-t border-white/5 pt-6">
              <h3 className="text-lg font-bold font-display text-white/90 mb-4">Historical Analytics</h3>
              <AtlasAnalytics profile={profile} />
            </div>

            {profile?.reviews && profile.reviews.length > 0 && (
              <div className="space-y-4 border-t border-white/5 pt-6">
                <h3 className="text-lg font-bold font-display text-white/90">Past Reviews</h3>
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
                          <p className="text-lg font-bold text-[var(--module-color-400)] mt-1">
                            {review.nsvTrend?.energyBudgetAvg ?? '-'}/10
                          </p>
                        </div>
                        <div>
                          <span className="text-white/40">Avg Focus</span>
                          <p className="text-lg font-bold text-[var(--module-color-400)] mt-1">
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
                                      <li key={i} className="text-xs text-[var(--module-color-300)]">{ins}</li>
                                  ))}
                              </ul>
                          </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
        onCompleteReview={actions.onSaveWeeklyReview}
      />

      {/* ── Fields/Settings Modal ── */}
      <PortalledModal
        isOpen={isFieldsModalOpen}
        onClose={() => setIsFieldsModalOpen(false)}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold font-display text-white/90">Atlas Settings</h2>
            <p className="text-xs text-white/40">Manage your Atlas module extensions and custom fields.</p>
          </div>
          <NeuralButton
            onClick={() => setIsFieldsModalOpen(false)}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </NeuralButton>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <FieldsTab
            extensions={extensions}
            fieldValues={fieldValues}
            onAddField={actions.onAddField}
            onDeleteField={actions.onDeleteField}
          />
        </div>
      </PortalledModal>

    </div>
  );
}