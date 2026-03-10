export interface RagRetrieveOptions {
  moduleId: string;
  query: string;
  encryptionKey?: CryptoKey | null;
  requiresVault: boolean;
}

export interface RagRetrieveResult {
  facts: string[];
  status: 'ok' | 'vault_blocked';
}

/**
 * Placeholder RAG adapter that enforces vault/E2EE boundaries.
 * Provider-specific implementations can replace this while keeping the contract.
 */
export const RagService = {
  async retrieve({ moduleId, query, encryptionKey, requiresVault }: RagRetrieveOptions): Promise<RagRetrieveResult> {
    if (!query.trim()) return { facts: [], status: 'ok' };

    if (requiresVault && !encryptionKey) {
      console.warn(`[RagService] Retrieval blocked: ${moduleId} requires vault key.`);
      return { facts: [], status: 'vault_blocked' };
    }

    // TODO: plug in real provider (e.g., Google GenAI embeddings) via adapter registry
    return { facts: [], status: 'ok' };
  }
};
