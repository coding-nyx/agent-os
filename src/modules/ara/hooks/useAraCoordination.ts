import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import type { MessageContent, UnifiedMemoryResult } from '@/lib/types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { Spine } from '@/lib/spine/spine-event-bus';
import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';
import { AraRoutingService } from '@/lib/services/ara-routing-service';
import { CommandIntelligenceServiceJs } from '@cortex-logic';
const _kmpCommandParser = new CommandIntelligenceServiceJs();
import { AraActionPlannerService } from '@/lib/services/ara-action-planner-service';
import { EpisodicMemoryService } from '@/lib/services/episodic-memory-service';
import { SemanticMemoryService } from '@/lib/services/semantic-memory-service';
import { OrchestrationCacheService } from '@/lib/services/orchestration-cache-service';
import { MemoryResultInjectionService } from '@/lib/services/memory-result-injection-service';

const MEMORY_SEARCH_MODULE_IDS: ModuleId[] = ['ara', 'agnes', 'atlas', 'ledger', 'soma', 'titan', 'scout', 'forge'];

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export type AraMemorySearchState = {
  query: string;
  results: UnifiedMemoryResult[];
  isSearching: boolean;
};

interface AraCoordinationAI {
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
  // If this module isn't targeted by any intent, there's no role for it — don't keep it.
  if (targetedIntents.length === 0) return false;

  return targetedIntents.every((intent) => !intent.mutatesState);
}

interface UseAraCoordinationInput {
  ai: AraCoordinationAI;
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

export function useAraCoordination(input: UseAraCoordinationInput) {
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
  const [memorySearchState, setMemorySearchState] = useState<AraMemorySearchState | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [clarificationHint, setClarificationHint] = useState<{ reasons: string[] } | null>(null);
  const paletteMemoryQueryRef = useRef<string | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the user's original message when it was intercepted by the early-routing
  // classifier (before being sent to Ara). If the routing proposal is dismissed,
  // this content is sent to Ara as a fallback so the message is never silently dropped.
  const pendingDismissalFallbackRef = useRef<MessageContent | null>(null);

  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  // When the routing banner is dismissed (either by the user or auto-dismiss timer),
  // fall back to sending the original message to Ara. This only fires when the early
  // classifier intercepted the message; if the AI already responded (AI-triggered
  // routing), the ref is null and the effect is a no-op.
  useEffect(() => {
    const unsubDismissed = Spine.on('ROUTING_DISMISSED', (_event) => {
      const fallback = pendingDismissalFallbackRef.current;
      pendingDismissalFallbackRef.current = null;
      if (!fallback) return;
      void ai.handleSendMessage(fallback, undefined, { threadId: currentThreadId });
    });
    // If the user accepts the proposal (banner or proposal card), clear the fallback
    // so a later ROUTING_DISMISSED from a different flow doesn't replay this message.
    const unsubAccepted = Spine.on('ROUTING_ACCEPTED', (_event) => {
      pendingDismissalFallbackRef.current = null;
    });
    return () => {
      unsubDismissed?.();
      unsubAccepted?.();
    };
  }, [ai, currentThreadId]);

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
      console.error('[useAraCoordination] Failed to resolve memory search results:', error);
      setMemorySearchState({
        query: trimmedQuery,
        results: [],
        isSearching: false,
      });
    }
  }, [isGuest, userId]);

  const presentRoutingSuggestion = useCallback((target: ModuleId, reason?: string, confidence?: number) => {
    // Don't re-propose a module that's already being consulted inline (deferred state).
    // This prevents the banner from reappearing and the 'deferred'→'draft' state reset
    // when Ara calls delegate_to_module again on the fallback stream.
    const existingSuggestion = useOrchestrationStore.getState().threadRoutingSuggestionByThreadId[currentThreadId];
    if (existingSuggestion?.target === target && existingSuggestion.state === 'deferred') {
      return;
    }

    const routingDecision = OrchestrationInteractionGateService.evaluate({
      autopilotLevel,
      candidate: {
        kind: 'routing',
        sourceModuleId: 'ara',
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
      // User accepted (auto) — clear the dismissal fallback so Ara doesn't
      // receive a stale replay if a future ROUTING_DISMISSED fires.
      pendingDismissalFallbackRef.current = null;
      // Emit ROUTING_ACCEPTED so the delegation tracker marks this as pending
      // (work is now in flight on the target module).
      Spine.emit({
        type: 'ROUTING_ACCEPTED',
        source: 'ara',
        target,
        domain: 'system',
        data: { reason: 'silent_delegate', confidence },
        cascadeDepth: 0,
        priority: 'info',
      });
      return;
    }

    setThreadRoutingSuggestion(currentThreadId, { target, reason, confidence, state: 'draft' });
    setSuggestionCount((prev) => prev + 1);
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = setTimeout(() => {
      patchThreadRoutingSuggestion(currentThreadId, { state: 'deferred' });
    }, 8000);
    // Emit ROUTING_PROPOSED so the routing banner and delegation tracker both
    // learn about this proposal — regardless of whether routing was detected
    // by the pre-send classifier or triggered later by an AI delegate_to_module action.
    Spine.emit({
      type: 'ROUTING_PROPOSED',
      source: 'ara',
      target,
      domain: 'system',
      data: { reason, confidence },
      cascadeDepth: 0,
      priority: 'info',
    });
  }, [autopilotLevel, clearThreadRoutingSuggestion, currentThreadId, navigate, patchThreadRoutingSuggestion, setThreadRoutingSuggestion]);

  const handleActionParsed = useCallback((type: string, payload: Record<string, unknown>) => {
    if (type === 'delegate_to_module' && typeof payload?.moduleId === 'string') {
      const targetModuleId = payload.moduleId as ModuleId;
      // Normalise reason — AI may use 'reason', 'intent', or 'instruction'
      const reason =
        typeof payload?.reason === 'string' ? payload.reason :
        typeof payload?.intent === 'string' ? payload.intent :
        typeof payload?.instruction === 'string' ? payload.instruction :
        undefined;
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : undefined;
      // The handoff was already stored by module-ai-action-execution-service.ts
      // delegateToModule() before this callback fires. Do NOT store a second time.
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
      const parsedCommand = JSON.parse(
        _kmpCommandParser.parse(contentText, 'ara')
      ) as ParsedCommandEnvelope;

      // Surface ambiguity hint when the parser cannot confidently determine intent.
      if (parsedCommand.requiresClarification && parsedCommand.ambiguityReasons.length > 0) {
        setClarificationHint({ reasons: parsedCommand.ambiguityReasons });
      } else {
        setClarificationHint(null);
      }

      const shouldPreferFusion = AraActionPlannerService.shouldPreferPlanningFusion({
        threadId: currentThreadId,
        parsedCommand,
        conversationDepth,
      });
      const decision = AraRoutingService.classifyIntent(contentText, parsedCommand);
      if (
        decision.target !== 'ara' &&
        decision.confidence >= 0.62 &&
        !shouldPreferFusion &&
        !shouldKeepMentionedAgentInThread(parsedCommand, decision.target)
      ) {
        // Store original content as fallback in case the user dismisses the banner.
        // The ROUTING_DISMISSED listener (above) will send this to Ara so the
        // message is never silently dropped.
        pendingDismissalFallbackRef.current = content;
        presentRoutingSuggestion(decision.target, decision.reason, decision.confidence);
        // Store the handoff so the target module can pick it up when it mounts or
        // when the user accepts the routing proposal (navigates to the target).
        // Do NOT send to Ara AI — it lacks the target's actions and would leave
        // a dangling pending request ("neural transmission interrupted").
        AraHandoffService.store({
          moduleId: decision.target,
          type: 'delegate',
          content: contentText,
          reason: decision.reason,
          sourceModuleId: 'ara',
          createdAt: new Date().toISOString(),
        });
        // ROUTING_PROPOSED is now emitted inside presentRoutingSuggestion so that
        // AI-triggered routing (delegate_to_module action) also shows the banner.
        setClarificationHint(null);
        return;
      }
    } else {
      setClarificationHint(null);
    }

    await ai.handleSendMessage(content, onActionParsed, { threadId: currentThreadId });
    // Clear hint once the LLM has taken the message — it will handle disambiguation itself.
    setClarificationHint(null);
  }, [ai, currentThreadId, presentRoutingSuggestion, setClarificationHint, suggestionCount]);

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
    clarificationHint,
    dismissClarificationHint: () => setClarificationHint(null),
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
