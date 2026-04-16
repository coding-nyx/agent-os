/**
 * scout-handoff-consumer.ts
 *
 * Enables Scout to receive and respond to `query`-type handoffs from Ara.
 *
 * When Ara (or another module) dispatches a `query` handoff targeting `scout`,
 * this consumer picks it up, runs a cross-module query against the Scout knowledge
 * base, and stores the result as a `query_result` handoff so the originating
 * module can read it.
 *
 * Register with: `registerScoutHandoffConsumer()`
 * Called at: module bootstrap (e.g., ScoutPage mount or app init)
 */

import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ScoutCrossModuleQueryService } from './scout-cross-module-query-service';

interface HandoffConsumerContext {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
}

let consumerRegistered = false;
let activeContext: HandoffConsumerContext = {};

/**
 * Registers a Spine listener that watches for MODULE_HANDOFF_RECEIVED events
 * directed at Scout, processes the query, and stores a query_result handoff.
 *
 * Idempotent — calling more than once has no effect.
 */
export function registerScoutHandoffConsumer(context: HandoffConsumerContext): () => void {
  activeContext = context;
  if (consumerRegistered) return () => {};
  consumerRegistered = true;

  const unsubscribe = Spine.subscribe('MODULE_HANDOFF_RECEIVED', async (event) => {
    const data = event.data as { moduleId?: string; type?: string; content?: string; sourceModuleId?: string };
    if (data.moduleId !== 'scout' || data.type !== 'query') return;

    const query = data.content?.trim();
    if (!query) return;

    const result = await ScoutCrossModuleQueryService.query(query, {
      userId: activeContext.userId,
      encryptionKey: activeContext.encryptionKey,
      requestingModule: data.sourceModuleId ?? 'ara',
    });

    if (!result) return;

    // Store result so the requesting module can consume it
    const responseModuleId = data.sourceModuleId ?? 'ara';
    AraHandoffService.store({
      moduleId: responseModuleId,
      type: 'query_result',
      content: JSON.stringify({
        query: result.query,
        answer: result.answer,
        confidence: result.confidence,
        webEnriched: result.webEnriched,
        nodeCount: result.supportingNodes.length,
      }),
      reason: `Scout knowledge base answer for: "${query.slice(0, 80)}"`,
      sourceModuleId: 'scout',
      createdAt: new Date().toISOString(),
    });
  });

  return () => {
    unsubscribe();
    consumerRegistered = false;
    activeContext = {};
  };
}

/**
 * Dispatches a `query` handoff to Scout from another module.
 * The result will be stored as a `query_result` handoff for `fromModuleId`.
 */
function dispatchScoutQuery(query: string, fromModuleId: string): void {
  AraHandoffService.store({
    moduleId: 'scout',
    type: 'query',
    content: query,
    reason: `Cross-module knowledge query from ${fromModuleId}`,
    sourceModuleId: fromModuleId,
    createdAt: new Date().toISOString(),
  });

  Spine.publish({
    type: 'MODULE_HANDOFF_RECEIVED',
    source: fromModuleId,
    target: 'scout',
    domain: 'C',
    priority: 'info',
    data: { moduleId: 'scout', type: 'query', content: query, sourceModuleId: fromModuleId },
  });
}
