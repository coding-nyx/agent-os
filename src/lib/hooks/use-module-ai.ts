import { useState, useCallback, useEffect } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '../global-soul-context';
import { useAuth } from '../auth-context';
import { Message, GuestQuota } from '../types';
import { GuestQuotaService } from '../services/guest-quota-service';
import { ModuleMemoryService } from '../services/module-memory-service';
import { PersonaFactory } from '@/llm-engine/persona-factory';
import { sanitizeJsonPayload } from '@/llm-engine/sanitize';
import { MODULE_ACTION_REGISTRY } from '../constants';
import { GlobalProjectionService } from '../services/global-projection-service';

interface UseModuleAIOptions {
  moduleId: string;
  systemPrompt: string;
}

export function useModuleAI({ moduleId, systemPrompt: baseRole }: UseModuleAIOptions) {
  const { streamMessage, sendMessage } = useAI();
  const { enhanceContext, globalSoul, refreshGlobalSoul } = useGlobalSoul();
  const { user, isGuest, profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<GuestQuota>(GuestQuotaService.getQuota());

  // Hydrate active session on mount
  useEffect(() => {
    let mounted = true;
    if (user && !isGuest) {
      ModuleMemoryService.getActiveSession(user.uid, moduleId).then(session => {
        if (mounted && session && session.history.length > 0) {
          setMessages(session.history);
        }
      });
    }
    return () => { mounted = false; };
  }, [user, isGuest, moduleId]);

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

      // SchemaGuard & Dynamic Vitals Parsing
      const actionRegex = /<action type="([^"]+)">([\s\S]*?)<\/action>/gi;
      let match;
      const allowedActions = (MODULE_ACTION_REGISTRY as any)[moduleId] || [];

      while ((match = actionRegex.exec(response)) !== null) {
        const type = match[1];
        const payloadStr = match[2];

        // 1. Schema Guard: Only allow registered actions for this module
        if (!allowedActions.includes(type)) {
          console.warn(`[SchemaGuard] Blocked unauthorized action "${type}" for module "${moduleId}"`);
          continue;
        }

        try {
          const payload = JSON.parse(sanitizeJsonPayload(payloadStr));
          
          // 2. Dynamic Vitals: Automatic Global Soul Synchronization
          if (user && !isGuest) {
            if (type === 'update_soul_resilience' && typeof payload.score === 'number') {
              await GlobalProjectionService.updateCrossFunctionalState(user.uid, { emotionalResilience: payload.score });
              await refreshGlobalSoul();
            } else if (type === 'update_cns_fatigue' && typeof payload.score === 'number') {
              await GlobalProjectionService.updateCrossFunctionalState(user.uid, { cnsFatigue: payload.score });
              await refreshGlobalSoul();
            } else if (type === 'update_sleep_quality' && typeof payload.score === 'number') {
              await GlobalProjectionService.updateCrossFunctionalState(user.uid, { sleepQuality: payload.score });
              await refreshGlobalSoul();
            }
          }

          if (onActionParsed) onActionParsed(type, payload);
        } catch (e) {
          console.error(`Failed to parse action payload for ${type}:`, e);
        }
      }

      setMessages(updatedHistory);
      setStreamingText('');

      if (user && !isGuest) {
        await ModuleMemoryService.saveActiveSession(user.uid, {
          sessionId: 'current',
          moduleId,
          startTime: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
          history: updatedHistory,
          tokenCount: 0,
          isGuestTrial: false
        });
      }
      
    } catch (e: any) {
      console.error(`Module ${moduleId} AI link failure:`, e);
      setError("The neural tunnel encountered an interference packet.");
    } finally {
      setIsProcessing(false);
    }
  }, [messages, isGuest, quota.isHardLocked, baseRole, enhanceContext, moduleId, user, profile, globalSoul, streamMessage, refreshGlobalSoul]);

  const clearSession = useCallback(async () => {
    setMessages([]);
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
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession,
    summarizeSession
  };
}
