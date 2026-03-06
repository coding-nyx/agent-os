import { ActionHub } from '@/lib/actions/action-hub';
import {
  BeliefGraph,
  saveBeliefGraph,
  loadBeliefGraph
} from './belief-graph-service';

let registered = false;

function normalizeGraph(payload: any): BeliefGraph {
  const now = new Date().toISOString();
  const nodes = Array.isArray(payload?.nodes)
    ? payload.nodes.map((node: any, index: number) => ({
        id: typeof node?.id === 'string' ? node.id : `belief_${Date.now()}_${index}`,
        label: typeof node?.label === 'string' ? node.label : `Belief ${index + 1}`,
        valence: node?.valence === 'positive' || node?.valence === 'negative' ? node.valence : 'neutral',
        intensity: typeof node?.intensity === 'number' ? Math.max(0, Math.min(10, node.intensity)) : 5
      }))
    : [];

  const edges = Array.isArray(payload?.edges)
    ? payload.edges.map((edge: any, index: number) => ({
        from: typeof edge?.from === 'string' ? edge.from : `belief_${index}`,
        to: typeof edge?.to === 'string' ? edge.to : `belief_${index}`,
        relation: typeof edge?.relation === 'string' ? edge.relation : 'related'
      }))
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
