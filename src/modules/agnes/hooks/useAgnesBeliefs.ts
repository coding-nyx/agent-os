import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import {
  dismissBeliefGraphProposal,
  subscribeBeliefGraphWorkflow,
  type BeliefGraphWorkflow,
  confirmBeliefGraphProposal,
  loadBeliefGraphWorkflow,
  updateBeliefSessionInvitationStatus,
} from '../services/belief-graph-workflow-service';
import { buildBeliefSessionInvitationSnapshot } from '../services/belief-trigger-service';
import {
  compactBeliefGraphDocument,
  subscribeBeliefGraph,
  type BeliefGraph as AgnesBeliefGraph,
} from '../services/belief-graph-service';
import { useAI } from '@/cortex-bridge/ai-context';
import type { AgnesState } from './types';

interface UseAgnesBeliefsParams {
  encryptionKey: CryptoKey | null | undefined;
  currentState: AgnesState;
}

export function useAgnesBeliefs({ encryptionKey, currentState }: UseAgnesBeliefsParams) {
  const { user, isGuest } = useAuth();
  const { generateJSON } = useAI();
  const globalSoul = useGlobalSoulStore((s) => s.globalSoul);

  const [beliefGraph, setBeliefGraph] = useState<AgnesBeliefGraph | null>(null);
  const [beliefWorkflow, setBeliefWorkflow] = useState<BeliefGraphWorkflow | null>(null);
  const [beliefWorkflowBusy, setBeliefWorkflowBusy] = useState(false);
  const [activeBeliefContext, setActiveBeliefContext] = useState<{ triggeringBeliefs: string[]; rationale: string[] } | null>(null);

  // Compaction UI state
  const [isCompactingBeliefGraph, setIsCompactingBeliefGraph] = useState(false);
  const [compactBeliefGraphStatus, setCompactBeliefGraphStatus] = useState<string | null>(null);

  // Belief workflow arrivals during an active session are deferred and shown post-session
  const pendingPostSessionBeliefWorkflowRef = useRef<BeliefGraphWorkflow | null>(null);

  // Ref-mirror of currentState so the subscription callback reads the latest
  // value without forcing effect re-subscription on every state transition.
  const currentStateRef = useRef(currentState);
  currentStateRef.current = currentState;

  // Subscribe to belief graph and workflow
  useEffect(() => {
    if (!user || isGuest || !encryptionKey) {
      setBeliefGraph(null);
      setBeliefWorkflow(null);
      return;
    }

    const unsubscribeGraph = subscribeBeliefGraph({ userId: user.uid, encryptionKey }, setBeliefGraph);
    const unsubscribeWorkflow = subscribeBeliefGraphWorkflow({ userId: user.uid, encryptionKey }, (workflow) => {
      // During an active therapy session, queue belief workflow arrivals for post-session
      // rather than surfacing them immediately. The session is a sacred container.
      if (currentStateRef.current === 'session') {
        pendingPostSessionBeliefWorkflowRef.current = workflow;
        return;
      }
      setBeliefWorkflow(workflow);
    });

    return () => {
      unsubscribeGraph();
      unsubscribeWorkflow();
    };
  }, [encryptionKey, isGuest, user]);

  const beliefInvitationSnapshot = useMemo(
    () => buildBeliefSessionInvitationSnapshot(beliefWorkflow?.invitation),
    [beliefWorkflow?.invitation],
  );

  const handleConfirmBeliefProposal = useCallback(
    async (proposalId: string, editedGraph: AgnesBeliefGraph) => {
      if (!user || isGuest || !encryptionKey) return;
      setBeliefWorkflowBusy(true);
      try {
        await confirmBeliefGraphProposal({
          proposalId,
          editedGraph,
          userId: user.uid,
          encryptionKey,
          emotionalState: globalSoul?.crossFunctionalState.emotional ?? null,
          isGuest,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    },
    [encryptionKey, globalSoul?.crossFunctionalState.emotional, isGuest, user],
  );

  const handleDismissBeliefProposal = useCallback(
    async (proposalId: string) => {
      if (!user || isGuest || !encryptionKey) return;
      setBeliefWorkflowBusy(true);
      try {
        await dismissBeliefGraphProposal({
          proposalId,
          userId: user.uid,
          encryptionKey,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    },
    [encryptionKey, isGuest, user],
  );

  const handleDismissBeliefInvitation = useCallback(async () => {
    if (!user || isGuest || !encryptionKey) return;
    setBeliefWorkflowBusy(true);
    try {
      await updateBeliefSessionInvitationStatus({
        status: 'dismissed',
        userId: user.uid,
        encryptionKey,
      });
    } finally {
      setBeliefWorkflowBusy(false);
    }
  }, [encryptionKey, isGuest, user]);

  const autoHandlePendingBeliefSuggestions = useCallback(async () => {
    if (!user || isGuest || !encryptionKey) return;

    try {
      const workflow = await loadBeliefGraphWorkflow({ userId: user.uid, encryptionKey });
      const pendingProposals = workflow?.proposals.filter((proposal) => proposal.status === 'pending') ?? [];
      if (pendingProposals.length === 0) return;

      setBeliefWorkflowBusy(true);
      let latestGraph: AgnesBeliefGraph | null = null;
      let latestWorkflow: BeliefGraphWorkflow | null = workflow;

      for (const proposal of pendingProposals) {
        try {
          const result = await confirmBeliefGraphProposal({
            proposalId: proposal.id,
            userId: user.uid,
            encryptionKey,
            emotionalState: globalSoul?.crossFunctionalState.emotional ?? null,
            isGuest,
          });
          if (result.graph) latestGraph = result.graph;
          if (result.workflow) latestWorkflow = result.workflow;
        } catch (error) {
          console.warn('[Agnes] Failed to auto-apply pending belief proposal:', proposal.id, error);
        }
      }

      if (latestGraph) setBeliefGraph(latestGraph);
      if (latestWorkflow) setBeliefWorkflow(latestWorkflow);
    } catch (error) {
      console.warn('[Agnes] Failed to auto-handle pending belief suggestions:', error);
    } finally {
      setBeliefWorkflowBusy(false);
    }
  }, [encryptionKey, globalSoul?.crossFunctionalState.emotional, isGuest, user]);

  const handleCompactBeliefGraph = useCallback(async () => {
    if (!user || isGuest || !encryptionKey) return;
    setCompactBeliefGraphStatus(null);
    setIsCompactingBeliefGraph(true);
    try {
      const result = await compactBeliefGraphDocument(
        { userId: user.uid, encryptionKey },
        { maxNodes: 60, generateJSON },
      );
      if (result.compacted) {
        setCompactBeliefGraphStatus(
          `Belief graph compacted (${result.nodeCount} beliefs, ${result.edgeCount} links).`,
        );
      } else {
        setCompactBeliefGraphStatus(`Belief graph compaction skipped: ${result.reason ?? 'unknown reason'}.`);
      }
    } catch (error) {
      console.error('[Agnes] Belief graph compaction failed:', error);
      setCompactBeliefGraphStatus('Belief graph compaction failed. Check console for details.');
    } finally {
      setIsCompactingBeliefGraph(false);
    }
  }, [encryptionKey, generateJSON, isGuest, user]);

  // Flush deferred workflow after session ends
  const flushPendingPostSessionWorkflow = useCallback(() => {
    if (pendingPostSessionBeliefWorkflowRef.current !== null) {
      setBeliefWorkflow(pendingPostSessionBeliefWorkflowRef.current);
      pendingPostSessionBeliefWorkflowRef.current = null;
    }
  }, []);

  // Accept belief invitation: update status + return context for session start
  const acceptBeliefInvitationAndGetContext = useCallback(async () => {
    if (user && !isGuest && encryptionKey) {
      setBeliefWorkflowBusy(true);
      try {
        await updateBeliefSessionInvitationStatus({
          status: 'accepted',
          userId: user.uid,
          encryptionKey,
        });
      } finally {
        setBeliefWorkflowBusy(false);
      }
    }
    const invitation = beliefWorkflow?.invitation;
    return invitation
      ? {
          triggeringBeliefs: invitation.triggeringBeliefs ?? [],
          rationale: invitation.rationale ?? [],
        }
      : undefined;
  }, [beliefWorkflow?.invitation, encryptionKey, isGuest, user]);

  return {
    beliefGraph,
    beliefWorkflow,
    beliefWorkflowBusy,
    beliefInvitationSnapshot,
    activeBeliefContext,
    setActiveBeliefContext,
    isCompactingBeliefGraph,
    compactBeliefGraphStatus,
    handleConfirmBeliefProposal,
    handleDismissBeliefProposal,
    handleDismissBeliefInvitation,
    handleCompactBeliefGraph,
    autoHandlePendingBeliefSuggestions,
    flushPendingPostSessionWorkflow,
    acceptBeliefInvitationAndGetContext,
  };
}
