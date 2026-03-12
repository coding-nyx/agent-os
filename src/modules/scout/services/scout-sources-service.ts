/**
 * scout-sources-service.ts
 *
 * Manages the Scout Source Library — per-user collection of saved research sources.
 * Firestore path: scout_sources/{userId}/items/{sourceId}
 *
 * Encryption model: the sensitive `metadata` field (title, snippet, tags) is
 * encrypted with the user's module key. The `url`, `domain`, `savedAt`, `nodeId`,
 * `isStarred`, and `isArchived` fields are plaintext for querying.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceEntry {
  id: string;
  userId: string;
  /** Links this source to a knowledge node */
  nodeId?: string;
  url: string;
  /** URL normalized for deduplication (lowercase, no trailing slash, no UTM params) */
  normalizedUrl: string;
  /** Plaintext — used for display without decryption */
  domain: string;
  /** ISO 8601 */
  savedAt: string;
  /** ISO 8601, set when user marks as read */
  readAt?: string;
  isStarred: boolean;
  /** Archived sources are hidden but not deleted */
  isArchived: boolean;
  /** Encrypted metadata */
  encryptedData?: string;
  iv?: string;
}

/** Decrypted view — what the app works with */
export interface SourceEntryDecrypted extends Omit<SourceEntry, 'encryptedData' | 'iv'> {
  title: string;
  snippet?: string;
  tags: string[];
}

/** Input when adding a source */
export interface AddSourceInput {
  url: string;
  title: string;
  domain?: string;
  snippet?: string;
  tags?: string[];
  nodeId?: string;
  savedAt?: string;
}

type SourceContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

const UTM_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'source',
];

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    UTM_PARAMS.forEach((p) => u.searchParams.delete(p));
    return `${u.origin}${u.pathname}${u.search}`
      .toLowerCase()
      .replace(/\/$/, '');
  } catch {
    return rawUrl.toLowerCase().replace(/\/$/, '');
  }
}

export function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt helpers
// ---------------------------------------------------------------------------

interface SourceMetadata {
  title: string;
  snippet?: string;
  tags: string[];
}

async function encryptMetadata(
  meta: SourceMetadata,
  key: CryptoKey,
): Promise<{ encryptedData: string; iv: string }> {
  const result = await encryptWithKey(JSON.stringify(meta), key);
  return { encryptedData: result.ciphertext, iv: result.iv };
}

async function decryptMetadata(
  encryptedData: string,
  iv: string,
  key: CryptoKey,
): Promise<SourceMetadata> {
  const json = await decryptWithKey({ ciphertext: encryptedData, iv }, key);
  return JSON.parse(json) as SourceMetadata;
}

async function decryptSource(
  raw: SourceEntry,
  key: CryptoKey,
): Promise<SourceEntryDecrypted> {
  const base = {
    id: raw.id,
    userId: raw.userId,
    nodeId: raw.nodeId,
    url: raw.url,
    normalizedUrl: raw.normalizedUrl,
    domain: raw.domain,
    savedAt: raw.savedAt,
    readAt: raw.readAt,
    isStarred: raw.isStarred,
    isArchived: raw.isArchived,
  };

  if (raw.encryptedData && raw.iv) {
    try {
      const meta = await decryptMetadata(raw.encryptedData, raw.iv, key);
      return { ...base, title: meta.title, snippet: meta.snippet, tags: meta.tags ?? [] };
    } catch {
      return { ...base, title: raw.domain || raw.url, snippet: undefined, tags: [] };
    }
  }

  return { ...base, title: raw.domain || raw.url, snippet: undefined, tags: [] };
}

// ---------------------------------------------------------------------------
// Collection path helper
// ---------------------------------------------------------------------------

function sourcesCollection(userId: string): string {
  return `scout_sources/${userId}/items`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a new source to the library.
 * Deduplicates by normalizedUrl — silently returns the existing source if already present.
 */
export async function addSource(
  input: AddSourceInput,
  { userId, encryptionKey }: SourceContext,
): Promise<SourceEntryDecrypted | null> {
  if (!userId || !encryptionKey) return null;

  const dataLayer = getNexusDataLayer();
  const normalizedUrl = normalizeUrl(input.url);
  const domain = input.domain ?? extractDomain(input.url);
  const now = input.savedAt ?? new Date().toISOString();
  const col = sourcesCollection(userId);

  // Check for duplicate
  const existing = await loadSources({ userId, encryptionKey });
  const dup = existing.find((s) => s.normalizedUrl === normalizedUrl && !s.isArchived);
  if (dup) return dup;

  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const meta: SourceMetadata = {
    title: input.title,
    snippet: input.snippet,
    tags: input.tags ?? [],
  };
  const { encryptedData, iv } = await encryptMetadata(meta, encryptionKey);

  const entry: SourceEntry = {
    id,
    userId,
    nodeId: input.nodeId,
    url: input.url,
    normalizedUrl,
    domain,
    savedAt: now,
    isStarred: false,
    isArchived: false,
    encryptedData,
    iv,
  };

  await dataLayer.setDocument(col, id, entry);
  return decryptSource(entry, encryptionKey);
}

/** Load all non-archived sources for the user, decrypted. */
export async function loadSources(
  { userId, encryptionKey }: SourceContext,
): Promise<SourceEntryDecrypted[]> {
  if (!userId || !encryptionKey) return [];

  const dataLayer = getNexusDataLayer();

  try {
    const docs = await dataLayer.listDocuments<SourceEntry>(sourcesCollection(userId));
    if (!docs || docs.length === 0) return [];

    const decrypted = await Promise.allSettled(
      docs
        .filter((d) => !d.isArchived)
        .map((d) => decryptSource(d, encryptionKey)),
    );

    return decrypted
      .filter((r): r is PromiseFulfilledResult<SourceEntryDecrypted> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

/** Update mutable fields on an existing source. */
export async function updateSource(
  id: string,
  patch: Partial<Pick<SourceEntryDecrypted, 'isStarred' | 'readAt' | 'nodeId' | 'tags' | 'title' | 'snippet'>>,
  { userId, encryptionKey }: SourceContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const dataLayer = getNexusDataLayer();
  const col = sourcesCollection(userId);
  const raw = await dataLayer.getDocument<SourceEntry>(col, id);
  if (!raw) return;

  let encryptedData = raw.encryptedData;
  let iv = raw.iv;

  if (patch.title !== undefined || patch.snippet !== undefined || patch.tags !== undefined) {
    const currentMeta: SourceMetadata = raw.encryptedData && raw.iv
      ? await decryptMetadata(raw.encryptedData, raw.iv, encryptionKey).catch(() => ({
          title: '',
          snippet: undefined,
          tags: [],
        }))
      : { title: '', snippet: undefined, tags: [] };

    const updatedMeta: SourceMetadata = {
      title: patch.title ?? currentMeta.title,
      snippet: patch.snippet !== undefined ? patch.snippet : currentMeta.snippet,
      tags: patch.tags !== undefined ? patch.tags : currentMeta.tags,
    };

    const encrypted = await encryptMetadata(updatedMeta, encryptionKey);
    encryptedData = encrypted.encryptedData;
    iv = encrypted.iv;
  }

  const updated: SourceEntry = {
    ...raw,
    isStarred: patch.isStarred !== undefined ? patch.isStarred : raw.isStarred,
    readAt: patch.readAt !== undefined ? patch.readAt : raw.readAt,
    nodeId: patch.nodeId !== undefined ? patch.nodeId : raw.nodeId,
    encryptedData,
    iv,
  };

  await dataLayer.setDocument(col, id, updated);
}

/** Soft-delete: set isArchived = true. */
export async function archiveSource(
  id: string,
  { userId }: SourceContext,
): Promise<void> {
  if (!userId) return;
  const dataLayer = getNexusDataLayer();
  const col = sourcesCollection(userId);
  const raw = await dataLayer.getDocument<SourceEntry>(col, id);
  if (!raw) return;
  await dataLayer.setDocument(col, id, { ...raw, isArchived: true });
}

/** Client-side text search over decrypted sources (title + domain + snippet + tags). */
export function filterSources(
  sources: SourceEntryDecrypted[],
  query: string,
): SourceEntryDecrypted[] {
  if (!query.trim()) return sources;
  const q = query.toLowerCase();
  return sources.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.domain.toLowerCase().includes(q) ||
      (s.snippet?.toLowerCase().includes(q) ?? false) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** Filter sources by knowledge node ID. */
export function getSourcesByNode(
  sources: SourceEntryDecrypted[],
  nodeId: string,
): SourceEntryDecrypted[] {
  return sources.filter((s) => s.nodeId === nodeId);
}


