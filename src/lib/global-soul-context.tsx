import { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { GlobalProjection } from './types';
import { useAuth } from './auth-context';
import { GlobalProjectionService } from './services/global-projection-service';
import { ConversationContext } from '@/llm-engine/types';

export interface GlobalSoulContextType {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  refreshGlobalSoul: () => Promise<void>;
  updateCrossFunctionalState: (updates: Partial<GlobalProjection['crossFunctionalState']>) => Promise<void>;
  updateTherapeuticBaseline: (baseline: GlobalProjection['therapeuticBaseline']) => Promise<void>;
  enhanceContext: (context: ConversationContext) => ConversationContext;
}

const GlobalSoulContext = createContext<GlobalSoulContextType | null>(null);

export function GlobalSoulProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [globalSoul, setGlobalSoul] = useState<GlobalProjection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshGlobalSoul = useCallback(async () => {
    if (!user) {
      setGlobalSoul(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const projection = await GlobalProjectionService.getProjection(user.uid);
      setGlobalSoul(projection);
    } catch (e) {
      console.error("Failed to refresh Global Projection:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateCrossFunctionalState = useCallback(async (updates: Partial<GlobalProjection['crossFunctionalState']>) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateCrossFunctionalState(user.uid, updates);
      await refreshGlobalSoul();
    } catch (e) {
      console.error("Failed to update Cross Functional State:", e);
    }
  }, [user, refreshGlobalSoul]);

  useEffect(() => {
    if (user && !authLoading) {
      refreshGlobalSoul();
    } else if (!authLoading) {
      setGlobalSoul(null);
      setIsLoading(false);
    }
  }, [user, authLoading, refreshGlobalSoul]);

  // Sync when profile changes (e.g. after onboarding)
  useEffect(() => {
    if (profile && !authLoading) {
      refreshGlobalSoul();
    }
  }, [profile, authLoading, refreshGlobalSoul]);

  const updateTherapeuticBaseline = useCallback(async (baseline: GlobalProjection['therapeuticBaseline']) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateTherapeuticBaseline(user.uid, baseline);
      await refreshGlobalSoul();
    } catch (e) {
      console.error("Failed to update Therapeutic Baseline:", e);
    }
  }, [user, refreshGlobalSoul]);

  const enhanceContext = useCallback((context: ConversationContext): ConversationContext => {
    if (!globalSoul) return context;
    const state = globalSoul.crossFunctionalState;
    const soulContext = `
[GLOBAL SYSTEM CONTEXT]
- Preferred Name: ${profile?.preferredName || 'Unknown'}
- Pronouns: ${profile?.pronouns || 'They/Them'}
- CNS Fatigue: ${state.cnsFatigue}/10
- Emotional Resilience: ${state.emotionalResilience}/10
- Sleep Quality: ${state.sleepQuality}/10
- Hormonal Context: ${state.hormonalContext || 'Unknown'}
ACTIVE TRENDS:
${globalSoul.compactedInsights.map(i => `- ${i}`).join('\n')}
`;
    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${soulContext}`
    };
  }, [globalSoul, profile]);

  return (
    <GlobalSoulContext.Provider value={{
      globalSoul, isLoading: isLoading || authLoading, refreshGlobalSoul, updateCrossFunctionalState, updateTherapeuticBaseline, enhanceContext
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
