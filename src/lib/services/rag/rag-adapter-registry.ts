import type { RagAdapter, RagRuntime } from './rag-adapter';
import { WebRagAdapter } from './adapters/web-rag-adapter';
import { NativeRagAdapterStub } from './adapters/native-rag-adapter';

class RagAdapterRegistry {
  private adapters = new Map<RagRuntime, RagAdapter>();

  constructor() {
    this.adapters.set('web', WebRagAdapter);
    this.adapters.set('native', NativeRagAdapterStub);
  }

  register(adapter: RagAdapter): void {
    this.adapters.set(adapter.runtime, adapter);
  }

  resolve(runtime: RagRuntime): RagAdapter {
    const adapter = this.adapters.get(runtime);
    if (!adapter) {
      throw new Error(`[RagService] Missing adapter for runtime "${runtime}"`);
    }
    return adapter;
  }
}

export const ragAdapterRegistry = new RagAdapterRegistry();
