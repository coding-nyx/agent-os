/**
 * CycleManager - View and manage active/completed cycles
 * All mutations go through Titan AI via onSubmitForApproval (AI-gated write path)
 */

import React, { useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RefreshCw, Plus, CheckCircle, PauseCircle, ChevronRight, MessageSquare, Beaker, Dumbbell, Heart, Apple, Zap, Settings } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import type { CycleEntry, CycleType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CycleManagerProps {
  cycles: CycleEntry[];
  /** Routes the user's cycle request to Titan AI for validation + commit */
  onSubmitForApproval: (prompt: string) => void;
  className?: string;
}

const CYCLE_TYPE_META: Record<CycleType, { label: string; icon: LucideIcon; color: string }> = {
  supplement: { label: 'Supplement', icon: Beaker, color: 'text-orange-400' },
  workout:    { label: 'Workout',    icon: Dumbbell, color: 'text-blue-400' },
  hormonal:   { label: 'Hormonal',  icon: Heart, color: 'text-rose-400' },
  nutrition:  { label: 'Nutrition', icon: Apple, color: 'text-green-400' },
  recovery:   { label: 'Recovery',  icon: Zap, color: 'text-purple-400' },
  custom:     { label: 'Custom',    icon: Settings, color: 'text-white/60' },
};

const STATUS_ICON: Record<CycleEntry['status'], LucideIcon> = {
  active:    RefreshCw,
  completed: CheckCircle,
  paused:    PauseCircle,
};

const STATUS_COLOR: Record<CycleEntry['status'], string> = {
  active:    'text-orange-400',
  completed: 'text-green-400',
  paused:    'text-white/40',
};

function CycleCard({
  cycle,
  onSelect,
}: {
  cycle: CycleEntry;
  onSelect: (c: CycleEntry) => void;
}) {
  const typeMeta = CYCLE_TYPE_META[cycle.type] ?? CYCLE_TYPE_META.custom;
  const TypeIcon = typeMeta.icon;
  const StatusIcon = STATUS_ICON[cycle.status];
  const phase = cycle.phases[cycle.currentPhaseIndex];
  const progress = cycle.phases.length > 0
    ? Math.round(((cycle.currentPhaseIndex) / cycle.phases.length) * 100)
    : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(cycle)}
      className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <TypeIcon className={cn('w-4 h-4', typeMeta.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white/90 truncate">{cycle.name}</span>
            <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', STATUS_COLOR[cycle.status])} />
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {typeMeta.label} · Started {cycle.startDate}
          </div>
          {cycle.status === 'active' && cycle.phases.length === 0 && (
            <p className="text-[10px] text-white/30 mt-1.5 italic">No phases configured</p>
          )}
          {cycle.status === 'active' && phase && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-white/50">
                <span>Phase {cycle.currentPhaseIndex + 1}/{cycle.phases.length}: {phase.name}</span>
                {phase.dosage && <span className="text-orange-400/70">{phase.dosage}</span>}
              </div>
              <div className="w-full h-1 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-orange-500/60 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-orange-400/60 transition-colors shrink-0 mt-2" />
      </div>
    </button>
  );
}

function CycleDetailModal({
  cycle,
  onClose,
  onSubmitForApproval,
}: {
  cycle: CycleEntry | null;
  onClose: () => void;
  onSubmitForApproval: (prompt: string) => void;
}) {
  if (!cycle) return null;
  const typeMeta = CYCLE_TYPE_META[cycle.type] ?? CYCLE_TYPE_META.custom;
  const TypeIcon = typeMeta.icon;

  const handleAdvancePhase = () => {
    const nextIndex = cycle.currentPhaseIndex + 1;
    const nextPhase = cycle.phases[nextIndex];
    const prompt = nextPhase
      ? `I want to advance my "${cycle.name}" cycle to the next phase: "${nextPhase.name}" (${nextPhase.durationDays} days${nextPhase.dosage ? `, ${nextPhase.dosage}` : ''}). Please confirm this is the right timing and advance the phase using the advance_cycle_phase action with cycleId="${cycle.id}".`
      : `I've completed all phases of my "${cycle.name}" cycle and want to mark it as complete. Please confirm and use complete_cycle with cycleId="${cycle.id}".`;
    onSubmitForApproval(prompt);
    onClose();
  };

  const handleAnalyze = () => {
    const phase = cycle.phases[cycle.currentPhaseIndex];
    const prompt = [
      `Analyze my current "${cycle.name}" ${cycle.type} cycle:`,
      `Started: ${cycle.startDate}`,
      phase ? `Current phase: "${phase.name}" (${phase.durationDays} days${phase.dosage ? `, ${phase.dosage}` : ''})` : '',
      cycle.notes ? `Notes: ${cycle.notes}` : '',
      '',
      'How is this cycle aligned with my current training state, recovery, and goals? Any adjustments needed?',
    ].filter(Boolean).join('\n');
    onSubmitForApproval(prompt);
    onClose();
  };

  return (
    <NeuralModal
      isOpen={!!cycle}
      onClose={onClose}
      title={cycle.name}
      subtitle={`${typeMeta.label} Cycle · ${cycle.status.toUpperCase()}`}
      icon={TypeIcon}
      themeColor="orange"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Started</div>
            <div className="text-xs font-bold text-white/80">{cycle.startDate}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Progress</div>
            <div className="text-xs font-bold text-white/80">
              Phase {cycle.currentPhaseIndex + 1} / {cycle.phases.length}
            </div>
          </div>
        </div>

        {cycle.description && (
          <p className="text-xs text-white/60 leading-relaxed">{cycle.description}</p>
        )}

        {/* Phase list */}
        <div className="space-y-2">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Phases</span>
          {cycle.phases.map((phase, idx) => {
            const isCurrent = idx === cycle.currentPhaseIndex && cycle.status === 'active';
            const isDone = idx < cycle.currentPhaseIndex;
            return (
              <div
                key={phase.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border transition-all',
                  isCurrent ? 'bg-orange-500/10 border-orange-500/30' : isDone ? 'bg-white/[0.02] border-white/5 opacity-50' : 'bg-white/[0.02] border-white/5'
                )}
              >
                <div className={cn(
                  'w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5',
                  isCurrent ? 'border-orange-500/60 text-orange-400' : isDone ? 'border-green-500/40 text-green-400' : 'border-white/20 text-white/30'
                )}>
                  {isDone ? '✓' : idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-bold', isCurrent ? 'text-orange-300' : 'text-white/70')}>
                      {phase.name}
                    </span>
                    <span className="text-[10px] text-white/40">{phase.durationDays}d</span>
                  </div>
                  {(phase.dosage || phase.trainingModifier) && (
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {[phase.dosage, phase.trainingModifier ? `Training: ${phase.trainingModifier}` : null].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {phase.notes && <p className="text-[10px] text-white/30 mt-1">{phase.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {cycle.notes && (
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-[9px] font-black uppercase tracking-wider text-white/40 mb-1">Notes</div>
            <p className="text-xs text-white/60">{cycle.notes}</p>
          </div>
        )}

        {/* Actions */}
        {cycle.status === 'active' && (
          <div className="flex gap-3 pt-2 border-t border-white/5">
            <NeuralButton size="xl" themeColor="orange" className="flex-1" onClick={handleAdvancePhase}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {cycle.currentPhaseIndex + 1 < cycle.phases.length ? 'Next Phase' : 'Complete Cycle'}
            </NeuralButton>
            <NeuralButton size="xl" variant="ghost" themeColor="orange" onClick={handleAnalyze}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Analyze
            </NeuralButton>
          </div>
        )}
      </div>
    </NeuralModal>
  );
}

export function CycleManager({ cycles, onSubmitForApproval, className }: CycleManagerProps) {
  const [selectedCycle, setSelectedCycle] = useState<CycleEntry | null>(null);

  const active = cycles.filter(c => c.status === 'active');
  const completed = cycles.filter(c => c.status !== 'active');

  const handleNewCycle = useCallback(() => {
    const prompt = [
      "I want to set up a new custom cycle. Please help me create one.",
      "Ask me: What type of cycle (supplement, workout periodization, nutrition, recovery, hormonal, or custom)?",
      "Then build the phases with me and use the create_cycle action to commit it.",
    ].join('\n');
    onSubmitForApproval(prompt);
  }, [onSubmitForApproval]);

  return (
    <div className={className}>
      <SurfaceCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <PanelLabel label="Cycle Tracker" metadata={active.length ? `${active.length} active` : 'no active cycles'} />
          <NeuralButton size="sm" themeColor="orange" onClick={handleNewCycle}>
            <Plus className="w-3 h-3 mr-1.5" />
            New Cycle
          </NeuralButton>
        </div>

        {cycles.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-xs text-white/40 italic">
              No cycles configured. Track creatine loading, workout blocks, or hormonal cycles.
            </p>
            <button
              type="button"
              onClick={handleNewCycle}
              className="text-[11px] text-orange-400/60 hover:text-orange-300 transition-colors"
            >
              Set up your first cycle →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {active.length > 0 && (
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-wider text-white/40">Active</div>
                {active.map(c => (
                  <CycleCard key={c.id} cycle={c} onSelect={setSelectedCycle} />
                ))}
              </div>
            )}

            {completed.length > 0 && (
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-wider text-white/40">Completed / Paused</div>
                {completed.slice(0, 3).map(c => (
                  <CycleCard key={c.id} cycle={c} onSelect={setSelectedCycle} />
                ))}
              </div>
            )}
          </div>
        )}
      </SurfaceCard>

      <CycleDetailModal
        cycle={selectedCycle}
        onClose={() => setSelectedCycle(null)}
        onSubmitForApproval={onSubmitForApproval}
      />
    </div>
  );
}
