import type { MemoryStore, AppendEpisodicEventInput, CompactMemoryInput, CompactMemoryResult } from '@/lib/storage/domain/memory-store';
import type { ModuleMemoryEnvelope, SemanticFact } from '@/lib/types';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { SemanticMemoryService } from '@/lib/services/semantic-memory-service';

export class FirebaseMemoryStore implements MemoryStore {
  async getEnvelope(uid: string, moduleId: string, encryptionKey?: CryptoKey | null): Promise<ModuleMemoryEnvelope | null> {
    return ModuleMemoryService.getEnvelope(uid, moduleId, encryptionKey);
  }

  subscribeEnvelope(
    uid: string,
    moduleId: string,
    onUpdate: (envelope: ModuleMemoryEnvelope | null) => void,
    encryptionKey?: CryptoKey | null,
  ): () => void {
    return ModuleMemoryService.subscribeEnvelope(uid, moduleId, onUpdate, encryptionKey);
  }

  async appendEpisodicEvent(input: AppendEpisodicEventInput): Promise<void> {
    await ModuleMemoryService.commitSession(
      input.uid,
      input.moduleId,
      input.event,
      input.snapshot,
      { encryptionKey: input.encryptionKey, facts: input.facts },
    );
  }

  async compact(input: CompactMemoryInput): Promise<CompactMemoryResult> {
    return ModuleMemoryService.compactEnvelope(input.uid, input.moduleId, {
      encryptionKey: input.encryptionKey,
      maxHistoryEvents: input.maxHistoryEvents,
    });
  }

  async upsertSemanticFact(uid: string, fact: Omit<SemanticFact, 'id' | 'updatedAt'> & { id?: string }): Promise<void> {
    await SemanticMemoryService.upsertFact(uid, fact);
  }
}
