import { useCallback, useRef, useState } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { stripInternalTags, isProviderControlOnly } from '@/llm-engine/sanitize';
import { Message, MessageContent } from '@/llm-engine/types';
import { GuidedChatSpec } from './types';

interface UseGuidedChatIntakeOptions<TState> {
  spec: GuidedChatSpec<TState>;
  onComplete?: (state: TState) => Promise<void> | void;
}

export function useGuidedChatIntake<TState>({ spec, onComplete }: UseGuidedChatIntakeOptions<TState>) {
  const { streamMessage } = useAI();
  const [state, setState] = useState<TState>(spec.initialState);
  const [stepIndex, setStepIndex] = useState(spec.initialStep ?? 0);
  const [messages, setMessages] = useState<Message[]>(spec.initialMessages);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const activeTurnRef = useRef(0);

  const handleSendMessage = useCallback(async (content: MessageContent) => {
    if (isProcessing) {
      return;
    }

    if (spec.canSend && !spec.canSend(state)) {
      return;
    }

    const turnId = activeTurnRef.current + 1;
    activeTurnRef.current = turnId;

    const userMsg: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');
    const contentText =
      typeof content === 'string'
        ? content
        : content.filter((part) => part.type === 'text').map((part) => part.text).join(' ');

    try {
      const { response } = await streamMessage(
        content,
        spec.buildContext(state, [...messages, userMsg]),
        (chunk) => {
          if (activeTurnRef.current !== turnId) return;
          setStreamingText((prev) => prev + chunk);
        }
      );

      if (activeTurnRef.current !== turnId) {
        return;
      }

      // If the LLM stream was interrupted (API error, network failure),
      // surface an error instead of silently dropping the response.
      if (response.isInterrupted) {
        setStreamingText('');
        setError('Neural intake link interrupted. Retry transmission.');
        return;
      }

      const nextHistory = [...messages, userMsg];
      let result: Awaited<ReturnType<typeof spec.onResponse>>;
      try {
        result = await spec.onResponse(response, state, {
          latestUserMessage: contentText,
          history: nextHistory
        });
      } catch (onResponseError) {
        console.error('Guided intake onResponse failed:', onResponseError);
        // Still commit the LLM response so the chat doesn't silently stop
        const fallback = response.publicText.trim() || response.fullText.trim();
        if (fallback) {
          setMessages((prev) => [...prev, { role: 'assistant', content: fallback }]);
        }
        setStreamingText('');
        return;
      }

      const nextState = result.nextState ?? state;

      setState(nextState);

      if (typeof result.nextStep === 'number') {
        setStepIndex(result.nextStep);
      }

      const assistantMessage = result.assistantMessage ?? response.publicText;

      if (assistantMessage.trim()) {
        // When onResponse provides an explicit override, use it as display content;
        // otherwise preserve the raw LLM output (tags stripped at render time).
        const commitContent = result.assistantMessage || response.fullText;
        setMessages((prev) => [...prev, { role: 'assistant', content: commitContent }]);
      }
      setStreamingText('');

      if (result.completed && onComplete) {
        await onComplete(nextState);
      }
    } catch (e) {
      if (activeTurnRef.current !== turnId) {
        return;
      }
      console.error('Guided intake failed:', e);
      setError('Neural intake link interrupted. Retry transmission.');
    } finally {
      if (activeTurnRef.current === turnId) {
        setIsProcessing(false);
      }
    }
  }, [isProcessing, messages, onComplete, spec, state, streamMessage]);

  return {
    state,
    setState,
    stepIndex,
    setStepIndex,
    messages,
    setMessages,
    isProcessing,
    error,
    streamingText,
    handleSendMessage
  };
}
