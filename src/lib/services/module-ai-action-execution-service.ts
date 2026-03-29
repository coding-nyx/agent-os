import { ActionHub } from '@/lib/actions/action-hub';
import { getActionLabel } from '@/lib/actions/action-labels';
import type { ConversationContext, StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type {
  ActionOrchestrationMetadata,
  HistoryMode,
  SpecialistConsultationArtifact,
  ThreadExecutionArtifact,
} from '@/lib/contracts/orchestration';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { NexusLogger } from '@/lib/nexus-logger';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { OrchestrationActionGateService } from '@/lib/services/orchestration-action-gate-service';
import { OrchestrationRuntimeService } from '@/lib/services/orchestration-runtime-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { Message, NeuralStateVectorPatch, SpineDomain, SpineEventPriority, SpineEventType } from '@/lib/types';

type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

interface ParsedAction {
  type: string;
  payload: Record<string, unknown>;
}

interface ExecuteModuleAIActionsInput {
  moduleId: string;
  responseActions: ParsedAction[];
  contentText: string;
  parsedCommand?: ParsedCommandEnvelope | null;
  allowedActions: string[];
  autopilotLevel: 0 | 1 | 2 | 3 | 4 | 5;
  orchestrationHistoryMode: HistoryMode;
  activeThreadId: string | null;
  persistencePolicy: PersistencePolicy;
  userId?: string;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  getBaseNSV?: () => Record<string, unknown>;
  sendMessage: (content: string, context: ConversationContext) => Promise<{ response: StructuredResponse; updatedHistory: Message[] }>;
  flushActiveSession?: (immediate?: boolean) => void;
  onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
  onConsultationStarted?: (targetModuleId: string) => void;
  onDispositionChange?: (disposition: 'reply' | 'consulting' | 'delegating' | 'acting' | null) => void;
  adjustRelativeReminderPayload: (payload: Record<string, unknown>) => Record<string, unknown>;
  recordAssistantContent: (content: string, metadata: ActionOrchestrationMetadata) => void;
}

interface ExecuteModuleAIActionsResult {
  analysisOnlyLabels: string[];
  dispatchedActionTypes: string[];
  escalatedExecutionLabels: string[];
  failedExecutionLabels: string[];
  heldForApprovalLabels: string[];
  highRiskReviewLabels: string[];
  manualReviewLabels: string[];
  orchestrationMetadata: ActionOrchestrationMetadata[];
  profileDirty: boolean;
  soulUpdates: NeuralStateVectorPatch;
  threadArtifacts: SpecialistConsultationArtifact[];
  executionArtifacts: ThreadExecutionArtifact[];
}

function mergeSoulPatch(target: NeuralStateVectorPatch, patch: NeuralStateVectorPatch) {
  for (const key of Object.keys(patch)) {
    const patchKey = key as keyof NeuralStateVectorPatch;
    if (typeof patch[patchKey] === 'object' && patch[patchKey] !== null) {
      (target as Record<string, unknown>)[key] = {
        ...((target as Record<string, unknown>)[key] as Record<string, unknown> | undefined),
        ...(patch[patchKey] as Record<string, unknown>),
      };
    } else {
      (target as Record<string, unknown>)[key] = patch[patchKey];
    }
  }
}

export class ModuleAIActionExecutionService {
  static async execute(input: ExecuteModuleAIActionsInput): Promise<ExecuteModuleAIActionsResult> {
    const {
      moduleId,
      responseActions,
      contentText,
      parsedCommand,
      allowedActions,
      autopilotLevel,
      orchestrationHistoryMode,
      activeThreadId,
      persistencePolicy,
      userId,
      isGuest,
      encryptionKey,
      navigateTo,
      getBaseNSV,
      sendMessage,
      flushActiveSession,
      onActionParsed,
      onConsultationStarted,
      onDispositionChange,
      adjustRelativeReminderPayload,
      recordAssistantContent,
    } = input;

    const analysisOnlyLabels: string[] = [];
    const dispatchedActionTypes: string[] = [];
    const escalatedExecutionLabels: string[] = [];
    const failedExecutionLabels: string[] = [];
    const heldForApprovalLabels: string[] = [];
    const highRiskReviewLabels: string[] = [];
    const manualReviewLabels: string[] = [];
    const orchestrationMetadata: ActionOrchestrationMetadata[] = [];
    const threadArtifacts: SpecialistConsultationArtifact[] = [];
    const executionArtifacts: ThreadExecutionArtifact[] = [];
    const soulUpdates: NeuralStateVectorPatch = {};
    let profileDirty = false;

    // Per-turn profile cache: shared across all action handlers within this AI response.
    // Allows sequential ledger actions to read each other's in-memory mutations instead
    // of independently re-fetching from Firestore between writes.
    const profileCache = new Map<string, unknown>();

    const updateGlobalSoul = async (patch: NeuralStateVectorPatch) => {
      mergeSoulPatch(soulUpdates, patch);
    };

    const delegateToModule = (target: string, reason: string, delegationContent: string) => {
      if (persistencePolicy === 'ephemeral') return;
      NexusHandoffService.store({
        moduleId: target,
        type: 'delegate',
        content: delegationContent,
        reason,
        sourceModuleId: moduleId,
        createdAt: new Date().toISOString(),
      });
      Spine.emit({
        type: 'MODULE_DELEGATED',
        source: moduleId,
        target,
        domain: 'system',
        data: { reason, content: delegationContent },
        cascadeDepth: 0,
        priority: 'info',
      });
    };

    for (const parsedAction of responseActions) {
      const { type, payload } = parsedAction;
      const adjustedPayload = type === 'propose_reminder'
        ? adjustRelativeReminderPayload(payload)
        : { ...payload };

      if (!allowedActions.includes(type)) {
        console.warn(`[SchemaGuard] Blocked unauthorized action "${type}" for module "${moduleId}"`);
        continue;
      }

      const orchestrationDecision = OrchestrationActionGateService.evaluate({
        moduleId,
        actionType: type,
        payload: adjustedPayload,
        autopilotLevel,
        historyMode: orchestrationHistoryMode,
        isGuest,
        activeThreadId,
        persistencePolicy,
      });

      NexusLogger.emit('ai', {
        moduleId,
        label: 'orchestration_gate',
        detail: {
          actionType: type,
          shouldDispatch: orchestrationDecision.shouldDispatch,
          executionMode: orchestrationDecision.metadata.executionMode,
          historyMode: orchestrationDecision.metadata.historyMode,
          approvalRequired: orchestrationDecision.metadata.approvalRequirement.required,
          proposalId: orchestrationDecision.metadata.proposal.id,
          executionId: orchestrationDecision.metadata.execution.id,
          patientScope: orchestrationDecision.metadata.patientScope,
          dispatchStatus: orchestrationDecision.metadata.dispatchStatus,
        },
      });

      orchestrationMetadata.push(orchestrationDecision.metadata);
      executionArtifacts.push({
        id: `execution.${orchestrationDecision.metadata.execution.id}`,
        threadId: orchestrationDecision.metadata.activeThreadId,
        sourceModuleId: orchestrationDecision.metadata.execution.source,
        actionType: type,
        proposalId: orchestrationDecision.metadata.proposal.id,
        executionId: orchestrationDecision.metadata.execution.id,
        requestedAt: orchestrationDecision.metadata.proposal.createdAt,
        resolvedAt: orchestrationDecision.metadata.execution.executedAt,
        status: orchestrationDecision.metadata.execution.status,
        summary: orchestrationDecision.metadata.proposalCard.summary || orchestrationDecision.metadata.proposalCard.title,
        patientScope: orchestrationDecision.metadata.patientScope,
        errorMessage: orchestrationDecision.metadata.failure?.errorMessage,
      });

      if (!orchestrationDecision.shouldDispatch) {
        const noticePrefix = OrchestrationRuntimeService.getNoticePrefix(orchestrationDecision.metadata.runtime);
        if (noticePrefix === 'Manual review required before execution') {
          manualReviewLabels.push(getActionLabel(type));
        } else if (noticePrefix === 'High-risk action requires approval') {
          highRiskReviewLabels.push(getActionLabel(type));
        } else if (noticePrefix === 'Pending approval before execution') {
          heldForApprovalLabels.push(getActionLabel(type));
        } else if (noticePrefix === 'Not executed in this session') {
          analysisOnlyLabels.push(getActionLabel(type));
        }
        continue;
      }

      if (type === 'commit_research' && moduleId === 'scout') {
        flushActiveSession?.(true);
        dispatchedActionTypes.push(type);
        continue;
      }

      const isConsultationAction = type === 'query_module' || type === 'query_module_data';
      if (isConsultationAction) {
        const targetModuleId = typeof adjustedPayload?.moduleId === 'string' ? adjustedPayload.moduleId : 'unknown';
        onConsultationStarted?.(targetModuleId);
        onDispositionChange?.('consulting');
      } else {
        onDispositionChange?.('acting');
      }

      const executed = await ActionHub.execute(moduleId, type, {
        userId,
        isGuest,
        moduleId,
        payload: adjustedPayload,
        parsedCommand: parsedCommand ?? undefined,
        orchestration: orchestrationDecision.metadata,
        persistencePolicy,
        encryptionKey,
        navigateTo,
        getLatestNSV: () => ({
          ...(getBaseNSV?.() ?? {}),
          ...soulUpdates,
        }),
        pushAssistantMessage: (content: string) => {
          if (!content.trim()) return;
          recordAssistantContent(content, orchestrationDecision.metadata);
        },
        emitThreadArtifact: (artifact) => {
          threadArtifacts.push(artifact);
        },
        sendMessage,
        emitSpineEvent: (eventType: SpineEventType, data: Record<string, unknown>, options?: { domain?: string; priority?: 'info' | 'alert' | 'critical'; target?: string }) => Spine.emit({
          type: eventType,
          source: moduleId,
          domain: (options?.domain ?? 'system') as SpineDomain,
          target: options?.target,
          data,
          cascadeDepth: 0,
          priority: options?.priority
            ?? ((['info', 'alert', 'critical'] as const).includes(data.priority as SpineEventPriority)
              ? (data.priority as SpineEventPriority)
              : 'info'),
        }),
        updateGlobalSoul,
        delegateToModule,
        markProfileDirty: () => {
          profileDirty = true;
        },
        profileCache,
      });

      if (!executed) {
        if (orchestrationDecision.metadata.execution.status === 'failed_escalated') {
          escalatedExecutionLabels.push(getActionLabel(type));
        } else if (orchestrationDecision.metadata.execution.status === 'failed') {
          failedExecutionLabels.push(getActionLabel(type));
        }
        continue;
      }

      dispatchedActionTypes.push(type);

      if (onActionParsed) onActionParsed(type, payload);
    }

    return {
      analysisOnlyLabels,
      dispatchedActionTypes,
      escalatedExecutionLabels,
      failedExecutionLabels,
      heldForApprovalLabels,
      highRiskReviewLabels,
      manualReviewLabels,
      orchestrationMetadata,
      profileDirty,
      soulUpdates,
      threadArtifacts,
      executionArtifacts,
    };
  }
}
