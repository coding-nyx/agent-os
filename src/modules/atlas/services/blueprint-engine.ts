import { BlueprintEngineJs } from '@cortex-logic';
import type { NeuralStateVector } from '@/lib/types';

const _engine = new BlueprintEngineJs();

/**
 * Atlas BlueprintEngine
 * Calculates cognitive capacity and manages task load.
 * Delegates all computation to the KMP BlueprintEngineJs facade.
 */
export class BlueprintEngine {
  /**
   * Calculates the Daily Capacity (C_day) based on the NeuralStateVector.
   * Formula: C_day = (vitality * resilienceModifier) - (friction * 0.2)
   * clamped to [0.1, 1.0].
   */
  public static calculateCapacity(nsv: NeuralStateVector): number {
    return _engine.calculateCapacity(JSON.stringify(nsv));
  }

  /**
   * Validates if the current task load exceeds the daily capacity.
   * @param weights  Array of cognitive weights for active tasks.
   * @param capacity Current daily capacity.
   */
  public static isOverloaded(weights: number[], capacity: number): boolean {
    return _engine.isOverloaded(JSON.stringify(weights), capacity);
  }

  /**
   * Determines which tasks should be deferred if overloaded.
   * Prefers keeping high-priority, low-weight tasks.
   */
  public static getTasksToDefer<T extends { cognitive_weight: number; priority: number }>(
    tasks: T[],
    capacity: number
  ): T[] {
    return JSON.parse(_engine.getTasksToDefer(JSON.stringify(tasks), capacity));
  }
}
