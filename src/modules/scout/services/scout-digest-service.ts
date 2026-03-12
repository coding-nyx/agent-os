/**
 * scout-digest-service.ts
 *
 * Generates and persists on-demand research digests for Scout.
 * Firestore path: scout_digests/{userId}/items/{digestId}
 *
 * Caps at 10 digests per user (oldest deleted on create).
 * 30-day TTL enforced by a `expiresAt` field (Cloud Function cleanup or client-side filter).
 *
 * Encryption: `sections` is encrypted; `createdAt`, `triggerSource`,
 * `nodeCount`, `sourceCount` are plaintext for querying.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { callStructuredLLM } from '@/lib/ai-adapters/call-structured-llm';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ScoutProfile } from './scout-knowledge-service';
import type { SourceEntryDecrypted } from './scout-sources-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestSections {
  executiveSummary: string;
  keyThemes: string[];
  knowledgeGaps: string[];
  recommendedActions: string[];
  /** Optional condensed source list narrative */
  sourceSummary?: string;
}

export interface ScoutDigest {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  triggerSource: 'manual' | 'scheduled' | 'deep-research';
  nodeCount: number;
  sourceCount: number;
  /** Encrypted digest content */
  encryptedData?: string;
  iv?: string;
}

export interface ScoutDigestDecrypted extends Omit<ScoutDigest, 'encryptedData' | 'iv'> {
  sections: DigestSections;
}

type DigestContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

const MAX_DIGESTS = 10;
const TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// Collection path helper
// ---------------------------------------------------------------------------

function digestsCollection(userId: string): string {
  return `scout_digests/${userId}/items`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt helpers
// ---------------------------------------------------------------------------

async function encryptSections(
  sections: DigestSections,
  key: CryptoKey,
): Promise<{ encryptedData: string; iv: string }> {
  const result = await encryptWithKey(JSON.stringify(sections), key);
  return { encryptedData: result.ciphertext, iv: result.iv };
}

async function decryptSections(
  encryptedData: string,
  iv: string,
  key: CryptoKey,
): Promise<DigestSections> {
  const json = await decryptWithKey({ ciphertext: encryptedData, iv }, key);
  return JSON.parse(json) as DigestSections;
}

async function decryptDigest(
  raw: ScoutDigest,
  key: CryptoKey,
): Promise<ScoutDigestDecrypted> {
  const base = {
    id: raw.id,
    userId: raw.userId,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    triggerSource: raw.triggerSource,
    nodeCount: raw.nodeCount,
    sourceCount: raw.sourceCount,
  };

  if (raw.encryptedData && raw.iv) {
    const sections = await decryptSections(raw.encryptedData, raw.iv, key);
    return { ...base, sections };
  }

  return {
    ...base,
    sections: {
      executiveSummary: 'Digest content unavailable.',
      keyThemes: [],
      knowledgeGaps: [],
      recommendedActions: [],
    },
  };
}

// ---------------------------------------------------------------------------
// LLM prompt builder
// ---------------------------------------------------------------------------

function buildDigestPrompt(
  profile: ScoutProfile,
  sources: SourceEntryDecrypted[],
): string {
  const nodes = profile.knowledgeNodes.slice(0, 30);
  const topSources = sources.slice(0, 20);

  const nodesSummary = nodes
    .map(
      (n, i) =>
        `${i + 1}. [${n.status.toUpperCase()}] ${n.title}: "${n.claim}" (confidence: ${n.confidence.toFixed(2)})`,
    )
    .join('\n');

  const sourcesSummary = topSources
    .map((s, i) => `${i + 1}. ${s.title} — ${s.domain}`)
    .join('\n');

  return `You are a research intelligence assistant generating a structured digest.

## Research Focus
${profile.researchFocus.join(', ') || 'General research'}

## Knowledge Nodes (${nodes.length} of ${profile.knowledgeNodes.length} shown)
${nodesSummary || 'No knowledge nodes yet.'}

## Saved Sources (${topSources.length} of ${sources.length} shown)
${sourcesSummary || 'No sources saved yet.'}

Generate a JSON digest with this exact structure:
{
  "executiveSummary": "2-3 sentence summary of the overall research state",
  "keyThemes": ["theme 1", "theme 2", "theme 3"],
  "knowledgeGaps": ["gap 1", "gap 2"],
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "sourceSummary": "1-2 sentence summary of the sources landscape"
}

Be specific and actionable. Reference actual topics from the research focus and nodes.
Respond with JSON only — no preamble, no markdown.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a new digest from the current research profile and sources.
 * Emits Spine events for UI state management.
 * Saves to Firestore, enforcing the 10-digest cap.
 */
export async function generateDigest(
  profile: ScoutProfile,
  sources: SourceEntryDecrypted[],
  triggerSource: ScoutDigest['triggerSource'],
  { userId, encryptionKey }: DigestContext,
): Promise<ScoutDigestDecrypted | null> {
  if (!userId || !encryptionKey) return null;

  Spine.publish({
    type: 'DIGEST_GENERATION_STARTED',
    source: 'scout',
    domain: 'C',
    priority: 'info',
    data: { triggerSource },
  });

  try {
    const prompt = buildDigestPrompt(profile, sources);

    const { data: sections } = await callStructuredLLM<DigestSections>(prompt, {
      systemPrompt:
        'You are a precise research intelligence assistant. ' +
        'Always respond with valid JSON matching the requested schema exactly.',
      temperature: 0.4,
      maxOutputTokens: 1024,
    });

    const now = new Date().toISOString();
    const id = `digest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { encryptedData, iv } = await encryptSections(sections, encryptionKey);

    const digest: ScoutDigest = {
      id,
      userId,
      createdAt: now,
      expiresAt: addDays(now, TTL_DAYS),
      triggerSource,
      nodeCount: profile.knowledgeNodes.length,
      sourceCount: sources.length,
      encryptedData,
      iv,
    };

    await saveDigest(digest, { userId, encryptionKey });

    Spine.publish({
      type: 'DIGEST_GENERATED',
      source: 'scout',
      domain: 'C',
      priority: 'info',
      data: { digestId: id, createdAt: now },
    });

    return { ...digest, sections };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Digest generation failed';

    Spine.publish({
      type: 'DIGEST_GENERATION_FAILED',
      source: 'scout',
      domain: 'C',
      priority: 'alert',
      data: { error: message },
    });

    throw error;
  }
}

/**
 * Persist a digest to Firestore, enforcing the 10-digest cap.
 * Deletes the oldest digest(s) when the cap would be exceeded.
 */
export async function saveDigest(
  digest: ScoutDigest,
  { userId, encryptionKey }: DigestContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const dataLayer = getNexusDataLayer();
  const col = digestsCollection(userId);

  const existing = await dataLayer.listDocuments<ScoutDigest>(col);
  if (existing.length >= MAX_DIGESTS) {
    const sorted = [...existing].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toDelete = sorted.slice(0, existing.length - MAX_DIGESTS + 1);
    await Promise.all(toDelete.map((d) => dataLayer.deleteDocument(col, d.id)));
  }

  await dataLayer.setDocument(col, digest.id, digest);
}

/** Load all non-expired digests for the user, decrypted, newest first. */
export async function loadDigests(
  { userId, encryptionKey }: DigestContext,
): Promise<ScoutDigestDecrypted[]> {
  if (!userId || !encryptionKey) return [];

  const dataLayer = getNexusDataLayer();

  try {
    const docs = await dataLayer.listDocuments<ScoutDigest>(digestsCollection(userId));
    if (!docs || docs.length === 0) return [];

    const now = new Date().toISOString();
    const valid = docs.filter((d) => !d.expiresAt || d.expiresAt > now);

    const decrypted = await Promise.allSettled(
      valid.map((d) => decryptDigest(d, encryptionKey)),
    );

    return decrypted
      .filter((r): r is PromiseFulfilledResult<ScoutDigestDecrypted> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Delete a specific digest. */
export async function deleteDigest(
  id: string,
  { userId }: DigestContext,
): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  await dataLayer.deleteDocument(digestsCollection(userId), id);
}
