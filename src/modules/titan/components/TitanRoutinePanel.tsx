import React, { useState } from 'react';
import { Routine, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ProgramTemplateSelector } from './ProgramTemplateSelector';
import { EmptyState } from '@/core/components/EmptyState';
import { getTodayWeekday } from '../utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import { RoutineBuilder } from './RoutineBuilder';
import { RestPeriodCalculator } from './RestPeriodCalculator';
import { Dumbbell, ChevronRight, MessageSquare, Clock, FileText, Plus, Pencil, MoreVertical, Play, ChevronDown, ChevronUp, LayoutTemplate, Trash2 } from 'lucide-react';

import { ActiveProgramDashboard } from './ActiveProgramDashboard';
import { ProgramBuilderModal } from './ProgramBuilderModal';
import { TitanProfile, PlannedWorkout } from '@/lib/types';

interface TitanRoutinePanelProps {
  routines: Routine[];
  activeProgram?: TitanProfile['activeProgram'];
  plannedWorkouts?: PlannedWorkout[];
  onAnalyzeRoutine?: (routine: Routine) => void;
  onGeneratePlan?: () => void;
  onImportRoutine?: () => void;
  onSubmitForApproval?: (routine: Routine) => void;
  onStartSession?: (routine: Routine) => void;
  onApplyProgram?: (routines: Routine[], programName: string, programId?: string, durationWeeks?: number, phases?: { name: string; weeks: [number, number] }[]) => void;
  onClearProgram?: () => void;
  onUpdateProgram?: (updates: Partial<NonNullable<TitanProfile['activeProgram']>>) => void;
}

const WEEKDAY_ORDER: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const SHORT_DAY: Record<string, string> = {
  monday: 'MON', tuesday: 'TUE', wednesday: 'WED',
  thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN',
};

export function TitanRoutinePanel({
  routines,
  activeProgram,
  plannedWorkouts,
  onAnalyzeRoutine,
  onGeneratePlan,
  onImportRoutine,
  onSubmitForApproval,
  onStartSession,
  onApplyProgram,
  onClearProgram,
  onUpdateProgram,
}: TitanRoutinePanelProps) {
  const today = getTodayWeekday();
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | undefined>(undefined);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);

  const sorted = [...(routines || [])].sort((a, b) => {
    const aIndex = WEEKDAY_ORDER.indexOf(a.weekday || 'monday');
    const bIndex = WEEKDAY_ORDER.indexOf(b.weekday || 'monday');
    return aIndex - bIndex;
  });

  const todayRoutine = sorted.find(r => r.weekday === today);
  const otherRoutines = sorted.filter(r => r.weekday !== today);

  const handleOpenCreate = () => {
    setEditingRoutine(undefined);
    setShowBuilder(true);
  };

  const handleOpenEdit = (routine: Routine) => {
    setEditingRoutine(routine);
    setSelectedRoutine(null);
    setShowBuilder(true);
  };

  const handleBuilderSave = (routine: Routine) => {
    setShowBuilder(false);
    setEditingRoutine(undefined);
    onSubmitForApproval?.(routine);
  };

  const handleBuilderClose = () => {
    setShowBuilder(false);
    setEditingRoutine(undefined);
  };

  const handleProgramSave = (newRoutines: Routine[], name: string, duration: number, phases: { name: string; weeks: [number, number] }[]) => {
    setShowProgramBuilder(false);
    onApplyProgram?.(newRoutines, name, crypto.randomUUID(), duration, phases);
  };

  // ── Empty state ──
  if (sorted.length === 0) {
    return (
      <>
        <div className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-5 sm:pb-6 bg-slate-900/70 border-b border-white/[0.09] backdrop-blur-xl">
          <EmptyState
            title="No Training Plan Yet"
            description="Build your weekly routine manually, or let Titan generate one based on your goals and recovery state."
            icon={Dumbbell}
            action={
              <div className="flex flex-row flex-wrap items-center justify-center gap-3 pt-1 relative">
                <NeuralButton onClick={handleOpenCreate} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Build Routine
                </NeuralButton>
                {onApplyProgram && (
                  <NeuralButton onClick={() => setShowProgramBuilder(true)} variant="outline">
                    <LayoutTemplate className="w-4 h-4 mr-2" />
                    Build Program
                  </NeuralButton>
                )}
                {onGeneratePlan && (
                  <NeuralButton onClick={onGeneratePlan} variant="ghost">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    AI Plan
                  </NeuralButton>
                )}
                {onImportRoutine && (
                  <div className="relative z-50">
                    <NeuralButton
                      variant="ghost"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="p-2 h-10 w-10 min-w-0"
                      title="More options"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </NeuralButton>
                    {dropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 rounded-lg bg-white/10 border border-white/20 backdrop-blur-lg shadow-2xl z-[9999] overflow-visible">
                        <NeuralButton
                          variant="ghost"
                          onClick={() => {
                            onImportRoutine();
                            setDropdownOpen(false);
                          }}
                          className="w-full px-4 py-3 justify-start rounded-none hover:bg-white/20"
                        >
                          Use an Existing Routine
                        </NeuralButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            }
          />
        </div>

        {/* ── Quick-Start Programs (empty state) ── */}
        {onApplyProgram && (
          <QuickStartSection
            show={showQuickStart}
            onToggle={() => setShowQuickStart((v) => !v)}
            onApplyProgram={onApplyProgram}
          />
        )}

        <RoutineBuilderModal
          isOpen={showBuilder}
          routine={editingRoutine}
          onSave={handleBuilderSave}
          onClose={handleBuilderClose}
        />
        {onApplyProgram && (
          <ProgramBuilderModal
            isOpen={showProgramBuilder}
            onClose={() => setShowProgramBuilder(false)}
            onSave={(r, n, d, p) => handleProgramSave(r, n, d, p ?? [])}
            existingRoutines={routines}
          />
        )}
      </>
    );
  }

  // ── Populated state ──
  return (
    <>
      {/* ── Quick-Start Programs (populated state) ── */}
      {onApplyProgram && !activeProgram && (
        <QuickStartSection
          show={showQuickStart}
          onToggle={() => setShowQuickStart((v) => !v)}
          onApplyProgram={onApplyProgram}
        />
      )}

      {/* ── Active Program Dashboard ── */}
      {activeProgram && (
        <div className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-2">
          <ActiveProgramDashboard
            activeProgram={activeProgram}
            plannedWorkouts={plannedWorkouts ?? []}
            routines={routines}
            onClearProgram={onClearProgram!}
            onUpdateProgram={onUpdateProgram!}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6 px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-5 sm:pb-6 md:pb-8 bg-slate-900/70 border-b border-white/[0.09] backdrop-blur-xl">

        {/* ── Weekly Plan ── */}
        <SurfaceCard className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-white/[0.09]">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] uppercase tracking-[0.25em] font-bold text-white/40">Weekly Plan</span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.045] border border-white/[0.09] text-[11px] font-bold text-white/30 tabular-nums tracking-[0.1em]">{sorted.length} DAYS</span>
            </div>
            <div className="flex items-center gap-1">
              {onClearProgram && (
                <NeuralIconButton
                  size="sm"
                  variant="ghost"
                  onClick={onClearProgram}
                  title="Clear Program"
                  aria-label="Clear Program"
                  icon={<Trash2 className="w-3.5 h-3.5 text-red-500/70" />}
                />
              )}
              <NeuralIconButton
                size="sm"
                onClick={handleOpenCreate}
                title="Add Day"
                aria-label="Add Day"
                icon={<Plus className="w-4 h-4" />}
              />
              {onApplyProgram && (
                <NeuralIconButton
                  size="sm"
                  onClick={() => setShowProgramBuilder(true)}
                  title="Create Full Program"
                  aria-label="Create Full Program"
                  icon={<LayoutTemplate className="w-4 h-4" />}
                />
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col p-3 gap-1.5">
            {/* Today featured row */}
            {todayRoutine ? (
              <div className="rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] shadow-[0_0_28px_rgba(255,140,0,0.06)] p-3.5 mb-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--module-accent)] flex flex-col items-center justify-center shrink-0 shadow-[0_0_18px_rgba(255,140,0,0.25)]">
                      <span className="text-[11px] font-black text-white/70 uppercase tracking-[0.1em] leading-none">
                        {SHORT_DAY[today] ?? today.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="text-[7px] text-white/40 uppercase tracking-[0.08em] mt-0.5 leading-none">today</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] sm:text-sm font-bold text-[var(--module-color-200)] truncate leading-tight">{todayRoutine.name}</p>
                      <p className="text-[11px] text-[var(--module-color-400)]/55 mt-0.5 tracking-[0.06em]">
                        {todayRoutine.exercises.length} exercise{todayRoutine.exercises.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <NeuralButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(todayRoutine)}
                      className="w-8 h-8 p-0 min-h-0 text-[var(--module-color-400)]/40 hover:text-[var(--module-color-300)] hover:bg-[var(--module-accent)] transition-all rounded-lg"
                      title="Edit routine"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </NeuralButton>
                    {onStartSession && (
                      <NeuralButton
                        size="sm"
                        onClick={() => onStartSession(todayRoutine)}
                        className="h-8 px-3 min-h-0 text-[11px] uppercase tracking-[0.14em] font-bold"
                        title="Log Session"
                      >
                        <Play className="w-3 h-3 mr-1.5" />
                        Log
                      </NeuralButton>
                    )}
                    <NeuralButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRoutine(todayRoutine)}
                      className="w-8 h-8 p-0 min-h-0 text-[var(--module-color-400)]/30 hover:text-[var(--module-color-300)] transition-colors rounded-lg"
                      aria-label="View details"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </NeuralButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.09] px-4 py-3 mb-1 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.045] border border-white/[0.09] flex flex-col items-center justify-center shrink-0">
                  <span className="text-[11px] font-black text-white/25 uppercase tracking-[0.1em] leading-none">
                    {SHORT_DAY[today] ?? today.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="text-[7px] text-white/20 uppercase tracking-[0.08em] mt-0.5 leading-none">today</span>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-white/30">Rest Day</p>
                  {onGeneratePlan && (
                    <NeuralButton
                      variant="ghost"
                      onClick={onGeneratePlan}
                      className="text-[11px] text-[var(--module-color-400)]/50 hover:text-[var(--module-color-400)] h-auto min-h-0 p-0 mt-0.5"
                    >
                      Request a session →
                    </NeuralButton>
                  )}
                </div>
              </div>
            )}

            {/* Other days */}
            {otherRoutines.map((routine) => (
              <div
                key={`${routine.weekday}-${routine.id}`}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-white/[0.09] hover:bg-white/[0.045] transition-all cursor-pointer"
                onClick={() => setSelectedRoutine(routine)}
              >
                <span className="w-[2.25rem] text-[11px] uppercase tracking-[0.18em] font-bold text-white/30 shrink-0">
                  {SHORT_DAY[routine.weekday ?? ''] ?? (routine.weekday ?? '')}
                </span>
                <span className="flex-1 text-[12px] text-white/50 font-medium truncate">{routine.name}</span>
                <span className="text-[11px] text-white/25 tabular-nums shrink-0">{routine.exercises.length} ex</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {onStartSession && (
                    <NeuralIconButton
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onStartSession(routine); }}
                      title="Log Session"
                      className="w-7 h-7 min-h-0 p-0"
                      icon={<Play className="w-3 h-3" />}
                    />
                  )}
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleOpenEdit(routine); }}
                    className="w-7 h-7 min-h-0 p-0 text-white/30 hover:text-white/60 rounded-lg"
                    title="Edit"
                  >
                    <Pencil className="w-3 h-3" />
                  </NeuralButton>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        {/* ── Today's Protocol ── */}
        <SurfaceCard className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-white/[0.09]">
            <span className="text-[11px] uppercase tracking-[0.25em] font-bold text-white/40">Today's Protocol</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/25 tabular-nums">{today}</span>
          </div>

          {!todayRoutine ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-5 gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.045] border border-white/[0.09] flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-white/20" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white/35">Rest Day</p>
                <p className="text-[11px] text-white/20">No protocol scheduled for today.</p>
              </div>
              {onGeneratePlan && (
                <NeuralButton variant="outline" size="sm" onClick={onGeneratePlan} className="mt-1">
                  <MessageSquare className="w-3.5 h-3.5 mr-2" />
                  Request a Session
                </NeuralButton>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Start session CTA */}
              {onStartSession && (
                <div className="px-3 pt-3">
                  <NeuralButton
                    onClick={() => onStartSession(todayRoutine)}
                    className="w-full h-10 text-[11px] uppercase tracking-[0.18em] font-bold"
                  >
                    <Play className="w-3.5 h-3.5 mr-2" />
                    Start Session
                  </NeuralButton>
                </div>
              )}

              {/* Exercise list */}
              <div className="flex-1 px-3 pt-3 pb-2 space-y-1.5">
                {todayRoutine.exercises.map((ex, idx) => (
                  <div
                    key={`${todayRoutine.id}-${idx}`}
                    onClick={() => setSelectedRoutine(todayRoutine)}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-white/[0.09] bg-gradient-to-r from-white/[0.03] to-transparent hover:from-white/[0.05] hover:border-white/[0.09] transition-all cursor-pointer group"
                  >
                    <span className="w-5 text-[11px] font-black tabular-nums shrink-0 text-right text-[var(--module-color-400)]/40">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-[13px] font-semibold text-white/70 group-hover:text-white/85 truncate transition-colors">{ex.name}</span>
                    {ex.muscleGroups && ex.muscleGroups.length > 0 && (
                      <span className="hidden sm:block text-[11px] uppercase tracking-[0.12em] text-white/20 shrink-0 truncate max-w-[5rem]">
                        {ex.muscleGroups[0]}
                      </span>
                    )}
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)] font-bold tabular-nums text-[11px] sm:text-[11px]">
                      {ex.sets}×{ex.reps}
                    </span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-3 pb-3 border-t border-white/[0.09] pt-2">
                <NeuralButton
                  variant="ghost"
                  onClick={() => handleOpenEdit(todayRoutine)}
                  className="w-full text-[11px] uppercase tracking-[0.14em] text-[var(--module-color-400)]/40 hover:text-[var(--module-color-400)]/70 transition-colors h-8 min-h-0 font-semibold"
                >
                  Edit today's routine
                </NeuralButton>
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Routine Detail Modal */}
      <NeuralModal
        isOpen={!!selectedRoutine}
        onClose={() => setSelectedRoutine(null)}
        title={selectedRoutine?.name || 'Routine Detail'}
        subtitle={selectedRoutine?.weekday?.toUpperCase()}
        icon={Dumbbell}
        themeColor="module"
        maxWidth="lg"
      >
        {selectedRoutine && (
          <div className="space-y-7">
            {/* Routine meta */}
            {(selectedRoutine.rationale || selectedRoutine.timeframe) && (
              <div className="p-4 rounded-2xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] space-y-3">
                {selectedRoutine.rationale && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-3.5 h-3.5 text-[var(--module-color-400)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--module-color-400)] block mb-1">Rationale</span>
                      <p className="text-xs text-white/70 leading-relaxed">{selectedRoutine.rationale}</p>
                    </div>
                  </div>
                )}
                {selectedRoutine.timeframe && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-3.5 h-3.5 text-[var(--module-color-400)] shrink-0" />
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--module-color-400)] block mb-1">Timeframe</span>
                      <span className="text-xs text-white/70">{selectedRoutine.timeframe}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Exercise list */}
            <div className="space-y-3">
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50">
                Exercises ({selectedRoutine.exercises.length})
              </span>
              <div className="space-y-3">
                {selectedRoutine.exercises.map((ex, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-white/[0.12] bg-white/[0.045] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
                          <span className="text-[11px] font-black text-[var(--module-color-400)]">{idx + 1}</span>
                        </div>
                        <span className="text-sm font-bold text-white/90">{ex.name}</span>
                      </div>
                      <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.045] border border-white/[0.12]">
                        <span className="text-[11px] font-black text-[var(--module-color-300)] tabular-nums">{ex.sets}</span>
                        <span className="text-[11px] text-white/40">×</span>
                        <span className="text-[11px] font-black text-white/70 tabular-nums">{ex.reps}</span>
                      </div>
                    </div>
                    {ex.notes && (
                      <p className="text-[11px] text-white/45 leading-relaxed pl-10">{ex.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Rest period calculator */}
            <RestPeriodCalculator />

            {/* Actions */}
            <div className="flex gap-3">
              {onAnalyzeRoutine && (
                <NeuralButton
                  size="xl"
                  className="flex-1"
                  onClick={() => {
                    onAnalyzeRoutine(selectedRoutine);
                    setSelectedRoutine(null);
                  }}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Analyze Protocol
                </NeuralButton>
              )}
              <NeuralButton
                size="xl"
                variant="ghost"
                onClick={() => handleOpenEdit(selectedRoutine)}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </NeuralButton>
            </div>
          </div>
        )}
      </NeuralModal>

      {/* Routine Builder Modal */}
      <RoutineBuilderModal
        isOpen={showBuilder}
        routine={editingRoutine}
        onSave={handleBuilderSave}
        onClose={handleBuilderClose}
      />
      {onApplyProgram && (
        <ProgramBuilderModal
          isOpen={showProgramBuilder}
          onClose={() => setShowProgramBuilder(false)}
          onSave={(r, n, d, p) => handleProgramSave(r, n, d, p ?? [])}
          existingRoutines={routines}
        />
      )}
    </>
  );
}

// ── QuickStartSection ────────────────────────────────────────────────────────

interface QuickStartSectionProps {
  show: boolean;
  onToggle: () => void;
  onApplyProgram: (routines: Routine[], programName: string) => void;
}

function QuickStartSection({ show, onToggle, onApplyProgram }: QuickStartSectionProps) {
  return (
    <div className="border-b border-white/[0.09]">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 md:px-8 py-3 hover:bg-white/[0.045] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent)]/40"
        aria-expanded={show}
      >
        <div className="flex items-center gap-2.5">
          <LayoutTemplate className="w-3.5 h-3.5 text-[var(--module-color-400)]/60 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            Quick-Start Programs
          </span>
        </div>
        <div className="text-white/25">
          {show ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Collapsible body */}
      {show && (
        <div className="px-4 sm:px-6 md:px-8 pb-5 pt-1">
          <ProgramTemplateSelector onApplyProgram={onApplyProgram} />
        </div>
      )}
    </div>
  );
}

// ── RoutineBuilder wrapped in NeuralModal ─────────────────────────────────────

interface RoutineBuilderModalProps {
  isOpen: boolean;
  routine?: Routine;
  onSave: (routine: Routine) => void;
  onClose: () => void;
}

function RoutineBuilderModal({ isOpen, routine, onSave, onClose }: RoutineBuilderModalProps) {
  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={routine ? `Edit — ${routine.name}` : 'New Routine'}
      subtitle={routine ? routine.weekday?.toUpperCase() : 'Build your protocol'}
      icon={Dumbbell}
      themeColor="module"
      maxWidth="2xl"
    >
      <RoutineBuilder
        routine={routine}
        onSave={onSave}
        onCancel={onClose}
      />
    </NeuralModal>
  );
}
