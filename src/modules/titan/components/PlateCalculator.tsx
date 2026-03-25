/**
 * PlateCalculator — Barbell plate loading calculator.
 *
 * Given a target weight, shows which plates to load on each side of the bar.
 * Supports kg and lb. Greedy algorithm from largest to smallest plate.
 *
 * Plate colour coding follows gym convention:
 *   kg:  25=red, 20=blue, 15=yellow, 10=green, 5=white, 2.5=black, 1.25=chrome
 *   lb:  45=blue, 35=yellow, 25=green, 10=white, 5=red, 2.5=black
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ── Constants ────────────────────────────────────────────────────────────────

const BAR_WEIGHT_KG  = 20;
const BAR_WEIGHT_LB  = 45;

interface PlateSpec {
  weight: number;
  color: string;      // Tailwind bg class
  textColor: string;  // Tailwind text class
  label: string;
}

const KG_PLATES: PlateSpec[] = [
  { weight: 25,   color: 'bg-red-500/80',    textColor: 'text-white',      label: '25' },
  { weight: 20,   color: 'bg-blue-500/80',   textColor: 'text-white',      label: '20' },
  { weight: 15,   color: 'bg-yellow-400/80', textColor: 'text-black',      label: '15' },
  { weight: 10,   color: 'bg-green-500/80',  textColor: 'text-white',      label: '10' },
  { weight: 5,    color: 'bg-white/70',      textColor: 'text-black',      label: '5'  },
  { weight: 2.5,  color: 'bg-zinc-800/90',   textColor: 'text-white/70',   label: '2.5'},
  { weight: 1.25, color: 'bg-zinc-400/60',   textColor: 'text-zinc-900',   label: '1¼' },
];

const LB_PLATES: PlateSpec[] = [
  { weight: 45,  color: 'bg-blue-500/80',   textColor: 'text-white',    label: '45' },
  { weight: 35,  color: 'bg-yellow-400/80', textColor: 'text-black',    label: '35' },
  { weight: 25,  color: 'bg-green-500/80',  textColor: 'text-white',    label: '25' },
  { weight: 10,  color: 'bg-white/70',      textColor: 'text-black',    label: '10' },
  { weight: 5,   color: 'bg-red-500/80',    textColor: 'text-white',    label: '5'  },
  { weight: 2.5, color: 'bg-zinc-800/90',   textColor: 'text-white/70', label: '2.5'},
];

// ── Algorithm ────────────────────────────────────────────────────────────────

interface PlateResult {
  plates: Array<{ spec: PlateSpec; count: number }>;
  remainder: number;  // leftover weight that can't be made with available plates
}

function calcPlates(targetWeight: number, unit: 'kg' | 'lb'): PlateResult {
  const barWeight = unit === 'kg' ? BAR_WEIGHT_KG : BAR_WEIGHT_LB;
  const plateSpecs = unit === 'kg' ? KG_PLATES : LB_PLATES;

  const perSide = (targetWeight - barWeight) / 2;
  if (perSide <= 0) {
    return { plates: [], remainder: 0 };
  }

  let remaining = Math.round(perSide * 100) / 100; // avoid float drift
  const plates: Array<{ spec: PlateSpec; count: number }> = [];

  for (const spec of plateSpecs) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / spec.weight + 0.001); // small epsilon for float safety
    if (count > 0) {
      plates.push({ spec, count });
      remaining = Math.round((remaining - spec.weight * count) * 100) / 100;
    }
  }

  return { plates, remainder: remaining };
}

// ── Component ────────────────────────────────────────────────────────────────

export interface PlateCalculatorProps {
  targetWeight: number;
  unit?: 'kg' | 'lb';
}

export function PlateCalculator({ targetWeight, unit: initialUnit = 'kg' }: PlateCalculatorProps) {
  const [unit, setUnit] = useState<'kg' | 'lb'>(initialUnit);

  // Convert targetWeight if the user switches units
  const displayWeight = useMemo(() => {
    if (unit === initialUnit) return targetWeight;
    return unit === 'lb'
      ? Math.round(targetWeight * 2.20462 * 2) / 2   // kg→lb, round to 0.5
      : Math.round(targetWeight / 2.20462 * 2) / 2;  // lb→kg, round to 0.5
  }, [targetWeight, unit, initialUnit]);

  const { plates, remainder } = useMemo(
    () => calcPlates(displayWeight, unit),
    [displayWeight, unit],
  );

  const barWeight = unit === 'kg' ? BAR_WEIGHT_KG : BAR_WEIGHT_LB;
  const isUnderBar = displayWeight <= barWeight;
  const hasRemainder = remainder > 0.01;

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
          Plate Calc — {unit === 'kg' ? BAR_WEIGHT_KG : BAR_WEIGHT_LB}{unit} bar
        </span>
        <button
          onClick={() => setUnit(u => u === 'kg' ? 'lb' : 'kg')}
          className="text-[10px] font-bold text-[var(--module-color-300)] hover:text-[var(--module-color-400)] transition-colors px-2 py-0.5 rounded border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]"
        >
          {unit === 'kg' ? 'Switch to lb' : 'Switch to kg'}
        </button>
      </div>

      {/* Target weight label */}
      <p className="text-[11px] text-white/50">
        Target: <span className="text-white/80 font-bold">{displayWeight}{unit}</span>
        {' '}→ <span className="text-white/50">{((displayWeight - barWeight) / 2).toFixed(2)}{unit} per side</span>
      </p>

      {/* Plate display */}
      {isUnderBar ? (
        <p className="text-[11px] text-[var(--module-color-300)] italic">
          Target is at or below bar weight — no plates needed.
        </p>
      ) : plates.length === 0 && !hasRemainder ? (
        <p className="text-[11px] text-white/40 italic">No plates needed.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Per side:</p>
          <div className="flex flex-wrap gap-1.5">
            {plates.map(({ spec, count }) =>
              Array.from({ length: count }, (_, i) => (
                <span
                  key={`${spec.label}-${i}`}
                  className={cn(
                    'inline-flex items-center justify-center rounded-full px-2 py-0.5',
                    'text-[10px] font-black min-w-[2rem]',
                    spec.color,
                    spec.textColor,
                  )}
                >
                  {spec.label}
                </span>
              ))
            )}
            {hasRemainder && (
              <span className="text-[10px] text-rose-400 font-semibold self-center">
                +{remainder.toFixed(2)}{unit} (not achievable with standard plates)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
