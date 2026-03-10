import { useRef, useEffect, useCallback, useState } from 'react';
import type { ModuleMemoryEnvelope, SemanticFact } from '../types';
import { ModuleMemoryService } from '../services/module-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { MemoryOrchestrator } from '../services/memory-orchestrator';
import { MODULE_MANIFEST } from '../module-manifest';

export interface MemoryContext {
  recalledSessionsSummary: string;
  recalledFactsSummary: string;
  status?: 'ok' | 'vault_blocked';
}

interface UseMemoryIntegrationOptions {
  moduleId: string;
  userId: string | undefined;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
}

export function useMemoryIntegration({ moduleId, userId, isGuest, encryptionKey }: UseMemoryIntegrationOptions) {
  const episodicEnvelopeRef = useRef<Record<string, ModuleMemoryEnvelope | null>>({});
  const episodicReadyRef = useRef<Record<string, boolean>>({});
  const semanticFactsRef = useRef<SemanticFact[]>([]);
  const semanticReadyRef = useRef(false);
  // Stabilize encryptionKey: only re-subscribe when the key identity actually changes
  const encryptionKeyRef = useRef(encryptionKey);
  const [encryptionKeyVersion, setEncryptionKeyVersion] = useState(0);
  if (encryptionKeyRef.current !== encryptionKey) {
    encryptionKeyRef.current = encryptionKey;
    setEncryptionKeyVersion(v => v + 1);
  }

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
      }, encryptionKeyRef.current)
    );

    const semanticUnsub = SemanticMemoryService.subscribeFacts(userId, (facts) => {
      semanticFactsRef.current = facts;
      semanticReadyRef.current = true;
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
      semanticUnsub();
    };
  }, [userId, isGuest, moduleId, encryptionKeyVersion]);

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
      return { recalledSessionsSummary: '', recalledFactsSummary: '', status: 'ok' };
    }

    const securityPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = securityPolicy ? (securityPolicy.mandatory || securityPolicy.defaultLocked) : false;

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
      semanticFactsRef.current,
      { requiresVault, encryptionKey: encryptionKeyRef.current }
    );
  }, [moduleId, userId, isGuest]);

  return { retrieveMemoryContext };
}
