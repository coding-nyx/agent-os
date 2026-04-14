import { useEffect, useState } from 'react';
import type { NexusDataLayer } from '@/lib/data-layer';
import type { SilentHistoryEntry } from '@/lib/contracts/orchestration';
import { OrchestrationHistoryService } from '@/lib/services/orchestration-history-service';

export function useNexusSilentHistory(
  userId: string | undefined,
  isGuest: boolean,
  currentThreadId: string,
  dataLayer: NexusDataLayer,
): SilentHistoryEntry[] {
  const [entries, setEntries] = useState<SilentHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!userId || isGuest) {
      setEntries([]);
      return () => {
        cancelled = true;
      };
    }

    void OrchestrationHistoryService.listSilentHistoryForThread(userId, currentThreadId, {
      dataLayer,
      limit: 6,
    })
      .then((result) => {
        if (cancelled) return;
        setEntries(result);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[NexusDashboard] Failed to load silent history:', error);
          setEntries([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, dataLayer, isGuest, userId]);

  return entries;
}
