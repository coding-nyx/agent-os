/**
 * useScoutPromptBuilder.ts
 *
 * Extracts the deterministic prompt-building logic from ScoutContent.
 * Produces fully-hydrated system prompts for both master and session flows
 * so the component layer stays thin.
 *
 * Session flow now implements a proper RAG pipeline:
 *   1. Retrieve — semantic search over ALL knowledge nodes (global + session)
 *   2. Score    — coverage evaluated by ScoutSessionContextAssemblerJs (cortex-logic)
 *   3. Augment  — web search triggered only when coverage < threshold
 *   4. Generate — LLM receives fused [SESSION_KNOWLEDGE] + [FRESH_WEB_EVIDENCE] context
 *
 * Context assembly (formatting, scoring, off-topic detection) lives in
 * ScoutSessionContextAssemblerJs (cortex-logic KMP) — pure domain logic.
 * Async I/O (Firestore retrieval, web crawl) stays in Agnes.
 */

import { useCallback, useRef } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { WebCrawlerService } from '@/lib/services/web-crawler-service';
import {
  classifyMasterIntent,
  formatSearchDigest,
  isRecheckIntent,
  updateMasterTopicStreakWithPolicy,
} from '../services/scout-flow-orchestrator';
import {
  queryKnowledgeNodes,
  addKnowledgeNode,
} from '../services/scout-knowledge-service';
import { ScoutSessionContextAssemblerJs as ScoutSessionContextAssembler } from '@cortex-logic';
import type { ResearchSession } from '../types';
import type { AddSourceInput, SourceEntryDecrypted } from '../services/scout-sources-service';

// ---------------------------------------------------------------------------
// Security: strip bracket-tag delimiters that could inject prompt structure
// ---------------------------------------------------------------------------

/** Remove structural markers ([TAG], <action>, <tool_call> etc.) from user input. */
function sanitizeUserInput(text: string): string {
  return text
    .replace(/\[([A-Z_]{3,})\]/g, '($1)')
    .replace(/<(action|thought|tool_call)\b[^>]*>/gi, '')
    .replace(/<\/(action|thought|tool_call)>/gi, '');
}

// ---------------------------------------------------------------------------
// Shared assembler instance
// ---------------------------------------------------------------------------

const _assembler = new ScoutSessionContextAssembler();

/** Coverage score below this threshold triggers a web search augmentation. */
const COVERAGE_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Params & Return types
// ---------------------------------------------------------------------------

interface UseScoutPromptBuilderParams {
  activeSession: ResearchSession | null;
  addSourceFn: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  encryptionKey: CryptoKey | null;
  updateSessionFn: (id: string, patch: Partial<ResearchSession>) => Promise<void>;
  userId: string | undefined;
}

interface UseScoutPromptBuilderReturn {
  buildMasterDeterministicPrompt: (rawUserText: string) => Promise<string>;
  buildSessionDeterministicPrompt: (rawUserText: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScoutPromptBuilder({
  activeSession,
  addSourceFn,
  encryptionKey,
  updateSessionFn,
  userId,
}: UseScoutPromptBuilderParams): UseScoutPromptBuilderReturn {
  // Keep a stable ref to activeSession so callbacks don't capture stale values
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  // -----------------------------------------------------------------------
  // Master flow — no active session
  // -----------------------------------------------------------------------
  const buildMasterDeterministicPrompt = useCallback(
    async (rawUserText: string): Promise<string> => {
      const intentDecision = classifyMasterIntent(rawUserText);
      const topicState = updateMasterTopicStreakWithPolicy({
        userText: rawUserText,
        shouldTrack: intentDecision.shouldTrackTopic,
      });

      if (topicState.shouldProposeSession) {
        Spine.emit({
          type: 'RESEARCH_PROPOSED',
          source: 'scout',
          domain: 'C',
          data: {
            userId,
            query: rawUserText,
            reason: `We've covered ${topicState.topicKey} across several exchanges — this looks like a research session candidate.`,
            mode: 'deep',
          },
          cascadeDepth: 0,
          priority: 'info',
        });
      }

      if (!intentDecision.shouldSearch) {
        return [
          '[MASTER_FLOW_INSTRUCTION]',
          'Respond naturally in conversational mode.',
          `Detected intent: ${intentDecision.intentClass}.`,
          intentDecision.conversationStyle === 'brief_ack'
            ? 'Keep it very short (one sentence).'
            : intentDecision.conversationStyle === 'chatty'
              ? 'Keep it warm, brief, and conversational.'
              : 'Provide a direct answer without forced citations.',
          'Do not emit web_search or expanded_web_search for this turn.',
          'Do not append a source list unless explicitly requested by the user.',
          '[USER_QUERY]',
          sanitizeUserInput(rawUserText),
        ].join('\n\n');
      }

      const response = await WebCrawlerService.search(rawUserText, {
        maxResults: 5,
        includeImages: false,
      });
      const digest = formatSearchDigest(rawUserText, response.results);

      return [
        '[MASTER_FLOW_INSTRUCTION]',
        'Use the pre-fetched search context below to answer directly.',
        'Do not emit web_search or expanded_web_search for this turn.',
        intentDecision.shouldIncludeSources
          ? 'Include key sources in the response.'
          : 'Do not add an explicit source list unless user requests citations.',
        digest,
        '[USER_QUERY]',
        sanitizeUserInput(rawUserText),
      ].join('\n\n');
    },
    [userId],
  );

  // -----------------------------------------------------------------------
  // Session flow — RAG pipeline
  // -----------------------------------------------------------------------
  const buildSessionDeterministicPrompt = useCallback(
    async (rawUserText: string): Promise<string> => {
      const session = activeSessionRef.current;
      if (!session) return rawUserText;

      const intentDecision = classifyMasterIntent(rawUserText);

      // Short-circuit: conversational turns (ack, smalltalk) don't need retrieval
      if (
        intentDecision.intentClass === 'acknowledgment' ||
        intentDecision.intentClass === 'smalltalk'
      ) {
        return [
          '[SESSION_FLOW_INSTRUCTION]',
          'Respond conversationally without triggering search.',
          `Detected intent: ${intentDecision.intentClass}.`,
          'Keep response concise and context-aware.',
          'Do not emit web_search or expanded_web_search for this turn.',
          '[USER_QUERY]',
          sanitizeUserInput(rawUserText),
        ].join('\n\n');
      }

      // ── STEP 1: Off-topic detection ─────────────────────────────────────
      // Only check when the query looks like a substantive question/request
      if (intentDecision.intentClass !== 'conversational') {
        const offTopic = _assembler.isOffTopic(rawUserText, session.topic);
        if (offTopic) {
          Spine.emit({
            type: 'SCOUT_OFF_TOPIC_DETECTED',
            source: 'scout',
            domain: 'C',
            data: {
              userId,
              query: rawUserText,
              sessionTopic: session.topic,
              sessionId: session.id,
            },
            cascadeDepth: 0,
            priority: 'info',
          });

          return [
            '[SESSION_ROUTING_REQUIRED]',
            `The user's query appears off-topic from the active session: "${session.topic}".`,
            'Present EXACTLY TWO options in your response using numbered markdown:',
            '1. **Switch to Scout Master** — exit this session and explore the new topic generally',
            `2. **New Session: ${rawUserText.slice(0, 60)}** — start a focused research session`,
            'Do not answer the user question directly. Do not emit web_search.',
            `Emit: <action type="propose_research">{"query":"${sanitizeUserInput(rawUserText).replace(/"/g, "'")}","reason":"off-topic from active session","mode":"web"}</action>`,
            '[USER_QUERY]',
            sanitizeUserInput(rawUserText),
          ].join('\n\n');
        }
      }

      // ── STEP 2: Retrieve — semantic search over ALL knowledge nodes ──────
      // No parentSessionId filter — retrieve globally relevant knowledge.
      // Annotate which nodes belong to the active session.
      const shouldRecheck = isRecheckIntent(rawUserText);
      const allRetrieved = shouldRecheck
        ? []
        : await queryKnowledgeNodes(
            rawUserText,
            { userId: userId ?? null, encryptionKey },
            { limit: 6, threshold: 0.55 },
          );

      const annotatedNodes = allRetrieved.map((node) => ({
        ...node,
        fromSession: node.parentSessionId === session.id,
      }));

      const nodesJson = JSON.stringify(
        annotatedNodes.map((n) => ({
          claim: n.claim,
          confidence: n.confidence,
          similarity: n.similarity,
          status: n.status,
          fromSession: n.fromSession,
        }))
      );

      // ── STEP 3: Coverage score — decide whether to augment with web ──────
      const coverage = _assembler.computeCoverageScore(nodesJson);
      const needsWebAugment =
        shouldRecheck ||
        intentDecision.shouldSearch ||
        coverage < COVERAGE_THRESHOLD;

      let webResultsJson = '[]';

      if (needsWebAugment) {
        try {
          const searchResponse = await WebCrawlerService.search(rawUserText, {
            maxResults: 5,
            includeImages: false,
          });

          const topResults = searchResponse.results.slice(0, 3);
          webResultsJson = JSON.stringify(
            topResults.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: (r.content ?? '').slice(0, 280),
            }))
          );

          // Auto-index web results as pending knowledge nodes (fire-and-forget)
          if (userId && encryptionKey) {
            Promise.allSettled(
              topResults.map(async (result) => {
                const source = await addSourceFn({
                  url: result.url,
                  title: result.title,
                  snippet: (result.content ?? '').slice(0, 280),
                  discoveredVia: 'search',
                });
                await addKnowledgeNode(
                  {
                    claim: (result.content ?? result.title).slice(0, 420),
                    confidence:
                      typeof result.score === 'number'
                        ? Math.min(0.85, result.score)
                        : 0.66,
                    evidence: source ? [source.id] : [],
                    status: 'pending',
                    parentSessionId: session.id,
                    source: result.url,
                    sources: [result.url],
                  },
                  { userId, encryptionKey },
                );
              }),
            ).then(() => {
              updateSessionFn(session.id, {
                lastSearchAt: new Date().toISOString(),
              });
            });
          }
        } catch (err) {
          console.warn('[ScoutPromptBuilder] Web search failed:', err);
        }
      }

      // ── STEP 4: Assemble fused context (cortex-logic domain logic) ───────
      const fusedContext = _assembler.assembleFusedContext(
        nodesJson,
        webResultsJson,
        session.topic,
        rawUserText,
      );

      // ── STEP 5: Build the full session prompt ─────────────────────────────
      const searchInstruction = needsWebAugment
        ? 'Use session knowledge + fresh web evidence to answer. Do not emit web_search for this turn.'
        : 'Use session context. Do not run web_search or expanded_web_search for this turn.';

      const sourcesInstruction = intentDecision.shouldIncludeSources
        ? 'Include key sources in the response.'
        : 'Do not add explicit source list unless user requests citations.';

      return [
        '[SESSION_FLOW_INSTRUCTION]',
        searchInstruction,
        sourcesInstruction,
        `[ACTIVE_SESSION_TOPIC] ${session.topic}`,
        fusedContext,
        '[USER_QUERY]',
        sanitizeUserInput(rawUserText),
      ].join('\n\n');
    },
    [addSourceFn, encryptionKey, updateSessionFn, userId],
  );

  return {
    buildMasterDeterministicPrompt,
    buildSessionDeterministicPrompt,
  };
}
