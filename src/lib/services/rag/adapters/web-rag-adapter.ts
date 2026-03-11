import type { RagAdapter, RagRetrieveOptions, RagRetrieveResult } from '../rag-adapter';

/**
 * Web adapter for vault-safe retrieval.
 * Provider-specific retrieval can be wired here without changing app contracts.
 */
export const WebRagAdapter: RagAdapter = {
  id: 'web-vault-safe',
  runtime: 'web',
  async retrieve({ moduleId, query, encryptionKey, requiresVault }: RagRetrieveOptions): Promise<RagRetrieveResult> {
    if (!query.trim()) return { facts: [], status: 'ok' };

    if (requiresVault && !encryptionKey) {
      console.warn(`[RagService] Retrieval blocked: ${moduleId} requires vault key.`);
      return { facts: [], status: 'vault_blocked' };
    }

    // TODO(S10-007): plug in real provider (e.g., Google GenAI embeddings) through this adapter.
    return { facts: [], status: 'ok' };
  }
};
