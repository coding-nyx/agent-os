import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages auto-scroll behaviour for chat:
 * - Scrolls to bottom when the user sends a message or is already near the bottom
 * - Shows a "scroll to bottom" button when scrolled up
 * - Flags new AI completions that arrive while scrolled away
 */
export function useChatScroll(
  messages: { role: string }[],
  isLoading: boolean,
  error?: string | null,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewCompletion, setHasNewCompletion] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  }, []);

  // Smart auto-scroll: only scroll if user is already near the bottom OR it's a user message.
  // Dep is messages.length (not messages) so this effect does NOT fire on every streamed token —
  // only when the number of messages changes (new send or turn commit).
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === 'user';

    if (isUserMessage || isNearBottomRef.current) {
      scrollToBottom(messages.length <= 2 ? 'instant' : 'smooth');
      setHasNewCompletion(false);
    } else if (lastMessage?.role === 'assistant' || isLoading) {
      setHasNewCompletion(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isLoading, error, scrollToBottom]);

  // Track scroll position to detect if user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 150;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < threshold;
      isNearBottomRef.current = nearBottom;
      setShowScrollButton(distanceFromBottom > threshold);

      if (nearBottom) {
        setHasNewCompletion(false);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToBottomClick = useCallback(() => {
    scrollToBottom();
    isNearBottomRef.current = true;
    setHasNewCompletion(false);
  }, [scrollToBottom]);

  return {
    scrollRef,
    bottomSentinelRef,
    showScrollButton,
    hasNewCompletion,
    handleScrollToBottomClick,
  };
}
