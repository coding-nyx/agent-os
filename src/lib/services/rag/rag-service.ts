import { ragAdapterRegistry } from './rag-adapter-registry';
import type { RagAdapter, RagRetrieveOptions, RagRetrieveResult, RagRuntime } from './rag-adapter';

export type { RagAdapter, RagRetrieveOptions, RagRetrieveResult, RagRuntime } from './rag-adapter';

export interface RagServiceRetrieveOptions extends RagRetrieveOptions {
  runtime?: RagRuntime;
}

/**
 * Runtime-selected RAG entrypoint that preserves vault/E2EE guardrails.
 */
export const RagService = {
  registerAdapter(adapter: RagAdapter): void {
    ragAdapterRegistry.register(adapter);
  },

  async retrieve({ runtime = 'web', ...options }: RagServiceRetrieveOptions): Promise<RagRetrieveResult> {
    const adapter = ragAdapterRegistry.resolve(runtime);
    return adapter.retrieve(options);
  }
};
