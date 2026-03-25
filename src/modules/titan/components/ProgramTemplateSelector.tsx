/**
 * ProgramTemplateSelector
 *
 * Displays a browseable grid of curated workout programs. Clicking a card
 * expands an inline detail section (no modal) showing the full day-by-day
 * breakdown plus an "Apply This Program" CTA.
 *
 * Single Responsibility: this component only handles program browsing and
 * selection. Persistence is delegated to the parent via `onApplyProgram`.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Dumbbell,
  Zap,
  BarChart2,
  Calendar,
  Target,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { WORKOUT_PROGRAMS, WorkoutProgram } from '../data/program-templates';
import type { Routine } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgramTemplateSelectorProps {
  /** Called with the full routines array when the user confirms a program */
  onApplyProgram: (routines: Routine[], programName: string) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge helpers — deterministic styling, no runtime logic leakage
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<WorkoutProgram['level'], string> = {
  beginner: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  intermediate: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  advanced: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

const FOCUS_STYLES: Record<WorkoutProgram['focus'], string> = {
  strength: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  hypertrophy: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  powerlifting: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  general: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
};

const EQUIPMENT_LABEL: Record<WorkoutProgram['equipment'], string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  any: 'Any / Minimal',
  full_gym: 'Full Gym',
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface ProgramCardProps {
  program: WorkoutProgram;
  isExpanded: boolean;
  isApplied: boolean;
  onToggle: (id: string) => void;
  onApply: (program: WorkoutProgram) => void;
}

function ProgramCard({ program, isExpanded, isApplied, onToggle, onApply }: ProgramCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-300 overflow-hidden',
        isExpanded
          ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] shadow-[0_0_32px_rgba(255,140,0,0.08)]'
          : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.035] hover:border-white/[0.12]',
      )}
    >
      {/* ── Card header (always visible) ── */}
      <button
        type="button"
        onClick={() => onToggle(program.id)}
        className="w-full text-left px-4 pt-4 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent)]/50 rounded-t-2xl"
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: shortName badge + title */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black tracking-tight',
                isExpanded
                  ? 'bg-[var(--module-accent)] text-white shadow-[0_0_18px_rgba(255,140,0,0.35)]'
                  : 'bg-white/[0.06] text-white/50',
              )}
            >
              {program.shortName.length <= 3 ? program.shortName : <Dumbbell className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white/85 truncate leading-snug">{program.name}</p>
              <p className="text-[11px] text-white/40 mt-0.5 leading-snug line-clamp-1">{program.description.slice(0, 80)}…</p>
            </div>
          </div>

          {/* Right: chevron */}
          <div className="shrink-0 mt-0.5 text-white/30">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Meta pill row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className={cn('text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full', LEVEL_STYLES[program.level])}>
            {program.level}
          </span>
          <span className={cn('text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full', FOCUS_STYLES[program.focus])}>
            {program.focus}
          </span>
          <span className="text-[9px] font-semibold text-white/35 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] uppercase tracking-[0.1em]">
            {program.daysPerWeek}d/wk
          </span>
          <span className="text-[9px] font-semibold text-white/35 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] uppercase tracking-[0.1em]">
            {EQUIPMENT_LABEL[program.equipment]}
          </span>
        </div>
      </button>

      {/* ── Expanded detail section ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.07]">
              {/* Full description */}
              <p className="text-[12px] text-white/60 leading-relaxed pt-3">{program.description}</p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <StatPill icon={Calendar} label="Duration" value={`${program.durationWeeks} wks`} />
                <StatPill icon={BarChart2} label="Days/wk" value={String(program.daysPerWeek)} />
                <StatPill icon={Target} label="Focus" value={program.focus} />
              </div>

              {/* Day-by-day routine summary */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">Training Days</p>
                {program.routines.map((routine) => (
                  <div
                    key={routine.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--module-color-400)]/70 w-[2.5rem] shrink-0">
                        {routine.weekday ? routine.weekday.slice(0, 3).toUpperCase() : '—'}
                      </span>
                      <span className="text-[12px] font-semibold text-white/80 leading-tight">{routine.name}</span>
                      {routine.timeframe && (
                        <span className="ml-auto text-[9px] text-white/30 shrink-0">{routine.timeframe}</span>
                      )}
                    </div>
                    <ul className="space-y-0.5 pl-[3rem]">
                      {routine.exercises.map((ex, idx) => (
                        <li key={idx} className="text-[11px] text-white/45 leading-snug flex items-baseline gap-1.5">
                          <span className="text-[var(--module-color-400)]/50 font-bold tabular-nums shrink-0 text-[9px]">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-white/55">{ex.name}</span>
                          <span className="text-white/30">{ex.sets}×{ex.reps}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isApplied ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-[12px] font-semibold text-emerald-400">
                    ✓ Applied! {program.routines.length} routine{program.routines.length !== 1 ? 's' : ''} created.
                  </p>
                </div>
              ) : (
                <NeuralButton
                  onClick={() => onApply(program)}
                  className="w-full text-[11px] uppercase tracking-[0.18em] font-bold h-10"
                >
                  <Zap className="w-3.5 h-3.5 mr-2" />
                  Apply This Program
                </NeuralButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface StatPillProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function StatPill({ icon: Icon, label, value }: StatPillProps) {
  return (
    <div className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03]">
      <Icon className="w-3 h-3 text-[var(--module-color-400)]/60" />
      <span className="text-[10px] font-bold text-white/70 capitalize leading-none">{value}</span>
      <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25 leading-none">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ProgramTemplateSelector({ onApplyProgram, className }: ProgramTemplateSelectorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleApply = useCallback(
    (program: WorkoutProgram) => {
      onApplyProgram(program.routines, program.name);
      setAppliedId(program.id);
    },
    [onApplyProgram],
  );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-1">
        <Package className="w-3.5 h-3.5 text-[var(--module-color-400)]/60 shrink-0" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
          {WORKOUT_PROGRAMS.length} Programs Available
        </span>
      </div>

      {/* Program grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {WORKOUT_PROGRAMS.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            isExpanded={expandedId === program.id}
            isApplied={appliedId === program.id}
            onToggle={handleToggle}
            onApply={handleApply}
          />
        ))}
      </div>
    </div>
  );
}
