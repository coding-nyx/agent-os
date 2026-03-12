/**
 * useSources.ts
 *
 * React hook for the Scout Source Library.
 * Loads sources once on mount; updates local state optimistically on mutations.
 * Guest mode: returns empty sources, all mutations are no-ops.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  loadSources,
  addSource,
  updateSource,
  archiveSource,
  filterSources,
  getSourcesByNode,
  type SourceEntryDecrypted,
  type AddSourceInput,
} from '../services/scout-sources-service';

type SourceContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

interface UseSourcesReturn {
  sources: SourceEntryDecrypted[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  addSource: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  updateSource: (
    id: string,
    patch: Partial<Pick<SourceEntryDecrypted, 'isStarred' | 'readAt' | 'nodeId' | 'tags' | 'title' | 'snippet'>>,
  ) => Promise<void>;
  archiveSource: (id: string) => Promise<void>;
  /** Client-side text search — returns filtered copy, does not mutate `sources` */
  searchSources: (query: string) => SourceEntryDecrypted[];
  /** Filter sources by knowledge node ID */
  getSourcesByNode: (nodeId: string) => SourceEntryDecrypted[];
  /** Reload sources from Firestore */
  refresh: () => Promise<void>;
}

export function useSources({ userId, encryptionKey }: SourceContext): UseSourcesReturn {
  const [sources, setSources] = useState<SourceEntryDecrypted[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ userId, encryptionKey }), [userId, encryptionKey]);

  const load = useCallback(async () => {
    if (!userId || !encryptionKey) {
      setSources([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadSources(ctx);
      setSources(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setIsLoading(false);
    }
  }, [ctx, userId, encryptionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddSource = useCallback(
    async (input: AddSourceInput): Promise<SourceEntryDecrypted | null> => {
      if (!userId || !encryptionKey) return null;
      setIsSaving(true);
      setError(null);
      try {
        const result = await addSource(input, ctx);
        if (result) {
          setSources((prev) => {
            const exists = prev.find((s) => s.id === result.id);
            if (exists) return prev;
            return [result, ...prev];
          });
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add source');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [ctx, userId, encryptionKey],
  );

  const handleUpdateSource = useCallback(
    async (
      id: string,
      patch: Partial<Pick<SourceEntryDecrypted, 'isStarred' | 'readAt' | 'nodeId' | 'tags' | 'title' | 'snippet'>>,
    ): Promise<void> => {
      if (!userId || !encryptionKey) return;

      // Optimistic update
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );

      try {
        await updateSource(id, patch, ctx);
      } catch (err) {
        // Revert on failure
        await load();
        setError(err instanceof Error ? err.message : 'Failed to update source');
      }
    },
    [ctx, userId, encryptionKey, load],
  );

  const handleArchiveSource = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) return;

      // Optimistic removal from list
      setSources((prev) => prev.filter((s) => s.id !== id));

      try {
        await archiveSource(id, ctx);
      } catch (err) {
        await load();
        setError(err instanceof Error ? err.message : 'Failed to archive source');
      }
    },
    [ctx, userId, load],
  );

  const searchSourcesFn = useCallback(
    (query: string) => filterSources(sources, query),
    [sources],
  );

  const getSourcesByNodeFn = useCallback(
    (nodeId: string) => getSourcesByNode(sources, nodeId),
    [sources],
  );

  return {
    sources,
    isLoading,
    isSaving,
    error,
    addSource: handleAddSource,
    updateSource: handleUpdateSource,
    archiveSource: handleArchiveSource,
    searchSources: searchSourcesFn,
    getSourcesByNode: getSourcesByNodeFn,
    refresh: load,
  };
}
