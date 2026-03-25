import { NeuralStateVector } from '@/lib/types';

/**
 * Atlas BlueprintEngine
 * Calculates cognitive capacity and manages task load.
 */

export class BlueprintEngine {
  /**
   * Calculates the Daily Capacity (C_day) based on the GlobalSoul state.
   * Formula: C_day = (vitality * Resilience_modifier) - friction
   * Resilience_modifier is derived from resilience (e.g., 0.8 + resilience * 0.4)
   */
  public static calculateCapacity(nsv: NeuralStateVector): number {
    const vitality =
      typeof nsv.biological?.recoveryScore === 'number'
        ? nsv.biological.recoveryScore / 10
        : typeof nsv.biological?.cnsFatigue === 'number'
          ? Math.max(0, Math.min(1, (10 - nsv.biological.cnsFatigue) / 10))
          : 0.5;
    const resilience =
      typeof nsv.emotional?.emotionalResilience === 'number'
        ? Math.max(0, Math.min(1, nsv.emotional.emotionalResilience / 10))
        : 0.5;
    const friction =
      typeof nsv.resource?.financialFriction === 'number'
        ? Math.max(0, Math.min(1, nsv.resource.financialFriction / 10))
        : 0.5;

    // Resilience modifier: high resilience (1.0) gives 1.2x, low (0.0) gives 0.8x
    const resilienceModifier = 0.8 + (resilience * 0.4);
    
    const capacity = (vitality * resilienceModifier) - (friction * 0.2);
    
    return Math.max(0.1, Math.min(1.0, capacity));
  }

  /**
   * Validates if the current task load exceeds the daily capacity.
   * @param weights Array of cognitive weights for active tasks.
   * @param capacity Current daily capacity.
   */
  public static isOverloaded(weights: number[], capacity: number): boolean {
    const totalLoad = weights.reduce((sum, w) => sum + w, 0);
    return totalLoad > capacity;
  }

  /**
   * Determines which tasks should be deferred if overloaded.
   * Prefers keeping high-priority, low-weight tasks.
   */
  public static getTasksToDefer<T extends { cognitive_weight: number, priority: number }>(
    tasks: T[],
    capacity: number
  ): T[] {
    const sorted = [...tasks].sort((a, b) => {
      // Sort by priority (1 is highest) then weight (descending)
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.cognitive_weight - a.cognitive_weight;
    });

    let currentLoad = 0;
    const toKeep: T[] = [];
    const toDefer: T[] = [];

    for (const task of sorted) {
      if (currentLoad + task.cognitive_weight <= capacity) {
        currentLoad += task.cognitive_weight;
        toKeep.push(task);
      } else {
        toDefer.push(task);
      }
    }

    return toDefer;
  }
}
