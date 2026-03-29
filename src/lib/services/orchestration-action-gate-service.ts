import type {
  ActionOrchestrationMetadata,
  ExecutionRecord,
  HistoryMode,
  MutationProposal,
  PatientScope,
  ProposalCard,
} from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { getActionLabel } from '@/lib/actions/action-labels';
import { MasterThreadService } from './master-thread-service';
import { OrchestrationPolicyService } from './orchestration-policy-service';
import { OrchestrationRuntimeService } from './orchestration-runtime-service';

type SupportedSource = ModuleId | 'nexus';
type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

export interface OrchestrationActionGateInput {
  moduleId: string;
  actionType: string;
  payload: Record<string, unknown>;
  autopilotLevel: 0 | 1 | 2 | 3 | 4 | 5;
  historyMode: HistoryMode;
  isGuest: boolean;
  activeThreadId?: string | null;
  persistencePolicy?: PersistencePolicy;
  now?: string;
}

export interface OrchestrationActionGateDecision {
  shouldDispatch: boolean;
  metadata: ActionOrchestrationMetadata;
}

const NON_MUTATING_ACTIONS = new Set([
  'propose_reminder',
  'query_reminders',
  'query_module_data',
  'query_memory',
  'search_memory',
  'web_search', // Explicitly non-mutating: data retrieval only
  'query_profile',
  'analyze_trends',
  'analyze_spending',
  'analyze_medical_image',
  'compare_periods',
  'suggest_interventions',
  'suggest_field',
  'identify_correlations',
  'generate_summary',
  'detect_data_hint',
  'navigate_to_module',
  'delegate_to_module',
  'create_module_handoff',
  // Titan program application — the action handler is guidance-only (no DB write);
  // actual routine merge happens via the ProgramTemplateSelector UI.
  'apply_program_template',
  'suggest_progression',
]);

const NON_MUTATING_PREFIXES = ['analyze_', 'compare_', 'identify_', 'generate_', 'query_', 'suggest_', 'explain_', 'validate_', 'propose_'];
const MUTATING_PREFIXES = [
  'create_',
  'update_',
  'delete_',
  'modify_',
  'set_',
  'sync_',
  'log_',
  'commit_',
  'confirm_',
  'dismiss_',
  'track_',
  'flatten_',
  'record_',
  'merge_',
  'discard_',
  'complete_',
  'advance_',
  'archive_',
  'issue_',
  'schedule_',
];
const HIGH_RISK_KEYWORDS = ['delete', 'discard', 'archive', 'clearance', 'transaction', 'budget', 'goal', 'diagnosis'];

function isSupportedSource(moduleId: string): moduleId is SupportedSource {
  return moduleId === 'nexus' || Object.prototype.hasOwnProperty.call(MODULE_MANIFEST, moduleId);
}

function normalizeSource(moduleId: string): SupportedSource {
  return isSupportedSource(moduleId) ? moduleId : 'nexus';
}

function inferMutatesState(actionType: string): boolean {
  if (NON_MUTATING_ACTIONS.has(actionType)) return false;
  if (NON_MUTATING_PREFIXES.some((prefix) => actionType.startsWith(prefix))) return false;
  if (MUTATING_PREFIXES.some((prefix) => actionType.startsWith(prefix))) return true;
  return true;
}

function inferHighRisk(actionType: string): boolean {
  const normalized = actionType.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inferProposalConfidence(
  actionType: string,
  payload: Record<string, unknown>,
  mutatesState: boolean,
  highRisk: boolean,
): number {
  const explicitConfidence = payload.confidence;
  if (typeof explicitConfidence === 'number' && Number.isFinite(explicitConfidence)) {
    return clampConfidence(explicitConfidence);
  }

  const payloadKeys = Object.keys(payload).filter((key) => key !== 'confidence' && key !== 'requiresApproval');
  let confidence = mutatesState ? 0.76 : 0.92;

  if (payloadKeys.length >= 3) {
    confidence += 0.1;
  } else if (payloadKeys.length === 0) {
    confidence -= 0.08;
  }

  if (mutatesState && payload.requiresApproval === true) {
    confidence -= 0.2;
  }

  if (highRisk) {
    confidence -= 0.18;
  }

  if (actionType.startsWith('schedule_') || actionType.startsWith('log_') || actionType.startsWith('clear_')) {
    confidence += 0.15;
  }

  if (actionType.startsWith('update_') || actionType.startsWith('record_') || actionType.startsWith('confirm_')) {
    confidence += 0.12;
  }

  return clampConfidence(confidence);
}

function buildProposalCardStatus(metadata: ActionOrchestrationMetadata['dispatchStatus']): ProposalCard['status'] {
  if (metadata === 'awaiting_approval') return 'pending_approval';
  if (metadata === 'blocked' || metadata === 'analysis_only' || metadata === 'ephemeral') return 'blocked';
  return 'approved';
}

function buildExecutionStatus(metadata: ActionOrchestrationMetadata['dispatchStatus']): ExecutionRecord['status'] {
  if (metadata === 'approved') return 'executed';
  if (metadata === 'awaiting_approval') return 'deferred';
  if (metadata === 'analysis_only' || metadata === 'ephemeral') return 'analysis_only';
  return 'blocked';
}

function hashToken(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeIdToken(value: string, maxLength: number): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[\\/]/g, '-') // Firestore forbids "/" in document ids
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) return `id-${hashToken(value)}`;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(8, maxLength - 8))}-${hashToken(normalized)}`;
}

export class OrchestrationActionGateService {
  static evaluate(input: OrchestrationActionGateInput): OrchestrationActionGateDecision {
    const now = input.now ?? new Date().toISOString();
    const source = normalizeSource(input.moduleId);
    const patientScope: PatientScope = input.isGuest ? 'GUEST' : 'USER';
    const actionLabel = getActionLabel(input.actionType);
    const activeThreadId = input.activeThreadId ?? null;
    const mutatesState = inferMutatesState(input.actionType);
    const highRisk = inferHighRisk(input.actionType);
    const confidence = inferProposalConfidence(input.actionType, input.payload, mutatesState, highRisk);
    const explicitApprovalRequested = mutatesState && input.payload.requiresApproval === true;
    const safeThreadToken = sanitizeIdToken(activeThreadId ?? input.moduleId, 72);
    const safeActionToken = sanitizeIdToken(input.actionType, 48);
    const proposalId = `${safeThreadToken}.${safeActionToken}.${crypto.randomUUID()}`;
    const proposal: MutationProposal = {
      id: proposalId,
      source,
      intent: actionLabel,
      confidence,
      requiresApproval: explicitApprovalRequested,
      patientScope,
      createdAt: now,
      metadata: {
        actionType: input.actionType,
        activeThreadId,
        payloadKeys: Object.keys(input.payload),
        mutatesState,
        highRisk,
      },
    };

    const policy =
      input.persistencePolicy === 'ephemeral'
        ? {
            requiresApproval: { required: false, reason: 'none' as const },
            executionMode: 'analysis_only' as const,
            historyMode: input.historyMode,
            canMutateState: false,
          }
        : OrchestrationPolicyService.getExecutionPolicy(input.autopilotLevel, proposal, { highRisk });

    const effectiveHistoryMode: HistoryMode =
      input.historyMode === 'silent' || policy.historyMode === 'silent' ? 'silent' : 'standard';

    let dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'] = 'approved';
    if (input.persistencePolicy === 'ephemeral') {
      dispatchStatus = 'ephemeral';
    } else if (policy.requiresApproval.required) {
      dispatchStatus = 'awaiting_approval';
    } else if (mutatesState && !policy.canMutateState) {
      dispatchStatus = policy.executionMode === 'analysis_only' ? 'analysis_only' : 'blocked';
    } else if (mutatesState && policy.executionMode === 'analysis_only') {
      dispatchStatus = 'analysis_only';
    }

    const execution: ExecutionRecord = {
      id: `exec.${proposal.id}`,
      proposalId: proposal.id,
      source,
      autopilotLevel: input.autopilotLevel,
      executionMode: policy.executionMode,
      historyMode: effectiveHistoryMode,
      patientScope,
      executedAt: now,
      status: buildExecutionStatus(dispatchStatus),
    };

    const runtime = OrchestrationRuntimeService.buildRuntimeSemantics({
      autopilotLevel: input.autopilotLevel,
      historyMode: effectiveHistoryMode,
      dispatchStatus,
      highRisk,
    });

    const proposalCard = MasterThreadService.buildProposalCard(proposal, {
      title: actionLabel,
      summary: `${actionLabel} requested by ${source}.`,
      approvalRequirement: policy.requiresApproval,
      executionMode: policy.executionMode,
      historyMode: effectiveHistoryMode,
      status: buildProposalCardStatus(dispatchStatus),
    });

    const metadata: ActionOrchestrationMetadata = {
      actionType: input.actionType,
      activeThreadId,
      autopilotLevel: input.autopilotLevel,
      proposal,
      proposalCard,
      approvalRequirement: policy.requiresApproval,
      executionMode: policy.executionMode,
      historyMode: effectiveHistoryMode,
      patientScope,
      execution,
      mutatesState,
      highRisk,
      dispatchStatus,
      runtime,
    };

    const shouldDispatch =
      input.persistencePolicy !== 'ephemeral' &&
      !policy.requiresApproval.required &&
      (!mutatesState || policy.canMutateState) &&
      dispatchStatus === 'approved';

    return {
      shouldDispatch,
      metadata,
    };
  }
}
