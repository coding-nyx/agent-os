/**
 * MoodEnergyPicker — Compact merged mood + energy level selector.
 *
 * Replaces two separate tall pill-button rows with a single compact widget:
 *  - Top row: 5 emoji mood buttons
 *  - Bottom row: 5 clickable energy segments (filled/empty bar)
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
  const selectedMood = MOOD_OPTIONS.find((m) => m.value === mood) ?? MOOD_OPTIONS[2];

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3"
      role="group"
      aria-label="Mood and energy selector"
    >
      {/* ── Mood row ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest font-display">
            Mood
          </p>
          <p className="text-[11px] text-white/50 font-medium">
            {selectedMood.label}
          </p>
        </div>

        <div
          className="flex gap-1.5"
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
                aria-label={label}
                onClick={() => onMoodChange(value)}
                className={cn(
                  'flex-1 flex items-center justify-center h-10 rounded-lg text-lg transition-all duration-150',
                  isSelected
                    ? 'bg-violet-500/20 border border-violet-500/40 scale-105 shadow-sm'
                    : 'bg-white/5 border border-white/8 hover:bg-white/10 hover:scale-105',
                )}
              >
                <span role="img" aria-label={label}>
                  {emoji}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="border-t border-white/6" aria-hidden />

      {/* ── Energy row ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest font-display">
            ⚡ Energy
          </p>
          <p className="text-[11px] text-white/40">
            {energyLevel === 1
              ? 'Drained'
              : energyLevel === 2
                ? 'Low'
                : energyLevel === 3
                  ? 'Moderate'
                  : energyLevel === 4
                    ? 'High'
                    : 'Peak'}
          </p>
        </div>

        <div
          className="flex gap-1.5"
          role="radiogroup"
          aria-label="Energy level selection"
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
                aria-label={`Energy level ${val}`}
                onClick={() => onEnergyChange(val)}
                className={cn(
                  'flex-1 h-7 rounded-md transition-all duration-150 border',
                  isFilled
                    ? 'bg-emerald-500/30 border-emerald-500/40 hover:bg-emerald-500/40'
                    : 'bg-white/5 border-white/8 hover:bg-white/10',
                  isSelected && 'ring-1 ring-emerald-400/40 scale-y-110',
                )}
              />
            );
          })}
        </div>

        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[9px] text-white/20 uppercase tracking-wider">Low</span>
          <span className="text-[9px] text-white/20 uppercase tracking-wider">High</span>
        </div>
      </div>
    </div>
  );
}
