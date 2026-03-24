import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { useAliveEntityRetrieval } from './useAliveEntityRetrieval';

describe('useAliveEntityRetrieval', () => {
  it('loads alive entities and builds grouped runtime context', async () => {
    const dataLayer = new InMemoryDataLayer({
      'users/user-1/alive_entities': [
        {
          id: 'alive.goal.1',
          type: 'ACTION',
          label: 'Morning planning',
          semantic_tags: ['atlas', 'planning'],
          attributes: {},
          soul_impact_preset: {},
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        {
          id: 'alive.sleep.1',
          type: 'METRIC',
          label: 'Sleep 8h',
          semantic_tags: ['titan', 'sleep'],
          attributes: {},
          soul_impact_preset: {},
          sourceModule: 'titan',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
    });

    const { result } = renderHook(() => useAliveEntityRetrieval(dataLayer, 'user-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entities).toHaveLength(2);
    expect(result.current.context).toMatchObject({
      total: 2,
      moduleIds: ['atlas', 'titan'],
    });
  });
});
