export type NexusHandoffType = 'delegate' | 'query' | 'query_result';

export interface NexusHandoff {
  moduleId: string;
  type: NexusHandoffType;
  content: string;
  reason?: string;
  sourceModuleId?: string;
  createdAt: string;
}

const STORAGE_KEY = 'nexus_nexus_handoff';

function readStore(): Record<string, NexusHandoff> {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, NexusHandoff>;
  } catch {
    return {};
  }
}

function writeStore(next: Record<string, NexusHandoff>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export const NexusHandoffService = {
  store(handoff: NexusHandoff) {
    const store = readStore();
    // Enforce content size limit
    const safeHandoff = { ...handoff, content: handoff.content.slice(0, 4000) };
    // Prune stale entries (> 10 min old)
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    for (const key of Object.keys(store)) {
      if (new Date(store[key].createdAt).getTime() < tenMinAgo) delete store[key];
    }
    store[safeHandoff.moduleId] = safeHandoff;
    writeStore(store);
  },

  consume(moduleId: string): NexusHandoff | null {
    const store = readStore();
    const handoff = store[moduleId];
    if (!handoff) return null;
    // Always prune the entry regardless of freshness
    delete store[moduleId];
    writeStore(store);
    // Reject stale handoffs — only hasPending() was previously checking TTL
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    if (new Date(handoff.createdAt).getTime() < tenMinAgo) {
      console.warn(`[NexusHandoffService] Discarding stale handoff for "${moduleId}" (age > 10 min)`);
      return null;
    }
    return handoff;
  },

  /** Non-destructive check: returns true if a fresh (< 10 min old) handoff exists for this module. */
  hasPending(moduleId: string): boolean {
    const store = readStore();
    const handoff = store[moduleId];
    if (!handoff) return false;
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    return new Date(handoff.createdAt).getTime() >= tenMinAgo;
  },
};
