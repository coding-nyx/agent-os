import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryOrchestrator } from './memory-orchestrator';
import { EpisodicMemoryService } from './episodic-memory-service';
import { SemanticMemoryService } from './semantic-memory-service';
import { RagService } from './rag/rag-service';

describe('MemoryOrchestrator unified retrieval', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('merges episodic, semantic, and rag results into a single ordered contract', async () => {
    vi.spyOn(EpisodicMemoryService, 'retrieveRelevantUnified').mockResolvedValue([
      {
        id: 'episodic:atlas:session-1',
        type: 'episodic',
        moduleId: 'atlas',
        text: 'You stabilized planning after a reset.',
        score: 0.91,
        timestamp: '2026-03-24T00:00:00.000Z',
        citation: {
          type: 'episodic',
          moduleId: 'atlas',
          entityId: 'session-1',
          label: 'Planning reset',
        },
      },
    ]);
    vi.spyOn(SemanticMemoryService, 'getFactsUnified').mockResolvedValue([
      {
        id: 'semantic:fact-1',
        type: 'semantic',
        moduleId: 'atlas',
        text: 'Short resets improve long planning blocks.',
        score: 0.88,
        confidence: 0.88,
        timestamp: '2026-03-23T00:00:00.000Z',
        citation: {
          type: 'semantic',
          moduleId: 'atlas',
          entityId: 'fact-1',
          label: 'Short resets improve long planning blocks.',
        },
      },
    ]);
    vi.spyOn(RagService, 'retrieve').mockResolvedValue({
      status: 'ok',
      facts: [
        {
          id: 'rag:1',
          type: 'rag',
          moduleId: 'atlas',
          text: 'External research also supports short reset intervals.',
          score: 0.74,
          timestamp: '2026-03-22T00:00:00.000Z',
          citation: {
            type: 'rag',
            moduleId: 'atlas',
            entityId: 'rag:1',
            label: 'External research also supports short reset intervals.',
          },
        },
      ],
    });

    const result = await MemoryOrchestrator.retrieveUnifiedContext(
      'user-1',
      'atlas',
      'planning reset',
      [],
      false,
      false,
      [],
      { requiresVault: false, encryptionKey: null },
    );

    expect(result.status).toBe('ok');
    expect(result.results.map((entry) => entry.type)).toEqual(['episodic', 'semantic', 'rag']);
    expect(result.recalledSessionsSummary).toContain('You stabilized planning after a reset.');
    expect(result.recalledFactsSummary).toContain('Short resets improve long planning blocks.');
    expect(result.recalledFactsSummary).toContain('[RAG] External research also supports short reset intervals.');
  });
});
