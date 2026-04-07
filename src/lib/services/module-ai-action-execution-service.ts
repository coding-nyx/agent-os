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

export interface DeferredApproval {
  executionId: string;
  actionType: string;
  payload: Record<string, unknown>;
  label: string;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`;
}

interface ExecuteModuleAIActionsResult {
  analysisOnlyLabels: string[];
  dispatchedActionTypes: string[];
  escalatedExecutionLabels: string[];
  failedExecutionLabels: string[];
  heldForApprovalLabels: string[];
  highRiskReviewLabels: string[];
  manualReviewLabels: string[];
  schemaBlockedLabels: string[];
  orchestrationMetadata: ActionOrchestrationMetadata[];
  profileDirty: boolean;
  soulUpdates: NeuralStateVectorPatch;
  threadArtifacts: SpecialistConsultationArtifact[];
  executionArtifacts: ThreadExecutionArtifact[];
  deferredApprovals: DeferredApproval[];
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
    const schemaBlockedLabels: string[] = [];
    const orchestrationMetadata: ActionOrchestrationMetadata[] = [];
    const threadArtifacts: SpecialistConsultationArtifact[] = [];
    const executionArtifacts: ThreadExecutionArtifact[] = [];
    const deferredApprovals: DeferredApproval[] = [];
    const soulUpdates: NeuralStateVectorPatch = {};
    let profileDirty = false;
    const executedActionSignatures = new Set<string>();

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

    // Defense-in-depth: map hallucinated action types to their real equivalents.
    // LLMs sometimes invent actions like "list_tasks" or "get_tasks" instead of
    // using "query_module_data" with the correct moduleId target.
    const HALLUCINATED_ACTION_MAP: Record<string, { type: string; patchPayload?: (p: Record<string, unknown>) => Record<string, unknown> }> = {
      list_tasks:        { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      get_tasks:         { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      get_task:          { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      fetch_tasks:       { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      query_tasks:       { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      list_habits:       { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      get_habits:        { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'atlas' }) },
      list_transactions: { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'ledger' }) },
      get_transactions:  { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'ledger' }) },
      list_workouts:     { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'titan' }) },
      get_workouts:      { type: 'query_module_data', patchPayload: (p) => ({ ...p, moduleId: p.moduleId ?? 'titan' }) },
    };

    for (const parsedAction of responseActions) {
      let { type, payload } = parsedAction;
      // Guard: payload must be a plain object. If KMP serialized it as a JSON string,
      // parse it here before spreading — otherwise {..."jsonString"} produces {"0":"{","1":"\"", ...}
      const safePayload: Record<string, unknown> =
        typeof payload === 'string' ? (JSON.parse(payload) as Record<string, unknown>) : payload;

      // Normalize type to lowercase_snake_case before any lookup — guards against LLMs emitting
      // Title Case or space-separated variants (e.g. "Retrieve Tasks" → "retrieve_tasks").
      type = type.trim().toLowerCase().replace(/\s+/g, '_');

      // Auto-translate hallucinated action types to real ones
      const translation = HALLUCINATED_ACTION_MAP[type];
      if (translation) {
        NexusLogger.emit('ai', {
          moduleId,
          label: 'hallucinated_action_translated',
          detail: { originalType: type, translatedType: translation.type },
        });
        type = translation.type;
        if (translation.patchPayload) {
          Object.assign(safePayload, translation.patchPayload(safePayload));
        }
      }

      const adjustedPayload = type === 'propose_reminder'
        ? adjustRelativeReminderPayload(safePayload)
        : { ...safePayload };
      const signature = `${type}|${stableSerialize(adjustedPayload)}`;
      if (executedActionSignatures.has(signature)) {
        NexusLogger.emit('ai', {
          moduleId,
          label: 'action_deduped',
          detail: { actionType: type },
        });
        continue;
      }
      executedActionSignatures.add(signature);

      if (!allowedActions.includes(type)) {
        NexusLogger.emit('ai', {
          moduleId,
          label: 'schema_guard_blocked',
          detail: { actionType: type },
        });
        schemaBlockedLabels.push(getActionLabel(type));
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
        // Preserve payload so the UI can surface an Approve/Dismiss card
        if (orchestrationDecision.metadata.dispatchStatus === 'awaiting_approval') {
          deferredApprovals.push({
            executionId: orchestrationDecision.metadata.execution.id,
            actionType: type,
            payload: adjustedPayload,
            label: getActionLabel(type),
          });
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
        emitSpineEvent: (eventType: SpineEventType, data: Record<string, unknown>, options?: { domain?: string; priority?: 'info' | 'warning' | 'alert' | 'critical'; target?: string }) => Spine.emit({
          type: eventType,
          source: moduleId,
          domain: (options?.domain ?? 'system') as SpineDomain,
          target: options?.target,
          data,
          cascadeDepth: 0,
          priority: options?.priority
            ?? ((['info', 'warning', 'alert', 'critical'] as const).includes(data.priority as SpineEventPriority)
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
      schemaBlockedLabels,
      orchestrationMetadata,
      profileDirty,
      soulUpdates,
      threadArtifacts,
      executionArtifacts,
      deferredApprovals,
    };
  }
}
