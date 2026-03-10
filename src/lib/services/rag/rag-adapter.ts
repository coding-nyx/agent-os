export type RagRuntime = 'web' | 'native';

export interface RagRetrieveOptions {
  moduleId: string;
  query: string;
  encryptionKey?: CryptoKey | null;
  requiresVault: boolean;
  // Used by pending recovery to replay retrieval deterministically.
  contextHash?: string;
}

export interface RagRetrieveResult {
  facts: string[];
  status: 'ok' | 'vault_blocked';
}

export interface RagAdapter {
  id: string;
  runtime: RagRuntime;
  retrieve(options: RagRetrieveOptions): Promise<RagRetrieveResult>;
}
