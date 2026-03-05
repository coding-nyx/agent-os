import { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { GlobalSoul } from './types';
import { useVault } from './vault-context';
import { useAuth } from './auth-context';
import { GlobalSoulService } from './services/global-soul-service';
import { ConversationContext } from '@/llm-engine/types';

export interface GlobalSoulContextType {
  globalSoul: GlobalSoul | null;
  refreshGlobalSoul: () => Promise<void>;
  updateGlobalSoul: (soul: GlobalSoul) => Promise<void>;
  enhanceContext: (context: ConversationContext) => ConversationContext;
  handleToolCall: (name: string, args: any) => Promise<any>;
}

const GlobalSoulContext = createContext<GlobalSoulContextType | null>(null);

export function GlobalSoulProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [globalSoul, setGlobalSoul] = useState<GlobalSoul | null>(null);
  const globalSoulRef = useRef<GlobalSoul | null>(null);

  useEffect(() => {
    globalSoulRef.current = globalSoul;
  }, [globalSoul]);

  const refreshGlobalSoul = useCallback(async () => {
    if (!user || !isUnlocked) {
      setGlobalSoul(null);
      return;
    }
    try {
      const globalKey = await getModuleKey('global');
      if (globalKey) {
        const soul = await GlobalSoulService.getSoul(user.uid, globalKey);
        setGlobalSoul(soul);
      }
    } catch (e) {
      console.error("Failed to refresh Global Soul:", e);
    }
  }, [user, isUnlocked, getModuleKey]);

  const updateGlobalSoul = useCallback(async (newSoul: GlobalSoul) => {
    if (!user || !isUnlocked) return;
    try {
      const globalKey = await getModuleKey('global');
      if (globalKey) {
        await GlobalSoulService.saveSoul(user.uid, newSoul, globalKey);
        setGlobalSoul(newSoul);
      }
    } catch (e) {
      console.error("Failed to update Global Soul:", e);
    }
  }, [user, isUnlocked, getModuleKey]);

  const handleToolCall = useCallback(async (name: string, args: any): Promise<any> => {
    if (!globalSoulRef.current) return { error: "Soul not loaded" };
    const currentSoul = { ...globalSoulRef.current };

    switch (name) {
      case 'request_biometric': {
        const insight = GlobalSoulService.synthesizeInsight('therapy', 'all', 'behavioral', `Metric requested: ${args.metric}. Reason: ${args.reason}`, 5);
        currentSoul.activeInsights = [...currentSoul.activeInsights, insight];
        await updateGlobalSoul(currentSoul);
        return { status: 'success', message: `Metric ${args.metric} requested.` };
      }
      case 'update_soul_resilience': {
        currentSoul.crossFunctionalState.emotionalResilience = args.score;
        const resInsight = GlobalSoulService.synthesizeInsight('therapy', 'all', 'behavioral', `Emotional resilience adjusted to ${args.score}/10.`, 5);
        currentSoul.activeInsights = [...currentSoul.activeInsights, resInsight];
        await updateGlobalSoul(currentSoul);
        return { status: 'success', message: `Resilience updated to ${args.score}.` };
      }
      default:
        return { error: "Unknown tool" };
    }
  }, [updateGlobalSoul]);

  useEffect(() => {
    if (isUnlocked) {
      void refreshGlobalSoul();
    } else {
      setGlobalSoul(null);
    }
  }, [isUnlocked, refreshGlobalSoul]);

  const enhanceContext = useCallback((context: ConversationContext): ConversationContext => {
    if (!globalSoul) return context;
    const state = globalSoul.crossFunctionalState;
    const soulContext = `
[GLOBAL SOUL CONTEXT]
- CNS Fatigue: ${state.cnsFatigue}/10
- Emotional Resilience: ${state.emotionalResilience}/10
- Sleep Quality: ${state.sleepQuality}/10
- Hormonal Context: ${state.hormonalContext || 'Unknown'}
ACTIVE INSIGHTS:
${globalSoul.activeInsights.filter(i => !i.isResolved).map(i => `- ${i.sourceModule.toUpperCase()}: ${i.content}`).join('\n')}
`;
    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${soulContext}`
    };
  }, [globalSoul]);

  return (
    <GlobalSoulContext.Provider value={{
      globalSoul, refreshGlobalSoul, updateGlobalSoul, enhanceContext, handleToolCall
    }}>
      {children}
    </GlobalSoulContext.Provider>
  );
}

export function useGlobalSoul() {
  const context = useContext(GlobalSoulContext);
  if (!context) throw new Error("useGlobalSoul must be used within GlobalSoulProvider");
  return context;
}
