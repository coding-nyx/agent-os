import React, { useState } from 'react';
import { Routine, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday } from '../utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { Dumbbell, ChevronRight, MessageSquare, Clock, FileText } from 'lucide-react';

interface TitanRoutinePanelProps {
  routines: Routine[];
  onAnalyzeRoutine?: (routine: Routine) => void;
}

const WEEKDAY_ORDER: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function TitanRoutinePanel({ routines, onAnalyzeRoutine }: TitanRoutinePanelProps) {
  const today = getTodayWeekday();
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  
  const sorted = [...(routines || [])].sort((a, b) => {
    const aIndex = WEEKDAY_ORDER.indexOf(a.weekday || 'monday');
    const bIndex = WEEKDAY_ORDER.indexOf(b.weekday || 'monday');
    return aIndex - bIndex;
  });

  const todayRoutine = sorted.find(r => r.weekday === today);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 pt-4 pb-6 bg-black/40 border-b border-white/5 backdrop-blur-xl">
        <SurfaceCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Weekly Plan</span>
            <span className="text-[9px] font-mono uppercase text-white/40">{sorted.length} days</span>
          </div>
          {sorted.length === 0 ? (
            <EmptyState
              size="sm"
              title="No routine on file"
              description="Ask Titan to generate a weekly plan."
              className="bg-transparent border-white/10"
            />
          ) : (
            <div className="space-y-1">
              {sorted.map((routine) => (
                <button
                  key={`${routine.weekday}-${routine.id}`}
                  type="button"
                  onClick={() => setSelectedRoutine(routine)}
                  className={cn(
                    'w-full flex items-center justify-between text-[10px] px-3 py-2 rounded-xl transition-all group',
                    routine.weekday === today
                      ? 'text-orange-300 font-bold bg-orange-500/10 hover:bg-orange-500/20'
                      : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                  )}
                >
                  <span className="uppercase tracking-wider">{routine.weekday}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white/50">{routine.exercises.length} exercises</span>
                    <ChevronRight className="w-3 h-3 text-white/30 group-hover:text-white/50 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Today&apos;s Protocol</span>
            <span className="text-[9px] font-mono uppercase text-white/40 italic">{today}</span>
          </div>
          {!todayRoutine ? (
            <EmptyState
              size="sm"
              title="No protocol scheduled"
              description="Titan can generate a recovery or strength session."
              className="bg-transparent border-white/10"
            />
          ) : (
            <div className="space-y-2">
              {todayRoutine.exercises.map((ex, idx) => (
                <button
                  key={`${todayRoutine.id}-${idx}`}
                  type="button"
                  onClick={() => setSelectedRoutine(todayRoutine)}
                  className="w-full flex items-center justify-between text-[10px] text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-white/50">
                    {ex.sets}x{ex.reps}
                  </span>
                </button>
              ))}
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
          <div className="space-y-6">
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
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">
                  Exercises ({selectedRoutine.exercises.length})
                </span>
              </div>
              <div className="space-y-2">
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

            {/* Analyze action */}
            {onAnalyzeRoutine && (
              <NeuralButton
                size="xl"
                className="w-full"
                onClick={() => {
                  onAnalyzeRoutine(selectedRoutine);
                  setSelectedRoutine(null);
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Analyze with Titan
              </NeuralButton>
            )}
          </div>
        )}
      </NeuralModal>
    </>
  );
}
