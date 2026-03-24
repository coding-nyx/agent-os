import type { ModuleId } from '@/lib/module-manifest';
import type { NeuralStateVectorPatch, SpineEvent, SpineEventPriority } from '@/lib/types';
import type { ActorIdentityRef } from '@/lib/agent-identity';

export const PRIMARY_AGENT_PRECEDENCE = ['agnes', 'atlas', 'soma', 'titan', 'ledger'] as const;

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

export interface MutationProposal {
  id: string;
  source: ModuleId | PrimaryAgentId | 'nexus';
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
  reason: 'manual_level' | 'explicit_gate' | 'high_risk' | 'conflict' | 'guest_scope' | 'none';
}

export interface ProposalCard {
  id: string;
  proposalId: string;
  title: string;
  summary: string;
  source: ModuleId | 'nexus';
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
  source: ModuleId | 'nexus';
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

export interface OrchestrationActionRuntimeEntry {
  actionType: string;
  proposalId: string;
  label: string;
  summary: string;
  source: ModuleId | 'nexus';
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
  source: ModuleId | 'nexus';
  timestamp: string;
  patientScope: PatientScope;
  metadata?: Record<string, unknown>;
}

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
export type MasterThreadAuthor = ModuleId | 'nexus' | 'user' | 'system';
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
  sourceModuleId: ModuleId | 'nexus';
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
  moduleId: ModuleId | 'nexus';
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
  participantIds: Array<ModuleId | 'nexus'>;
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
  participantIds: Array<ModuleId | 'nexus'>;
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

export interface SpecSpineEvent {
  header: {
    id: string;
    source: 'NEXUS' | 'AGNES' | 'ATLAS' | 'TITAN' | 'LEDGER' | 'SOMA';
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

const SPEC_SOURCE_MAP: Partial<Record<string, SpecSpineEvent['header']['source']>> = {
  nexus: 'NEXUS',
  agnes: 'AGNES',
  atlas: 'ATLAS',
  titan: 'TITAN',
  ledger: 'LEDGER',
  soma: 'SOMA',
  'cascade:nexus': 'NEXUS',
  'cascade:agnes': 'AGNES',
  'cascade:atlas': 'ATLAS',
  'cascade:titan': 'TITAN',
  'cascade:ledger': 'LEDGER',
  'cascade:soma': 'SOMA',
  'spine-cascade:core': 'NEXUS',
  'spine-cascade:ledger': 'LEDGER',
  'spine-cascade:soma': 'SOMA',
  'spine-cascade:agnes': 'AGNES',
  'spine-cascade': 'NEXUS',
};

const MASTER_THREAD_AUTHOR_PRECEDENCE: readonly string[] = ['user', 'system', 'nexus', ...PRIMARY_AGENT_PRECEDENCE];

export function isAutopilotLevel(value: unknown): value is AutopilotLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
}

export function isPrimaryAgentId(value: string): value is PrimaryAgentId {
  return (PRIMARY_AGENT_PRECEDENCE as readonly string[]).includes(value);
}

export function getAgentPrecedenceRank(source: ModuleId | PrimaryAgentId | 'nexus' | string): number {
  const normalized = source.toLowerCase();
  const index = PRIMARY_AGENT_PRECEDENCE.indexOf(normalized as PrimaryAgentId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function compareAgentPrecedence(
  left: ModuleId | PrimaryAgentId | 'nexus' | string,
  right: ModuleId | PrimaryAgentId | 'nexus' | string,
): number {
  return getAgentPrecedenceRank(left) - getAgentPrecedenceRank(right);
}

export function getMasterThreadAuthorRank(author: MasterThreadAuthor | string): number {
  const normalized = author.toLowerCase();
  const index = MASTER_THREAD_AUTHOR_PRECEDENCE.indexOf(normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function compareMasterThreadAuthors(left: MasterThreadAuthor | string, right: MasterThreadAuthor | string): number {
  return getMasterThreadAuthorRank(left) - getMasterThreadAuthorRank(right);
}

function compareParentMessageOrder(left: MasterThreadMessage, right: MasterThreadMessage): number {
  if (left.replyToMessageId && left.replyToMessageId === right.id) return 1;
  if (right.replyToMessageId && right.replyToMessageId === left.id) return -1;
  return 0;
}

export function compareMasterThreadTurns(left: MasterThreadTurn, right: MasterThreadTurn): number {
  const sequenceDelta = left.sequence - right.sequence;
  if (sequenceDelta !== 0) return sequenceDelta;

  const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
  if (createdAtDelta !== 0) return createdAtDelta;

  const authorDelta = compareMasterThreadAuthors(left.startedBy, right.startedBy);
  if (authorDelta !== 0) return authorDelta;

  return left.id.localeCompare(right.id);
}

export function compareMasterThreadMessages(left: MasterThreadMessage, right: MasterThreadMessage): number {
  const leftTurnSequence = left.turnSequence ?? Number.MAX_SAFE_INTEGER;
  const rightTurnSequence = right.turnSequence ?? Number.MAX_SAFE_INTEGER;
  const turnSequenceDelta = leftTurnSequence - rightTurnSequence;
  if (turnSequenceDelta !== 0) return turnSequenceDelta;

  const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
  if (createdAtDelta !== 0) return createdAtDelta;

  const parentMessageDelta = compareParentMessageOrder(left, right);
  if (parentMessageDelta !== 0) return parentMessageDelta;

  const authorDelta = compareMasterThreadAuthors(left.author, right.author);
  if (authorDelta !== 0) return authorDelta;

  const kindDelta = (left.kind ?? 'conversation').localeCompare(right.kind ?? 'conversation');
  if (kindDelta !== 0) return kindDelta;

  const turnIdDelta = (left.turnId ?? '').localeCompare(right.turnId ?? '');
  if (turnIdDelta !== 0) return turnIdDelta;

  return left.id.localeCompare(right.id);
}

export function toSpecPriority(priority: SpineEventPriority): SpecSpineEvent['header']['priority'] {
  if (priority === 'critical') return 3;
  if (priority === 'alert') return 2;
  return 1;
}

function normalizeSpecSource(source: string): SpecSpineEvent['header']['source'] {
  const direct = SPEC_SOURCE_MAP[source.toLowerCase()];
  if (direct) return direct;
  const segments = source.toLowerCase().split(':');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = SPEC_SOURCE_MAP[segments[index]];
    if (candidate) return candidate;
  }
  return 'NEXUS';
}

function normalizeMutations(
  input: Record<string, unknown> | Map<string, number> | undefined,
): Map<string, number> {
  if (!input) return new Map<string, number>();
  if (input instanceof Map) return new Map(input);

  return new Map(
    Object.entries(input).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
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
  const eventData = event.data as Record<string, unknown>;
  const intent =
    options?.intent ??
    (typeof eventData.intent === 'string' && eventData.intent.trim() !== '' ? eventData.intent : event.type.toLowerCase());

  const confidenceInput = options?.confidence ?? eventData.confidence;
  const requiresApprovalInput = options?.requiresApproval ?? eventData.requiresApproval;
  const patientScopeInput = options?.patientScope ?? eventData.patient_scope;

  return {
    header: {
      id: event.id,
      source: normalizeSpecSource(event.source),
      timestamp: event.timestamp,
      priority: toSpecPriority(event.priority),
    },
    payload: {
      intent,
      mutations: normalizeMutations(options?.mutations ?? (eventData.mutations as Record<string, unknown> | undefined)),
      attributes: { ...eventData },
    },
    logic_gates: {
      confidence:
        typeof confidenceInput === 'number' && Number.isFinite(confidenceInput)
          ? Math.max(0, Math.min(1, confidenceInput))
          : 0.5,
      requires_approval: requiresApprovalInput === true,
      patient_scope: patientScopeInput === 'GUEST' ? 'GUEST' : 'USER',
    },
  };
}

export function serializeSpecSpineEvent(event: SpecSpineEvent): PersistedSpecSpineEvent {
  return {
    header: { ...event.header },
    payload: {
      ...event.payload,
      mutations: Object.fromEntries(event.payload.mutations),
      attributes: { ...event.payload.attributes },
    },
    logic_gates: { ...event.logic_gates },
  };
}
