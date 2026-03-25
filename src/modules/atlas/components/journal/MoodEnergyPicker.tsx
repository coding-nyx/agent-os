/**
 * MoodEnergyPicker — Single-row compact vibe check widget.
 *
 * Layout (one row, mobile-first, min 320 px):
 *   [😔][😕][😐][🙂][😊]  │  [⚡][▪][▪][▪][▪][▪]
 *
 * Both button groups share the available width via flex-1 so the row
 * never overflows — even on 320 px screens.
 */

import React from 'react';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const MOOD_OPTIONS = [
  { value: 1, emoji: '😔', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😊', label: 'Great' },
] as const;

const ENERGY_LABELS: Record<number, string> = {
  1: 'Drained',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Peak',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MoodEnergyPickerProps {
  mood: number;
  energyLevel: number;
  onMoodChange: (value: number) => void;
  onEnergyChange: (value: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MoodEnergyPicker({
  mood,
  energyLevel,
  onMoodChange,
  onEnergyChange,
}: MoodEnergyPickerProps) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 min-w-0 overflow-hidden"
      role="group"
      aria-label="Mood and energy selector"
    >
      {/* ── Mood buttons (flex-1 — grows to fill half the row) ───────────── */}
      <div
        className="flex gap-0.5 flex-1 min-w-0"
        role="radiogroup"
        aria-label="Mood selection"
      >
        {MOOD_OPTIONS.map(({ value, emoji, label }) => {
          const isSelected = mood === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Mood: ${label}`}
              onClick={() => onMoodChange(value)}
              className={cn(
                'flex-1 min-w-0 flex items-center justify-center h-9 rounded-lg text-base transition-all duration-150 touch-manipulation',
                isSelected
                  ? 'bg-violet-500/20 border border-violet-500/40 scale-110'
                  : 'bg-white/5 border border-transparent hover:bg-white/10 hover:scale-105',
              )}
            >
              <span role="img" aria-hidden>{emoji}</span>
            </button>
          );
        })}
      </div>

      {/* ── Vertical divider ─────────────────────────────────────────────── */}
      <div className="w-px self-stretch bg-white/10 shrink-0" aria-hidden />

      {/* ── Lightning label ───────────────────────────────────────────────── */}
      <span
        className="shrink-0 text-sm leading-none select-none"
        aria-hidden
        title={`Energy: ${ENERGY_LABELS[energyLevel]}`}
      >
        ⚡
      </span>

      {/* ── Energy bars (flex-1 — grows to fill other half) ──────────────── */}
      <div
        className="flex gap-0.5 flex-1 min-w-0"
        role="radiogroup"
        aria-label={`Energy level — ${ENERGY_LABELS[energyLevel] ?? ''}`}
      >
        {[1, 2, 3, 4, 5].map((val) => {
          const isFilled = val <= energyLevel;
          const isSelected = val === energyLevel;
          return (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Energy: ${ENERGY_LABELS[val] ?? val}`}
              onClick={() => onEnergyChange(val)}
              className={cn(
                'flex-1 min-w-0 h-6 rounded-md transition-all duration-150 border touch-manipulation',
                isFilled
                  ? 'bg-emerald-500/30 border-emerald-500/40 hover:bg-emerald-500/40'
                  : 'bg-white/5 border-white/8 hover:bg-white/10',
                isSelected && 'ring-1 ring-emerald-400/50 scale-y-110',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
