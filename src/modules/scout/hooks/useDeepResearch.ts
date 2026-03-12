/**
 * useDeepResearch.ts
 *
 * State machine hook for orchestrating multi-step deep research workflows.
 *
 * Flow: idle → generating_questions → reviewing → searching → synthesizing → complete | error
 *
 * - Sub-question generation and synthesis use callStructuredLLM (Gemini)
 * - Parallel web searches use WebSearchService.searchBatch()
 * - Results are surfaced as a synthesis ScoutKnowledgeNode for the user to accept/discard
 * - AbortController supports cancellation at any stage
 */

import { useState, useCallback, useRef } from 'react';
import { callStructuredLLM } from '@/lib/ai-adapters/call-structured-llm';
import { WebSearchService, type WebSearchResponse } from '@/lib/services/web-search-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ScoutKnowledgeNode } from '../services/scout-knowledge-service';
import type { SourceEntryDecrypted } from '../services/scout-sources-service';
import type { AddSourceInput } from '../services/scout-sources-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeepResearchStatus =
  | 'idle'
  | 'generating_questions'
  | 'reviewing'
  | 'searching'
  | 'synthesizing'
  | 'complete'
  | 'error';

export interface SubQuestion {
  id: string;
  question: string;
  rationale?: string;
}

export interface SubQuestionResult {
  question: string;
  searchResponse: WebSearchResponse;
  status: 'ok' | 'error';
  error?: string;
}

export interface DeepResearchResult {
  query: string;
  subQuestions: SubQuestion[];
  results: SubQuestionResult[];
  synthesisNode: ScoutKnowledgeNode;
  capturedSources: AddSourceInput[];
}

export interface DeepResearchProgress {
  current: number;
  total: number;
  currentQuestion?: string;
}

export interface DeepResearchState {
  status: DeepResearchStatus;
  query: string;
  subQuestions: SubQuestion[];
  results: SubQuestionResult[];
  result: DeepResearchResult | null;
  progress: DeepResearchProgress;
  error: string | null;
}

export type UseDeepResearchReturn = DeepResearchState & {
  start: (query: string) => Promise<void>;
  confirmSubQuestions: (edited: SubQuestion[]) => Promise<void>;
  abort: () => void;
  reset: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseDeepResearchOptions {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
  onComplete?: (result: DeepResearchResult) => void;
  onProgress?: (state: DeepResearchState) => void;
}

const INITIAL_STATE: DeepResearchState = {
  status: 'idle',
  query: '',
  subQuestions: [],
  results: [],
  result: null,
  progress: { current: 0, total: 0 },
  error: null,
};

const SUB_QUESTION_SYSTEM_PROMPT = `You are an expert research strategist.
Given a research topic, generate 3-5 targeted sub-questions that together provide comprehensive coverage.
Each question should explore a different angle: definitions, evidence, applications, criticisms, future directions.
Respond with a JSON array: [{"id":"q1","question":"...","rationale":"..."}]`;

const SYNTHESIS_SYSTEM_PROMPT = `You are a research analyst synthesizing multiple web search results into a single knowledge node.
Respond with a JSON object matching the ScoutKnowledgeNode schema exactly.`;

export function useDeepResearch({
  onComplete,
  onProgress,
}: UseDeepResearchOptions = {}): UseDeepResearchReturn {
  const [state, setState] = useState<DeepResearchState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const updateState = useCallback(
    (patch: Partial<DeepResearchState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        onProgress?.(next);
        return next;
      });
    },
    [onProgress],
  );

  // ── Start: generate sub-questions ────────────────────────────────────────

  const start = useCallback(
    async (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      updateState({
        status: 'generating_questions',
        query,
        subQuestions: [],
        results: [],
        result: null,
        progress: { current: 0, total: 0 },
        error: null,
      });

      Spine.publish({
        type: 'DEEP_RESEARCH_STARTED',
        source: 'scout',
        domain: 'C',
        priority: 'info',
        data: { query },
      });

      try {
        const { data: questions } = await callStructuredLLM<SubQuestion[]>(
          `Research topic: "${query}"\n\nGenerate 3-5 targeted sub-questions as a JSON array.`,
          {
            systemPrompt: SUB_QUESTION_SYSTEM_PROMPT,
            temperature: 0.4,
            maxOutputTokens: 512,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        const validQuestions = Array.isArray(questions)
          ? questions.filter((q): q is SubQuestion => typeof q?.question === 'string')
          : [];

        if (validQuestions.length === 0) {
          throw new Error('No sub-questions were generated. Please rephrase the query and try again.');
        }

        updateState({
          status: 'reviewing',
          subQuestions: validQuestions,
          progress: { current: 0, total: validQuestions.length },
        });
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        updateState({
          status: 'error',
          error: err instanceof Error ? err.message : 'Sub-question generation failed',
        });
      }
    },
    [updateState],
  );

  // ── Confirm sub-questions and run searches ────────────────────────────────

  const confirmSubQuestions = useCallback(
    async (edited: SubQuestion[]) => {
      const controller = abortRef.current;
      if (!controller || controller.signal.aborted) return;

      updateState({
        status: 'searching',
        subQuestions: edited,
        progress: { current: 0, total: edited.length },
      });

      const queries = edited.map((q) => q.question);
      let searchResults: WebSearchResponse[] = [];

      try {
        // Use batch search for efficiency
        searchResults = await WebSearchService.searchBatch(queries, {
          maxResults: 5,
          signal: controller.signal,
        });
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        // Fall back to empty results array — synthesis can still run with partial data
        searchResults = queries.map((q) => ({ query: q, results: [] }));
      }

      if (controller.signal.aborted) return;

      const results: SubQuestionResult[] = edited.map((q, i) => ({
        question: q.question,
        searchResponse: searchResults[i] ?? { query: q.question, results: [] },
        status: searchResults[i]?.results?.length ? 'ok' : 'error',
        error: searchResults[i]?.results?.length
          ? undefined
          : 'No results found for this sub-question',
      }));

      updateState({
        status: 'synthesizing',
        results,
        progress: { current: edited.length, total: edited.length },
      });

      // ── Synthesis ──────────────────────────────────────────────────────────

      const currentQuery = state.query || edited[0]?.question || 'Research topic';

      const searchSummary = results
        .map(
          (r) =>
            `### ${r.question}\n` +
            r.searchResponse.results
              .slice(0, 3)
              .map((res) => `- **${res.title}** (${new URL(res.url).hostname}): ${res.content?.slice(0, 200) ?? ''}`)
              .join('\n'),
        )
        .join('\n\n');

      const synthesisPrompt = `Research query: "${currentQuery}"

## Search Results by Sub-Question:
${searchSummary}

Synthesize these results into a single ScoutKnowledgeNode JSON object:
{
  "id": "deep_${Date.now()}",
  "title": "concise title for this research topic",
  "claim": "the main evidence-based claim or finding",
  "confidence": 0.0-1.0,
  "status": "verified" | "pending" | "contested",
  "sources": ["url1", "url2"],
  "evidence": ["key finding 1", "key finding 2"],
  "updatedAt": "${new Date().toISOString()}"
}

Base confidence on source quality and consensus. Respond with JSON only.`;

      try {
        const { data: synthesisNode } = await callStructuredLLM<ScoutKnowledgeNode>(
          synthesisPrompt,
          {
            systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
            temperature: 0.3,
            maxOutputTokens: 1024,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        // Build captured sources list for auto-save into source library
        const capturedSources: AddSourceInput[] = results
          .flatMap((r) =>
            r.searchResponse.results.slice(0, 3).map((res) => ({
              url: res.url,
              title: res.title,
              snippet: res.content?.slice(0, 300),
              nodeId: synthesisNode.id,
            })),
          )
          .filter((s) => s.url);

        const finalResult: DeepResearchResult = {
          query: currentQuery,
          subQuestions: edited,
          results,
          synthesisNode: {
            ...synthesisNode,
            id: synthesisNode.id ?? `deep_${Date.now()}`,
            updatedAt: synthesisNode.updatedAt ?? new Date().toISOString(),
            status: synthesisNode.status ?? 'pending',
            confidence: Math.min(1, Math.max(0, synthesisNode.confidence ?? 0.6)),
          },
          capturedSources,
        };

        updateState({ status: 'complete', result: finalResult });

        Spine.publish({
          type: 'DEEP_RESEARCH_COMPLETED',
          source: 'scout',
          domain: 'C',
          priority: 'info',
          data: { query: currentQuery, nodeId: finalResult.synthesisNode.id },
        });

        onComplete?.(finalResult);
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        updateState({
          status: 'error',
          error: err instanceof Error ? err.message : 'Synthesis failed',
        });
      }
    },
    [state.query, updateState, onComplete],
  );

  // ── Abort ─────────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    updateState({ status: 'idle', error: null });
  }, [updateState]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    start,
    confirmSubQuestions,
    abort,
    reset,
  };
}
