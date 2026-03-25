/**
 * Intent LLM merge result types.
 *
 * The actual mergeIntents logic lives inside CommandIntelligenceService.parseWithLLM
 * and relies on normalizer helpers co-located in command-intelligence-service.ts.
 * This module defines the shared result contract used by callers and tests.
 */

import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';

export type ParserMode = 'phase1' | 'llm' | 'llm-fallback';

export interface MergeResult {
  envelope: ParsedCommandEnvelope;
  /** Which parser produced the final envelope. */
  parserMode: ParserMode;
}
