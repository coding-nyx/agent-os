import type { ModuleId } from '@/lib/module-manifest';
import type { NeuralStateVectorPatch, SpineEvent, SpineEventPriority } from '@/lib/types';
import type { ActorIdentityRef } from '@/lib/agent-identity';
import { OrchestrationContractsJs } from '@cortex-logic';

const _contracts = new OrchestrationContractsJs();

// ---------------------------------------------------------------------------
// Constant arrays (imported directly by TS callers — must remain in this module)
// ---------------------------------------------------------------------------

export const PRIMARY_AGENT_PRECEDENCE = ['agnes', 'atlas', 'soma', 'titan', 'ledger'] as const;

// ---------------------------------------------------------------------------
// Scalar types
// ---------------------------------------------------------------------------

export type PrimaryAgentId = (typeof PRIMARY_AGENT_PRECEDENCE)[number];
export type AutopilotLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type HistoryMode = 'standard' | 'silent';
export type ExecutionMode = 'manual' | 'assisted' | 'autonomous' | 'ghost' | 'analysis_only';
export type PatientScope = 'USER' | 'GUEST';
export type RuntimeAutonomy =
  | 'manual_lock'
  | 'proposal_first'
  | 'guided_assist'
  | 'conditional_autonomy'
  | 'supervised_autonomy'
  | 'ghost';
export type RuntimeDisposition =
  | 'manual_review'
  | 'proposal_review'
  | 'high_risk_review'
  | 'incident_review'
  | 'analysis_only'
  | 'visible_execution'
  | 'silent_execution'
  | 'ephemeral_preview';
export type ExecutionFailureCode = 'TRANSIENT' | 'PERMISSION' | 'PERMANENT' | 'MISSING_HANDLER' | 'UNKNOWN';
export type ExecutionFailureStatus = 'retry_scheduled' | 'failed' | 'escalated' | 'resolved';
export type AliveEntityType = 'ACTION' | 'HABIT' | 'LOG' | 'METRIC';
export type SpecVectorKey = 'resilience' | 'bandwidth' | 'vitality' | 'output' | 'friction';

export type SoulImpactPreset = Partial<Record<SpecVectorKey, number>>;

// ---------------------------------------------------------------------------
// Core orchestration interfaces
// ---------------------------------------------------------------------------

export interface MutationProposal {
  id: string;
  source: ModuleId | PrimaryAgentId | 'ara';
  intent: string;
  patch?: NeuralStateVectorPatch;
  vectorMutations?: Partial<Record<SpecVectorKey, number>>;
  confidence: number;
  requiresApproval?: boolean;
  patientScope: PatientScope;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequirement {
  required: boolean;
  reason: 'manual_level' | 'explicit_gate' | 'high_risk' | 'conflict' | 'guest_scope' | 'none' | 'kmp_parse_error' | 'kmp_error';
}

export interface ProposalCard {
  id: string;
  proposalId: string;
  title: string;
  summary: string;
  source: ModuleId | 'ara';
  status: 'draft' | 'pending_approval' | 'approved' | 'executed' | 'deferred' | 'blocked' | 'failed' | 'incident';
  approvalRequirement: ApprovalRequirement;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
}

export interface ActionOrchestrationMetadata {
  actionType: string;
  activeThreadId: string | null;
  autopilotLevel: AutopilotLevel;
  proposal: MutationProposal;
  proposalCard: ProposalCard;
  approvalRequirement: ApprovalRequirement;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  patientScope: PatientScope;
  execution: ExecutionRecord;
  failure?: ExecutionFailure | null;
  mutatesState: boolean;
  highRisk: boolean;
  dispatchStatus: 'approved' | 'awaiting_approval' | 'analysis_only' | 'blocked' | 'ephemeral';
  runtime: RuntimeSemantics;
}

export interface ExecutionRecord {
  id: string;
  proposalId: string;
  source: ModuleId | 'ara';
  autopilotLevel: AutopilotLevel;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  patientScope: PatientScope;
  executedAt: string;
  status: 'executed' | 'deferred' | 'blocked' | 'analysis_only' | 'failed' | 'failed_escalated';
}

export interface ExecutionFailure {
  id: string;
  executionId: string;
  proposalId: string;
  moduleId: string;
  actionType: string;
  threadId: string | null;
  patientScope: PatientScope;
  errorMessage: string;
  errorName: string;
  errorCode: ExecutionFailureCode;
  retryCount: number;
  maxRetries: number;
  failedAt: string;
  nextRetryAt: string | null;
  escalatedAt: string | null;
  resolvedAt?: string | null;
  status: ExecutionFailureStatus;
  metadata?: Record<string, unknown>;
}

export interface ResumableActionSnapshot {
  userId: string;
  isGuest: boolean;
  moduleId: string;
  actionType: string;
  payload: Record<string, unknown>;
  persistencePolicy?: string;
  activeThreadId?: string | null;
  orchestration: ActionOrchestrationMetadata;
}

export interface RuntimeSemantics {
  autopilotLevel: AutopilotLevel;
  autonomy: RuntimeAutonomy;
  disposition: RuntimeDisposition;
  historyDestination: 'standard' | 'silent_audit' | 'none';
  willPersistHistory: boolean;
  shouldNotifyUser: boolean;
}

// ---------------------------------------------------------------------------
// Interaction types
// ---------------------------------------------------------------------------

export type InteractionKind = 'routing' | 'planning' | 'routine';
export type InteractionDecisionMode =
  | 'visible_proposal'
  | 'silent_execute'
  | 'silent_delegate'
  | 'defer'
  | 'blocked';
export type InteractionDecisionReason =
  | 'manual_level'
  | 'low_confidence'
  | 'explicit_gate'
  | 'high_risk'
  | 'conflict'
  | 'silent_unavailable'
  | 'auto_routing'
  | 'auto_execution'
  | 'ghost_mode';

export interface InteractionCandidate {
  kind: InteractionKind;
  sourceModuleId: string;
  targetModuleId?: ModuleId;
  threadId?: string | null;
  confidence?: number | null;
  requiresApproval?: boolean;
  highRisk?: boolean;
  hasConflict?: boolean;
  canAutoDispatch?: boolean;
  dedupeKey?: string;
}

export interface InteractionDecision {
  kind: InteractionKind;
  mode: InteractionDecisionMode;
  reason: InteractionDecisionReason;
  confidence: number;
  historyMode: HistoryMode;
  shouldPersistDraft: boolean;
  shouldNotifyUser: boolean;
  shouldRenderHudSignal: boolean;
}

// ---------------------------------------------------------------------------
// Runtime summary and action entry types
// ---------------------------------------------------------------------------

export interface OrchestrationActionRuntimeEntry {
  actionType: string;
  proposalId: string;
  label: string;
  summary: string;
  source: ModuleId | 'ara';
  status: ProposalCard['status'];
  approvalRequirement: ApprovalRequirement;
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'];
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  executionStatus: ExecutionRecord['status'];
  patientScope: PatientScope;
  executedAt: string | null;
  failure: ExecutionFailure | null;
  runtime: RuntimeSemantics;
}

export interface OrchestrationTurnRuntimeSummary {
  moduleId: string;
  autopilotLevel: AutopilotLevel;
  historyMode: HistoryMode;
  activeThreadId: string | null;
  actions: OrchestrationActionRuntimeEntry[];
  aliveContext: AliveEntityRuntimeContext | null;
  counts: {
    total: number;
    visibleExecutions: number;
    silentExecutions: number;
    awaitingApproval: number;
    analysisOnly: number;
    blocked: number;
    ephemeral: number;
    failed: number;
    escalated: number;
  };
  shouldSuppressAssistantMessage: boolean;
}

export interface SilentHistoryEntry {
  id: string;
  executionId: string;
  proposalId: string;
  summary: string;
  source: ModuleId | 'ara';
  timestamp: string;
  patientScope: PatientScope;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Master thread types
// ---------------------------------------------------------------------------

export type ThreadParticipantRole = 'primary' | 'secondary' | 'observer';
export type ThreadParticipantInclusionReason = 'mentioned' | 'consulted' | 'delegated' | 'runtime';
export type ThreadParticipantState =
  | 'invited'
  | 'joined'
  | 'active'
  | 'waiting'
  | 'resolved'
  | 'dismissed'
  | 'left';
export type ThreadParticipantPresence = 'online' | 'idle' | 'offline';
export type MasterThreadAuthor = ModuleId | 'ara' | 'user' | 'system';
export type SpecialistConsultationMode = 'state_only' | 'state_plus_persisted_data';
export type SpecialistConsultationStatus = 'completed' | 'unavailable' | 'failed';
export type ThreadExecutionStatus = ExecutionRecord['status'];
export type MasterThreadMessageKind =
  | 'conversation'
  | 'consultation_request'
  | 'consultation_result'
  | 'consultation_failure'
  | 'execution_request'
  | 'execution_result'
  | 'execution_failure'
  | 'synthesis';

export interface SpecialistConsultationArtifact {
  id: string;
  threadId: string | null;
  sourceModuleId: string;
  targetModuleId: ModuleId;
  question: string;
  mode: SpecialistConsultationMode;
  requestedAt: string;
  resolvedAt: string;
  status: SpecialistConsultationStatus;
  summary: string;
  responseText?: string;
  errorMessage?: string;
}

export interface ThreadExecutionArtifact {
  id: string;
  threadId: string | null;
  sourceModuleId: ModuleId | 'ara';
  actionType: string;
  proposalId: string;
  executionId: string;
  requestedAt: string;
  resolvedAt: string;
  status: ThreadExecutionStatus;
  summary: string;
  patientScope: PatientScope;
  errorMessage?: string;
  retryable?: boolean;
  retrySummary?: string;
  retryPrompt?: string;
  retryVisibleContent?: string;
  retryOfPlanId?: string;
  retryAttempt?: number;
  retryParentExecutionId?: string;
}

export interface ThreadParticipant {
  moduleId: ModuleId | 'ara';
  role: ThreadParticipantRole;
  joinedAt: string;
  state: ThreadParticipantState;
  presence: ThreadParticipantPresence;
  inclusionReasons?: ThreadParticipantInclusionReason[];
  actorId?: string;
  actorLabel?: string;
  actorShortLabel?: string;
  invitedAt?: string;
  lastActiveAt?: string;
  leftAt?: string;
}

export interface MasterThreadTurn {
  id: string;
  threadId: string;
  sequence: number;
  startedBy: MasterThreadAuthor;
  participantIds: Array<ModuleId | 'ara'>;
  createdAt: string;
  updatedAt: string;
  messageIds: string[];
  replyToTurnId?: string;
  rootTurnId?: string;
}

export interface MasterThreadMessage {
  id: string;
  threadId: string;
  author: MasterThreadAuthor;
  kind?: MasterThreadMessageKind;
  body: string;
  createdAt: string;
  participantIds: Array<ModuleId | 'ara'>;
  actor?: ActorIdentityRef;
  consultation?: SpecialistConsultationArtifact;
  execution?: ThreadExecutionArtifact;
  proposalId?: string;
  turnId?: string;
  turnSequence?: number;
  replyToMessageId?: string;
  replyToTurnId?: string;
  rootMessageId?: string;
  rootTurnId?: string;
  dedupeKey?: string;
}

export interface ThreadResolutionState {
  threadId: string;
  status: 'open' | 'awaiting_approval' | 'executed' | 'deferred' | 'blocked';
  lastUpdatedAt: string;
  winningProposalId?: string;
}

// ---------------------------------------------------------------------------
// Alive entity types
// ---------------------------------------------------------------------------

export interface AliveEntity {
  id: string;
  type: AliveEntityType;
  label: string;
  semantic_tags: string[];
  attributes: Record<string, unknown>;
  soul_impact_preset: SoulImpactPreset;
  sourceModule: ModuleId;
  sourceEntityId?: string;
  provenance: 'native' | 'bootstrap' | 'adapter';
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface AliveEntityRuntimeReference {
  id: string;
  label: string;
  type: AliveEntityType;
  sourceModule: ModuleId;
  sourceEntityId?: string;
  provenance: AliveEntity['provenance'];
  semantic_tags: string[];
  updatedAt: string;
}

export interface AliveEntityRuntimeContext {
  total: number;
  moduleIds: ModuleId[];
  byModule: Partial<Record<ModuleId, AliveEntityRuntimeReference[]>>;
  tags: string[];
  lastUpdatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Spec / spine event types
// ---------------------------------------------------------------------------

export interface SpecSpineEvent {
  header: {
    id: string;
    source: 'ARA' | 'AGNES' | 'ATLAS' | 'TITAN' | 'LEDGER' | 'SOMA';
    timestamp: number;
    priority: 1 | 2 | 3;
  };
  payload: {
    intent: string;
    mutations: Map<string, number>;
    attributes: Record<string, unknown>;
  };
  logic_gates: {
    confidence: number;
    requires_approval: boolean;
    patient_scope: PatientScope;
  };
}

export interface PersistedSpecSpineEvent {
  header: SpecSpineEvent['header'];
  payload: Omit<SpecSpineEvent['payload'], 'mutations'> & {
    mutations: Record<string, number>;
  };
  logic_gates: SpecSpineEvent['logic_gates'];
}

// ---------------------------------------------------------------------------
// Exported functions — delegated to KMP
// ---------------------------------------------------------------------------

export function isAutopilotLevel(value: unknown): value is AutopilotLevel {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  return _contracts.isAutopilotLevel(value);
}

export function isPrimaryAgentId(value: string): value is PrimaryAgentId {
  return _contracts.isPrimaryAgentId(value);
}

export function getAgentPrecedenceRank(source: ModuleId | PrimaryAgentId | 'ara' | string): number {
  return _contracts.getAgentPrecedenceRank(source);
}

export function compareAgentPrecedence(
  left: ModuleId | PrimaryAgentId | 'ara' | string,
  right: ModuleId | PrimaryAgentId | 'ara' | string,
): number {
  return _contracts.compareAgentPrecedence(left, right);
}

export function compareMasterThreadTurns(left: MasterThreadTurn, right: MasterThreadTurn): number {
  return _contracts.compareMasterThreadTurns(JSON.stringify(left), JSON.stringify(right));
}

/**
 * Compares two MasterThreadMessage objects for sort order.
 * Previously named compareMasterThreadAuthors in the KMP contract; the TS name is preserved.
 */
export function compareMasterThreadMessages(left: MasterThreadMessage, right: MasterThreadMessage): number {
  return _contracts.compareMasterThreadMessages(JSON.stringify(left), JSON.stringify(right));
}

// Author precedence includes 'user' and 'system' which are not in PRIMARY_AGENT_PRECEDENCE.
// This ordering is TS-local; no KMP method covers the combined list.
const MASTER_THREAD_AUTHOR_PRECEDENCE: readonly string[] = ['user', 'system', 'ara', ...PRIMARY_AGENT_PRECEDENCE];

/**
 * Returns the precedence rank of a thread author string.
 * 'user' and 'system' rank before agent IDs; unknown authors rank last.
 */
export function getMasterThreadAuthorRank(author: MasterThreadAuthor | string): number {
  const index = MASTER_THREAD_AUTHOR_PRECEDENCE.indexOf(author.toLowerCase());
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Compares two thread author strings by precedence rank.
 * Preserved for backwards compatibility with callers that import this name directly.
 */
export function compareMasterThreadAuthors(left: MasterThreadAuthor | string, right: MasterThreadAuthor | string): number {
  return getMasterThreadAuthorRank(left) - getMasterThreadAuthorRank(right);
}

export function toSpecPriority(priority: SpineEventPriority): SpecSpineEvent['header']['priority'] {
  return _contracts.toSpecPriority(priority) as SpecSpineEvent['header']['priority'];
}

export function adaptSpineEventToSpec(
  event: SpineEvent,
  options?: {
    intent?: string;
    mutations?: Record<string, unknown> | Map<string, number>;
    confidence?: number;
    requiresApproval?: boolean;
    patientScope?: PatientScope;
  },
): SpecSpineEvent {
  // Map<string,number> is not JSON-serialisable; convert to a plain object first.
  const serialisableMutations =
    options?.mutations instanceof Map
      ? Object.fromEntries(options.mutations)
      : options?.mutations;

  const result = JSON.parse(
    _contracts.adaptSpineEventToSpec(
      JSON.stringify(event),
      JSON.stringify({ ...options, mutations: serialisableMutations }),
    ),
  ) as Omit<SpecSpineEvent, 'payload'> & { payload: { intent: string; mutations: Record<string, number>; attributes: Record<string, unknown> } };

  // Re-hydrate the mutations Record back to a Map to satisfy the SpecSpineEvent interface.
  return {
    ...result,
    payload: {
      ...result.payload,
      mutations: new Map(Object.entries(result.payload.mutations)),
    },
  };
}

export function serializeSpecSpineEvent(event: SpecSpineEvent): PersistedSpecSpineEvent {
  // serializeSpecSpineEvent is pure object reshaping; delegate to KMP.
  const serialisable = {
    ...event,
    payload: {
      ...event.payload,
      mutations: Object.fromEntries(event.payload.mutations),
    },
  };
  return JSON.parse(
    _contracts.serializeSpecSpineEvent(JSON.stringify(serialisable)),
  ) as PersistedSpecSpineEvent;
}
