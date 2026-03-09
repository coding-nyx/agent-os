/**
 * useScopedConversation — Ephemeral Scoped Conversation Hook
 *
 * Manages an isolated, non-persisted conversation channel for scoped interactions:
 *   - field-crud: schema management (no user wellness data in context)
 *   - scoped: entity-specific editing (routine, biomarker, field value)
 *   - general: full-context conversation (delegates to useModuleAI for persistence)
 *
 * Key differences from useModuleAI:
 *   - Messages are held in useState, NEVER written to Firestore
 *   - Action filtering: if the LLM returns an action not in `allowedActions`, it is
 *     logged as a warning and silently skipped (runtime enforcement layer)
 *   - No memory integration, no consolidation, no handoff processing
 *   - Lightweight parallel conversation that can coexist with the primary module chat
 *
 * @see skills/dynamic-field-system.md — "Three Conversation Scopes"
 */

import { useState, useCallback, useRef } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import type { Message, MessageContent } from '@/lib/types';
import type { ConversationContext } from '@/llm-engine/types';

// ============================================================================
// Types
// ============================================================================

export type ConversationScope = 'general' | 'scoped' | 'field-crud';

export interface UseScopedConversationOptions {
  /** Conversation scope — determines persistence and action filtering rules */
  scope: ConversationScope;
  /** Actions the LLM is permitted to emit in this scope */
  allowedActions: readonly string[];
  /** System prompt for the scoped conversation */
  systemPrompt: string;
  /**
   * Optional callback invoked when an action is parsed from the LLM response.
   * Return `false` to prevent the action from being dispatched.
   */
  onActionParsed?: (action: { type: string; payload: Record<string, unknown> }) => boolean | void;
}

export interface UseScopedConversationReturn {
  /** Current conversation messages (ephemeral — not persisted) */
  messages: Message[];
  /** Send a message and get a streamed response */
  sendMessage: (content: MessageContent) => Promise<void>;
  /** Clear all messages and reset the conversation */
  clearMessages: () => void;
  /** Whether the AI is currently processing a response */
  isLoading: boolean;
  /** Current streaming text fragment (partial response) */
  streamingText: string;
  /** Error message, if any */
  error: string | null;
}

// ============================================================================
// Action Parsing Helpers
// ============================================================================

const ACTION_TAG_REGEX = /<action\s+type="([^"]+)">([\s\S]*?)<\/action>/g;

interface ParsedAction {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Extract action tags from an LLM response body.
 */
function parseActionsFromResponse(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let match: RegExpExecArray | null;
  // Reset regex state
  ACTION_TAG_REGEX.lastIndex = 0;

  while ((match = ACTION_TAG_REGEX.exec(text)) !== null) {
    const type = match[1];
    const rawPayload = match[2].trim();
    try {
      const payload = JSON.parse(rawPayload) as Record<string, unknown>;
      actions.push({ type, payload });
    } catch (err) {
      console.warn(
        `[useScopedConversation] Failed to parse action payload for "${type}":`,
        rawPayload,
        err
      );
    }
  }

  return actions;
}

/**
 * Filter actions based on the allowed set and log warnings for blocked ones.
 */
function filterActions(
  actions: ParsedAction[],
  allowedActions: readonly string[],
  scope: ConversationScope,
  onActionParsed?: (action: { type: string; payload: Record<string, unknown> }) => boolean | void
): ParsedAction[] {
  const allowedSet = new Set(allowedActions);

  return actions.filter((action) => {
    // Scope-based filtering
    if (!allowedSet.has(action.type)) {
      console.warn(
        `[useScopedConversation] Action "${action.type}" blocked in scope "${scope}" — ` +
          `allowed: [${allowedActions.join(', ')}]`
      );
      return false;
    }

    // Optional callback filtering
    if (onActionParsed) {
      const result = onActionParsed(action);
      if (result === false) {
        console.warn(
          `[useScopedConversation] Action "${action.type}" blocked by onActionParsed callback`
        );
        return false;
      }
    }

    return true;
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useScopedConversation({
  scope,
  allowedActions,
  systemPrompt,
  onActionParsed,
}: UseScopedConversationOptions): UseScopedConversationReturn {
  const { streamMessage } = useAI();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const clearMessages = useCallback(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setStreamingText('');
    setError(null);
    setIsLoading(false);
  }, []);

  const sendMessage = useCallback(
    async (content: MessageContent) => {
      if (isLoading) return;

      setError(null);
      setIsLoading(true);
      setStreamingText('');

      // Add user message to local state
      const userMessage: Message = {
        role: 'user',
        content,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);

      // Build ephemeral conversation context (no memory, no Firestore)
      const context: ConversationContext = {
        systemPrompt,
        memoryContext: [],
        summary: '',
        history: updatedMessages,
      };

      // Abort controller for cancellation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let fullResponse = '';

      try {
        const result = await streamMessage(
          content,
          context,
          (chunk: string) => {
            if (!mountedRef.current) return;
            fullResponse += chunk;
            setStreamingText(fullResponse);
          },
          abortController.signal
        );

        if (!mountedRef.current) return;

        // Extract the assistant response text
        const responseText =
          result.response?.fullText || fullResponse || '';

        // Parse and filter actions from the response
        const parsedActions = parseActionsFromResponse(responseText);
        const allowedParsedActions = filterActions(
          parsedActions,
          allowedActions,
          scope,
          onActionParsed
        );

        // Log which actions passed filtering
        if (allowedParsedActions.length > 0) {
          console.log(
            `[useScopedConversation] ${allowedParsedActions.length} action(s) passed scope filter:`,
            allowedParsedActions.map((a) => a.type)
          );
        }

        // Add assistant message
        const assistantMessage: Message = {
          role: 'assistant',
          content: responseText,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingText('');
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled — not an error
          setStreamingText('');
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        console.error(
          `[useScopedConversation] Error in scope "${scope}":`,
          err
        );
        setError(errorMessage);
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [
      isLoading,
      messages,
      systemPrompt,
      streamMessage,
      allowedActions,
      scope,
      onActionParsed,
    ]
  );

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    streamingText,
    error,
  };
}
