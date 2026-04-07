/**
 * useScoutPromptBuilder.ts
 *
 * Extracts the deterministic prompt-building logic from ScoutContent.
 * Produces fully-hydrated system prompts for both master and session flows
 * so the component layer stays thin.
 */

import { useCallback } from 'react';
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
import type { ResearchSession } from '../types';
import type { AddSourceInput, SourceEntryDecrypted } from '../services/scout-sources-service';

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
          rawUserText,
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
        rawUserText,
      ].join('\n\n');
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Session flow — active research session
  // -----------------------------------------------------------------------
  const buildSessionDeterministicPrompt = useCallback(
    async (rawUserText: string): Promise<string> => {
      if (!activeSession) return rawUserText;

      const intentDecision = classifyMasterIntent(rawUserText);

      if (
        intentDecision.intentClass === 'acknowledgment' ||
        intentDecision.intentClass === 'smalltalk' ||
        intentDecision.intentClass === 'conversational'
      ) {
        return [
          '[SESSION_FLOW_INSTRUCTION]',
          'Respond conversationally without triggering search.',
          `Detected intent: ${intentDecision.intentClass}.`,
          'Keep response concise and context-aware.',
          'Do not emit web_search or expanded_web_search for this turn.',
          '[USER_QUERY]',
          rawUserText,
        ].join('\n\n');
      }

      const shouldRecheck = isRecheckIntent(rawUserText);
      const sessionHits = shouldRecheck
        ? []
        : await queryKnowledgeNodes(
            rawUserText,
            { userId: userId ?? null, encryptionKey },
            { limit: 5, threshold: 0.62 },
          ).then((nodes) =>
            nodes.filter((node) => node.parentSessionId === activeSession.id),
          );

      const shouldSearch =
        shouldRecheck || intentDecision.shouldSearch || sessionHits.length === 0;

      if (!shouldSearch) {
        const hitLines = sessionHits
          .slice(0, 5)
          .map(
            (node) =>
              `- ${node.claim} (confidence: ${Math.round(node.confidence * 100)}%)`,
          )
          .join('\n');

        return [
          '[SESSION_FLOW_INSTRUCTION]',
          'Use session context first. Do not run web_search or expanded_web_search for this turn.',
          'Answer conversationally; do not force source blocks unless requested.',
          `[ACTIVE_SESSION_TOPIC] ${activeSession.topic}`,
          '[SESSION_CONTEXT_HITS]',
          hitLines,
          '[USER_QUERY]',
          rawUserText,
        ].join('\n\n');
      }

      const searchResponse = await WebCrawlerService.search(rawUserText, {
        maxResults: 5,
        includeImages: false,
      });
      const topResults = searchResponse.results.slice(0, 3);
      const digest = formatSearchDigest(rawUserText, searchResponse.results);

      if (userId && encryptionKey) {
        await Promise.allSettled(
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
                parentSessionId: activeSession.id,
                source: result.url,
                sources: [result.url],
              },
              { userId, encryptionKey },
            );
          }),
        );
        await updateSessionFn(activeSession.id, {
          lastSearchAt: new Date().toISOString(),
        });
      }

      return [
        '[SESSION_FLOW_INSTRUCTION]',
        'Use session context and the pre-fetched search context below to answer directly.',
        'Do not emit web_search or expanded_web_search for this turn.',
        intentDecision.shouldIncludeSources
          ? 'Include key sources.'
          : 'Do not add explicit source list unless user requests citations.',
        `[ACTIVE_SESSION_TOPIC] ${activeSession.topic}`,
        digest,
        '[USER_QUERY]',
        rawUserText,
      ].join('\n\n');
    },
    [activeSession, addSourceFn, encryptionKey, updateSessionFn, userId],
  );

  return {
    buildMasterDeterministicPrompt,
    buildSessionDeterministicPrompt,
  };
}
