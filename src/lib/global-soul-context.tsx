import { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { GlobalProjection, NeuralStateVectorPatch } from './types';
import { useAuth } from './auth-context';
import { GlobalProjectionService } from './services/global-projection-service';
import { ConversationContext } from '@/llm-engine/types';
import { formatNSVForPrompt, formatNSVForModulePrompt, formatNSVForAtlasPlanner, normalizeNSV } from './services/nsv-service';
import { NSV_READ_PERMISSIONS } from './services/nsv-ownership';
import type { ModuleId } from './module-manifest';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';

export interface GlobalSoulContextType {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  refreshGlobalSoul: () => Promise<void>;
  updateCrossFunctionalState: (updates: NeuralStateVectorPatch) => Promise<void>;
  updateTherapeuticBaseline: (baseline: GlobalProjection['therapeuticBaseline']) => Promise<void>;
  /** Full NSV injection — used by Nexus (orchestrator) which requires all fields. */
  enhanceContext: (context: ConversationContext) => ConversationContext;
  /**
   * Filtered NSV injection — injects only the NSV fields permitted for the given module
   * per NSV_READ_PERMISSIONS. Use this for all non-Nexus modules to enforce privacy
   * boundaries and reduce prompt noise.
   *
   * Atlas receives a planning-optimised context block (formatNSVForAtlasPlanner) that
   * includes derived directives in addition to raw field values.
   *
   * @param extensionFieldsBlock - Optional pre-serialized extension fields block
   *   (e.g. "[CUSTOM TRACKED FIELDS — TRAINER]\n- Creatine Cycle: ...").
   *   Produced by `serializeExtensionFields()` in titan-session-prompt.ts.
   */
  enhanceContextForModule: (
    context: ConversationContext,
    moduleId: ModuleId,
    extensionFieldsBlock?: string,
  ) => ConversationContext;
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

  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Guard against double-fire when both user and profile resolve on mount
      if (hasRefreshedRef.current) return;
      hasRefreshedRef.current = true;
      refreshGlobalSoul();
    } else {
      hasRefreshedRef.current = false;
      setGlobalSoul(null);
      setIsLoading(false);
    }
  }, [user, profile, authLoading, refreshGlobalSoul]);

  useEffect(() => {
    if (!user || authLoading) return;
    const { db } = getFirebase();
    if (!db) return;

    const projectionRef = doc(db, 'global_souls', user.uid);
    const unsubscribe = onSnapshot(
      projectionRef, 
      (snapshot) => {
        if (!snapshot.exists()) {
          setGlobalSoul(null);
          setIsLoading(false);
          return;
        }
        const projection = snapshot.data() as GlobalProjection;
        setGlobalSoul({
          ...projection,
          crossFunctionalState: normalizeNSV(projection.crossFunctionalState)
        });
        setIsLoading(false);
      },
      (error) => {
        console.warn('Global Soul subscription delay or missing doc:', error);
        setGlobalSoul(null);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, authLoading]);

  // When the Soma profile changes, the cascade rule emits HEALTH_CONTEXT_STALE.
  // Force a projection refresh so enhanceContextForModule() uses fresh data.
  useSpineEvent('HEALTH_CONTEXT_STALE', () => {
    console.info('[GlobalSoul] HEALTH_CONTEXT_STALE received — refreshing projection');
    refreshGlobalSoul();
  });

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

  const enhanceContextForModule = useCallback((
    context: ConversationContext,
    moduleId: ModuleId,
    extensionFieldsBlock?: string,
  ): ConversationContext => {
    if (!globalSoul) return context;

    const state = globalSoul.crossFunctionalState;
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    const safePronouns = (profile?.pronouns || 'They/Them').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 30);
    const safeInsights = (globalSoul?.compactedInsights || []).map(i => i.slice(0, 200));

    // Atlas gets a planning-optimised context block with derived directives
    const nsvBlock = moduleId === 'atlas'
      ? formatNSVForAtlasPlanner(state)
      : formatNSVForModulePrompt(state, NSV_READ_PERMISSIONS[moduleId] ?? []);

    // Skip appending if there's no meaningful state data for this module
    // (and no extension fields to inject either)
    if (!nsvBlock && !extensionFieldsBlock) return context;

    const moduleContext = [
      '[SYSTEM CONTEXT]',
      `- Preferred Name: ${safeName}`,
      `- Pronouns: ${safePronouns}`,
      nsvBlock,
      safeInsights.length > 0
        ? `ACTIVE TRENDS:\n${safeInsights.map(i => `- ${i}`).join('\n')}`
        : '',
      // Append extension field values (dynamic fields tracked by the user)
      extensionFieldsBlock || '',
    ].filter(Boolean).join('\n');

    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${moduleContext}`
    };
  }, [globalSoul, profile]);

  return (
    <GlobalSoulContext.Provider value={{
      globalSoul, isLoading: isLoading || authLoading, refreshGlobalSoul, updateCrossFunctionalState,
      updateTherapeuticBaseline, enhanceContext, enhanceContextForModule
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
