import { describe, it, expect } from 'vitest';
import { RagService } from './rag-service';
import type { RagAdapter } from './rag-adapter';

describe('RagService', () => {
  it('blocks retrieval when vault key is required but missing', async () => {
    const res = await RagService.retrieve({
      moduleId: 'agnes',
      query: 'test',
      requiresVault: true,
      encryptionKey: null
    });
    expect(res.status).toBe('vault_blocked');
    expect(res.facts).toHaveLength(0);
  });

  it('allows retrieval when vault not required', async () => {
    const res = await RagService.retrieve({
      moduleId: 'atlas',
      query: 'test',
      requiresVault: false,
      encryptionKey: null
    });
    expect(res.status).toBe('ok');
  });

  it('supports runtime adapter selection for native stubs', async () => {
    const res = await RagService.retrieve({
      runtime: 'native',
      moduleId: 'titan',
      query: 'latest biomarker trend',
      requiresVault: false,
      encryptionKey: null
    });
    expect(res.status).toBe('ok');
  });

  it('allows adapter overrides through registry', async () => {
    const testAdapter: RagAdapter = {
      id: 'test-web',
      runtime: 'web',
      async retrieve() {
        return { status: 'ok', facts: ['from test adapter'] };
      }
    };
    RagService.registerAdapter(testAdapter);

    const res = await RagService.retrieve({
      moduleId: 'atlas',
      query: 'focus window',
      requiresVault: false,
      encryptionKey: null
    });
    expect(res.facts).toContain('from test adapter');
  });
});
