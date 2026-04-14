/**
 * useScoutSpineEvents.ts
 *
 * Encapsulates Spine event subscriptions and export logic
 * previously inlined in ScoutContent (ScoutPage.tsx).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { createFlowMeta } from '@/lib/spine/flow-contracts';
import { useUIStore } from '@/lib/stores/ui-store';
import { loadKnowledgeNodes } from '../services/scout-knowledge-service';
import type { ExportTarget } from '../services/scout-export-service';
import type { SourceEntryDecrypted } from '../services/scout-sources-service';
import type { ScoutDigestDecrypted } from '../services/scout-digest-service';
import type { ScoutTopLevelView } from '../scout-shell-layout';

// ---------------------------------------------------------------------------
// Params / Return types
// ---------------------------------------------------------------------------

interface UseScoutSpineEventsParams {
  userId: string | undefined;
  encryptionKey: CryptoKey | null;
  sources: SourceEntryDecrypted[];
  digests: ScoutDigestDecrypted[];
  openDeepResearch: (query: string) => void;
  setSelectedView: (view: ScoutTopLevelView) => void;
  setActiveSessionId: (id: string) => void;
}

interface UseScoutSpineEventsReturn {
  exportTarget: ExportTarget | null;
  exportDialogOpen: boolean;
  setExportDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExportTarget: React.Dispatch<React.SetStateAction<ExportTarget | null>>;
  requestExport: (target: ExportTarget) => void;
  researchProposal: { query: string; reason: string; mode: 'web' | 'deep' } | null;
  setResearchProposal: React.Dispatch<
    React.SetStateAction<{ query: string; reason: string; mode: 'web' | 'deep' } | null>
  >;
  deepResearchOpen: boolean;
  setDeepResearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deepResearchInitialQuery: string;
  setDeepResearchInitialQuery: React.Dispatch<React.SetStateAction<string>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScoutSpineEvents(params: UseScoutSpineEventsParams): UseScoutSpineEventsReturn {
  const {
    userId,
    encryptionKey,
    sources,
    digests,
    openDeepResearch,
    setSelectedView,
    setActiveSessionId,
  } = params;

  const setHideGlobalFAB = useUIStore((state) => state.setHideGlobalFAB);

  // ---- Local state ----

  const [deepResearchOpen, setDeepResearchOpen] = useState(false);
  const [deepResearchInitialQuery, setDeepResearchInitialQuery] = useState('');
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [researchProposal, setResearchProposal] = useState<{
    query: string;
    reason: string;
    mode: 'web' | 'deep';
  } | null>(null);

  // ---- Hide global FAB while deep-research panel is open ----

  useEffect(() => {
    setHideGlobalFAB(deepResearchOpen);
    return () => {
      setHideGlobalFAB(false);
    };
  }, [deepResearchOpen, setHideGlobalFAB]);

  // ---- Refs for latest sources / digests (avoids stale closures) ----

  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const digestsRef = useRef(digests);
  digestsRef.current = digests;

  // ---- Stable origin id for deduplicating self-emitted EXPORT_REQUESTED ----

  const localExportOriginRef = useRef<string | null>(null);
  if (localExportOriginRef.current === null) {
    localExportOriginRef.current = `scout-export:${crypto.randomUUID()}`;
  }

  // Reentrancy guard: prevent requestExport -> Spine.emit -> subscriber -> presentExportDialog
  // from causing a feedback loop if the originId guard is ever bypassed.
  const exportingRef = useRef(false);

  // ---- Export helpers ----

  const presentExportDialog = useCallback((target: ExportTarget) => {
    setExportTarget(target);
    setExportDialogOpen(true);
  }, []);

  const requestExport = useCallback(
    (target: ExportTarget) => {
      if (exportingRef.current) return; // reentrancy guard
      exportingRef.current = true;
      try {
        const flowMeta = createFlowMeta(localExportOriginRef.current!);
        Spine.emit({
          type: 'EXPORT_REQUESTED',
          source: 'scout',
          domain: 'C',
          data: { exportType: target.type },
          cascadeDepth: 0,
          priority: 'info',
          ...flowMeta,
          idempotencyKey: `export:${target.type}:${flowMeta.flowId}`,
        });
        presentExportDialog(target);
      } finally {
        exportingRef.current = false;
      }
    },
    [presentExportDialog],
  );

  // ---- Spine subscriptions ----

  useEffect(() => {
    const unsubDeepResearch = Spine.subscribe('DEEP_RESEARCH_STARTED', (event) => {
      const query = (event.data?.query as string) ?? '';
      openDeepResearch(query);
    });

    const unsubExport = Spine.subscribe('EXPORT_REQUESTED', (event) => {
      if (event.originId === localExportOriginRef.current) return;
      const exportType = event.data?.exportType as string;
      const s = sourcesRef.current;
      const d = digestsRef.current;
      if (exportType === 'full-library') {
        loadKnowledgeNodes({ userId, encryptionKey }).then((nodes) => {
          presentExportDialog({ type: 'full-library', nodes, digests: d, sources: s });
        });
      } else if (exportType === 'sources') {
        presentExportDialog({ type: 'sources', sources: s });
      } else if (exportType === 'nodes') {
        loadKnowledgeNodes({ userId, encryptionKey }).then((nodes) => {
          presentExportDialog({ type: 'nodes', nodes });
        });
      } else if (exportType === 'digest' && d[0]) {
        presentExportDialog({ type: 'digest', digest: d[0] });
      }
    });

    const unsubDigest = Spine.subscribe('DIGEST_GENERATION_STARTED', () => {
      setSelectedView('briefings');
    });

    const unsubSession = Spine.subscribe('SESSION_STARTED', (event) => {
      if (typeof event.data?.sessionId === 'string') {
        setActiveSessionId(event.data.sessionId);
        setSelectedView('research');
      }
    });

    const unsubProposal = Spine.subscribe('RESEARCH_PROPOSED', (event) => {
      const query = typeof event.data?.query === 'string' ? event.data.query : '';
      const reason = typeof event.data?.reason === 'string' ? event.data.reason : '';
      const mode = event.data?.mode === 'deep' ? 'deep' : 'web';
      if (query) setResearchProposal({ query, reason, mode });
    });

    return () => {
      unsubDeepResearch();
      unsubExport();
      unsubDigest();
      unsubSession();
      unsubProposal();
    };
  }, [openDeepResearch, presentExportDialog, userId, encryptionKey, setSelectedView, setActiveSessionId]);

  // ---- Return ----

  return {
    exportTarget,
    exportDialogOpen,
    setExportDialogOpen,
    setExportTarget,
    requestExport,
    researchProposal,
    setResearchProposal,
    deepResearchOpen,
    setDeepResearchOpen,
    deepResearchInitialQuery,
    setDeepResearchInitialQuery,
  };
}
