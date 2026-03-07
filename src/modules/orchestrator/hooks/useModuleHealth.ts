import { useState, useEffect, useMemo, useCallback } from 'react';
import { MODULE_MANIFEST, HUB_MODULE_ORDER, type ModuleId } from '@/lib/module-manifest';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import type { ModuleMemoryEnvelope } from '@/lib/types';

export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface ModuleHealthStatus {
  moduleId: ModuleId;
  title: string;
  alias: string;
  icon: typeof MODULE_MANIFEST.orchestrator.icon;
  colorHex: string;
  route: string;
  isAccessible: boolean;
  lastActive: string | null;
  lastSnapshot: string | null;
  keyMetricTone: StatusTone;
  hasPendingHandoff: boolean;
  hasAlert: boolean;
}

export interface UseModuleHealthReturn {
  modules: ModuleHealthStatus[];
  isLoading: boolean;
  refresh: () => void;
}

const HEALTH_MODULES = HUB_MODULE_ORDER.filter(id => id !== 'bridge');

function deriveMetricTone(moduleId: ModuleId, nsv: Record<string, unknown> | null): StatusTone {
  if (!nsv) return 'neutral';

  const bio = nsv.biological as Record<string, number | null> | undefined;
  const emo = nsv.emotional as Record<string, number | null> | undefined;
  const cog = nsv.cognitive as Record<string, number | null> | undefined;
  const res = nsv.resource as Record<string, number | null> | undefined;

  const safeNum = (v: number | null | undefined) => (typeof v === 'number' ? v : null);

  switch (moduleId) {
    case 'agnes': {
      const r = safeNum(emo?.emotionalResilience);
      if (r === null) return 'neutral';
      if (r >= 6) return 'good';
      if (r >= 4) return 'warn';
      return 'bad';
    }
    case 'titan': {
      const f = safeNum(bio?.cnsFatigue);
      if (f === null) return 'neutral';
      if (f <= 4) return 'good';
      if (f <= 7) return 'warn';
      return 'bad';
    }
    case 'soma': {
      const rec = safeNum(bio?.recoveryScore);
      if (rec === null) return 'neutral';
      if (rec >= 6) return 'good';
      if (rec >= 4) return 'warn';
      return 'bad';
    }
    case 'ledger': {
      const fr = safeNum(res?.financialFriction);
      if (fr === null) return 'neutral';
      if (fr <= 4) return 'good';
      if (fr <= 7) return 'warn';
      return 'bad';
    }
    case 'atlas': {
      const pl = safeNum(cog?.planningLoad);
      if (pl === null) return 'neutral';
      if (pl <= 5) return 'good';
      if (pl <= 7) return 'warn';
      return 'bad';
    }
    default:
      return 'neutral';
  }
}

export function useModuleHealth(): UseModuleHealthReturn {
  const { user } = useAuth();
  const { globalSoul } = useGlobalSoul();
  const vault = useVault();
  const [envelopes, setEnvelopes] = useState<Record<string, ModuleMemoryEnvelope | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const nsv = (globalSoul?.crossFunctionalState ?? null) as Record<string, unknown> | null;

  const fetchEnvelopes = useCallback(async () => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const results = await Promise.all(
        HEALTH_MODULES.map(async (id) => {
          try {
            const envelope = await ModuleMemoryService.getEnvelope(user.uid, id);
            return [id, envelope] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      const map: Record<string, ModuleMemoryEnvelope | null> = {};
      results.forEach(([id, env]) => { map[id] = env; });
      setEnvelopes(map);
    } catch {
      // Silent fail — show neutral status
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    fetchEnvelopes();
  }, [fetchEnvelopes, refreshCounter]);

  // Refresh on key spine events
  useSpineEvent('SESSION_ENDED', () => setRefreshCounter(c => c + 1));
  useSpineEvent('VITAL_UPDATED', () => setRefreshCounter(c => c + 1));

  const modules = useMemo<ModuleHealthStatus[]>(() => {
    return HEALTH_MODULES.map((id) => {
      const manifest = MODULE_MANIFEST[id];
      const envelope = envelopes[id];
      const isAccessible = vault?.isModuleAccessible?.(id) ?? !manifest.securityPolicy.defaultLocked;

      return {
        moduleId: id,
        title: manifest.title,
        alias: manifest.alias,
        icon: manifest.icon,
        colorHex: manifest.colorHex,
        route: manifest.route,
        isAccessible,
        lastActive: envelope?.lastActive ?? null,
        lastSnapshot: envelope?.latestSnapshot ?? null,
        keyMetricTone: deriveMetricTone(id, nsv),
        hasPendingHandoff: false,
        hasAlert: false,
      };
    });
  }, [envelopes, nsv, vault]);

  return {
    modules,
    isLoading,
    refresh: () => setRefreshCounter(c => c + 1),
  };
}
