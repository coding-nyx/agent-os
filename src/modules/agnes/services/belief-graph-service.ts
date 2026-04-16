import { BeliefGraphServiceJs } from '@cortex-logic';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import type { AraRecord } from '@/lib/data-layer';
import { AraLogger } from '@/lib/ara-logger';

const VAULT_SALT_MARKER = 'vault_salt_used';
const DEFAULT_COMPACT_BELIEF_NODE_LIMIT = 60;

// ═══════════════════════════════════════════════════════════════════════════════
// Types (unchanged — re-exported for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BeliefNode {
  id: string;
  label: string;
  valence: 'positive' | 'neutral' | 'negative';
  intensity: number;
  /** KMP-parity: belief classification. */
  type?: 'WOUND' | 'STRENGTH' | 'ANCHOR' | 'TRIGGER' | 'GROWTH';
  /** KMP-parity: importance weight (0.0–1.0). Higher = more salient. */
  gravity?: number;
  /** KMP-parity: Unix ms timestamp of last activation. */
  lastTriggeredAt?: number | null;
  /** KMP-parity: half-life decay window in days (default 30). */
  halfLifeDays?: number;
}

export interface BeliefEdge {
  from: string;
  to: string;
  relation: string;
}

/** KMP-parity: weighted directed link between two belief nodes. */
export interface NeuralLink {
  sourceId: string;
  targetId: string;
  /** Positive = healing/reinforcing; negative = triggering. */
  weight: number;
  /** The "why" behind this connection. */
  context: string;
}

export interface BeliefGraph {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  /** KMP-parity: weighted directed healing/triggering links between nodes. */
  neuralLinks?: NeuralLink[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompactBeliefGraphResult {
  compacted: boolean;
  nodeCount: number;
  edgeCount: number;
  reason?: 'missing_context' | 'missing_graph' | 'no_changes';
}

export type BeliefGraphLoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

type GenerateJSONFn = <T = unknown>(
  prompt: string,
  options?: { systemPrompt?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: string },
) => Promise<T>;

// ═══════════════════════════════════════════════════════════════════════════════
// KMP singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _service: InstanceType<typeof BeliefGraphServiceJs> | null = null;
function getService() {
  if (!_service) _service = new BeliefGraphServiceJs() as InstanceType<typeof BeliefGraphServiceJs>;
  return _service;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Domain logic — thin wrappers over KMP
// ═══════════════════════════════════════════════════════════════════════════════

export function normalizeBeliefGraph(raw: unknown): BeliefGraph {
  const graphJson = raw != null && typeof raw === 'object' ? JSON.stringify(raw) : '';
  const resultJson = getService().normalizeGraph(graphJson);
  return JSON.parse(resultJson) as BeliefGraph;
}

export function compactBeliefGraph(graph: BeliefGraph, maxNodes = DEFAULT_COMPACT_BELIEF_NODE_LIMIT): BeliefGraph {
  const resultJson = getService().compactGraph(JSON.stringify(graph), maxNodes);
  return JSON.parse(resultJson) as BeliefGraph;
}

export async function compactBeliefGraphWithLLM(
  graph: BeliefGraph,
  options?: {
    maxNodes?: number;
    generateJSON?: GenerateJSONFn;
  },
): Promise<BeliefGraph> {
  const maxNodes = options?.maxNodes ?? DEFAULT_COMPACT_BELIEF_NODE_LIMIT;

  if (!options?.generateJSON) {
    // No LLM — fall back to synchronous heuristic compaction
    return compactBeliefGraph(graph, maxNodes);
  }

  const generateJSON = options.generateJSON;

  return new Promise<BeliefGraph>((resolve, reject) => {
    const generateJsonFn = (
      requestJson: string,
      onResult: (json: string) => void,
      onError: (err: string) => void,
    ) => {
      const request = JSON.parse(requestJson) as {
        prompt: string;
        systemPrompt: string;
        temperature: number;
        maxTokens: number;
      };
      generateJSON(request.prompt, {
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      })
        .then((result) => onResult(typeof result === 'string' ? result : JSON.stringify(result)))
        .catch((err: Error) => onError(err.message ?? 'LLM call failed'));
    };

    getService().compactGraphWithLlm(
      JSON.stringify(graph),
      maxNodes,
      generateJsonFn,
      (resultJson: string) => resolve(JSON.parse(resultJson) as BeliefGraph),
      (err: string) => reject(new Error(err)),
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Persistence — stays in TS (encryption + data layer)
// ═══════════════════════════════════════════════════════════════════════════════

export async function loadBeliefGraph({ userId, encryptionKey }: BeliefGraphLoadContext): Promise<BeliefGraph | null> {
  if (!userId || !encryptionKey) return null;

  const record = await getAraDataLayer().getDocument<{ encryptedData: string; iv: string }>(
    'belief_graphs',
    userId,
  );
  if (!record) return null;

  const data = record;
  if (!data?.encryptedData || !data?.iv) return null;

  try {
    const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
    return normalizeBeliefGraph(JSON.parse(decrypted));
  } catch (error) {
    console.error('Failed to decrypt belief graph:', error);
    return null;
  }
}

export function subscribeBeliefGraph(
  { userId, encryptionKey }: BeliefGraphLoadContext,
  onUpdate: (graph: BeliefGraph | null) => void
): () => void {
  if (userId && encryptionKey) {
    const unsubscribe = getAraDataLayer().subscribeToDocument<{ encryptedData: string; iv: string }>(
      'belief_graphs',
      userId,
      async (record: AraRecord<{ encryptedData: string; iv: string }> | null) => {
        if (!record) {
          onUpdate(null);
          return;
        }
        const data = record;
        if (!data?.encryptedData || !data?.iv) {
          onUpdate(null);
          return;
        }
        try {
          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
          onUpdate(normalizeBeliefGraph(JSON.parse(decrypted)));
        } catch (error) {
          console.error('Failed to decrypt belief graph:', error);
          onUpdate(null);
        }
      }
    );
    return unsubscribe;
  }

  onUpdate(null);
  return () => {};
}

export async function saveBeliefGraph(
  graph: BeliefGraph,
  { userId, encryptionKey }: BeliefGraphLoadContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const normalized = normalizeBeliefGraph(graph);
  const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);

  try {
    await getAraDataLayer().setDocument('belief_graphs', userId, {
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: VAULT_SALT_MARKER,
      metadata: {
        nodes: normalized.nodes.length,
        edges: normalized.edges.length,
        lastActive: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[BeliefGraphService] Failed to save belief graph:', error);
  }
}

export async function compactBeliefGraphDocument(
  { userId, encryptionKey }: BeliefGraphLoadContext,
  options?: { maxNodes?: number; generateJSON?: GenerateJSONFn },
): Promise<CompactBeliefGraphResult> {
  if (!userId || !encryptionKey) {
    return { compacted: false, nodeCount: 0, edgeCount: 0, reason: 'missing_context' };
  }
  const existing = await loadBeliefGraph({ userId, encryptionKey });
  if (!existing) {
    return { compacted: false, nodeCount: 0, edgeCount: 0, reason: 'missing_graph' };
  }
  const compacted = options?.generateJSON
    ? await compactBeliefGraphWithLLM(existing, { maxNodes: options.maxNodes, generateJSON: options.generateJSON })
    : compactBeliefGraph(existing, options?.maxNodes);
  const changed = JSON.stringify(existing) !== JSON.stringify(compacted);
  if (!changed) {
    AraLogger.emit('ai', {
      moduleId: 'agnes',
      label: 'belief_graph_compaction_skipped',
      detail: {
        reason: 'no_changes',
        nodeCount: existing.nodes.length,
        edgeCount: existing.edges.length,
      },
    });
    return {
      compacted: false,
      nodeCount: existing.nodes.length,
      edgeCount: existing.edges.length,
      reason: 'no_changes',
    };
  }

  await saveBeliefGraph(compacted, { userId, encryptionKey });
  AraLogger.emit('ai', {
    moduleId: 'agnes',
    label: 'belief_graph_compaction_persisted',
    detail: {
      beforeNodes: existing.nodes.length,
      beforeEdges: existing.edges.length,
      afterNodes: compacted.nodes.length,
      afterEdges: compacted.edges.length,
      withLLM: !!options?.generateJSON,
    },
  });
  return {
    compacted: true,
    nodeCount: compacted.nodes.length,
    edgeCount: compacted.edges.length,
  };
}
