import { useEffect, useMemo, useRef } from 'react';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import type { MessageContent } from '@/lib/types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { AliveEntityRuntimeContext } from '@/lib/contracts/orchestration';
import type { AutopilotLevel } from '@/lib/contracts/orchestration';
import type { SynthesisAlert } from './useAraSynthesis';
import { AnticipatoryPlanningService } from '@/lib/services/anticipatory-planning-service';
import { AraActionPlannerService } from '@/lib/services/ara-action-planner-service';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';

function buildPlanningExecutionVisibleContent(planningSuggestion: {
  title: string;
  summary: string;
  targetModuleId?: ModuleId;
  nodeCount?: number;
}): string {
  const targetLabel = planningSuggestion.targetModuleId
    ? MODULE_MANIFEST[planningSuggestion.targetModuleId]?.alias ?? planningSuggestion.targetModuleId
    : 'Ara';
  if (planningSuggestion.nodeCount && planningSuggestion.nodeCount > 1) {
    return `Execute the proposed ${planningSuggestion.nodeCount}-step ${targetLabel} plan. ${planningSuggestion.summary}`;
  }
  return `Execute the proposed ${planningSuggestion.title.toLowerCase()} via ${targetLabel}.`;
}

export { buildPlanningExecutionVisibleContent };

export interface UseAraPlanningSuggestionParams {
  currentThreadId: string;
  alerts: SynthesisAlert[];
  aliveContext: AliveEntityRuntimeContext | null;
  conversationDepth: number;
  lastParsedCommand: ParsedCommandEnvelope | null | undefined;
  autopilotLevel: AutopilotLevel;
  routingSuggestion: { target: ModuleId; reason?: string; state?: string } | null;
  routineActiveProposal: { id: string } | null | undefined;
  docUploadBusy: boolean;
  isConflictBlocking: boolean;
  planningSuggestion: {
    id: string;
    state: string;
    prompt: string;
    title: string;
    summary: string;
    targetModuleId?: ModuleId;
    nodeCount?: number;
    confidence?: number;
  } | null;
  setThreadPlanningSuggestion: (threadId: string, suggestion: any) => void;
  patchThreadPlanningSuggestion: (threadId: string, patch: any) => void;
  clearThreadPlanningSuggestion: (threadId: string) => void;
  handleSendMessage: (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
    options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string }
  ) => Promise<void>;
}

export function useAraPlanningSuggestion({
  currentThreadId,
  alerts,
  aliveContext,
  conversationDepth,
  lastParsedCommand,
  autopilotLevel,
  routingSuggestion,
  routineActiveProposal,
  docUploadBusy,
  isConflictBlocking,
  planningSuggestion,
  setThreadPlanningSuggestion,
  patchThreadPlanningSuggestion,
  clearThreadPlanningSuggestion,
  handleSendMessage,
}: UseAraPlanningSuggestionParams) {
  const automatedProposalKeyRef = useRef<string | null>(null);

  const anticipatoryPlanningProposal = useMemo(
    () =>
      AnticipatoryPlanningService.buildProposal({
        threadId: currentThreadId,
        alerts,
        aliveContext,
        conversationDepth,
      }),
    [alerts, aliveContext, conversationDepth, currentThreadId],
  );

  const parsedCommandPlanningProposal = useMemo(
    () =>
      AraActionPlannerService.buildPlanningSuggestion({
        threadId: currentThreadId,
        parsedCommand: lastParsedCommand ?? null,
        conversationDepth,
      }),
    [lastParsedCommand, conversationDepth, currentThreadId],
  );

  useEffect(() => {
    if (routingSuggestion || routineActiveProposal || docUploadBusy || isConflictBlocking) {
      clearThreadPlanningSuggestion(currentThreadId);
      return;
    }

    const activePlanningProposal = anticipatoryPlanningProposal ?? parsedCommandPlanningProposal;

    if (!activePlanningProposal) {
      clearThreadPlanningSuggestion(currentThreadId);
      return;
    }

    const planningDecision = OrchestrationInteractionGateService.evaluate({
      autopilotLevel,
      candidate: {
        kind: 'planning',
        sourceModuleId: 'ara',
        targetModuleId: activePlanningProposal.targetModuleId,
        threadId: currentThreadId,
        confidence: activePlanningProposal.confidence,
        canAutoDispatch: true,
      },
    });
    if (planningDecision.mode === 'silent_execute') {
      const proposalKey = `planning:${activePlanningProposal.id}:${activePlanningProposal.confidence ?? ''}`;
      if (automatedProposalKeyRef.current === proposalKey) return;
      automatedProposalKeyRef.current = proposalKey;
      clearThreadPlanningSuggestion(currentThreadId);
      void handleSendMessage(activePlanningProposal.prompt, undefined, {
        visibleContent: buildPlanningExecutionVisibleContent(activePlanningProposal),
      });
      return;
    }

    setThreadPlanningSuggestion(currentThreadId, {
      ...activePlanningProposal,
      state:
        planningSuggestion?.id === activePlanningProposal.id
          ? planningSuggestion.state
          : activePlanningProposal.state,
    });
  }, [
    anticipatoryPlanningProposal,
    clearThreadPlanningSuggestion,
    currentThreadId,
    docUploadBusy,
    isConflictBlocking,
    autopilotLevel,
    parsedCommandPlanningProposal,
    planningSuggestion?.id,
    planningSuggestion?.state,
    routingSuggestion,
    routineActiveProposal,
    setThreadPlanningSuggestion,
    handleSendMessage,
  ]);

  return { anticipatoryPlanningProposal, parsedCommandPlanningProposal };
}
