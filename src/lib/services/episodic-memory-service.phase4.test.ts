import { describe, expect, it } from 'vitest';
import { EpisodicMemoryService } from './episodic-memory-service';
import type { ModuleMemoryEnvelope } from '@/lib/types';

describe('EpisodicMemoryService unified retrieval', () => {
  it('maps retrieved envelope events into unified cited memory results', async () => {
    const envelopes: ModuleMemoryEnvelope[] = [
      {
        moduleId: 'atlas',
        lastActive: '2026-03-24T00:00:00.000Z',
        latestSnapshot: 'Planning felt clearer after a reset.',
        eventHistory: [
          {
            id: 'session-1',
            timestamp: '2026-03-24T00:00:00.000Z',
            summary: 'Planning felt clearer after a reset.',
            keyInsights: ['reset improved focus'],
            sentiment: 0.4,
            tokenUsage: 120,
          },
        ],
        metadata: {},
      },
    ];

    const results = await EpisodicMemoryService.retrieveRelevantUnifiedFromEnvelopes('planning reset', envelopes, {
      moduleIds: ['atlas'],
      topK: 5,
      recencyWeight: 0.3,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'episodic',
      moduleId: 'atlas',
      text: 'Planning felt clearer after a reset.',
      citation: {
        type: 'episodic',
        moduleId: 'atlas',
        entityId: 'session-1',
      },
    });
  });
});
