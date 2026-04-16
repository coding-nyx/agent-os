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
import { composeBoundedContext } from './services/context/context-budgeter';

const MAX_ARA_CONTEXT_CHARS = 4_200;
const MAX_MODULE_CONTEXT_CHARS = 2_600;

interface GlobalSoulStore {
  globalSoul: GlobalProjection | null;
  isLoading: boolean;
  /** True when the last refresh attempt failed — soul data may be stale */
  soulStale: boolean;
  setGlobalSoul: (soul: GlobalProjection | null) => void;
  setIsLoading: (loading: boolean) => void;
  setSoulStale: (stale: boolean) => void;
}

export const useGlobalSoulStore = create<GlobalSoulStore>((set) => ({
  globalSoul: null,
  isLoading: true,
  soulStale: false,
  setGlobalSoul: (soul) => set({ globalSoul: soul, soulStale: false }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSoulStale: (stale) => set({ soulStale: stale }),
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
  const setSoulStale = useGlobalSoulStore(s => s.setSoulStale);
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const soulStale = useGlobalSoulStore(s => s.soulStale);
  const derivedWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDerivedSignatureRef = useRef<string>('');
  // Keep globalSoul and soulStale in refs so enhanceContext/enhanceContextForModule
  // don't need them as useCallback deps. Without this, every Firebase write to
  // global_souls recreates the callbacks → actionsValue context updates → every
  // useGlobalSoul() consumer in the app re-renders.
  const globalSoulRef = useRef(globalSoul);
  globalSoulRef.current = globalSoul;
  const soulStaleRef = useRef(soulStale);
  soulStaleRef.current = soulStale;
  // Only the initial load triggers the loading gate — background refreshes must not
  // call setIsLoading(true) or ProtectedRoute will unmount all children mid-request.
  const hasSoulLoadedRef = useRef(false);

  const refreshGlobalSoul = useCallback(async () => {
    if (!user) {
      setGlobalSoul(null);
      setIsLoading(false);
      return;
    }

    // Only block navigation on the very first load. Background refreshes
    // (e.g. triggered by enhanceContextForModule after 30s stale) must NOT
    // call setIsLoading(true) or ProtectedRoute will unmount all children.
    if (!hasSoulLoadedRef.current) {
      setIsLoading(true);
    }
    try {
      const projection = await GlobalProjectionService.getProjection(user.uid, dataLayer);
      setGlobalSoul(projection);
      hasSoulLoadedRef.current = true;
    } catch (e) {
      console.error("Failed to refresh Global Projection:", e);
      setSoulStale(true);
      Spine.emit({
        type: 'HEALTH_CONTEXT_STALE',
        source: 'ara',
        domain: 'system',
        data: { reason: 'refresh_failed' },
        cascadeDepth: 0,
        priority: 'info'
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, setGlobalSoul, setIsLoading, setSoulStale, dataLayer]);

  const updateCrossFunctionalState = useCallback(async (updates: NeuralStateVectorPatch) => {
    if (!user) return;
    try {
      await GlobalProjectionService.updateCrossFunctionalState(user.uid, updates, dataLayer);
    } catch (e) {
      console.error("[GlobalSoul] Failed to update Cross Functional State:", e);
      // Use 'info' priority so the event is NOT persisted to Firestore.
      // If the root cause is a Firestore write failure, a 'warning' persistence
      // write would amplify the problem — the console.error above already records
      // the failure. The 500ms Spine debounce also limits duplicate emissions.
      Spine.emit({
        type: 'SOUL_STALE',
        source: 'ara',
        domain: 'system',
        data: { reason: 'nsv_write_failed', error: e instanceof Error ? e.message : String(e) },
        cascadeDepth: 0,
        priority: 'info',
      });
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
        // React 18 automatic batching handles synchronous state updates in one
        // render pass. Do NOT wrap in startTransition — that defers the render
        // into a separate pass, causing visible layout shifts during agent flows.
        if (!record) {
          setGlobalSoul(null);
          setIsLoading(false);
          return;
        }
        hasSoulLoadedRef.current = true;
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
  // Deferred until the browser is idle so this non-critical subscription doesn't
  // compete with critical-path Firebase listeners during initial paint.
  useEffect(() => {
    if (!user || authLoading) return;

    let unsubscribeRef: (() => void) | null = null;
    let idleHandle: number | null = null;

    const subscribe = () => {
      unsubscribeRef = DerivedInsightsService.subscribeToInsights(user.uid, (insights) => {
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
    };

    // Defer non-critical subscription until the browser is idle (Item 8)
    if (typeof requestIdleCallback !== 'undefined') {
      idleHandle = requestIdleCallback(subscribe);
    } else {
      idleHandle = window.setTimeout(subscribe, 0);
    }

    return () => {
      if (idleHandle !== null) {
        if (typeof requestIdleCallback !== 'undefined') cancelIdleCallback(idleHandle);
        else clearTimeout(idleHandle);
      }
      unsubscribeRef?.();
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
    const soul = globalSoulRef.current;
    if (!soul) return context;
    const state = soul.crossFunctionalState;
    // eslint-disable-next-line no-control-regex
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    // eslint-disable-next-line no-control-regex
    const safePronouns = (profile?.pronouns || 'They/Them').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 30);
    const safeInsights = (soul.compactedInsights || []).map(i => i.slice(0, 200));
    const soulContext = composeBoundedContext({
      title: '[GLOBAL SYSTEM CONTEXT]',
      identityLines: [
        `- Preferred Name: ${safeName}`,
        `- Pronouns: ${safePronouns}`,
      ],
      nsvBlock: formatNSVForPrompt(state),
      insightLines: safeInsights,
      maxChars: MAX_ARA_CONTEXT_CHARS,
      minNsvChars: 420,
    });
    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${soulContext}`
    };
  }, [profile]); // globalSoul is read from globalSoulRef at call time — no dep needed

  const enhanceContextForModule = useCallback((
    context: ConversationContext,
    moduleId: ModuleId,
    extensionFieldsBlock?: string,
  ): ConversationContext => {
    const soul = globalSoulRef.current;
    if (!soul) return context;

    const state = soul.crossFunctionalState;
    // eslint-disable-next-line no-control-regex
    const safeName = (profile?.preferredName || 'Unknown').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
    // eslint-disable-next-line no-control-regex
    const safePronouns = (profile?.pronouns || 'They/Them').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 30);
    const safeInsights = (soul.compactedInsights || []).map(i => i.slice(0, 200));

    const rawNsvBlock = moduleId === 'atlas'
      ? formatNSVForAtlasPlanner(state)
      : formatNSVForModulePrompt(state, NSV_READ_PERMISSIONS[moduleId] ?? []);

    const nsvBlock = soulStaleRef.current && rawNsvBlock
      ? `⚠ NSV data may be stale — last refresh failed. Use with caution.\n${rawNsvBlock}`
      : rawNsvBlock;

    if (!nsvBlock && !extensionFieldsBlock) return context;

    const moduleContext = composeBoundedContext({
      title: '[SYSTEM CONTEXT]',
      identityLines: [
        `- Preferred Name: ${safeName}`,
        `- Pronouns: ${safePronouns}`,
      ],
      nsvBlock,
      insightLines: safeInsights,
      extensionBlock: extensionFieldsBlock || '',
      maxChars: MAX_MODULE_CONTEXT_CHARS,
      minNsvChars: 260,
    });

    return {
      ...context,
      systemPrompt: `${context.systemPrompt}\n\n${moduleContext}`
    };
  }, [profile, refreshGlobalSoul]); // globalSoul/soulStale read from refs at call time

  const getFilteredSoulForModule = useCallback((moduleId: ModuleId) => {
    return filterGlobalSoulForModule(globalSoulRef.current, moduleId);
  }, []); // globalSoul read from ref at call time

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

// Backward compatible hook that merges Zustand state and React Context actions.
// NOTE: This subscribes to the Zustand globalSoul slice — components that call
// this hook will re-render whenever global_souls is written to. For components
// that only need action functions (and not globalSoul data), prefer
// useGlobalSoulActions() to avoid unnecessary re-renders.
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

// Stable-only hook — returns action functions from context without subscribing
// to the Zustand globalSoul or isLoading slices. Components using this hook
// will NOT re-render when global_souls data is written to Firebase.
export function useGlobalSoulActions(): Omit<GlobalSoulContextType, 'globalSoul' | 'isLoading'> {
  const actions = useContext(GlobalSoulActionsContext);
  if (!actions) throw new Error("useGlobalSoulActions must be used within GlobalSoulProvider");
  return actions;
}

export function useFilteredGlobalSoul(moduleId: ModuleId): { globalSoul: GlobalProjection | null; isLoading: boolean } {
  const globalSoul = useGlobalSoulStore((state) => filterGlobalSoulForModule(state.globalSoul, moduleId));
  const isLoading = useGlobalSoulStore((state) => state.isLoading);
  return { globalSoul, isLoading };
}
