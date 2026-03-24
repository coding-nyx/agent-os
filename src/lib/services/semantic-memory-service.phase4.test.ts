import { describe, expect, it } from 'vitest';
import { SemanticMemoryService } from './semantic-memory-service';
import type { SemanticFact } from '@/lib/types';

describe('SemanticMemoryService unified retrieval', () => {
  it('maps stored semantic facts into unified cited memory results', () => {
    const facts: SemanticFact[] = [
      {
        id: 'fact-1',
        moduleId: 'atlas',
        fact: 'Short resets improve long planning sessions.',
        confidence: 0.88,
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'fact-2',
        moduleId: 'ledger',
        fact: 'Budget review is calmer after Atlas planning.',
        confidence: 0.7,
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
    ];

    const results = SemanticMemoryService.getFactsUnifiedFromFacts(facts, ['atlas']);

    expect(results).toEqual([
      expect.objectContaining({
        id: 'semantic:fact-1',
        type: 'semantic',
        moduleId: 'atlas',
        text: 'Short resets improve long planning sessions.',
        confidence: 0.88,
        citation: expect.objectContaining({
          entityId: 'fact-1',
          label: 'Short resets improve long planning sessions.',
        }),
      }),
    ]);
  });
});
