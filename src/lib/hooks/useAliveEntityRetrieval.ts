import { useEffect, useMemo, useState } from 'react';
import type { AraDataLayer, AraRecord } from '@/lib/data-layer';
import type { AliveEntity, AliveEntityRuntimeContext } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import { buildAliveEntityRuntimeContext, listAliveEntities } from '@/lib/services/alive-entity-service';

interface UseAliveEntityRetrievalOptions {
  moduleFilter?: ModuleId[];
  limitPerModule?: number;
}

export function useAliveEntityRetrieval(
  dataLayer: AraDataLayer,
  uid?: string,
  options?: UseAliveEntityRetrievalOptions,
) {
  const [entities, setEntities] = useState<Array<AraRecord<AliveEntity>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uid) {
      setEntities([]);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);

    void listAliveEntities(dataLayer, undefined, { uid })
      .then((results) => {
        if (cancelled) return;
        setEntities(results);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setEntities([]);
        setError(nextError instanceof Error ? nextError : new Error('Failed to load alive entities'));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataLayer, uid]);

  const context = useMemo<AliveEntityRuntimeContext | null>(() => {
    if (entities.length === 0) return null;
    return buildAliveEntityRuntimeContext(entities, {
      moduleFilter: options?.moduleFilter,
      limitPerModule: options?.limitPerModule,
    });
  }, [entities, options?.limitPerModule, options?.moduleFilter]);

  return { entities, context, isLoading, error };
}
