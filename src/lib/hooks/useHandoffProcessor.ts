import { useRef, useEffect, useCallback } from 'react';
import type { Message } from '../types';
import type { ConversationContext } from '@/llm-engine/types';
import type { StructuredResponse } from '@/llm-engine/engine/types';
import { NexusHandoffService } from '../services/nexus-handoff-service';
import { Spine } from '../spine/spine-event-bus';

function trimToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 12)).trim()}...`;
}

export interface RoutingResult {
  shouldDelegate: boolean;
  target?: string;
  reason?: string;
  confidence?: number;
}

interface UseHandoffProcessorOptions {
  moduleId: string;
  isHydrating: boolean;
  messagesCount: number;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Ref to the parent's handleSendMessage — set after definition to avoid circular deps */
  onSendMessageRef: React.MutableRefObject<((content: string) => void) | null>;
  sendMessage: (
    content: string,
    context: ConversationContext,
    signal?: AbortSignal
  ) => Promise<{ response: StructuredResponse; updatedHistory: Message[] }>;
  mountedRef: React.RefObject<boolean>;
}

export function useHandoffProcessor({
  moduleId,
  isHydrating,
  messagesCount,
  setMessages,
  onSendMessageRef,
  sendMessage,
  mountedRef
}: UseHandoffProcessorOptions) {
  const handoffProcessedRef = useRef(false);
  const pendingQueryRef = useRef<{ origin: string; issuedAt: string } | null>(null);
  const skipRoutingRef = useRef(false);

  // Reset handoff flag when module changes
  useEffect(() => {
    handoffProcessedRef.current = false;
  }, [moduleId]);

  /**
   * Run the routing-intent classifier and determine whether the message
   * should be delegated to a different module.
   */
  const classifyAndRoute = useCallback(async (
    content: string,
    recentMessages: Message[]
  ): Promise<RoutingResult> => {
    // Specialized modules handle their own routing; skip the LLM classifier entirely
    if (moduleId === 'orchestrator' || moduleId === 'scout') return { shouldDelegate: false };

    if (skipRoutingRef.current) {
      skipRoutingRef.current = false;
      return { shouldDelegate: false };
    }

    try {
      const routingAbort = new AbortController();
      const { response: routeResp } = await Promise.race([
        sendMessage(content, {
          systemPrompt: 'You are a routing intent classifier. Return ONLY a single <action> tag.',
          memoryContext: [],
          summary: 'Classifying intent.',
          history: recentMessages.slice(-3) // H-4: only last 3 turns for routing
        }, routingAbort.signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            routingAbort.abort();
            reject(new Error('Routing classification timeout'));
          }, 5000)
        )
      ]);

      // M-1: guard post-unmount state update
      if (!mountedRef.current) return { shouldDelegate: false };

      const routeHint = routeResp.actions.find((a) => a.type === 'delegate_to_module')?.payload as
        { target?: string; confidence?: number; reason?: string } | undefined;
      const shouldDelegate =
        routeHint?.target &&
        routeHint.target !== moduleId &&
        (routeHint.confidence || 0) >= 0.62;

      if (shouldDelegate) {
        return {
          shouldDelegate: true,
          target: routeHint.target,
          reason: routeHint.reason,
          confidence: routeHint.confidence
        };
      }
    } catch (e) {
      console.warn('Nexus routing gate failed, continuing in current module.', e);
    }

    return { shouldDelegate: false };
  }, [moduleId, sendMessage, mountedRef]);

  /** Persist a delegation handoff and emit a spine event. */
  const storeDelegation = useCallback((
    target: string,
    content: string,
    reason?: string,
    confidence?: number
  ) => {
    NexusHandoffService.store({
      moduleId: target,
      type: 'delegate',
      content,
      reason,
      sourceModuleId: moduleId,
      createdAt: new Date().toISOString()
    });

    Spine.emit({
      type: 'MODULE_DELEGATED',
      source: moduleId,
      target,
      domain: 'system',
      data: { content, confidence, reason },
      cascadeDepth: 0,
      priority: 'info'
    });
  }, [moduleId]);

  /** If a pending cross-module query exists, emit the response back. */
  const handlePendingQueryResult = useCallback((visibleAssistantText: string) => {
    if (!visibleAssistantText || !pendingQueryRef.current) return;

    const queryContext = pendingQueryRef.current;
    pendingQueryRef.current = null;
    const origin = queryContext.origin || 'orchestrator';

    NexusHandoffService.store({
      moduleId: origin,
      type: 'query_result',
      content: trimToCharLimit(visibleAssistantText, 1200),
      reason: 'query_result',
      sourceModuleId: moduleId,
      createdAt: new Date().toISOString()
    });

    Spine.emit({
      type: 'MODULE_DELEGATED',
      source: moduleId,
      target: origin,
      domain: 'system',
      data: { content: visibleAssistantText, reason: 'query_result' },
      cascadeDepth: 0,
      priority: 'info'
    });
  }, [moduleId]);

  // Consume and process incoming handoffs on mount / when hydration completes
  useEffect(() => {
    if (handoffProcessedRef.current) return;
    if (isHydrating || messagesCount > 0) return;

    const handoff = NexusHandoffService.consume(moduleId);
    if (!handoff) {
      handoffProcessedRef.current = true;
      return;
    }

    handoffProcessedRef.current = true;
    const handoffNote = handoff.content
      ? `Nexus handoff: ${handoff.content}`
      : 'Nexus handoff received.';

    if (handoff.type === 'delegate') {
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: handoffNote }] : prev));
      if (handoff.content) {
        queueMicrotask(() => {
          skipRoutingRef.current = true;
          onSendMessageRef.current?.(handoff.content);
        });
      }
      return;
    }

    if (handoff.type === 'query' && handoff.content) {
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: handoffNote }] : prev));
      pendingQueryRef.current = {
        origin: handoff.sourceModuleId || 'orchestrator',
        issuedAt: handoff.createdAt
      };
      queueMicrotask(() => {
        skipRoutingRef.current = true;
        onSendMessageRef.current?.(handoff.content);
      });
    }

    if (handoff.type === 'query_result' && handoff.content) {
      const sourceLabel = handoff.sourceModuleId ? ` from ${handoff.sourceModuleId}` : '';
      const note = `Nexus query result${sourceLabel}: ${handoff.content}`;
      setMessages((prev) =>
        prev.length === 0
          ? [{ role: 'assistant', content: note }]
          : [...prev, { role: 'assistant', content: note }]
      );
    }
  }, [isHydrating, messagesCount, moduleId, setMessages, onSendMessageRef]);

  return {
    classifyAndRoute,
    storeDelegation,
    handlePendingQueryResult
  };
}
