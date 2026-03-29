import type { ModuleMemoryEnvelope, SessionEventSummary, SemanticFact } from '@/lib/types';

export interface AppendEpisodicEventInput {
  uid: string;
  moduleId: string;
  event: SessionEventSummary;
  snapshot: string;
  encryptionKey?: CryptoKey | null;
  facts?: string[];
}

export interface CompactMemoryInput {
  uid: string;
  moduleId: string;
  encryptionKey?: CryptoKey | null;
  maxHistoryEvents?: number;
}

export interface CompactMemoryResult {
  compacted: boolean;
  eventCount?: number;
  snapshotTruncated?: boolean;
  historyCompacted?: boolean;
  estimatedBytes?: number;
  reason?: string;
}

export interface MemoryStore {
  getEnvelope(uid: string, moduleId: string, encryptionKey?: CryptoKey | null): Promise<ModuleMemoryEnvelope | null>;
  subscribeEnvelope(
    uid: string,
    moduleId: string,
    onUpdate: (envelope: ModuleMemoryEnvelope | null) => void,
    encryptionKey?: CryptoKey | null,
  ): () => void;
  appendEpisodicEvent(input: AppendEpisodicEventInput): Promise<void>;
  compact(input: CompactMemoryInput): Promise<CompactMemoryResult>;
  upsertSemanticFact(uid: string, fact: Omit<SemanticFact, 'id' | 'updatedAt'> & { id?: string }): Promise<void>;
}
