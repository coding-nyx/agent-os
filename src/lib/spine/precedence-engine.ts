/**
 * Precedence Engine — thin bridge over cortex-logic's PrecedenceResolverJs.
 *
 * The stateful, time-windowed conflict resolution logic lives in KMP so both
 * Agnes and nexus-android apply identical precedence rules.
 *
 * The `prioritize` method is local-only (batch sort) and doesn't need KMP.
 * The `resolveConflicts` method delegates to the KMP PrecedenceResolverJs
 * for per-event evaluation with time-windowed collision detection.
 */

import { SpineEvent } from '../types';
import { PrecedenceResolverJs } from '@cortex-logic';

const _resolver = new PrecedenceResolverJs();

export const PrecedenceMap: Record<string, number> = {
  "AGNES": 1,
  "ATLAS": 2,
  "SOMA": 3,
  "TITAN": 4,
  "LEDGER": 5,
  "NEXUS": 99,
  "SYSTEM": 0
};

export class PrecedenceEngine {
  public prioritize(proposals: SpineEvent[]): SpineEvent[] {
    return [...proposals].sort((a, b) => {
      const pA = PrecedenceMap[a.source.toUpperCase()] || 99;
      const pB = PrecedenceMap[b.source.toUpperCase()] || 99;

      if (pA === pB) {
        const prioA = a.priority === 'critical' ? 0 : a.priority === 'alert' ? 1 : 2;
        const prioB = b.priority === 'critical' ? 0 : b.priority === 'alert' ? 1 : 2;
        if (prioA !== prioB) return prioA - prioB;
        return a.timestamp - b.timestamp;
      }
      return pA - pB;
    });
  }

  public resolveConflicts(proposals: SpineEvent[]): SpineEvent[] {
    _resolver.clear();
    const sorted = this.prioritize(proposals);
    const results: SpineEvent[] = [];

    for (const event of sorted) {
      const mutations = (event.data as Record<string, unknown> | undefined)?.mutations as Record<string, unknown> | undefined;

      if (!mutations || Object.keys(mutations).length === 0) {
        results.push(event);
        continue;
      }

      const vectors = Object.keys(mutations);
      const shouldRequireApproval = _resolver.evaluate(
        event.source,
        JSON.stringify(vectors),
        false,
      );

      if (!shouldRequireApproval) {
        results.push(event);
      } else {
        console.warn(`[PrecedenceEngine] Downgraded event from ${event.source} due to precedence conflict.`);
      }
    }

    return results;
  }
}

export const Precedence = new PrecedenceEngine();
