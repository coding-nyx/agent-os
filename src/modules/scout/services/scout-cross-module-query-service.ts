/**
 * scout-cross-module-query-service.ts
 *
 * Exposes Scout's RAG capabilities as a stable cross-agent API.
 *
 * Any Nexus module (Titan, Agnes, Atlas, Ledger, Soma) can call this service
 * to enrich its answers with Scout's local knowledge base + web fallback before
 * responding to the user. Calls are fire-and-forget friendly — the result is
 * returned immediately and a Spine event is published for traceability.
 *
 * Usage (from any module service):
 *   const result = await ScoutCrossModuleQueryService.query('HRV and sleep recovery', context);
 *   if (result && result.confidence >= 0.6) {
 *     // incorporate result.answer into the module's response
 *   }
 *
 * Feature flag: 'scoutCrossModuleQuery' (AutonomyFeatureFlags)
 */

import { ScoutQueryService } from './scout-query-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ScoutKnowledgeNode, SourceEntry } from '../types';

export interface ScoutCrossModuleQueryResult {
  query: string;
  answer: string;
  confidence: number;
  supportingNodes: ScoutKnowledgeNode[];
  supportingSources: SourceEntry[];
  /** True when the answer was enriched with a live web search. */
  webEnriched: boolean;
}

interface QueryContext {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
  /** The module requesting the query — used for Spine event tracing. */
  requestingModule?: string;
}

export const ScoutCrossModuleQueryService = {
  /**
   * Queries Scout's knowledge base (with optional web fallback) on behalf of
   * another agent. Returns null if the feature flag is off, the user is not
   * authenticated, or Scout has no relevant data.
   */
  async query(
    query: string,
    context: QueryContext,
  ): Promise<ScoutCrossModuleQueryResult | null> {
    if (!AutonomyFeatureFlags.isEnabled('scoutCrossModuleQuery')) return null;
    if (!context.userId || !context.encryptionKey) return null;

    try {
      Spine.publish({
        type: 'SCOUT_CROSS_MODULE_QUERY',
        source: context.requestingModule ?? 'nexus',
        target: 'scout',
        domain: 'C',
        priority: 'info',
        data: { query, requestingModule: context.requestingModule ?? 'nexus' },
      });

      const result = await ScoutQueryService.queryLibrary(query, {
        userId: context.userId,
        encryptionKey: context.encryptionKey,
      });

      if (!result) return null;

      Spine.publish({
        type: 'SCOUT_QUERY_RESULT_READY',
        source: 'scout',
        target: context.requestingModule,
        domain: 'C',
        priority: 'info',
        data: {
          query,
          confidence: result.confidence,
          nodeCount: result.supportingNodes.length,
          webEnriched: result.webEnriched ?? false,
          requestingModule: context.requestingModule ?? 'nexus',
        },
      });

      return {
        query,
        answer: result.answer,
        confidence: result.confidence,
        supportingNodes: result.supportingNodes,
        supportingSources: result.supportingSources,
        webEnriched: result.webEnriched ?? false,
      };
    } catch (err) {
      console.error('[ScoutCrossModuleQueryService] Query failed:', err);
      return null;
    }
  },

  /**
   * Convenience: returns true when a cross-module query is likely to yield
   * useful results (flag enabled + user authenticated).
   */
  isAvailable(context: QueryContext): boolean {
    return (
      AutonomyFeatureFlags.isEnabled('scoutCrossModuleQuery') &&
      Boolean(context.userId && context.encryptionKey)
    );
  },
};
