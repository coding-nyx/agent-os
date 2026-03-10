import { describe, it, expect } from 'vitest';
import { RagService } from './rag-service';

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
});
