/**
 * scout-knowledge-service.ts
 *
 * Manages the Scout Knowledge Base — synthesized research claims and findings.
 * Firestore path: scout_knowledge/{userId}/nodes/{nodeId}
 * 
 * Overall profile (onboarding, focus) still stored at scout_knowledge/{userId}.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { EmbeddingService, cosineSimilarity } from '@/lib/services/embedding-service';
import { ScoutKnowledgeNode as ScoutKnowledgeNodeBase } from '../types';

export interface ScoutKnowledgeNode extends ScoutKnowledgeNodeBase {
  /** Title is optional in the new schema, but kept for legacy compat if needed. */
  title?: string;
  /** Evidence is now primarily SourceEntry IDs. */
  evidence: string[];
}

export interface InterestNode {
  id: string;
  topic: string;
  score: number;
  trend: 'rising' | 'steady' | 'cooling';
  lastSeenAt: string;
}

export interface ScoutNewsBrief {
  topic: string;
  summary: string;
  source?: string;
  updatedAt: string;
  isPlaceholder?: boolean;
}

export interface ScoutProfile {
  onboardingComplete: boolean;
  researchFocus: string[];
  interests: InterestNode[];
  summary: string;
  createdAt: string;
  updatedAt: string;
  // Legacy fields kept for migration/sync
  knowledgeNodes?: any[];
  verificationQueue?: any[];
  newsBriefs?: ScoutNewsBrief[];
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function nodesCollection(userId: string): string {
  return `scout_knowledge/${userId}/nodes`;
}

export function createEmptyScoutProfile(): ScoutProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    researchFocus: [],
    interests: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadScoutProfile({ userId, encryptionKey }: LoadContext): Promise<ScoutProfile | null> {
  if (!userId || !encryptionKey) return createEmptyScoutProfile();
  const dataLayer = getNexusDataLayer();
  const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('scout_knowledge', userId);
  if (!data?.encryptedData || !data?.iv) return createEmptyScoutProfile();

  try {
    const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to decrypt scout profile:', error);
    return createEmptyScoutProfile();
  }
}

export async function saveScoutProfile(profile: ScoutProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  if (!userId || !encryptionKey) return;
  const dataLayer = getNexusDataLayer();
  profile.updatedAt = new Date().toISOString();
  const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
  
  await dataLayer.setDocument('scout_knowledge', userId, {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    metadata: {
      onboardingComplete: profile.onboardingComplete,
      lastActive: profile.updatedAt
    }
  });

  // Calculate and update NSV metrics
  const nodes = await loadKnowledgeNodes({ userId, encryptionKey });
  const researchLoad = Math.min(1, nodes.filter(n => n.status === 'pending').length / 20);
  const verifiedCount = nodes.filter(n => n.status === 'verified').length;
  const researchDepth = nodes.length > 0 ? verifiedCount / nodes.length : 0;
  const interestDiversity = Math.min(1, profile.interests.length / 10);

  // Notify Spine for asynchronous processing (metrics, RAG indexing, etc.)
  Spine.publish({
    type: 'SCOUT_PROFILE_UPDATED',
    source: 'scout',
    domain: 'C',
    priority: 'info',
    data: { 
      userId, 
      onboardingComplete: profile.onboardingComplete,
      metrics: {
        researchLoad,
        researchDepth,
        interestDiversity
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Knowledge Node API
// ---------------------------------------------------------------------------

export async function addKnowledgeNode(
  node: Omit<ScoutKnowledgeNode, 'id' | 'updatedAt'>,
  { userId, encryptionKey }: LoadContext
): Promise<ScoutKnowledgeNode | null> {
  if (!userId || !encryptionKey) return null;
  const dataLayer = getNexusDataLayer();
  const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  // Generate embedding for semantic search if not already provided
  let embedding = node.embedding;
  if (!embedding) {
    try {
      embedding = await EmbeddingService.embed(node.claim);
    } catch (err) {
      console.warn('[ScoutKnowledgeService] Failed to generate embedding for new node:', err);
    }
  }

  const newNode: ScoutKnowledgeNode = {
    ...node,
    id,
    embedding,
    updatedAt: now
  };

  const encrypted = await encryptWithKey(JSON.stringify(newNode), encryptionKey);
  await dataLayer.setDocument(nodesCollection(userId), id, {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    status: newNode.status, // Plaintext for filtering
    updatedAt: now
  });

  return newNode;
}

/**
 * Computes a BM25-inspired keyword score between 0 and 1.
 * Splits query into tokens and counts how many appear in the claim text.
 */
function computeKeywordScore(claim: string, query: string): number {
  const claimLower = claim.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter(token => claimLower.includes(token)).length;
  return hits / tokens.length;
}

export async function queryKnowledgeNodes(
  query: string,
  { userId, encryptionKey }: LoadContext,
  options: { limit?: number; threshold?: number } = {}
): Promise<Array<ScoutKnowledgeNode & { similarity: number }>> {
  if (!userId || !encryptionKey) return [];
  
  const nodes = await loadKnowledgeNodes({ userId, encryptionKey });
  if (nodes.length === 0) return [];

  const threshold = options.threshold ?? 0.7;

  try {
    const queryVector = await EmbeddingService.embed(query);

    const results = nodes
      .map(node => {
        const semanticScore = node.embedding ? cosineSimilarity(queryVector, node.embedding) : 0;
        const keywordScore = computeKeywordScore(node.claim, query);
        // Hybrid score: semantic dominates, keyword boosts borderline matches
        const similarity = 0.7 * semanticScore + 0.3 * keywordScore;
        return { ...node, similarity };
      })
      .filter(node => node.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);

    return options.limit ? results.slice(0, options.limit) : results;
  } catch (err) {
    console.error('[ScoutKnowledgeService] Semantic query failed, falling back to keyword:', err);
    return nodes
      .map(n => ({ ...n, similarity: computeKeywordScore(n.claim, query) }))
      .filter(n => n.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit);
  }
}

export async function loadKnowledgeNodes({ userId, encryptionKey }: LoadContext): Promise<ScoutKnowledgeNode[]> {
  if (!userId || !encryptionKey) return [];
  const dataLayer = getNexusDataLayer();
  try {
    const docs = await dataLayer.listDocuments<{ encryptedData: string; iv: string }>(nodesCollection(userId));
    const decrypted = await Promise.allSettled(
      docs.map(async (d) => {
        const json = await decryptWithKey({ ciphertext: d.encryptedData, iv: d.iv }, encryptionKey);
        return JSON.parse(json) as ScoutKnowledgeNode;
      })
    );
    return decrypted
      .filter((r): r is PromiseFulfilledResult<ScoutKnowledgeNode> => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function updateKnowledgeNode(
  id: string,
  patch: Partial<ScoutKnowledgeNode>,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (!userId || !encryptionKey) return;
  const dataLayer = getNexusDataLayer();
  const nodes = await loadKnowledgeNodes({ userId, encryptionKey });
  const current = nodes.find(n => n.id === id);
  if (!current) return;

  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  // Update embedding if claim changed and embedding not explicitly provided
  if (patch.claim && patch.claim !== current.claim && !patch.embedding) {
    try {
      updated.embedding = await EmbeddingService.embed(patch.claim);
    } catch (err) {
      console.warn('[ScoutKnowledgeService] Failed to regenerate embedding for node update:', err);
    }
  }

  const encrypted = await encryptWithKey(JSON.stringify(updated), encryptionKey);
  await dataLayer.setDocument(nodesCollection(userId), id, {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    status: updated.status,
    updatedAt: updated.updatedAt
  });
}

export async function deleteKnowledgeNode(id: string, { userId }: LoadContext): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  await dataLayer.deleteDocument(nodesCollection(userId), id);
}

// ---------------------------------------------------------------------------
// Guest / Subscription API
// ---------------------------------------------------------------------------

const GUEST_SCOUT_KEY = 'nexus_guest_scout_profile';

export function loadGuestScoutProfile(): ScoutProfile {
  const stored = localStorage.getItem(GUEST_SCOUT_KEY);
  if (!stored) return createEmptyScoutProfile();
  try {
    return JSON.parse(stored);
  } catch {
    return createEmptyScoutProfile();
  }
}

export function saveGuestScoutProfile(profile: ScoutProfile): void {
  localStorage.setItem(GUEST_SCOUT_KEY, JSON.stringify(profile));
}

export function clearGuestScoutProfile(): void {
  localStorage.removeItem(GUEST_SCOUT_KEY);
}

export async function syncGuestScoutProfileToUser(
  guestProfile: ScoutProfile,
  { userId, encryptionKey }: LoadContext = {}
): Promise<void> {
  if (!userId || !encryptionKey) return;
  const existing = await loadScoutProfile({ userId, encryptionKey });
  if (existing?.onboardingComplete) return;

  await saveScoutProfile(guestProfile, { userId, encryptionKey });
  clearGuestScoutProfile();
}

export function subscribeScoutProfile(
  { userId, encryptionKey }: LoadContext = {},
  onUpdate: (profile: ScoutProfile) => void
): () => void {
  if (!userId || !encryptionKey) {
    onUpdate(loadGuestScoutProfile());
    return () => {};
  }

  const dataLayer = getNexusDataLayer();
  return dataLayer.subscribeToDocument<any>('scout_knowledge', userId, async (data) => {
    if (!data?.encryptedData || !data?.iv) {
      onUpdate(createEmptyScoutProfile());
      return;
    }
    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      onUpdate(JSON.parse(decrypted));
    } catch {
      onUpdate(createEmptyScoutProfile());
    }
  });
}
