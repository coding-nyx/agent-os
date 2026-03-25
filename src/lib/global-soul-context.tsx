import { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { GlobalProjection, NeuralStateVectorPatch } from './types';
import { useAuth } from './auth-context';
import { GlobalProjectionService } from './services/global-projection-service';
import { DerivedInsightsService } from './services/derived-insights-service';
import { ConversationContext } from '@/lib/ai-adapters/engine-types';
import { formatNSVForPrompt, formatNSVForModulePrompt, formatNSVForAtlasPlanner, normalizeNSV } from './services/nsv-service';
import { NSV_READ_PERMISSIONS, filterGlobalSoulForModule } from './services/nsv-ownership';
import type { ModuleId } from './module-manifest';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { useDataLayer } from './data-layer/provider';

interface GlobalSoulStore {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  setGlobalSoul: (soul: GlobalProjection | null) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useGlobalSoulStore = create<GlobalSoulStore>((set) => ({
  globalSoul: null,
  isLoading: true,
  setGlobalSoul: (soul) => set({ globalSoul: soul }),
  setIsLoading: (loading) => set({ isLoading: loading })
}));

export interface GlobalSoulContextType {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  refreshGlobalSoul: () => Promise<void>;
  updateCrossFunctionalState: (updates: NeuralStateVectorPatch) => Promise<void>;
  updateTherapeuticBaseline: (baseline: GlobalProjection['therapeuticBaseline']) => Promise<void>;
  enhanceContext: (context: ConversationContext) => ConversationContext;
  enhanceContextForModule: (
    context: ConversationContext,
    moduleId: ModuleId,
    extensionFieldsBlock?: string,
  ) => ConversationContext;
  getFilteredSoulForModule: (moduleId: ModuleId) => GlobalProjection | null;
}

// Actions remain in Context so they have access to `user` and `profile` from useAuth
const GlobalSoulActionsContext = createContext<Omit<GlobalSoulContextType, 'globalSoul' | 'isLoading'> | null>(null);

export function GlobalSoulProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const dataLayer = useDataLayer();
  const setGlobalSoul = useGlobalSoulStore(s => s.setGlobalSoul);
  const setIsLoading = useGlobalSoulStore(s => s.setIsLoading);
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const derivedWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDerivedSignatureRef = useRef<string>('');

  const refreshGlobalSoul = useCallback(async () => {
    if (!user) {
      setGlobalSoul(null);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const projection = await GlobalProjectionService.getProjection(user.uid, dataLayer);
      setGlobalSoul(projection);
    } catch (e) {
      console.error("Failed to refresh Global Projection:", e);
      Spine.emit({
        type: 'HEALTH_CONTEXT_STALE',
        source: 'nexus',
        domain: 'system',
        data: { reason: 'refresh_failed' },
        cascadeDepth: 0,
        priority: 'info'
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, setGlobalSoul, setIsLoading, dataLayer]);

  const updateCrossFunctionalState = useCallback(async (updates: NeuralStateVectorPatch) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateCrossFunctionalState(user.uid, updates, dataLayer);
    } catch (e) {
      console.error("Failed to update Cross Functional State:", e);
    }
  }, [user, dataLayer]);

  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      if (hasRefreshedRef.current) return;
      hasRefreshedRef.current = true;
      refreshGlobalSoul();
    } else {
      hasRefreshedRef.current = false;
      setGlobalSoul(null);
      setIsLoading(false);
    }
  }, [user, profile, authLoading, refreshGlobalSoul, setGlobalSoul, setIsLoading]);

  useEffect(() => {
    if (!user || authLoading) return;
    const unsubscribe = dataLayer.subscribeToDocument<GlobalProjection>(
      'global_souls',
      user.uid,
      (record) => {
        if (!record) {
          setGlobalSoul(null);
          setIsLoading(false);
          return;
        }
        setGlobalSoul({
          ...record,
          crossFunctionalState: normalizeNSV(record.crossFunctionalState),
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, authLoading, setGlobalSoul, setIsLoading, dataLayer]);

  useSpineEvent('HEALTH_CONTEXT_STALE', () => {
    console.info('[GlobalSoul] HEALTH_CONTEXT_STALE received — refreshing projection');
    refreshGlobalSoul();
  });

  // Wire derived insights into `global_souls.{userId}.compactedInsights`
  // so the orchestrator prompt augmentation can see them.
  useEffect(() => {
    if (!user || authLoading) return;

    const unsubscribe = DerivedInsightsService.subscribeToInsights(user.uid, (insights) => {
      const derivedLines = Array.from(
        new Map(
          insights.slice(0, 10).map((i) => {
            const content = (i.content ?? '').slice(0, 220);
            const line = `[DI:${i.id}] ${content}`;
            return [i.id, line] as const;
          }),
        ).values(),
      );

      const signature = derivedLines.join('|');
      if (signature === lastDerivedSignatureRef.current) return;
      lastDerivedSignatureRef.current = signature;

      // Preserve non-derived compacted insights (e.g. analysis summaries).
      const current = useGlobalSoulStore.getState().globalSoul;
      const existingNonDerived = (current?.compactedInsights ?? []).filter((s) => !s.startsWith('[DI:'));
      const nextCompactedInsights = [...derivedLines, ...existingNonDerived].slice(0, 12);

      if (derivedWriteTimerRef.current) clearTimeout(derivedWriteTimerRef.current);
      derivedWriteTimerRef.current = setTimeout(() => {
        dataLayer
          .updateDocument('global_souls', user.uid, {
            compactedInsights: nextCompactedInsights,
            lastSync: new Date().toISOString(),
          })
          .catch((e: unknown) => {
            console.error('[DerivedInsights] Failed to compact into global_souls:', e);
          });
      }, 350);
    });

    return () => {
      unsubscribe();
      if (derivedWriteTimerRef.current) {
        clearTimeout(derivedWriteTimerRef.current);
        derivedWriteTimerRef.current = null;
      }
    };
  }, [user?.uid, authLoading, dataLayer]);

  const updateTherapeuticBaseline = useCallback(async (baseline: GlobalProjection['therapeuticBaseline']) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateTherapeuticBaseline(user.uid, baseline, dataLayer);
    } catch (e) {
      console.error("Failed to update Therapeutic Baseline:", e);
    }
  }, [user, dataLayer]);

  const enhanceContext = useCallback((context: ConversationContext): ConversationContext => {
    if (!globalSoul) return context;
    const state = globalSoul?.crossFunctionalState;
    // eslint-disable-next-line no-control-regex
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    // eslint-disable-next-line no-control-regex
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
    // eslint-disable-next-line no-control-regex
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    // eslint-disable-next-line no-control-regex
    const safePronouns = (profile?.pronouns || 'They/Them').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 30);
    const safeInsights = (globalSoul?.compactedInsights || []).map(i => i.slice(0, 200));

    const nsvBlock = moduleId === 'atlas'
      ? formatNSVForAtlasPlanner(state)
      : formatNSVForModulePrompt(state, NSV_READ_PERMISSIONS[moduleId] ?? []);

    if (!nsvBlock && !extensionFieldsBlock) return context;

    const moduleContext = [
      '[SYSTEM CONTEXT]',
      `- Preferred Name: ${safeName}`,
      `- Pronouns: ${safePronouns}`,
      nsvBlock,
      safeInsights.length > 0
        ? `ACTIVE TRENDS:\n${safeInsights.map(i => `- ${i}`).join('\n')}`
        : '',
      extensionFieldsBlock || '',
    ].filter(Boolean).join('\n');

    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${moduleContext}`
    };
  }, [globalSoul, profile]);

  const getFilteredSoulForModule = useCallback((moduleId: ModuleId) => {
    return filterGlobalSoulForModule(globalSoul, moduleId);
  }, [globalSoul]);

  const actionsValue = useMemo(() => ({
    refreshGlobalSoul,
    updateCrossFunctionalState,
    updateTherapeuticBaseline,
    enhanceContext,
    enhanceContextForModule,
    getFilteredSoulForModule,
  }), [refreshGlobalSoul, updateCrossFunctionalState, updateTherapeuticBaseline,
      enhanceContext, enhanceContextForModule, getFilteredSoulForModule]);

  return (
    <GlobalSoulActionsContext.Provider value={actionsValue}>
      {children}
    </GlobalSoulActionsContext.Provider>
  );
}

// Backward compatible hook that merges Zustand state and React Context actions
export function useGlobalSoul(): GlobalSoulContextType {
  const actions = useContext(GlobalSoulActionsContext);
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const isLoading = useGlobalSoulStore(s => s.isLoading);
  
  if (!actions) throw new Error("useGlobalSoul must be used within GlobalSoulProvider");
  
  return {
    ...actions,
    globalSoul,
    isLoading
  };
}

export function useFilteredGlobalSoul(moduleId: ModuleId): { globalSoul: GlobalProjection | null; isLoading: boolean } {
  const globalSoul = useGlobalSoulStore((state) => filterGlobalSoulForModule(state.globalSoul, moduleId));
  const isLoading = useGlobalSoulStore((state) => state.isLoading);
  return { globalSoul, isLoading };
}
