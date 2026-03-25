/**
 * Habit Energy Matcher
 *
 * Matches active habits to optimal energy slots in today's energy wave,
 * spreading them across the day to avoid clustering.
 */

import type { AtlasHabit, EnergyWavePoint } from '@/lib/types';

export interface HabitEnergySlot {
  habitId: string;
  habitTitle: string;
  suggestedHour: number;      // 0-23 (best hour to do this habit)
  suggestedTimeLabel: string;  // e.g. "8:00 AM - 9:00 AM"
  energyAtSlot: number;        // 0-10 energy at that slot
  matchReason: string;         // e.g. "Matches your morning energy peak"
}

function slotIndexToHour(slotIndex: number, totalSlots: number): number {
  // Map slot index to an hour assuming equal distribution across 24 hours
  return Math.floor((slotIndex / totalSlots) * 24);
}

function formatHourLabel(hour: number): string {
  const format = (h: number) => {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${period}`;
  };
  const endHour = (hour + 1) % 24;
  return `${format(hour)} - ${format(endHour)}`;
}

function matchReason(energyCost: number, slotEnergy: number): string {
  if (energyCost >= 7) {
    return slotEnergy >= 8
      ? 'Matches your energy peak — ideal for high-effort habits'
      : 'Best available high-energy slot for this demanding habit';
  }
  if (energyCost >= 4) {
    return slotEnergy >= 6
      ? 'Good medium-energy slot for this habit'
      : 'Moderate energy window — manageable for this habit';
  }
  return slotEnergy >= 4
    ? 'Moderate slot suits this low-energy habit'
    : 'Low-energy valley — perfect for a light habit';
}

/**
 * Match habits to optimal energy slots in today's energy wave.
 *
 * Algorithm:
 * - Low energyCost habits (1-3) → find moderate energy slots (4-6)
 * - Medium energyCost habits (4-6) → find medium-high slots (6-8)
 * - High energyCost habits (7-10) → find peak energy slots (8-10)
 * - Spread habits across the day — don't cluster them all in one slot
 * - Return sorted by suggestedHour (chronologically)
 */
export function matchHabitsToEnergySlots(
  habits: AtlasHabit[],
  energyWave: EnergyWavePoint[]
): HabitEnergySlot[] {
  const activeHabits = habits.filter(h => h.status === 'active');
  if (activeHabits.length === 0 || energyWave.length === 0) return [];

  const totalSlots = energyWave.length;
  const usedSlotIndices = new Set<number>();
  const results: HabitEnergySlot[] = [];

  // Sort habits by energyCost descending so high-demand habits claim peaks first
  const sortedHabits = [...activeHabits].sort((a, b) => b.energyCost - a.energyCost);

  for (const habit of sortedHabits) {
    const cost = habit.energyCost ?? 5;

    // Determine the target energy band for this habit
    let minEnergy: number;
    let maxEnergy: number;

    if (cost >= 7) {
      minEnergy = 8;
      maxEnergy = 10;
    } else if (cost >= 4) {
      minEnergy = 6;
      maxEnergy = 8;
    } else {
      minEnergy = 4;
      maxEnergy = 6;
    }

    // Find the best slot in the preferred band that hasn't been claimed yet
    let bestIndex = -1;
    let bestEnergy = -1;

    for (let i = 0; i < totalSlots; i++) {
      if (usedSlotIndices.has(i)) continue;
      const energy = energyWave[i].energy;
      if (energy >= minEnergy && energy <= maxEnergy && energy > bestEnergy) {
        bestEnergy = energy;
        bestIndex = i;
      }
    }

    // Fall back: find the closest match ignoring band constraints
    if (bestIndex === -1) {
      for (let i = 0; i < totalSlots; i++) {
        if (usedSlotIndices.has(i)) continue;
        const energy = energyWave[i].energy;
        const distance = Math.abs(energy - (minEnergy + maxEnergy) / 2);
        const currentBest = bestIndex !== -1
          ? Math.abs(energyWave[bestIndex].energy - (minEnergy + maxEnergy) / 2)
          : Infinity;
        if (distance < currentBest) {
          bestIndex = i;
          bestEnergy = energy;
        }
      }
    }

    if (bestIndex === -1) continue;

    usedSlotIndices.add(bestIndex);
    const hour = slotIndexToHour(bestIndex, totalSlots);

    results.push({
      habitId: habit.id,
      habitTitle: habit.title,
      suggestedHour: hour,
      suggestedTimeLabel: formatHourLabel(hour),
      energyAtSlot: energyWave[bestIndex].energy,
      matchReason: matchReason(cost, energyWave[bestIndex].energy),
    });
  }

  return results.sort((a, b) => a.suggestedHour - b.suggestedHour);
}
