/**
 * scout-digest-service.ts
 *
 * Generates and persists on-demand research digests for Scout.
 * Firestore path: scout_digests/{userId}/digests/{digestId}
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ScoutDigest, ScoutKnowledgeNode } from '../types';
import { SourceEntryDecrypted } from './scout-sources-service';
import { generateJSONWithAgent } from '@/lib/ai-adapters/json-generation-agent';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoutDigestDecrypted extends ScoutDigest {
  // Encryption envelope (required by encrypt/decrypt helpers)
  encryptedData: string;
  iv: string;

  // Export/UI convenience fields (derived if missing)
  createdAt: string;
  nodeCount: number;
  sourceCount: number;
  triggerSource: string;
  sections: {
    executiveSummary: string;
    keyThemes: string[];
    knowledgeGaps: string[];
    recommendedActions: string[];
    sourceSummary?: string;
  };
}

type DigestContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

const MAX_DIGESTS = 10;

// ---------------------------------------------------------------------------
// Collection path helper
// ---------------------------------------------------------------------------

function digestsCollection(userId: string): string {
  return `scout_digests/${userId}/digests`;
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt helpers
// ---------------------------------------------------------------------------

async function encryptDigest(
  digest: ScoutDigest,
  key: CryptoKey,
): Promise<{ encryptedData: string; iv: string }> {
  const result = await encryptWithKey(JSON.stringify(digest), key);
  return { encryptedData: result.ciphertext, iv: result.iv };
}

async function decryptDigest(
  id: string,
  userId: string,
  encryptedData: string,
  iv: string,
  key: CryptoKey,
): Promise<ScoutDigestDecrypted> {
  const json = await decryptWithKey({ ciphertext: encryptedData, iv }, key);
  const parsed = JSON.parse(json) as ScoutDigest;

  const createdAt = (parsed as any).createdAt ?? (parsed as any).generatedAt ?? new Date().toISOString();
  const nodeCount = parsed.summary?.totalNodes ?? 0;
  const sourceCount = (parsed as any).sourceCount ?? 0;
  const triggerSource = (parsed as any).triggerSource ?? parsed.generationType;

  // The prompt currently produces `synthesizedContent` (newsletter Markdown) but the
  // export layer expects a "sections" object. Provide a minimal derived mapping
  // to keep export/UI layers type-safe and functional.
  const sections = (parsed as any).sections ?? {
    executiveSummary: parsed.synthesizedContent ?? '',
    keyThemes: [],
    knowledgeGaps: [],
    recommendedActions: [],
    sourceSummary: undefined,
  };

  return {
    ...parsed,
    id,
    userId,
    encryptedData,
    iv,
    createdAt,
    nodeCount,
    sourceCount,
    triggerSource,
    sections,
  };
}

// ---------------------------------------------------------------------------
// LLM prompt builder
// ---------------------------------------------------------------------------

function buildDigestPrompt(
  interests: string[],
  nodes: ScoutKnowledgeNode[],
  sources: SourceEntryDecrypted[],
): string {
  const nodesSummary = nodes
    .slice(0, 30)
    .map(
      (n, i) =>
        `${i + 1}. [${n.status.toUpperCase()}] claim: "${n.claim}" (confidence: ${n.confidence.toFixed(2)})`,
    )
    .join('\n');

  const sourcesSummary = sources
    .slice(0, 20)
    .map((s, i) => `${i + 1}. ${s.title} (${s.domain}) - ${s.snippet?.slice(0, 100)}`)
    .join('\n');

  return `You are a research intelligence assistant generating a structured newsletter digest.

## Research Interests
${interests.join(', ') || 'General research'}

## Knowledge Findings
${nodesSummary || 'No knowledge findings yet.'}

## Key Sources
${sourcesSummary || 'No sources saved yet.'}

Generate a JSON digest with this exact structure:
{
  "periodStart": "ISO Date",
  "periodEnd": "ISO Date",
  "summary": {
    "totalNodes": number,
    "newNodesThisPeriod": number,
    "verifiedCount": number,
    "contestedCount": number
  },
  "topClaims": [
    { "nodeId": "string", "claim": "string", "confidence": number, "evidenceCount": number }
  ],
  "trendingInterests": [
    { "topic": "string", "score": number, "trend": "rising|steady|cooling" }
  ],
  "synthesizedContent": "2-3 paragraphs of Markdown synthesized from the findings, styled like a professional intelligence newsletter."
}

Respond with JSON only.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateDigest(
  interests: string[],
  nodes: ScoutKnowledgeNode[],
  sources: SourceEntryDecrypted[],
  triggerSource: ScoutDigest['generationType'],
  { userId, encryptionKey }: DigestContext,
): Promise<ScoutDigestDecrypted | null> {
  if (!userId || !encryptionKey) return null;

  Spine.emit({
    type: 'DIGEST_GENERATION_STARTED' as any,
    source: 'scout',
    domain: 'C',
    priority: 'info',
    data: { triggerSource },
  });

  try {
    const prompt = buildDigestPrompt(interests, nodes, sources);

    // Initialize engine agent via adapter for one-off service call
    const openrouterKey = resolveOpenRouterKey();
    const response = await generateJSONWithAgent<any>({
      prompt,
      openrouterKey,
      systemPrompt: 'You are a professional research intelligence analyst. Respond with valid JSON matching the schema.',
      temperature: 0.4,
    });

    if (!response) throw new Error('Empty response from intelligence engine');

    // Robust parsing: handle if model wrapped the digest object
    let rawDigest = response;
    if (response && typeof response === 'object' && !response.synthesizedContent && !response.topClaims) {
      const possibleDigest = response.digest || response.newsletter || response.report || response.data;
      if (possibleDigest && typeof possibleDigest === 'object') {
        rawDigest = possibleDigest;
      } else {
        // Check if ANY value in the object looks like a digest (has synthesizedContent or topClaims)
        const values = Object.values(response);
        const foundDigest = values.find(v => v && typeof v === 'object' && ((v as any).synthesizedContent || (v as any).topClaims));
        if (foundDigest) rawDigest = foundDigest;
      }
    }

    const now = new Date().toISOString();
    const id = `digest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const digest: ScoutDigest = {
      ...rawDigest,
      id,
      userId,
      generatedAt: now,
      generationType: triggerSource,
    };

    const { encryptedData, iv } = await encryptDigest(digest, encryptionKey);

    const createdAt = now;
    const nodeCount = digest.summary?.totalNodes ?? 0;
    const sourceCount = 0;
    const sections = {
      executiveSummary: digest.synthesizedContent ?? '',
      keyThemes: [],
      knowledgeGaps: [],
      recommendedActions: [],
      sourceSummary: undefined,
    };

    const decryptedDigest: ScoutDigestDecrypted = {
      ...digest,
      encryptedData,
      iv,
      createdAt,
      nodeCount,
      sourceCount,
      triggerSource,
      sections,
    };

    await saveDigest(decryptedDigest, { userId, encryptionKey });

    Spine.emit({
      type: 'DIGEST_GENERATED' as any,
      source: 'scout',
      domain: 'C',
      priority: 'info',
      data: {
        userId,
        digestId: id,
        generatedAt: now,
        digest: {
          id,
          generatedAt: now,
          generationType: triggerSource,
          summary: digest.summary,
          topClaims: digest.topClaims,
          trendingInterests: digest.trendingInterests,
          synthesizedContent: digest.synthesizedContent,
        },
      },
    });

    return decryptedDigest;
  } catch (error) {
    console.error('[ScoutDigestService] Failed to generate digest:', error);
    Spine.emit({
      type: 'DIGEST_GENERATION_FAILED' as any,
      source: 'scout',
      domain: 'C',
      priority: 'alert',
      data: { error: String(error) },
    });
    return null;
  }
}

export async function saveDigest(
  digest: any,
  { userId }: DigestContext,
): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  const col = digestsCollection(userId);

  const existing = await dataLayer.listDocuments<any>(col);
  if (existing.length >= MAX_DIGESTS) {
    const sorted = [...existing].sort((a, b) => (a.generatedAt || a.createdAt).localeCompare(b.generatedAt || b.createdAt));
    const toDelete = sorted.slice(0, existing.length - MAX_DIGESTS + 1);
    await Promise.all(toDelete.map((d) => dataLayer.deleteDocument(col, d.id)));
  }

  await dataLayer.setDocument(col, digest.id, digest);
}

export async function loadDigests(
  { userId, encryptionKey }: DigestContext,
): Promise<ScoutDigestDecrypted[]> {
  if (!userId || !encryptionKey) return [];
  const dataLayer = getNexusDataLayer();
  try {
    const docs = await dataLayer.listDocuments<any>(digestsCollection(userId));
    if (!docs || docs.length === 0) return [];

    const decrypted = await Promise.allSettled(
      docs.map((d) => decryptDigest(d.id, userId, d.encryptedData, d.iv, encryptionKey)),
    );

    const failed = decrypted.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(
        `[Scout] ${failed}/${docs.length} digest(s) could not be decrypted — ` +
        `possible key mismatch or data corruption. Digests will be skipped.`
      );
    }

    return decrypted
      .filter((r): r is PromiseFulfilledResult<ScoutDigestDecrypted> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  } catch {
    return [];
  }
}

export async function deleteDigest(id: string, { userId }: DigestContext): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  await dataLayer.deleteDocument(digestsCollection(userId), id);
}
