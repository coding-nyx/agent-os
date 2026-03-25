import { SpineEvent } from '../types';

export const PrecedenceMap: Record<string, number> = {
  "AGNES": 1,
  "ATLAS": 2,
  "SOMA": 3,
  "TITAN": 4,
  "LEDGER": 5,
  "NEXUS": 99,
  // System overrides
  "SYSTEM": 0
};

export class PrecedenceEngine {
  /**
   * Sorts proposed events by the agent's precedence hierarchy.
   * Lower number means higher priority (Agnes > Atlas > Soma > Titan > Ledger).
   */
  public prioritize(proposals: SpineEvent[]): SpineEvent[] {
    return [...proposals].sort((a, b) => {
      const pA = PrecedenceMap[a.source.toUpperCase()] || 99;
      const pB = PrecedenceMap[b.source.toUpperCase()] || 99;
      
      if (pA === pB) {
        // If same source, prioritize based on explicit priority or timestamp
        const prioA = a.priority === 'critical' ? 0 : a.priority === 'alert' ? 1 : 2;
        const prioB = b.priority === 'critical' ? 0 : b.priority === 'alert' ? 1 : 2;
        if (prioA !== prioB) return prioA - prioB;
        return a.timestamp - b.timestamp;
      }
      return pA - pB;
    });
  }

  /**
   * Filters a batch of events to ensure no lower-precedence agent
   * is allowed to mutate the same GlobalSoul vector as a higher-precedence agent in this batch.
   */
  public resolveConflicts(proposals: SpineEvent[]): SpineEvent[] {
    const sorted = this.prioritize(proposals);
    const resolvedEvents: SpineEvent[] = [];
    const mutatedVectors = new Set<string>();

    for (const event of sorted) {
      const mutations = (event.data as Record<string, unknown> | undefined)?.mutations as Record<string, unknown> | undefined;
      
      // Pass-through events with no mutations
      if (!mutations || Object.keys(mutations).length === 0) {
        resolvedEvents.push(event);
        continue;
      }

      // Check if any mutation conflicts with a previously accepted (higher precedence) mutation
      const mutationKeys = Object.keys(mutations);
      const conflicts = mutationKeys.some(vector => mutatedVectors.has(vector));
      
      if (!conflicts) {
        // Register all vectors mutated by this event to block lower-precedence agents
        mutationKeys.forEach(vector => mutatedVectors.add(vector));
        resolvedEvents.push(event);
      } else {
        console.warn(`[PrecedenceEngine] Suppressed event from ${event.source} due to conflict.`);
      }
    }

    return resolvedEvents;
  }
}

export const Precedence = new PrecedenceEngine();
