/**
 * Habit Energy Matcher — thin bridge over cortex-logic's HabitEnergyMatcherJs.
 * Algorithm lives in KMP commonMain so both Agnes and nexus-android produce
 * identical slot assignments.
 */

import type { AtlasHabit, EnergyWavePoint } from '@/lib/types';
import { HabitEnergyMatcherJs } from '@cortex-logic';

const matcher = new HabitEnergyMatcherJs();

export interface HabitEnergySlot {
  habitId: string;
  habitTitle: string;
  suggestedHour: number;      // 0-23 (best hour to do this habit)
  suggestedTimeLabel: string;  // e.g. "8:00 AM - 9:00 AM"
  energyAtSlot: number;        // 0-10 energy at that slot
  matchReason: string;         // e.g. "Matches your morning energy peak"
}

export function matchHabitsToEnergySlots(
  habits: AtlasHabit[],
  energyWave: EnergyWavePoint[]
): HabitEnergySlot[] {
  const habitsSlim = habits.map(h => ({
    id: h.id,
    title: h.title,
    energyCost: h.energyCost ?? 5,
    status: h.status,
  }));
  const energySlim = energyWave.map(e => ({ energy: e.energy }));
  const raw = matcher.matchHabitsToEnergySlots(
    JSON.stringify(habitsSlim),
    JSON.stringify(energySlim),
  );
  return JSON.parse(raw);
}
