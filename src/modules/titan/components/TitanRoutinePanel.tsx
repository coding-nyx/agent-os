import React, { useState } from 'react';
import { Routine, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { getTodayWeekday } from '../utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { PanelLabel } from '@/core/components/PanelLabel';
import { RoutineBuilder } from './RoutineBuilder';
import { RestPeriodCalculator } from './RestPeriodCalculator';
import { Dumbbell, ChevronRight, MessageSquare, Clock, FileText, Plus, Pencil, MoreVertical, Play } from 'lucide-react';

interface TitanRoutinePanelProps {
  routines: Routine[];
  onAnalyzeRoutine?: (routine: Routine) => void;
  onGeneratePlan?: () => void;
  onImportRoutine?: () => void;
  /** Sends the routine to Titan AI for validation before it is committed. */
  onSubmitForApproval?: (routine: Routine) => void;
  /** Called when the user wants to log a session for a routine. */
  onStartSession?: (routine: Routine) => void;
}

const WEEKDAY_ORDER: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function TitanRoutinePanel({
  routines,
  onAnalyzeRoutine,
  onGeneratePlan,
  onImportRoutine,
  onSubmitForApproval,
  onStartSession,
}: TitanRoutinePanelProps) {
  const today = getTodayWeekday();
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | undefined>(undefined);
  const [showBuilder, setShowBuilder] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const sorted = [...(routines || [])].sort((a, b) => {
    const aIndex = WEEKDAY_ORDER.indexOf(a.weekday || 'monday');
    const bIndex = WEEKDAY_ORDER.indexOf(b.weekday || 'monday');
    return aIndex - bIndex;
  });

  const todayRoutine = sorted.find(r => r.weekday === today);

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

  // ── Empty state ──
  if (sorted.length === 0) {
    return (
      <>
        <div className="px-6 pt-3 pb-5 bg-black/40 border-b border-white/5 backdrop-blur-xl">
          <EmptyState
            title="No Training Plan Yet"
            description="Build your weekly routine manually, or let Titan generate one based on your goals and recovery state."
            icon={Dumbbell}
            action={
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 relative">
                <NeuralButton themeColor="orange" onClick={handleOpenCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Build Manually
                </NeuralButton>
                {onGeneratePlan && (
                  <NeuralButton themeColor="orange" onClick={onGeneratePlan} variant="ghost">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    AI Plan
                  </NeuralButton>
                )}
                {onImportRoutine && (
                  <div className="relative z-50">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                      title="More options"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {dropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 rounded-lg bg-white/10 border border-white/20 backdrop-blur-lg shadow-2xl z-[9999] overflow-visible">
                        <button
                          type="button"
                          onClick={() => {
                            onImportRoutine();
                            setDropdownOpen(false);
                          }}
                          className="w-full px-4 py-3 text-sm text-left text-white/80 hover:bg-white/20 transition-colors whitespace-nowrap"
                        >
                          Use an Existing Routine
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            }
          />
        </div>

        <RoutineBuilderModal
          isOpen={showBuilder}
          routine={editingRoutine}
          onSave={handleBuilderSave}
          onClose={handleBuilderClose}
        />
      </>
    );
  }

  // ── Populated state ──
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 pt-3 pb-8 bg-black/40 border-b border-white/5 backdrop-blur-xl">
        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <PanelLabel label="Weekly Plan" metadata={`${sorted.length} days`} />
            <NeuralButton size="sm" themeColor="orange" onClick={handleOpenCreate}>
              <Plus className="w-3 h-3 mr-1.5" />
              Add Day
            </NeuralButton>
          </div>
          <div className="space-y-2">
            {sorted.map((routine) => (
              <div
                key={`${routine.weekday}-${routine.id}`}
                className={cn(
                  'w-full flex items-center justify-between text-xs px-3 py-3 rounded-xl transition-all group',
                  routine.weekday === today
                    ? 'text-orange-300 font-bold bg-orange-500/10'
                    : 'text-white/60 bg-white/[0.02]'
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedRoutine(routine)}
                  className="flex-1 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="uppercase tracking-wider">{routine.weekday}</span>
                  <span className="text-white/40 truncate">{routine.name}</span>
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-white/40 mr-1">{routine.exercises.length} ex</span>
                  {onStartSession && (
                    <NeuralButton
                      size="sm"
                      onClick={() => onStartSession(routine)}
                      className="shrink-0"
                    >
                      <Play className="w-3 h-3 mr-1.5" />
                      Log Session
                    </NeuralButton>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(routine)}
                    className="p-1 rounded-lg text-white/30 hover:text-orange-400 hover:bg-orange-500/10 transition-all opacity-0 group-hover:opacity-100"
                    title="Edit routine"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRoutine(routine)}
                    className="text-white/30 hover:text-white/50 transition-colors"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <PanelLabel label="Today's Protocol" metadata={today} />
          {!todayRoutine ? (
            <div className="flex flex-col items-center text-center py-6 space-y-3">
              <p className="text-sm text-white/40 italic">Rest day — no protocol scheduled.</p>
              {onGeneratePlan && (
                <button
                  type="button"
                  onClick={onGeneratePlan}
                  className="text-xs text-orange-400/70 hover:text-orange-300 transition-colors font-medium"
                >
                  Request a session →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {todayRoutine.exercises.map((ex, idx) => (
                <button
                  key={`${todayRoutine.id}-${idx}`}
                  type="button"
                  onClick={() => setSelectedRoutine(todayRoutine)}
                  className="w-full flex items-center justify-between text-xs text-white/60 px-3 py-3 rounded-xl hover:bg-white/5 transition-all"
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-white/40 tabular-nums">{ex.sets}×{ex.reps}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleOpenEdit(todayRoutine)}
                className="w-full text-[10px] text-orange-400/60 hover:text-orange-300 transition-colors pt-1 text-center"
              >
                Edit today's routine →
              </button>
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
        themeColor="orange"
        maxWidth="lg"
      >
        {selectedRoutine && (
          <div className="space-y-7">
            {/* Routine meta */}
            {(selectedRoutine.rationale || selectedRoutine.timeframe) && (
              <div className="p-4 rounded-2xl bg-orange-500/[0.04] border border-orange-500/10 space-y-3">
                {selectedRoutine.rationale && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.25em] text-orange-400/60 block mb-1">Rationale</span>
                      <p className="text-xs text-white/70 leading-relaxed">{selectedRoutine.rationale}</p>
                    </div>
                  </div>
                )}
                {selectedRoutine.timeframe && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.25em] text-orange-400/60 block mb-1">Timeframe</span>
                      <span className="text-xs text-white/70">{selectedRoutine.timeframe}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Exercise list */}
            <div className="space-y-3">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">
                Exercises ({selectedRoutine.exercises.length})
              </span>
              <div className="space-y-3">
                {selectedRoutine.exercises.map((ex, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                          <span className="text-[10px] font-black text-orange-400">{idx + 1}</span>
                        </div>
                        <span className="text-sm font-bold text-white/90">{ex.name}</span>
                      </div>
                      <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        <span className="text-[10px] font-black text-orange-300 tabular-nums">{ex.sets}</span>
                        <span className="text-[10px] text-white/40">×</span>
                        <span className="text-[10px] font-black text-white/70 tabular-nums">{ex.reps}</span>
                      </div>
                    </div>
                    {ex.notes && (
                      <p className="text-[10px] text-white/45 leading-relaxed pl-10">{ex.notes}</p>
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
                  themeColor="orange"
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
                themeColor="orange"
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
    </>
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
      themeColor="orange"
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
