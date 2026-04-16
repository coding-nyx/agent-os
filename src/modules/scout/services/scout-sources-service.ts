/**
 * scout-sources-service.ts
 *
 * Manages the Scout Source Library — per-user collection of saved research sources.
 * Firestore path: scout_sources/{userId}/sources/{sourceId}
 */

import { getAraDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { SourceEntry } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Decrypted view — what the app works with */
export interface SourceEntryDecrypted extends Omit<SourceEntry, 'encryptedData' | 'iv'> {
  // Aliases expected by export/UI layers.
  // (Some older persisted shapes use `isStarred/readAt/savedAt/nodeId`.)
  isStarred?: boolean;
  readAt?: string;
  savedAt?: string;
  nodeId?: string;
}

/** Input when adding a source */
export interface AddSourceInput {
  url: string;
  title: string;
  domain?: string;
  snippet?: string;
  imageUrl?: string;
  favicon?: string;
  tags?: string[];
  nodeId?: string;
  savedAt?: string;
  discoveredVia?: SourceEntry['discoveredVia'];
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
  imageUrl?: string;
  favicon?: string;
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
  raw: any,
  key: CryptoKey,
): Promise<SourceEntryDecrypted> {
  const base: any = {
    id: raw.id,
    url: raw.url,
    normalizedUrl: raw.normalizedUrl,
    domain: raw.domain,
    addedAt: raw.addedAt || raw.savedAt,
    // Back-compat aliases used by export/UI layers.
    savedAt: raw.savedAt || raw.addedAt,
    lastAccessedAt: raw.lastAccessedAt,
    discoveredVia: raw.discoveredVia || 'search',
    readStatus: raw.readStatus || (raw.readAt ? 'read' : 'unread'),
    readAt: raw.readAt,
    starred: raw.starred ?? raw.isStarred ?? false,
    isStarred: raw.starred ?? raw.isStarred ?? false,
    archived: raw.archived ?? raw.isArchived ?? false,
    citingNodeIds: raw.citingNodeIds || (raw.nodeId ? [raw.nodeId] : []),
    nodeId: raw.nodeId ?? (Array.isArray(raw.citingNodeIds) ? raw.citingNodeIds[0] : undefined),
  };

  if (raw.encryptedData && raw.iv) {
    try {
      const meta = await decryptMetadata(raw.encryptedData, raw.iv, key);
      return { 
        ...base, 
        title: meta.title, 
        snippet: meta.snippet, 
        imageUrl: meta.imageUrl,
        favicon: meta.favicon,
        tags: meta.tags ?? [] 
      };
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
  return `scout_sources/${userId}/sources`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a new source to the library.
 */
export async function addSource(
  input: AddSourceInput,
  { userId, encryptionKey }: SourceContext,
): Promise<SourceEntryDecrypted | null> {
  if (!userId || !encryptionKey) return null;

  const dataLayer = getAraDataLayer();
  const normalizedUrl = normalizeUrl(input.url);
  const domain = input.domain ?? extractDomain(input.url);
  const now = input.savedAt ?? new Date().toISOString();
  const col = sourcesCollection(userId);

  // Check for duplicate
  const existing = await loadSources({ userId, encryptionKey });
  const dup = existing.find((s) => s.normalizedUrl === normalizedUrl);
  if (dup) {
    if (input.nodeId && !dup.citingNodeIds.includes(input.nodeId)) {
      await updateSource(dup.id, { citingNodeIds: [...dup.citingNodeIds, input.nodeId] }, { userId, encryptionKey });
    }
    return dup;
  }

  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const meta: SourceMetadata = {
    title: input.title,
    snippet: input.snippet,
    imageUrl: input.imageUrl,
    favicon: input.favicon,
    tags: input.tags ?? [],
  };
  const { encryptedData, iv } = await encryptMetadata(meta, encryptionKey);

  const entry: any = {
    id,
    url: input.url,
    normalizedUrl,
    domain,
    addedAt: now,
    discoveredVia: input.discoveredVia || 'search',
    readStatus: 'unread',
    starred: false,
    archived: false,
    citingNodeIds: input.nodeId ? [input.nodeId] : [],
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

  const dataLayer = getAraDataLayer();

  try {
    const docs = await dataLayer.listDocuments<any>(sourcesCollection(userId), { limit: 200 });
    if (!docs || docs.length === 0) return [];

    const decrypted = await Promise.allSettled(
      docs
        .filter((d) => !d.archived && !d.isArchived)
        .map((d) => decryptSource(d, encryptionKey)),
    );

    const failed = decrypted.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(
        `[Scout] ${failed}/${docs.length} source(s) could not be decrypted — ` +
        `possible key mismatch or data corruption. Sources will be skipped.`
      );
    }

    return decrypted
      .filter((r): r is PromiseFulfilledResult<SourceEntryDecrypted> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  } catch {
    return [];
  }
}

/** Update mutable fields on an existing source. */
export async function updateSource(
  id: string,
  patch: Partial<SourceEntryDecrypted>,
  { userId, encryptionKey }: SourceContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const dataLayer = getAraDataLayer();
  const col = sourcesCollection(userId);
  const raw = await dataLayer.getDocument<any>(col, id);
  if (!raw) return;

  let encryptedData = raw.encryptedData;
  let iv = raw.iv;

  if (patch.title !== undefined || patch.snippet !== undefined || patch.tags !== undefined || patch.imageUrl !== undefined || patch.favicon !== undefined) {
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
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : currentMeta.imageUrl,
      favicon: patch.favicon !== undefined ? patch.favicon : currentMeta.favicon,
      tags: patch.tags !== undefined ? patch.tags : currentMeta.tags,
    };

    const encrypted = await encryptMetadata(updatedMeta, encryptionKey);
    encryptedData = encrypted.encryptedData;
    iv = encrypted.iv;
  }

  const updated: any = {
    ...raw,
    readStatus: patch.readStatus !== undefined ? patch.readStatus : (raw.readStatus || (raw.readAt ? 'read' : 'unread')),
    starred: patch.starred !== undefined ? patch.starred : (raw.starred ?? raw.isStarred ?? false),
    archived: patch.archived !== undefined ? patch.archived : (raw.archived ?? raw.isArchived ?? false),
    citingNodeIds: patch.citingNodeIds !== undefined ? patch.citingNodeIds : (raw.citingNodeIds || (raw.nodeId ? [raw.nodeId] : [])),
    lastAccessedAt: patch.lastAccessedAt !== undefined ? patch.lastAccessedAt : raw.lastAccessedAt,
    encryptedData,
    iv,
  };

  await dataLayer.setDocument(col, id, updated);
}

/** Soft-delete: set archived = true. */
export async function archiveSource(
  id: string,
  { userId }: SourceContext,
): Promise<void> {
  if (!userId) return;
  const dataLayer = getAraDataLayer();
  const col = sourcesCollection(userId);
  const raw = await dataLayer.getDocument<any>(col, id);
  if (!raw) return;
  await dataLayer.setDocument(col, id, { ...raw, archived: true });
}

/** Client-side text search over decrypted sources. */
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
