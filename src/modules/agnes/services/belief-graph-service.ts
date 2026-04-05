import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NexusRecord } from '@/lib/data-layer';
import { NexusLogger } from '@/lib/nexus-logger';

const VAULT_SALT_MARKER = 'vault_salt_used';
const DEFAULT_COMPACT_BELIEF_NODE_LIMIT = 60;
const INTENT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'for', 'from', 'had',
  'has', 'have', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'so', 'that',
  'the', 'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'were', 'with', 'you', 'your',
]);
const TOKEN_ALIASES: Record<string, string> = {
  cannot: 'cant',
  cant: 'cant',
  couldnt: 'cant',
  faking: 'fake',
  fake: 'fake',
  never: 'not',
  wont: 'not',
};

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

export function normalizeBeliefGraph(raw: unknown): BeliefGraph {
  const now = new Date().toISOString();
  const base: BeliefGraph = {
    nodes: [],
    edges: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };

  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, unknown>;

  return {
    ...base,
    nodes: Array.isArray(candidate.nodes)
      ? candidate.nodes.map((_raw: Record<string, unknown>, index: number) => { const node = _raw as Record<string, unknown> | null; return ({
          id: typeof node?.id === 'string' ? node.id : `belief_${index}`,
          label: typeof node?.label === 'string' ? node.label : 'Belief',
          valence: node?.valence === 'positive' || node?.valence === 'negative' ? node.valence as 'positive' | 'negative' : 'neutral',
          intensity: typeof node?.intensity === 'number' ? Math.max(0, Math.min(10, node.intensity as number)) : 5
        }); })
      : [],
    edges: Array.isArray(candidate.edges)
      ? candidate.edges.map((_raw: Record<string, unknown>, index: number) => { const edge = _raw as Record<string, unknown> | null; return ({
          from: typeof edge?.from === 'string' ? edge.from : `belief_${index}`,
          to: typeof edge?.to === 'string' ? edge.to : `belief_${index}`,
          relation: typeof edge?.relation === 'string' ? edge.relation as string : 'related'
        }); })
      : [],
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

function normalizeBeliefLabel(label: string): string {
  return label.trim().toLowerCase();
}

function stemToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('ly') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
}

function normalizeIntentToken(rawToken: string): string {
  const lower = rawToken.toLowerCase().trim();
  if (!lower) return '';
  const aliased = TOKEN_ALIASES[lower] ?? lower;
  const stemmed = stemToken(aliased);
  return TOKEN_ALIASES[stemmed] ?? stemmed;
}

function tokenizeBeliefIntent(label: string): string[] {
  const rawTokens = label
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  const normalizedTokens = rawTokens
    .map(normalizeIntentToken)
    .filter((token) => token && !INTENT_STOPWORDS.has(token));
  return Array.from(new Set(normalizedTokens));
}

function countOverlap(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let overlap = 0;
  for (const token of left) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap;
}

function areValenceCompatible(left: BeliefNode['valence'], right: BeliefNode['valence']): boolean {
  return left === right || left === 'neutral' || right === 'neutral';
}

function areBeliefsIntentEquivalent(left: BeliefNode, right: BeliefNode): boolean {
  if (!areValenceCompatible(left.valence, right.valence)) return false;
  const leftTokens = tokenizeBeliefIntent(left.label);
  const rightTokens = tokenizeBeliefIntent(right.label);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const overlap = countOverlap(leftTokens, rightTokens);
  if (overlap === 0) return false;

  const union = new Set([...leftTokens, ...rightTokens]).size;
  const minSize = Math.min(leftTokens.length, rightTokens.length);
  const jaccard = union > 0 ? overlap / union : 0;
  const containment = minSize > 0 ? overlap / minSize : 0;

  if (containment >= 0.95) return true;
  return containment >= 0.75 && jaccard >= 0.6;
}

function edgeKey(edge: BeliefEdge): string {
  return `${edge.from}::${edge.to}::${edge.relation.trim().toLowerCase()}`;
}

function dedupeNodesByExactLabel(nodes: BeliefNode[]): {
  canonicalNodes: BeliefNode[];
  aliasToCanonicalId: Map<string, string>;
} {
  const nodeByLabel = new Map<string, BeliefNode>();
  const aliasToCanonicalId = new Map<string, string>();

  for (const node of nodes) {
    const label = node.label.trim() || 'Belief';
    const normalizedLabel = normalizeBeliefLabel(label);
    if (!normalizedLabel) continue;
    const candidateNode: BeliefNode = {
      id: node.id?.trim() || `belief.${crypto.randomUUID()}`,
      label,
      valence: node.valence,
      intensity: Math.max(0, Math.min(10, node.intensity)),
    };

    const existing = nodeByLabel.get(normalizedLabel);
    if (existing) {
      if (candidateNode.intensity >= existing.intensity) {
        existing.label = candidateNode.label;
        existing.valence = candidateNode.valence;
      }
      existing.intensity = Math.max(existing.intensity, candidateNode.intensity);
      aliasToCanonicalId.set(candidateNode.id, existing.id);
      continue;
    }

    nodeByLabel.set(normalizedLabel, candidateNode);
    aliasToCanonicalId.set(candidateNode.id, candidateNode.id);
  }

  return {
    canonicalNodes: Array.from(nodeByLabel.values()),
    aliasToCanonicalId,
  };
}

function mergeNodeIntoTarget(target: BeliefNode, source: BeliefNode): void {
  if (source.intensity >= target.intensity) {
    target.label = source.label;
    target.valence = source.valence;
  }
  target.intensity = Math.max(target.intensity, source.intensity);
}

function applyHeuristicSemanticMerge(canonicalNodes: BeliefNode[], aliasToCanonicalId: Map<string, string>): BeliefNode[] {
  const workingNodes = [...canonicalNodes];
  const removed = new Set<string>();
  const indexById = () =>
    new Map(
      workingNodes
        .filter((node) => !removed.has(node.id))
        .map((node) => [node.id, node] as const),
    );

  for (let i = 0; i < workingNodes.length; i += 1) {
    const left = workingNodes[i];
    if (removed.has(left.id)) continue;
    for (let j = i + 1; j < workingNodes.length; j += 1) {
      const right = workingNodes[j];
      if (removed.has(right.id)) continue;
      if (!areBeliefsIntentEquivalent(left, right)) continue;
      mergeNodeIntoTarget(left, right);
      removed.add(right.id);
      aliasToCanonicalId.set(right.id, left.id);
    }
  }

  const byId = indexById();
  for (const [fromId, toId] of Array.from(aliasToCanonicalId.entries())) {
    const resolved = byId.get(toId);
    if (resolved) {
      aliasToCanonicalId.set(fromId, resolved.id);
    }
  }

  return workingNodes.filter((node) => !removed.has(node.id));
}

interface LLMSemanticMergePlan {
  groups: Array<{
    canonicalId: string;
    memberIds: string[];
  }>;
}

async function requestLLMSemanticMergePlan(
  nodes: BeliefNode[],
  generateJSON: GenerateJSONFn,
): Promise<LLMSemanticMergePlan | null> {
  if (nodes.length <= 1) return { groups: [] };
  const compactNodes = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    valence: node.valence,
    intensity: node.intensity,
  }));

  const prompt = [
    'Input beliefs (JSON):',
    JSON.stringify(compactNodes),
    '',
    'Return ONLY JSON with this exact shape:',
    '{"groups":[{"canonicalId":"node-id","memberIds":["node-id"]}]}',
    '',
    'Rules:',
    '- Group only beliefs with the same underlying intent.',
    '- Never group opposite-intent beliefs (for example: "i am safe" vs "i am unsafe").',
    '- Keep valence-compatible grouping only (same valence, or one neutral).',
    '- Every memberId must be present in input. canonicalId must be one of memberIds.',
  ].join('\n');

  try {
    const plan = await generateJSON<LLMSemanticMergePlan>(prompt, {
      systemPrompt: 'You are a strict JSON-only belief deduplication planner.',
      temperature: 0.1,
      maxTokens: 900,
    });
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.groups)) {
      NexusLogger.emit('ai', {
        moduleId: 'agnes',
        label: 'belief_graph_compaction_llm_plan_invalid',
        detail: { inputNodes: nodes.length },
      });
      return null;
    }
    NexusLogger.emit('ai', {
      moduleId: 'agnes',
      label: 'belief_graph_compaction_llm_plan_received',
      detail: { inputNodes: nodes.length, groups: plan.groups.length },
    });
    return plan;
  } catch {
    NexusLogger.emit('ai', {
      moduleId: 'agnes',
      label: 'belief_graph_compaction_llm_plan_failed',
      detail: { inputNodes: nodes.length },
    });
    return null;
  }
}

function applyLLMSemanticMerge(
  canonicalNodes: BeliefNode[],
  aliasToCanonicalId: Map<string, string>,
  plan: LLMSemanticMergePlan | null,
): BeliefNode[] {
  if (!plan || !Array.isArray(plan.groups) || plan.groups.length === 0) {
    return canonicalNodes;
  }

  const byId = new Map(canonicalNodes.map((node) => [node.id, node] as const));
  const removed = new Set<string>();
  const consumed = new Set<string>();

  for (const rawGroup of plan.groups) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;
    const memberIds = Array.isArray(rawGroup.memberIds)
      ? rawGroup.memberIds.filter((id): id is string => typeof id === 'string' && byId.has(id))
      : [];
    if (memberIds.length < 2) continue;
    if (memberIds.some((id) => removed.has(id) || consumed.has(id))) continue;
    const canonicalId = typeof rawGroup.canonicalId === 'string' && memberIds.includes(rawGroup.canonicalId)
      ? rawGroup.canonicalId
      : memberIds[0];
    const canonicalNode = byId.get(canonicalId);
    if (!canonicalNode || removed.has(canonicalId)) continue;

    for (const memberId of memberIds) {
      if (memberId === canonicalId) continue;
      const memberNode = byId.get(memberId);
      if (!memberNode || removed.has(memberId)) continue;
      if (!areValenceCompatible(canonicalNode.valence, memberNode.valence)) continue;
      mergeNodeIntoTarget(canonicalNode, memberNode);
      removed.add(memberId);
      aliasToCanonicalId.set(memberId, canonicalId);
    }
    memberIds.forEach((id) => consumed.add(id));
  }

  const compacted = canonicalNodes.filter((node) => !removed.has(node.id));
  const compactedById = new Set(compacted.map((node) => node.id));
  for (const [fromId, toId] of Array.from(aliasToCanonicalId.entries())) {
    if (compactedById.has(toId)) continue;
    if (compactedById.has(fromId)) {
      aliasToCanonicalId.set(fromId, fromId);
    }
  }

  return compacted;
}

function finalizeCompactedGraph(
  normalized: BeliefGraph,
  compactedNodes: BeliefNode[],
  aliasToCanonicalId: Map<string, string>,
  maxNodes: number,
): BeliefGraph {
  const limitedMaxNodes = Math.max(1, Math.floor(maxNodes));
  const nodes = [...compactedNodes]
    .sort((left, right) => {
      if (right.intensity !== left.intensity) return right.intensity - left.intensity;
      return left.label.localeCompare(right.label);
    })
    .slice(0, limitedMaxNodes);

  const retainedNodeIds = new Set(nodes.map((node) => node.id));
  const edges: BeliefEdge[] = [];
  const seenEdges = new Set<string>();

  for (const edge of normalized.edges) {
    const from = aliasToCanonicalId.get(edge.from) ?? edge.from;
    const to = aliasToCanonicalId.get(edge.to) ?? edge.to;
    if (!retainedNodeIds.has(from) || !retainedNodeIds.has(to) || from === to) continue;
    const normalizedEdge: BeliefEdge = {
      from,
      to,
      relation: edge.relation.trim() || 'related',
    };
    const key = edgeKey(normalizedEdge);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push(normalizedEdge);
  }

  return {
    ...normalized,
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
}

export function compactBeliefGraph(graph: BeliefGraph, maxNodes = DEFAULT_COMPACT_BELIEF_NODE_LIMIT): BeliefGraph {
  const normalized = normalizeBeliefGraph(graph);
  const { canonicalNodes, aliasToCanonicalId } = dedupeNodesByExactLabel(normalized.nodes);
  const semanticallyCompacted = applyHeuristicSemanticMerge(canonicalNodes, aliasToCanonicalId);
  return finalizeCompactedGraph(normalized, semanticallyCompacted, aliasToCanonicalId, maxNodes);
}

export async function compactBeliefGraphWithLLM(
  graph: BeliefGraph,
  options?: {
    maxNodes?: number;
    generateJSON?: GenerateJSONFn;
  },
): Promise<BeliefGraph> {
  const normalized = normalizeBeliefGraph(graph);
  const maxNodes = options?.maxNodes ?? DEFAULT_COMPACT_BELIEF_NODE_LIMIT;
  const { canonicalNodes, aliasToCanonicalId } = dedupeNodesByExactLabel(normalized.nodes);
  NexusLogger.emit('ai', {
    moduleId: 'agnes',
    label: 'belief_graph_compaction_started',
    detail: {
      hasLLM: !!options?.generateJSON,
      inputNodes: normalized.nodes.length,
      inputEdges: normalized.edges.length,
      postExactDedupeNodes: canonicalNodes.length,
      maxNodes,
    },
  });

  let semanticallyCompacted = canonicalNodes;
  let usedLLMPlan = false;
  if (options?.generateJSON) {
    const plan = await requestLLMSemanticMergePlan(canonicalNodes, options.generateJSON);
    semanticallyCompacted = applyLLMSemanticMerge(canonicalNodes, aliasToCanonicalId, plan);
    usedLLMPlan = !!plan && plan.groups.length > 0;
  }
  if (semanticallyCompacted === canonicalNodes || semanticallyCompacted.length === canonicalNodes.length) {
    NexusLogger.emit('ai', {
      moduleId: 'agnes',
      label: 'belief_graph_compaction_fallback_heuristic',
      detail: {
        reason: usedLLMPlan ? 'llm_plan_no_effect' : 'llm_unavailable_or_empty',
        nodes: canonicalNodes.length,
      },
    });
    semanticallyCompacted = applyHeuristicSemanticMerge(canonicalNodes, aliasToCanonicalId);
  }

  const finalized = finalizeCompactedGraph(normalized, semanticallyCompacted, aliasToCanonicalId, maxNodes);
  NexusLogger.emit('ai', {
    moduleId: 'agnes',
    label: 'belief_graph_compaction_completed',
    detail: {
      usedLLMPlan,
      outputNodes: finalized.nodes.length,
      outputEdges: finalized.edges.length,
      nodeDelta: normalized.nodes.length - finalized.nodes.length,
      edgeDelta: normalized.edges.length - finalized.edges.length,
    },
  });
  return finalized;
}

export async function loadBeliefGraph({ userId, encryptionKey }: BeliefGraphLoadContext): Promise<BeliefGraph | null> {
  if (!userId || !encryptionKey) return null;

  const record = await getNexusDataLayer().getDocument<{ encryptedData: string; iv: string }>(
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
    const unsubscribe = getNexusDataLayer().subscribeToDocument<{ encryptedData: string; iv: string }>(
      'belief_graphs',
      userId,
      async (record: NexusRecord<{ encryptedData: string; iv: string }> | null) => {
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
    await getNexusDataLayer().setDocument('belief_graphs', userId, {
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
    NexusLogger.emit('ai', {
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
  NexusLogger.emit('ai', {
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
