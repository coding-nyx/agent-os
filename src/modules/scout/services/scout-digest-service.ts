/**
 * scout-digest-service.ts
 *
 * Generates and persists on-demand research digests for Scout.
 * Firestore path: scout_digests/{userId}/digests/{digestId}
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { CognitiveAgent } from '@/llm-engine/engine/CognitiveAgent';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ScoutDigest, ScoutKnowledgeNode } from '../types';
import { SourceEntryDecrypted } from './scout-sources-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoutDigestDecrypted extends ScoutDigest {
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
  digest: ScoutDigestDecrypted,
  key: CryptoKey,
): Promise<{ encryptedData: string; iv: string }> {
  const { encryptedData: _ed, iv: _iv, ...payload } = digest;
  const result = await encryptWithKey(JSON.stringify(payload), key);
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
  return { ...JSON.parse(json), id, userId, encryptedData, iv };
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

    // Initialize engine agent manually for one-off service call
    const openrouterKey = localStorage.getItem('VITE_OPENROUTER_API_KEY') || (import.meta.env.VITE_OPENROUTER_API_KEY as string);
    const agent = new CognitiveAgent({ openrouterKey });

    const response = await agent.generateJSON<any>(prompt, {
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

    const digest: ScoutDigestDecrypted = {
      ...rawDigest,
      id,
      userId,
      generatedAt: now,
      generationType: triggerSource,
    };

    const { encryptedData, iv } = await encryptDigest(digest, encryptionKey);

    await saveDigest({ ...digest, encryptedData, iv }, { userId, encryptionKey });

    Spine.emit({
      type: 'DIGEST_GENERATED' as any,
      source: 'scout',
      domain: 'C',
      priority: 'info',
      data: { digestId: id, generatedAt: now },
    });

    return digest;
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
