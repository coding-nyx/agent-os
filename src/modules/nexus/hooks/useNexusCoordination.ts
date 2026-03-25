import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import type { MessageContent, UnifiedMemoryResult } from '@/lib/types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { CommandIntelligenceService } from '@/lib/services/command-intelligence-service';
import { NexusActionPlannerService } from '@/lib/services/nexus-action-planner-service';
import { EpisodicMemoryService } from '@/lib/services/episodic-memory-service';
import { SemanticMemoryService } from '@/lib/services/semantic-memory-service';
import { OrchestrationCacheService } from '@/lib/services/orchestration-cache-service';
import { MemoryResultInjectionService } from '@/lib/services/memory-result-injection-service';

const MEMORY_SEARCH_MODULE_IDS: ModuleId[] = ['nexus', 'agnes', 'atlas', 'ledger', 'soma', 'titan', 'scout', 'forge'];

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export type NexusMemorySearchState = {
  query: string;
  results: UnifiedMemoryResult[];
  isSearching: boolean;
};

interface NexusCoordinationAI {
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: MessageContent }>;
  lastParsedCommand?: ParsedCommandEnvelope | null;
  handleSendMessage: (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
    options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string },
  ) => Promise<void>;
}

function shouldKeepMentionedAgentInThread(
  parsedCommand: ParsedCommandEnvelope | null | undefined,
  target: ModuleId,
): boolean {
  const mention = parsedCommand?.mentions?.find((candidate) => candidate.moduleId === target);
  if (!mention) return false;
  if (mention.disposition === 'ownership') return false;
  if (mention.disposition === 'consultative') return true;

  const targetedIntents = parsedCommand?.intents.filter((intent) => intent.candidateModules.includes(target)) ?? [];
  if (targetedIntents.length === 0) return true;

  return targetedIntents.every((intent) => !intent.mutatesState);
}

interface UseNexusCoordinationInput {
  ai: NexusCoordinationAI;
  userId?: string;
  isGuest: boolean;
  currentThreadId: string;
  autopilotLevel: 0 | 1 | 2 | 3 | 4 | 5;
  navigate: (path: string) => void;
  setThreadRoutingSuggestion: (
    threadId: string,
    suggestion: { target: ModuleId; reason?: string; confidence?: number; state: 'draft' | 'deferred' } | null,
  ) => void;
  patchThreadRoutingSuggestion: (
    threadId: string,
    patch: Partial<{ target: ModuleId; reason?: string; confidence?: number; state: 'draft' | 'deferred' }>,
  ) => void;
  clearThreadRoutingSuggestion: (threadId: string) => void;
}

export function useNexusCoordination(input: UseNexusCoordinationInput) {
  const {
    ai,
    userId,
    isGuest,
    currentThreadId,
    autopilotLevel,
    navigate,
    setThreadRoutingSuggestion,
    patchThreadRoutingSuggestion,
    clearThreadRoutingSuggestion,
  } = input;
  const [memorySearchState, setMemorySearchState] = useState<NexusMemorySearchState | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const paletteMemoryQueryRef = useRef<string | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  const resolveMemorySearchResults = useCallback(async (query: string, moduleIds = MEMORY_SEARCH_MODULE_IDS) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    if (!userId || isGuest) {
      setMemorySearchState({
        query: trimmedQuery,
        results: [],
        isSearching: false,
      });
      return;
    }

    setMemorySearchState({
      query: trimmedQuery,
      results: [],
      isSearching: true,
    });

    try {
      const cacheKey = [
        userId,
        trimmedQuery.toLowerCase(),
        [...moduleIds].sort().join(','),
      ].join('|');
      const [sessions, facts] = await OrchestrationCacheService.rememberAsync(
        'memory-search',
        cacheKey,
        () => Promise.all([
          EpisodicMemoryService.retrieveRelevantUnified(userId, trimmedQuery, {
            moduleIds,
            topK: 5,
            recencyWeight: 0.3,
          }),
          SemanticMemoryService.getFactsUnified(userId, moduleIds),
        ]),
      );
      setMemorySearchState({
        query: trimmedQuery,
        results: [...sessions, ...facts].sort((left, right) => right.score - left.score),
        isSearching: false,
      });
    } catch (error) {
      console.error('[useNexusCoordination] Failed to resolve memory search results:', error);
      setMemorySearchState({
        query: trimmedQuery,
        results: [],
        isSearching: false,
      });
    }
  }, [isGuest, userId]);

  const presentRoutingSuggestion = useCallback((target: ModuleId, reason?: string, confidence?: number) => {
    const routingDecision = OrchestrationInteractionGateService.evaluate({
      autopilotLevel,
      candidate: {
        kind: 'routing',
        sourceModuleId: 'nexus',
        targetModuleId: target,
        threadId: currentThreadId,
        confidence,
        canAutoDispatch: true,
      },
    });
    if (routingDecision.mode === 'silent_delegate') {
      const manifest = MODULE_MANIFEST[target];
      if (manifest) {
        navigate(manifest.route);
      }
      clearThreadRoutingSuggestion(currentThreadId);
      return;
    }

    setThreadRoutingSuggestion(currentThreadId, { target, reason, confidence, state: 'draft' });
    setSuggestionCount((prev) => prev + 1);
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = setTimeout(() => {
      patchThreadRoutingSuggestion(currentThreadId, { state: 'deferred' });
    }, 8000);
  }, [autopilotLevel, clearThreadRoutingSuggestion, currentThreadId, navigate, patchThreadRoutingSuggestion, setThreadRoutingSuggestion]);

  const handleActionParsed = useCallback((type: string, payload: Record<string, unknown>) => {
    if (type === 'delegate_to_module' && typeof payload?.moduleId === 'string') {
      const targetModuleId = payload.moduleId as ModuleId;
      const reason = typeof payload?.reason === 'string' ? payload.reason : undefined;
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : undefined;
      presentRoutingSuggestion(targetModuleId, reason, confidence);
      return;
    }
    if (type === 'search_memory') {
      const query =
        typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.content === 'string'
            ? payload.content
            : typeof payload?.question === 'string'
              ? payload.question
              : '';
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      if (paletteMemoryQueryRef.current === trimmedQuery) {
        paletteMemoryQueryRef.current = null;
        return;
      }

      const requestedModuleIds = Array.isArray(payload?.moduleIds)
        ? payload.moduleIds.filter((id): id is ModuleId => typeof id === 'string')
        : MEMORY_SEARCH_MODULE_IDS;
      void resolveMemorySearchResults(trimmedQuery, requestedModuleIds);
    }
  }, [presentRoutingSuggestion, resolveMemorySearchResults]);

  const handleSendWithRouting = useCallback(async (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
  ) => {
    const contentText = contentToText(content);
    const conversationDepth = ai.messages.filter((message) => message.role === 'user').length;
    const shouldSkipRouting = conversationDepth === 0 || conversationDepth > 3 || suggestionCount >= 2;

    if (!shouldSkipRouting) {
      const parsedCommand = CommandIntelligenceService.parse(contentText, {
        sourceModuleId: 'nexus',
      });
      const shouldPreferFusion = NexusActionPlannerService.shouldPreferPlanningFusion({
        threadId: currentThreadId,
        parsedCommand,
        conversationDepth,
      });
      const decision = NexusRoutingService.classifyIntent(contentText, parsedCommand);
      if (
        decision.target !== 'nexus' &&
        decision.confidence >= 0.62 &&
        !shouldPreferFusion &&
        !shouldKeepMentionedAgentInThread(parsedCommand, decision.target)
      ) {
        presentRoutingSuggestion(decision.target, decision.reason, decision.confidence);
      }
    }

    await ai.handleSendMessage(content, onActionParsed, { threadId: currentThreadId });
  }, [ai, currentThreadId, presentRoutingSuggestion, suggestionCount]);

  const handleInjectChat = useCallback((text: string) => {
    void ai.handleSendMessage(text, undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId]);

  const handleMemoryResultClick = useCallback((result: UnifiedMemoryResult) => {
    setMemorySearchState(null);
    void ai.handleSendMessage(MemoryResultInjectionService.formatForChat(result), undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId]);

  const handleDismissMemoryResults = useCallback(() => {
    setMemorySearchState(null);
  }, []);

  const handleConsultModule = useCallback((moduleId: string, question?: string) => {
    const moduleName = MODULE_MANIFEST[moduleId as ModuleId]?.title || moduleId;
    const trimmedQuestion = question?.trim();
    const prompt = trimmedQuestion
      ? `Consult ${moduleName} about: ${trimmedQuestion}`
      : `Consult ${moduleName} about my current state.`;
    void ai.handleSendMessage(prompt, undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId]);

  const handleMemorySearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setMemorySearchState(null);
    paletteMemoryQueryRef.current = trimmedQuery;
    await resolveMemorySearchResults(trimmedQuery);
    await ai.handleSendMessage(`Search my memory for: ${trimmedQuery}`, undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId, resolveMemorySearchResults]);

  const handleAskAboutDomain = useCallback((domain: string) => {
    void ai.handleSendMessage(`Tell me about my ${domain} state right now.`, undefined, { threadId: currentThreadId });
  }, [ai, currentThreadId]);

  return {
    memorySearchState,
    handleActionParsed,
    handleAskAboutDomain,
    handleConsultModule,
    handleDismissMemoryResults,
    handleInjectChat,
    handleMemoryResultClick,
    handleMemorySearch,
    handleSendWithRouting,
    presentRoutingSuggestion,
  };
}
