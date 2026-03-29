import { useCallback, useRef } from 'react';
import type { Message, MessageContent } from '../types';

/**
 * Returns handlers for editing and retrying user messages in a chat history.
 *
 * Edit/retry truncate history before the target message, then re-send.
 * A ref ensures the send always uses the latest handleSendMessage closure —
 * which by that point captures the already-truncated messages array — so
 * the LLM receives only the clean, truncated context.
 */
export function useMessageEditRetry(
  messages: Message[],
  setMessages: (msgs: Message[]) => void,
  handleSendMessage: (content: MessageContent) => void,
) {
  // Always point to the latest handleSendMessage so the post-truncation send
  // uses the closure that sees the truncated messages, not the stale one.
  const sendRef = useRef(handleSendMessage);
  sendRef.current = handleSendMessage;

  /**
   * Edit a user message at index: truncate history before it, re-send with new content.
   * sessionStorage / Firestore are updated automatically via the save effect in
   * use-module-ai.ts when setMessages triggers a re-render.
   */
  const editUserMessage = useCallback(
    (index: number, newContent: string) => {
      const truncated = messages.slice(0, index);
      setMessages(truncated);
      // Wait one tick for React to re-render with truncated messages, then send.
      // sendRef.current will point to the updated handleSendMessage that captures
      // the truncated history — the LLM context is clean.
      setTimeout(() => sendRef.current(newContent), 50);
    },
    [messages, setMessages],
  );

  /**
   * Retry a user message at index: truncate history before it, re-send same content.
   */
  const retryUserMessage = useCallback(
    (index: number) => {
      const userMsg = messages[index];
      if (!userMsg || userMsg.role !== 'user') return;
      const truncated = messages.slice(0, index);
      setMessages(truncated);
      setTimeout(() => sendRef.current(userMsg.content), 50);
    },
    [messages, setMessages],
  );

  return { editUserMessage, retryUserMessage };
}
