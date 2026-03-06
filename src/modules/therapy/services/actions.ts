import { ActionHub } from '@/lib/actions/action-hub';
import {
  BeliefGraph,
  saveBeliefGraph,
  loadBeliefGraph
} from './belief-graph-service';

let registered = false;

function normalizeGraph(payload: Record<string, unknown>): BeliefGraph {
  const now = new Date().toISOString();
  const nodes = Array.isArray(payload?.nodes)
    ? (payload.nodes as unknown[]).map((_raw, index) => {
        const node = _raw as Record<string, unknown> | null;
        return {
          id: typeof node?.id === 'string' ? node.id as string : `belief_${Date.now()}_${index}`,
          label: typeof node?.label === 'string' ? node.label as string : `Belief ${index + 1}`,
          valence: node?.valence === 'positive' || node?.valence === 'negative' ? node.valence as 'positive' | 'negative' : 'neutral' as const,
          intensity: typeof node?.intensity === 'number' ? Math.max(0, Math.min(10, node.intensity as number)) : 5
        };
      })
    : [];

  const edges = Array.isArray(payload?.edges)
    ? (payload.edges as unknown[]).map((_raw, index) => {
        const edge = _raw as Record<string, unknown> | null;
        return {
          from: typeof edge?.from === 'string' ? edge.from as string : `belief_${index}`,
          to: typeof edge?.to === 'string' ? edge.to as string : `belief_${index}`,
          relation: typeof edge?.relation === 'string' ? edge.relation as string : 'related'
        };
      })
    : [];

  return {
    nodes,
    edges,
    summary: typeof payload?.summary === 'string' ? payload.summary : '',
    createdAt: typeof payload?.createdAt === 'string' ? payload.createdAt : now,
    updatedAt: now
  };
}

export function registerTherapyActions() {
  if (registered) return;
  registered = true;

  ActionHub.register('therapy', 'update_belief_graph', async ({ userId, encryptionKey, payload }) => {
    if (!userId || !encryptionKey) return;

    const next = normalizeGraph(payload);
    await saveBeliefGraph(next, { userId, encryptionKey });
  });
}
