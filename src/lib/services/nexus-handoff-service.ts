export type NexusHandoffType = 'delegate' | 'query' | 'query_result';

export interface NexusHandoff {
  moduleId: string;
  type: NexusHandoffType;
  content: string;
  reason?: string;
  sourceModuleId?: string;
  createdAt: string;
}

const STORAGE_KEY = 'agnes_nexus_handoff';

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
    store[handoff.moduleId] = handoff;
    writeStore(store);
  },

  consume(moduleId: string): NexusHandoff | null {
    const store = readStore();
    const handoff = store[moduleId];
    if (!handoff) return null;
    delete store[moduleId];
    writeStore(store);
    return handoff;
  }
};
