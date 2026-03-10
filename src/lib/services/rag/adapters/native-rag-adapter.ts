import type { RagAdapter, RagRetrieveOptions, RagRetrieveResult } from '../rag-adapter';

/**
 * Non-web/KMP/native stub adapter.
 * Intended to be replaced by platform keyring + offline queue implementations.
 */
export const NativeRagAdapterStub: RagAdapter = {
  id: 'native-stub',
  runtime: 'native',
  async retrieve({ moduleId, query, encryptionKey, requiresVault }: RagRetrieveOptions): Promise<RagRetrieveResult> {
    if (!query.trim()) return { facts: [], status: 'ok' };

    if (requiresVault && !encryptionKey) {
      console.warn(`[RagService][NativeStub] Retrieval blocked: ${moduleId} requires secure keyring key.`);
      return { facts: [], status: 'vault_blocked' };
    }

    // Stub behavior for Sprint 2 closure. Native implementations should:
    // 1) resolve encryption keys from secure keyring
    // 2) queue retrieval/offline sync events through Spine when disconnected
    return { facts: [], status: 'ok' };
  }
};
