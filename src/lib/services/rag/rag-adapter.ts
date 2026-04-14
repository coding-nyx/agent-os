import type { UnifiedMemoryResult } from '@/lib/types';

export type RagRuntime = 'web' | 'native';

export interface RagRetrieveOptions {
  moduleId: string;
  query: string;
  userId?: string;
  encryptionKey?: CryptoKey | null;
  requiresVault: boolean;
  /** Maximum number of results to return. Defaults to 6. */
  topK?: number;
  // Used by pending recovery to replay retrieval deterministically.
  contextHash?: string;
}

export interface RagRetrieveResult {
  facts: UnifiedMemoryResult[];
  status: 'ok' | 'vault_blocked';
}

export interface RagAdapter {
  id: string;
  runtime: RagRuntime;
  retrieve(options: RagRetrieveOptions): Promise<RagRetrieveResult>;
}
