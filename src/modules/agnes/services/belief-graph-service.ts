import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NexusRecord } from '@/lib/data-layer';

const VAULT_SALT_MARKER = 'vault_salt_used';

export interface BeliefNode {
  id: string;
  label: string;
  valence: 'positive' | 'neutral' | 'negative';
  intensity: number;
}

export interface BeliefEdge {
  from: string;
  to: string;
  relation: string;
}

export interface BeliefGraph {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function normalizeGraph(raw: unknown): BeliefGraph {
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

export async function loadBeliefGraph({ userId, encryptionKey }: LoadContext): Promise<BeliefGraph | null> {
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
    return normalizeGraph(JSON.parse(decrypted));
  } catch (error) {
    console.error('Failed to decrypt belief graph:', error);
    return null;
  }
}

export function subscribeBeliefGraph(
  { userId, encryptionKey }: LoadContext,
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
          onUpdate(normalizeGraph(JSON.parse(decrypted)));
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

export async function saveBeliefGraph(graph: BeliefGraph, { userId, encryptionKey }: LoadContext): Promise<void> {
  if (!userId || !encryptionKey) return;

  const normalized = normalizeGraph(graph);
  const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);

  try {
    await getNexusDataLayer().setDocument('belief_graphs', userId, {
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: VAULT_SALT_MARKER,
      metadata: {
        nodes: normalized.nodes.length,
        lastActive: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[BeliefGraphService] Failed to save belief graph:', error);
  }
}
