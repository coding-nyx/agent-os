import { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { GlobalProjection, NeuralStateVectorPatch } from './types';
import { useAuth } from './auth-context';
import { GlobalProjectionService } from './services/global-projection-service';
import { ConversationContext } from '@/llm-engine/types';
import { formatNSVForPrompt, normalizeNSV } from './services/nsv-service';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from './firebase';

export interface GlobalSoulContextType {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  refreshGlobalSoul: () => Promise<void>;
  updateCrossFunctionalState: (updates: NeuralStateVectorPatch) => Promise<void>;
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

  const updateCrossFunctionalState = useCallback(async (updates: NeuralStateVectorPatch) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateCrossFunctionalState(user.uid, updates);
      // onSnapshot listener on line ~76 handles state update automatically
    } catch (e) {
      console.error("Failed to update Cross Functional State:", e);
    }
  }, [user]);

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

  useEffect(() => {
    if (!user || authLoading) return;
    const { db } = getFirebase();
    if (!db) return;

    const projectionRef = doc(db, 'global_souls', user.uid);
    const unsubscribe = onSnapshot(projectionRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const projection = snapshot.data() as GlobalProjection;
      setGlobalSoul({
        ...projection,
        crossFunctionalState: normalizeNSV(projection.crossFunctionalState)
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const updateTherapeuticBaseline = useCallback(async (baseline: GlobalProjection['therapeuticBaseline']) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateTherapeuticBaseline(user.uid, baseline);
      // onSnapshot listener handles state update automatically
    } catch (e) {
      console.error("Failed to update Therapeutic Baseline:", e);
    }
  }, [user]);

  const enhanceContext = useCallback((context: ConversationContext): ConversationContext => {
    if (!globalSoul) return context;
    const state = globalSoul?.crossFunctionalState;
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    const safePronouns = (profile?.pronouns || 'They/Them').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 30);
    const safeInsights = (globalSoul?.compactedInsights || [])
      .map(i => i.slice(0, 200));
    const soulContext = `
[GLOBAL SYSTEM CONTEXT]
- Preferred Name: ${safeName}
- Pronouns: ${safePronouns}
${formatNSVForPrompt(state)}
ACTIVE TRENDS:
${safeInsights.length ? safeInsights.map(i => `- ${i}`).join('\n') : 'None'}
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
