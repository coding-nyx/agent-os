import { describe, expect, it, vi } from 'vitest';
import { ActionHub, type ActionContext } from './action-hub';

function makeContext(moduleId: string): ActionContext {
  return {
    userId: 'u1',
    isGuest: false,
    moduleId,
    payload: {},
    emitSpineEvent: vi.fn(),
    updateGlobalSoul: vi.fn().mockResolvedValue(undefined),
    delegateToModule: vi.fn(),
  };
}

describe('ActionHub NSV read-only guardrails', () => {
  it('allows scout to write whitelisted cognitive keys', async () => {
    const actionType = `__test_readonly_scout_${crypto.randomUUID()}`;
    const ctx = makeContext('scout');
    ActionHub.register('scout', actionType, async (c) => {
      await c.updateGlobalSoul({ cognitive: { researchLoad: 7 } });
    });

    await expect(ActionHub.execute('scout', actionType, ctx)).resolves.toBe(true);
    expect(ctx.updateGlobalSoul).toHaveBeenCalledWith({ cognitive: { researchLoad: 7 } });
  });

  it('silently drops blocked keys for scout without throwing', async () => {
    const actionType = `__test_readonly_scout_blocked_${crypto.randomUUID()}`;
    const ctx = makeContext('scout');
    ActionHub.register('scout', actionType, async (c) => {
      await c.updateGlobalSoul({ biological: { hrv: 50 } });
    });

    await expect(ActionHub.execute('scout', actionType, ctx)).resolves.toBe(true);
    expect(ctx.updateGlobalSoul).not.toHaveBeenCalled();
  });

  it('silently drops all keys for forge without throwing', async () => {
    const actionType = `__test_readonly_forge_${crypto.randomUUID()}`;
    const ctx = makeContext('forge');
    ActionHub.register('forge', actionType, async (c) => {
      await c.updateGlobalSoul({ cognitive: { activeLoad: 3 } });
    });

    await expect(ActionHub.execute('forge', actionType, ctx)).resolves.toBe(true);
    expect(ctx.updateGlobalSoul).not.toHaveBeenCalled();
  });

  it('allows non read-only modules to write Global Soul', async () => {
    const actionType = `__test_readonly_atlas_${crypto.randomUUID()}`;
    const ctx = makeContext('atlas');
    ActionHub.register('atlas', actionType, async (c) => {
      await c.updateGlobalSoul({ cognitive: { focusScore: 8 } });
    });

    await expect(ActionHub.execute('atlas', actionType, ctx)).resolves.toBe(true);
    expect(ctx.updateGlobalSoul).toHaveBeenCalledWith({ cognitive: { focusScore: 8 } });
  });
});
