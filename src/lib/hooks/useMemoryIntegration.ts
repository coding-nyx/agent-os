import { useRef, useEffect, useCallback } from 'react';
import type { ModuleMemoryEnvelope, SemanticFact } from '../types';
import { ModuleMemoryService } from '../services/module-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { MemoryOrchestrator } from '../services/memory-orchestrator';

export interface MemoryContext {
  recalledSessionsSummary: string;
  recalledFactsSummary: string;
}

interface UseMemoryIntegrationOptions {
  moduleId: string;
  userId: string | undefined;
  isGuest: boolean;
}

export function useMemoryIntegration({ moduleId, userId, isGuest }: UseMemoryIntegrationOptions) {
  const episodicEnvelopeRef = useRef<Record<string, ModuleMemoryEnvelope | null>>({});
  const episodicReadyRef = useRef<Record<string, boolean>>({});
  const semanticFactsRef = useRef<SemanticFact[]>([]);
  const semanticReadyRef = useRef(false);

  // Subscribe to episodic envelopes and semantic facts
  useEffect(() => {
    if (!userId || isGuest) {
      episodicEnvelopeRef.current = {};
      episodicReadyRef.current = {};
      semanticFactsRef.current = [];
      semanticReadyRef.current = false;
      return;
    }

    const moduleIds = Array.from(new Set([moduleId, 'orchestrator']));
    const unsubs = moduleIds.map((id) =>
      ModuleMemoryService.subscribeEnvelope(userId, id, (envelope) => {
        episodicEnvelopeRef.current[id] = envelope;
        episodicReadyRef.current[id] = true;
      })
    );

    const semanticUnsub = SemanticMemoryService.subscribeFacts(userId, (facts) => {
      semanticFactsRef.current = facts;
      semanticReadyRef.current = true;
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
      semanticUnsub();
    };
  }, [userId, isGuest, moduleId]);

  // Reset memory state on unmount
  useEffect(() => {
    return () => {
      episodicEnvelopeRef.current = {};
      episodicReadyRef.current = {};
      semanticFactsRef.current = [];
      semanticReadyRef.current = false;
    };
  }, []);

  const retrieveMemoryContext = useCallback(async (
    memoryQuery: string
  ): Promise<MemoryContext> => {
    if (!userId || isGuest) {
      return { recalledSessionsSummary: '', recalledFactsSummary: '' };
    }

    const relevantModuleIds = Array.from(new Set([moduleId, 'orchestrator']));
    const cachedEnvelopes = relevantModuleIds
      .map((id) => episodicEnvelopeRef.current[id])
      .filter((env): env is ModuleMemoryEnvelope => Boolean(env));
    const episodicReady = relevantModuleIds.every((id) => episodicReadyRef.current[id]);

    return MemoryOrchestrator.retrieveContext(
      userId,
      moduleId,
      memoryQuery,
      cachedEnvelopes,
      episodicReady,
      semanticReadyRef.current,
      semanticFactsRef.current
    );
  }, [moduleId, userId, isGuest]);

  return { retrieveMemoryContext };
}
