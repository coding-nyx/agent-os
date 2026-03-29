/**
 * useDeepResearch.ts
 *
 * State machine hook for orchestrating multi-step deep research workflows.
 *
 * Flow: idle → generating_questions → reviewing → searching → synthesizing → complete | error
 *
 * - Sub-question generation and synthesis use callStructuredLLM (OpenRouter)
 * - Parallel web searches use WebSearchService.searchBatch()
 * - Results are surfaced as a synthesis ScoutKnowledgeNode for the user to accept/discard
 * - AbortController supports cancellation at any stage
 */

import { useState, useCallback, useRef } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { WebCrawlerService as WebSearchService, type WebCrawlerResponse as WebSearchResponse } from '@/lib/services/web-crawler-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ScoutKnowledgeNode } from '../services/scout-knowledge-service';
import { queryKnowledgeNodes } from '../services/scout-knowledge-service';
import type { AddSourceInput } from '../services/scout-sources-service';
import { updateSession } from '../services/scout-session-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeepResearchStatus =
  | 'idle'
  | 'planning'
  | 'generating_questions'
  | 'reviewing'
  | 'searching'
  | 'synthesizing'
  | 'recursive_analysis'
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

export interface ResearchPlan {
  hypothesis: string;
  goals: string[];
  existingCoverage: string[];
  gaps: string[];
  sourceStrategy: 'academic' | 'news' | 'technical' | 'mixed';
}

export interface DeepResearchState {
  status: DeepResearchStatus;
  query: string;
  depth: 'quick' | 'deep';
  recursionLevel: number;
  useExpertSources: boolean;
  subQuestions: SubQuestion[];
  results: SubQuestionResult[];
  result: DeepResearchResult | null;
  plan: ResearchPlan | null;
  progress: DeepResearchProgress;
  error: string | null;
}

export type UseDeepResearchReturn = DeepResearchState & {
  start: (query: string, options?: { depth?: 'quick' | 'deep'; useExpertSources?: boolean }) => Promise<void>;
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
  sessionId?: string | null;
  onComplete?: (result: DeepResearchResult) => void;
  onProgress?: (state: DeepResearchState) => void;
}

const INITIAL_STATE: DeepResearchState = {
  status: 'idle',
  query: '',
  depth: 'quick',
  recursionLevel: 0,
  useExpertSources: false,
  subQuestions: [],
  results: [],
  result: null,
  plan: null,
  progress: { current: 0, total: 0 },
  error: null,
};

const SUB_QUESTION_SYSTEM_PROMPT = `You are an expert research strategist.
Given a research topic, generate 3-5 targeted sub-questions that together provide comprehensive coverage.
Each question should explore a different angle: definitions, evidence, applications, criticisms, future directions.
Respond with a JSON array strictly: [{"id":"q1","question":"...","rationale":"..."}]`;

const SYNTHESIS_SYSTEM_PROMPT = `You are a research analyst synthesizing evidence into a precise knowledge claim.

SYNTHESIS METHOD:
1. Identify the consensus position across sources
2. Weight evidence: primary source > peer-reviewed > news > blog; recency boosts weight
3. Flag contradictions explicitly — do not average them away
4. Form a falsifiable, specific claim (avoid vague "may help" language)
5. Status rules: "verified" = 3+ corroborating sources + no major contradictions; "contested" = direct conflicts found; otherwise "pending"

Respond with the ScoutKnowledgeNode JSON schema. Include extra fields: reasoning, contradictions, followUpQuestions.`;

export function useDeepResearch({
  userId,
  encryptionKey,
  sessionId,
  onComplete,
  onProgress,
}: UseDeepResearchOptions = {}): UseDeepResearchReturn {
  const { generateJSON } = useAI();
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
    async (query: string, options: { depth?: 'quick' | 'deep'; useExpertSources?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const depth = options.depth || 'quick';
      const useExpertSources = options.useExpertSources || false;

      Spine.publish({
        type: 'DEEP_RESEARCH_REQUESTED',
        source: 'scout',
        domain: 'C',
        priority: 'info',
        data: { query, depth, useExpertSources },
      });

      updateState({
        status: 'generating_questions',
        query,
        depth,
        useExpertSources,
        subQuestions: [],
        results: [],
        result: null,
        plan: null,
        progress: { current: 0, total: 0 },
        error: null,
      });

      Spine.publish({
        type: 'DEEP_RESEARCH_STARTED',
        source: 'scout',
        domain: 'C',
        priority: 'info',
        data: { query, depth, useExpertSources },
      });

      try {
        // Planning phase: audit KB and build research plan
        updateState({ status: 'planning' });

        let plan: ResearchPlan | null = null;
        if (userId && encryptionKey) {
          try {
            const existingNodes = await queryKnowledgeNodes(
              query,
              { userId, encryptionKey },
              { limit: 8, threshold: 0.45 },
            );

            const planResponse = await generateJSON<ResearchPlan>(
              `Research topic: "${query}"
Existing KB findings (${existingNodes.length}):
${existingNodes.map((n: any) => `- ${n.claim} (confidence: ${n.confidence.toFixed(2)})`).join('\n') || '(none)'}

Return JSON: {
  "hypothesis": "working hypothesis based on existing evidence",
  "goals": ["research goal 1", "research goal 2"],
  "existingCoverage": ["what KB already covers"],
  "gaps": ["what is missing"],
  "sourceStrategy": "academic|news|technical|mixed"
}`,
              { systemPrompt: 'You are a research planner. Be concise. Return only valid JSON.', temperature: 0.3, maxTokens: 400, signal: controller.signal },
            );

            if (planResponse && !controller.signal.aborted) {
              plan = planResponse;
              updateState({ plan });
            }
          } catch {
            // Non-fatal: continue without a plan
          }
        }

        // Now set status back to generating_questions for sub-question step
        updateState({ status: 'generating_questions' });

        const prompt = [
          `Research topic: "${query}"`,
          plan
            ? `Research plan:\n- Hypothesis: ${plan.hypothesis}\n- Gaps to address: ${plan.gaps.join('; ')}\n- Source strategy: ${plan.sourceStrategy}`
            : null,
          `Research depth: ${depth}`,
          useExpertSources ? `Priority: Peer-reviewed, academic, and clinical sources.` : null,
          `Generate ${depth === 'deep' ? '5-8' : '3-5'} targeted sub-questions${plan?.gaps.length ? ' that specifically address the identified gaps' : ''} as a JSON array.`
        ].filter(Boolean).join('\n\n');

        const response = await generateJSON<any>(
          prompt,
          {
            systemPrompt: SUB_QUESTION_SYSTEM_PROMPT,
            temperature: 0.4,
            maxTokens: 512,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        // Robust parsing: Handle if model wrapped array in an object (e.g. { "subquestions": [...] })
        let rawQuestions: any[] = [];
        if (Array.isArray(response)) {
          rawQuestions = response;
        } else if (response && typeof response === 'object') {
          // Look for common wrapper keys
          const possibleArray = response.subquestions || response.questions || response.items || response.sub_questions;
          if (Array.isArray(possibleArray)) {
            rawQuestions = possibleArray;
          } else {
            // Check if ANY value in the object is an array
            const values = Object.values(response);
            const foundArray = values.find(v => Array.isArray(v));
            if (foundArray) rawQuestions = foundArray as any[];
          }
        }

        const validQuestions = rawQuestions
          .filter((q): q is SubQuestion => typeof q?.question === 'string')
          .map((q, i) => ({
            id: q.id || `q_${i}`,
            question: q.question,
            rationale: q.rationale || '',
          }));

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
    [updateState, generateJSON, userId, encryptionKey],
  );

  // ── Confirm sub-questions and run searches ────────────────────────────────

  const confirmSubQuestions = useCallback(
    async (edited: SubQuestion[]) => {
      let controller = abortRef.current;
      if (!controller || controller.signal.aborted) return;

      updateState({
        status: 'searching',
        subQuestions: edited,
        progress: { current: 0, total: edited.length },
      });

      const queries = edited.map((q) => q.question);
      let searchResults: WebSearchResponse[] = [];

      // KB-first: check local knowledge base for each sub-question.
      // Skip web search for questions already covered with high confidence.
      const kbCache = new Map<string, WebSearchResponse>();
      if (userId && encryptionKey) {
        await Promise.allSettled(
          edited.map(async (q) => {
            const kbNodes = await queryKnowledgeNodes(q.question, { userId, encryptionKey }, { limit: 3, threshold: 0.75 });
            if (kbNodes.length > 0) {
              kbCache.set(q.question, {
                query: q.question,
                results: kbNodes.map(n => ({
                  title: n.claim.slice(0, 80),
                  url: n.source ?? `scout://knowledge/${n.id}`,
                  content: n.claim,
                  score: n.similarity,
                })),
              });
            }
          }),
        );
      }

      // Only search the web for sub-questions NOT covered by the local KB
      const questionsNeedingSearch = edited.filter(q => !kbCache.has(q.question));
      const queriesForSearch = questionsNeedingSearch.map(q => q.question);

      try {
        // Use batch search for efficiency; deep mode requests more content per result
        const webResponses = await WebSearchService.searchBatch(queriesForSearch, {
          maxResults: state.depth === 'deep' ? 8 : 5,
          signal: controller.signal,
          deepContent: state.depth === 'deep',
        });
        // Merge KB hits and web results back into the full ordered array
        searchResults = edited.map(q =>
          kbCache.get(q.question) ?? webResponses[questionsNeedingSearch.findIndex(sq => sq.question === q.question)] ?? { query: q.question, results: [] }
        );
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        // Fall back to empty results for any failed searches
        searchResults = edited.map(q =>
          kbCache.get(q.question) ?? { query: q.question, results: [] }
        );
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
        results: [...state.results, ...results],
        progress: { current: edited.length, total: edited.length },
      });

      // ── Synthesis ──────────────────────────────────────────────────────────

      const currentQuery = state.query || edited[0]?.question || 'Research topic';
      const allResults = [...state.results, ...results];

      const searchSummary = allResults
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
${state.plan ? `Initial hypothesis: ${state.plan.hypothesis}` : ''}

## Evidence by Sub-Question:
${searchSummary}

Synthesize following the method in the system prompt. Respond with JSON:
{
  "id": "deep_${Date.now()}",
  "claim": "precise evidence-based claim",
  "confidence": 0.0,
  "status": "verified|pending|contested",
  "evidence": ["url1"],
  "reasoning": "how you weighted the evidence",
  "contradictions": [],
  "followUpQuestions": [],
  "updatedAt": "${new Date().toISOString()}"
}`;

      try {
        const response = await generateJSON<any>(
          synthesisPrompt,
          {
            systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
            temperature: 0.3,
            maxTokens: 1024,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        // Robust parsing: handle if model wrapped the node object
        let synthesisNode = response;
        if (response && typeof response === 'object' && !response.claim && !response.title) {
          const possibleNode = response.node || response.knowledgeNode || response.finding || response.data;
          if (possibleNode && typeof possibleNode === 'object') {
            synthesisNode = possibleNode;
          } else {
            // Check if ANY value in the object looks like a node (has claim or title)
            const values = Object.values(response);
            const foundNode = values.find(v => v && typeof v === 'object' && ((v as any).claim || (v as any).title));
            if (foundNode) synthesisNode = foundNode;
          }
        }

        // ── Recursive Logic ──────────────────────────────────────────────────

        // Use followUpQuestions embedded in synthesis instead of a separate LLM call
        const followUps = Array.isArray(synthesisNode.followUpQuestions)
          ? synthesisNode.followUpQuestions.filter((q: any) => typeof q === 'string' && q.length > 0)
          : [];

        if (state.depth === 'deep' && state.recursionLevel < 2 && followUps.length > 0) {
          updateState({
            status: 'reviewing',
            subQuestions: followUps.map((q: string, i: number) => ({
              id: `r${state.recursionLevel}_${i}`,
              question: q,
              rationale: 'Gap identified during synthesis',
            })),
            recursionLevel: state.recursionLevel + 1,
          });
          return;
        }

        // Build captured sources list for auto-save into source library
        const capturedSources: AddSourceInput[] = allResults
          .flatMap((r) =>
            r.searchResponse.results.slice(0, 3).map((res, i) => ({
              url: res.url,
              title: res.title,
              snippet: res.content?.slice(0, 300),
              imageUrl: r.searchResponse.images?.[indexByUrl(res.url, r.searchResponse.images)] || r.searchResponse.images?.[0], 
              nodeId: synthesisNode.id || `deep_${Date.now()}`,
            })),
          )
          .filter((s) => s.url);

        const finalResult: DeepResearchResult = {
          query: currentQuery,
          subQuestions: [...state.subQuestions, ...edited],
          results: allResults,
          synthesisNode: {
            ...synthesisNode,
            id: synthesisNode.id ?? `deep_${Date.now()}`,
            updatedAt: synthesisNode.updatedAt ?? new Date().toISOString(),
            status: (synthesisNode.status as any) ?? 'pending',
            confidence: Math.min(1, Math.max(0, synthesisNode.confidence ?? 0.6)),
          },
          capturedSources,
        };

        updateState({ status: 'complete', result: finalResult });

        // Auto-save the parent session to 'complete' without requiring manual Accept click
        if (userId && sessionId) {
          updateSession(sessionId, {
            status: 'complete',
            resultNodeId: finalResult.synthesisNode.id,
          }, { userId }).catch(() => {/* non-fatal */});
        }

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
    [state.query, state.depth, state.results, state.subQuestions, state.recursionLevel, state.plan, updateState, generateJSON, onComplete],
  );

function indexByUrl(url: string, images?: string[]): number {
  if (!images) return 0;
  // Simple heuristic mapping
  return Math.abs(url.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)) % images.length;
}

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
