/**
 * useDigests.ts
 *
 * React hook for Scout on-demand digest generation and history.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  loadDigests,
  generateDigest,
  deleteDigest,
  type ScoutDigestDecrypted,
} from '../services/scout-digest-service';
import { ScoutDigest, ScoutKnowledgeNode } from '../types';
import type { SourceEntryDecrypted } from './useSources';

type DigestContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

interface UseDigestsReturn {
  digests: ScoutDigestDecrypted[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  latestDigest: ScoutDigestDecrypted | null;
  generateDigest: (
    interests: string[],
    nodes: ScoutKnowledgeNode[],
    sources: SourceEntryDecrypted[],
    triggerSource: ScoutDigest['generationType'],
  ) => Promise<ScoutDigestDecrypted | null>;
  deleteDigest: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDigests(
  { userId, encryptionKey }: DigestContext
): UseDigestsReturn {
  const [digests, setDigests] = useState<ScoutDigestDecrypted[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ userId, encryptionKey }), [userId, encryptionKey]);

  const load = useCallback(async () => {
    if (!userId || !encryptionKey) {
      setDigests([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadDigests(ctx);
      setDigests(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load digests');
    } finally {
      setIsLoading(false);
    }
  }, [ctx, userId, encryptionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerateDigest = useCallback(
    async (
      interests: string[],
      nodes: ScoutKnowledgeNode[],
      sources: SourceEntryDecrypted[],
      triggerSource: ScoutDigest['generationType'],
    ): Promise<ScoutDigestDecrypted | null> => {
      if (!userId || !encryptionKey) return null;
      setIsGenerating(true);
      setError(null);
      try {
        const result = await generateDigest(interests, nodes, sources, triggerSource, ctx);
        if (result) {
          setDigests((prev) => [result, ...prev].slice(0, 10));
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Digest generation failed');
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [ctx, userId, encryptionKey],
  );

  const handleDeleteDigest = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) return;
      setDigests((prev) => prev.filter((d) => d.id !== id));
      try {
        await deleteDigest(id, ctx);
      } catch (err) {
        await load();
        setError(err instanceof Error ? err.message : 'Failed to delete digest');
      }
    },
    [ctx, userId, load],
  );

  const latestDigest = digests[0] ?? null;

  return {
    digests,
    isLoading,
    isGenerating,
    error,
    latestDigest,
    generateDigest: handleGenerateDigest,
    deleteDigest: handleDeleteDigest,
    refresh: load,
  };
}
