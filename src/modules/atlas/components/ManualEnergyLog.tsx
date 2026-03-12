/**
 * ManualEnergyLog
 * Compact inline widget that lets users log their current energy level.
 * Designed for non-AI users who have no populated energyWave data.
 * Dark glassmorphism, emerald Atlas theme.
 */

import React, { useState, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';

type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

interface ManualEnergyLogProps {
  onLogEnergy: (level: number, timeOfDay: TimeOfDay) => void;
  /** ISO string — if within last 2 h, shows "Logged recently ✓" instead of the form */
  lastLoggedAt?: string;
}

const TIME_LABELS: { id: TimeOfDay; label: string }[] = [
  { id: 'morning',   label: 'Morning'   },
  { id: 'midday',    label: 'Midday'    },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening',   label: 'Evening'   },
  { id: 'night',     label: 'Night'     },
];

/** Derive the current time-of-day bucket from the hour. */
function currentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 12)  return 'morning';
  if (h < 14)  return 'midday';
  if (h < 17)  return 'afternoon';
  if (h < 21)  return 'evening';
  return 'night';
}

/** Returns true if the ISO timestamp is within the last 2 hours. */
function isWithin2h(isoString: string): boolean {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    return diff >= 0 && diff < 2 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function ManualEnergyLog({ onLogEnergy, lastLoggedAt }: ManualEnergyLogProps) {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<TimeOfDay>(currentTimeOfDay());

  const loggedRecently = lastLoggedAt ? isWithin2h(lastLoggedAt) : false;

  const handleLog = useCallback(() => {
    if (selectedLevel === null) return;
    onLogEnergy(selectedLevel, selectedTime);
    setSelectedLevel(null);
  }, [selectedLevel, selectedTime, onLogEnergy]);

  return (
    <div
      className={cn(
        'rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-md',
        'px-4 py-3 space-y-2.5',
      )}
      aria-label="Manual energy log"
    >
      {/* Title row */}
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
          Energy Log
        </span>
      </div>

      {loggedRecently ? (
        /* "Logged recently" state */
        <p className="text-xs text-emerald-400/80 font-medium">
          Logged recently ✓
        </p>
      ) : (
        <>
          {/* Energy level buttons: 1–5 */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-label={`Energy level ${lvl}`}
                aria-pressed={selectedLevel === lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={cn(
                  'w-8 h-8 rounded-full text-xs font-bold border transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                  selectedLevel === lvl
                    ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300',
                )}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Time-of-day pills */}
          <div className="flex items-center flex-wrap gap-1.5">
            {TIME_LABELS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-label={`Time of day: ${label}`}
                aria-pressed={selectedTime === id}
                onClick={() => setSelectedTime(id)}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                  selectedTime === id
                    ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Log button */}
          <div className="flex justify-end pt-0.5">
            <NeuralButton
              size="sm"
              themeColor="emerald"
              disabled={selectedLevel === null}
              onClick={handleLog}
            >
              Log
            </NeuralButton>
          </div>
        </>
      )}
    </div>
  );
}
