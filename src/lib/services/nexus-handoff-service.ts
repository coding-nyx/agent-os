import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { NexusLogger } from '@/lib/nexus-logger';

export type NexusHandoffType = 'delegate' | 'query' | 'query_result';

export interface NexusHandoff {
  moduleId: string;
  type: NexusHandoffType;
  content: string;
  reason?: string;
  sourceModuleId?: string;
  createdAt: string;
}

const SESSION_CACHE_KEY = 'nexus_nexus_handoff';
const HANDOFFS_COLLECTION = 'handoffs';

let _userId: string | null = null;

function readCache(): Record<string, NexusHandoff> {
  const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, NexusHandoff>;
  } catch {
    return {};
  }
}

function writeCache(next: Record<string, NexusHandoff>) {
  sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(next));
}

function pendingCollection(): string {
  return `${HANDOFFS_COLLECTION}/${_userId}/pending`;
}

export const NexusHandoffService = {
  /**
   * Call once when auth resolves. Required for cross-tab / tab-refresh persistence.
   * Drains any pre-existing sessionStorage entries into Firestore on first call.
   */
  init(userId: string) {
    _userId = userId;
    void this._migrate();
  },

  async _migrate() {
    if (!_userId) return;
    const cache = readCache();
    if (Object.keys(cache).length === 0) return;
    const dl = getNexusDataLayer();
    for (const [moduleId, handoff] of Object.entries(cache)) {
      await dl
        .setDocument<NexusHandoff>(pendingCollection(), moduleId, handoff)
        .catch((e) => { NexusLogger.warn('HandoffService', 'Failed to write handoff document', e); });
    }
    // sessionStorage now serves only as a same-tab write-through cache
  },

  store(handoff: NexusHandoff) {
    const safe = { ...handoff, content: handoff.content.slice(0, 4000) };

    // Populate the same-tab cache immediately (sync, zero-latency fast path)
    const cache = readCache();
    cache[safe.moduleId] = safe;
    writeCache(cache);

    // Persist to Firestore so the handoff survives tab refresh and cross-tab navigation
    if (_userId) {
      getNexusDataLayer()
        .setDocument<NexusHandoff>(pendingCollection(), safe.moduleId, safe)
        .catch((e) =>
          console.error('[NexusHandoffService] Firestore write failed:', e)
        );
    }
  },

  /**
   * Destructively reads and removes the pending handoff for `moduleId`.
   * Checks the same-tab sessionStorage cache first (fast path), then falls back
   * to Firestore for cross-tab or post-refresh scenarios.
   */
  async consume(moduleId: string): Promise<NexusHandoff | null> {
    // Fast path: same-tab cache hit
    const cache = readCache();
    if (cache[moduleId]) {
      const handoff = cache[moduleId];
      delete cache[moduleId];
      writeCache(cache);
      if (_userId) {
        getNexusDataLayer()
          .deleteDocument(pendingCollection(), moduleId)
          .catch((e) => { NexusLogger.warn('HandoffService', 'Failed to delete handoff document', e); });
      }
      return handoff;
    }

    // Fallback: cross-tab / refresh — fetch from Firestore
    if (!_userId) return null;
    const dl = getNexusDataLayer();
    try {
      const doc = await dl.getDocument<NexusHandoff>(pendingCollection(), moduleId);
      if (!doc) return null;
      await dl.deleteDocument(pendingCollection(), moduleId).catch((e) => { NexusLogger.warn('HandoffService', 'Failed to delete handoff document', e); });
      return doc;
    } catch (err) {
      console.warn('[NexusHandoffService] Failed to consume handoff from Firestore:', err);
      return null;
    }
  },

  /**
   * Non-destructive check: returns true if a handoff exists in the same-tab cache.
   * Used for UI health indicators — does not query Firestore.
   */
  hasPending(moduleId: string): boolean {
    return !!readCache()[moduleId];
  },
};
