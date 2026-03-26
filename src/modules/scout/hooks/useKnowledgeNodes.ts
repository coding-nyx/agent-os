import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadKnowledgeNodes, ScoutKnowledgeNode } from '../services/scout-knowledge-service';

type KnowledgeContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

export function useKnowledgeNodes({ userId, encryptionKey }: KnowledgeContext) {
  const [knowledgeNodes, setKnowledgeNodes] = useState<ScoutKnowledgeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ userId, encryptionKey }), [userId, encryptionKey]);

  const load = useCallback(async () => {
    if (!userId || !encryptionKey) {
      setKnowledgeNodes([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadKnowledgeNodes(ctx);
      setKnowledgeNodes(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge nodes');
    } finally {
      setIsLoading(false);
    }
  }, [ctx]); // ctx already contains userId + encryptionKey

  useEffect(() => {
    load();
  }, [load]);

  return {
    knowledgeNodes,
    isLoading,
    error,
    refresh: load,
  };
}
