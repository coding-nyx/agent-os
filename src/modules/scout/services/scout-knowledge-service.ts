/**
 * scout-knowledge-service.ts
 *
 * Manages the Scout Knowledge Base — synthesized research claims and findings.
 * Firestore path: scout_knowledge/{userId}/nodes/{nodeId}
 * 
 * Overall profile (onboarding, focus) still stored at scout_knowledge/{userId}.
 */

import { getAraDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';
import { Spine } from '@/lib/spine/spine-event-bus';
import { EmbeddingService, cosineSimilarity } from '@/lib/services/embedding-service';
import { EmbeddingUtilsJs } from '@cortex-logic';

const _embUtils = new EmbeddingUtilsJs();
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

function nodesCollection(userId: string): string {
  return `scout_knowledge/${userId}/nodes`;
}

function normalizeScoutProfile(raw: unknown): ScoutProfile {
  const base = createEmptyScoutProfile();
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, unknown>;

  return {
    onboardingComplete: candidate.onboardingComplete === true,
    researchFocus: Array.isArray(candidate.researchFocus)
      ? candidate.researchFocus.filter((s): s is string => typeof s === 'string')
      : [],
    interests: Array.isArray(candidate.interests)
      ? (candidate.interests as InterestNode[]).filter(
          (n): n is InterestNode => n !== null && typeof n === 'object' && typeof n.id === 'string',
        )
      : [],
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : base.createdAt,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : base.updatedAt,
    knowledgeNodes: Array.isArray(candidate.knowledgeNodes) ? candidate.knowledgeNodes : undefined,
    verificationQueue: Array.isArray(candidate.verificationQueue) ? candidate.verificationQueue : undefined,
    newsBriefs: Array.isArray(candidate.newsBriefs) ? candidate.newsBriefs : undefined,
  };
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
  const dataLayer = getAraDataLayer();
  const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('scout_knowledge', userId);
  if (!data?.encryptedData || !data?.iv) return createEmptyScoutProfile();

  try {
    const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
    return normalizeScoutProfile(JSON.parse(decrypted));
  } catch (error) {
    console.error('Failed to decrypt scout profile:', error);
    return createEmptyScoutProfile();
  }
}

export async function saveScoutProfile(
  profile: ScoutProfile,
  { userId, encryptionKey }: LoadContext,
  options?: { suppressEvent?: boolean }
): Promise<void> {
  if (!userId || !encryptionKey) return;
  const dataLayer = getAraDataLayer();
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

  if (!options?.suppressEvent) {
    const nodes = await loadKnowledgeNodes({ userId, encryptionKey });
    const researchLoad = Math.min(1, nodes.filter(n => n.status === 'pending').length / 20);
    const verifiedCount = nodes.filter(n => n.status === 'verified').length;
    const researchDepth = nodes.length > 0 ? verifiedCount / nodes.length : 0;
    const interestDiversity = Math.min(1, profile.interests.length / 10);

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
}

// ---------------------------------------------------------------------------
// Knowledge Node API
// ---------------------------------------------------------------------------

export async function addKnowledgeNode(
  node: Omit<ScoutKnowledgeNode, 'id' | 'updatedAt'>,
  { userId, encryptionKey }: LoadContext
): Promise<ScoutKnowledgeNode | null> {
  if (!userId || !encryptionKey) return null;
  const dataLayer = getAraDataLayer();
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
  return _embUtils.computeKeywordScore(claim, query) as number;
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
  const dataLayer = getAraDataLayer();
  try {
    const docs = await dataLayer.listDocuments<{ encryptedData: string; iv: string }>(nodesCollection(userId), { limit: 500 });
    const decrypted = await Promise.allSettled(
      docs.map(async (d) => {
        const json = await decryptWithKey({ ciphertext: d.encryptedData, iv: d.iv }, encryptionKey);
        return JSON.parse(json) as ScoutKnowledgeNode;
      })
    );
    const failed = decrypted.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(
        `[Scout] ${failed}/${docs.length} knowledge node(s) could not be decrypted — ` +
        `possible key mismatch or data corruption. Nodes will be skipped.`
      );
    }
    return decrypted
      .filter((r): r is PromiseFulfilledResult<ScoutKnowledgeNode> => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    console.warn('[ScoutKnowledgeService] Failed to load knowledge nodes:', err);
    return [];
  }
}

export async function updateKnowledgeNode(
  id: string,
  patch: Partial<ScoutKnowledgeNode>,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (!userId || !encryptionKey) return;
  const dataLayer = getAraDataLayer();
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
  const dataLayer = getAraDataLayer();
  await dataLayer.deleteDocument(nodesCollection(userId), id);
}

// ---------------------------------------------------------------------------
// Factory instance — used for guest localStorage helpers.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<ScoutProfile>({
  collection: 'scout_knowledge',
  guestStorageKey: 'ara_guest_scout_profile',
  createEmpty: createEmptyScoutProfile,
  normalize: normalizeScoutProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
  }),
});

// ---------------------------------------------------------------------------
// Guest / Subscription API
// ---------------------------------------------------------------------------

function loadGuestScoutProfile(): ScoutProfile {
  return _service.loadGuest() ?? createEmptyScoutProfile();
}

function saveGuestScoutProfile(profile: ScoutProfile): void {
  _service.saveGuest(profile);
}

function clearGuestScoutProfile(): void {
  _service.clearGuest();
}

export async function syncGuestScoutProfileToUser(
  { userId, encryptionKey }: LoadContext = {},
): Promise<boolean> {
  if (!userId || !encryptionKey) return false;
  const guestProfile = _service.loadGuest();
  if (!guestProfile) return false;

  const existing = await loadScoutProfile({ userId, encryptionKey });
  if (existing?.onboardingComplete) return false;

  await saveScoutProfile(guestProfile, { userId, encryptionKey });
  _service.clearGuest();
  return true;
}

export function subscribeScoutProfile(
  { userId, encryptionKey }: LoadContext = {},
  onUpdate: (profile: ScoutProfile) => void,
  onError?: (error: unknown) => void,
): () => void {
  if (!userId || !encryptionKey) {
    onUpdate(loadGuestScoutProfile());
    return () => {};
  }

  let lastUpdatedAt: string | null = null;
  const dataLayer = getAraDataLayer();
  return dataLayer.subscribeToDocument<any>('scout_knowledge', userId, async (data) => {
    if (!data?.encryptedData || !data?.iv) {
      onUpdate(createEmptyScoutProfile());
      return;
    }
    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      const nextProfile = normalizeScoutProfile(JSON.parse(decrypted));
      if (nextProfile.updatedAt === lastUpdatedAt) return;
      lastUpdatedAt = nextProfile.updatedAt;
      onUpdate(nextProfile);
    } catch (err) {
      console.warn('[ScoutKnowledgeService] Profile decryption failed in subscription:', err);
      if (onError) {
        onError(err);
      } else {
        onUpdate(createEmptyScoutProfile());
      }
    }
  }, onError);
}
