import { useState, useCallback, useEffect, useRef } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '../global-soul-context';
import { useAuth } from '../auth-context';
import { Message, GuestQuota, GlobalProjection } from '../types';
import { GuestQuotaService } from '../services/guest-quota-service';
import { ModuleMemoryService } from '../services/module-memory-service';
import { PersonaFactory } from '@/llm-engine/persona-factory';
import { sanitizeJsonPayload, stripInternalTags, stripProviderControlTokens } from '@/llm-engine/sanitize';
import { MODULE_ACTION_REGISTRY } from '../constants';
import { GlobalProjectionService } from '../services/global-projection-service';

interface UseModuleAIOptions {
  moduleId: string;
  systemPrompt: string;
}

type ParsedAction = {
  type: string;
  payload: any;
};

function parseToolCallPayload(rawJson: string): ParsedAction | null {
  try {
    const parsed = JSON.parse(sanitizeJsonPayload(rawJson)) as { name?: string; arguments?: any };
    if (!parsed?.name || typeof parsed.name !== 'string') return null;

    let payload = parsed.arguments ?? {};
    if (typeof payload === 'string') {
      payload = JSON.parse(sanitizeJsonPayload(payload));
    }
    if (!payload || typeof payload !== 'object') payload = {};

    return {
      type: parsed.name,
      payload
    };
  } catch (e) {
    console.error('Failed to parse <tool_call> payload:', e);
    return null;
  }
}

export function useModuleAI({ moduleId, systemPrompt: baseRole }: UseModuleAIOptions) {
  const { streamMessage, sendMessage } = useAI();
  const { enhanceContext, globalSoul, refreshGlobalSoul } = useGlobalSoul();
  const { user, isGuest, profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<GuestQuota>(GuestQuotaService.getQuota());
  const sessionStartRef = useRef<string>(new Date().toISOString());

  // Hydrate active session on mount
  useEffect(() => {
    let mounted = true;
    if (user && !isGuest) {
      ModuleMemoryService.getActiveSession(user.uid, moduleId).then(session => {
        if (mounted && session && session.history.length > 0) {
          // CONCURRENCY GUARD: Only hydrate if user hasn't already started a local session
          setMessages(prev => prev.length === 0 ? session.history : prev);
          sessionStartRef.current = session.startTime || new Date().toISOString();
        }
        if (mounted) setIsHydrating(false);
      });
    } else {
      setIsHydrating(false);
    }
    return () => { mounted = false; };
  }, [user, isGuest, moduleId]);

  useEffect(() => {
    if (isHydrating || !user || isGuest || messages.length === 0) return;
    ModuleMemoryService.saveActiveSession(user.uid, {
      sessionId: 'current',
      moduleId,
      startTime: sessionStartRef.current,
      lastMessageAt: new Date().toISOString(),
      history: messages,
      tokenCount: 0,
      isGuestTrial: false
    }).catch(e => console.error('Failed to save active session:', e));
  }, [isHydrating, isGuest, messages, moduleId, user]);

  const handleSendMessage = useCallback(async (
    content: string, 
    onActionParsed?: (actionType: string, payload: any) => void
  ) => {
    if (isGuest && quota.isHardLocked) return;

    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');

    if (isGuest) {
      setQuota(GuestQuotaService.incrementTurn());
    }

    try {
      const finalSystemPrompt = PersonaFactory.generateSystemPrompt({
        moduleId,
        baseRole,
        userProfile: profile,
        globalSoul: globalSoul
      });
      
      const { updatedHistory, response } = await streamMessage(
        content,
        enhanceContext({
          systemPrompt: finalSystemPrompt,
          insights: [],
          summary: `Active session in ${moduleId}.`,
          history: messages
        }),
        (chunk) => {
          setStreamingText(prev => prev + chunk);
        }
      );

      // SchemaGuard & Atomic Vitals Batching
      const parsedActions: ParsedAction[] = [];

      const actionRegex = /<action type="([^"]+)">([\s\S]*?)<\/action>/gi;
      let actionMatch;
      while ((actionMatch = actionRegex.exec(response)) !== null) {
        const type = actionMatch[1];
        const payloadStr = actionMatch[2];
        try {
          const payload = JSON.parse(sanitizeJsonPayload(payloadStr));
          parsedActions.push({ type, payload });
        } catch (e) {
          console.error(`Failed to parse action payload for ${type}:`, e);
        }
      }

      const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
      let toolCallMatch;
      while ((toolCallMatch = toolCallRegex.exec(response)) !== null) {
        const parsed = parseToolCallPayload(toolCallMatch[1]);
        if (parsed) parsedActions.push(parsed);
      }

      const allowedActions = (MODULE_ACTION_REGISTRY as any)[moduleId] || [];
      const soulUpdates: Partial<GlobalProjection['crossFunctionalState']> = {};

      for (const parsedAction of parsedActions) {
        const { type, payload } = parsedAction;

        if (!allowedActions.includes(type)) {
          console.warn(`[SchemaGuard] Blocked unauthorized action "${type}" for module "${moduleId}"`);
          continue;
        }

        // Accumulate vitals for an ATOMIC update
        if (type === 'update_soul_resilience' && typeof payload.score === 'number') {
          soulUpdates.emotionalResilience = payload.score;
        } else if (type === 'update_cns_fatigue' && typeof payload.score === 'number') {
          soulUpdates.cnsFatigue = payload.score;
        } else if (type === 'update_sleep_quality' && typeof payload.score === 'number') {
          soulUpdates.sleepQuality = payload.score;
        }

        if (onActionParsed) onActionParsed(type, payload);
      }

      // Execute Atomic Soul Synchronization
      if (user && !isGuest && Object.keys(soulUpdates).length > 0) {
        await GlobalProjectionService.updateCrossFunctionalState(user.uid, soulUpdates);
        await refreshGlobalSoul();
      }

      const normalizedResponse = stripProviderControlTokens(response);
      const visibleAssistantText = stripInternalTags(normalizedResponse).publicText.trim();
      if (visibleAssistantText) {
        setMessages(prev => {
          const nextHistory = [...prev, { role: 'assistant', content: visibleAssistantText } as Message];
          return nextHistory;
        });
      }

      setStreamingText('');
      
    } catch (e: any) {
      console.error(`Module ${moduleId} AI link failure:`, e);
      setError("The neural tunnel encountered an interference packet.");
    } finally {
      setIsProcessing(false);
    }
  }, [messages, isGuest, quota.isHardLocked, baseRole, enhanceContext, moduleId, user, profile, globalSoul, streamMessage, refreshGlobalSoul]);

  const clearSession = useCallback(async () => {
    setMessages([]);
    sessionStartRef.current = new Date().toISOString();
    if (user && !isGuest) {
      await ModuleMemoryService.clearActiveSession(user.uid, moduleId);
    }
  }, [user, isGuest, moduleId]);

  const summarizeSession = useCallback(async (): Promise<string> => {
    if (messages.length < 3) return "Session was too brief for full synthesis.";
    try {
      const { response } = await sendMessage(
        "Summarize this session in 2 supportive sentences focusing on key takeaways or health indicators.",
        enhanceContext({
          systemPrompt: "You are an analytical supervisor.",
          insights: [],
          summary: "Summarizing.",
          history: messages
        })
      );
      return response.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    } catch (e) {
      return "Session completed and data synchronized.";
    }
  }, [messages, sendMessage, enhanceContext]);

  return {
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession,
    summarizeSession
  };
}
