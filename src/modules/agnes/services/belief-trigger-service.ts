import { BeliefGraphServiceJs } from '@cortex-logic';
import type {
  ActionOrchestrationMetadata,
  HistoryMode,
  OrchestrationTurnRuntimeSummary,
} from '@/lib/contracts/orchestration';
import type { MasterThreadShellSnapshot } from '@/lib/services/master-thread-service';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import { OrchestrationActionGateService } from '@/lib/services/orchestration-action-gate-service';
import { OrchestrationRuntimeService } from '@/lib/services/orchestration-runtime-service';
import type { NeuralStateVector } from '@/lib/types';
import type { BeliefGraph, BeliefNode } from './belief-graph-service';

// ═══════════════════════════════════════════════════════════════════════════════
// Types (unchanged — re-exported for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BeliefInvitationDecision {
  shouldInvite: boolean;
  summary: string;
  rationale: string[];
  fingerprint: string;
  confidence: number;
  triggeringBeliefs: string[];
  metrics: {
    totalNodes: number;
    negativeCount: number;
    highIntensityNegativeCount: number;
    severeNegativeCount: number;
    averageNegativeIntensity: number;
    resilience: number | null;
    stressLoad: number | null;
  };
}

export interface BeliefSessionInvitation {
  id: string;
  status: 'pending' | 'accepted' | 'dismissed';
  threadId: string;
  title: string;
  summary: string;
  rationale: string[];
  fingerprint: string;
  confidence: number;
  triggeringBeliefs: string[];
  triggeredAt: string;
  runtimeSummary: OrchestrationTurnRuntimeSummary;
}

export interface BeliefSessionInvitationRuntime {
  invitation: BeliefSessionInvitation;
  metadata: ActionOrchestrationMetadata;
}

type EmotionalContext = NeuralStateVector['emotional'] | null | undefined;

// ═══════════════════════════════════════════════════════════════════════════════
// KMP singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _service: InstanceType<typeof BeliefGraphServiceJs> | null = null;
function getService() {
  if (!_service) _service = new BeliefGraphServiceJs() as InstanceType<typeof BeliefGraphServiceJs>;
  return _service;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers (used by orchestration functions that stay in TS)
// ═══════════════════════════════════════════════════════════════════════════════

function hashToken(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeThreadToken(value: string, maxLength = 36): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\\/]/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) return `belief-${hashToken(value)}`;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(8, maxLength - 8))}-${hashToken(normalized)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Domain logic — thin wrappers over KMP
// ═══════════════════════════════════════════════════════════════════════════════

export function evaluateBeliefSessionInvitationThreshold(input: {
  graph: BeliefGraph | null;
  emotionalState?: EmotionalContext;
}): BeliefInvitationDecision {
  const graphJson = input.graph ? JSON.stringify(input.graph) : '';
  const resilience =
    typeof input.emotionalState?.emotionalResilience === 'number'
      ? input.emotionalState.emotionalResilience
      : -1;
  const stressLoad =
    typeof input.emotionalState?.stressLoad === 'number'
      ? input.emotionalState.stressLoad
      : -1;

  const resultJson = getService().evaluateInvitationThreshold(graphJson, resilience, stressLoad);
  return JSON.parse(resultJson) as BeliefInvitationDecision;
}

export function getTriggeringBeliefNodes(graph: BeliefGraph | null, invitation: BeliefSessionInvitation | null): BeliefNode[] {
  if (!graph || !invitation) return [];
  const graphJson = JSON.stringify(graph);
  const labelsJson = JSON.stringify(invitation.triggeringBeliefs);
  const resultJson = getService().getTriggeringNodes(graphJson, labelsJson);
  return JSON.parse(resultJson) as BeliefNode[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Orchestration-dependent functions — stay in TS
// ═══════════════════════════════════════════════════════════════════════════════

export function createBeliefSessionInvitationRuntime(input: {
  graph: BeliefGraph | null;
  emotionalState?: EmotionalContext;
  now?: string;
  isGuest?: boolean;
  autopilotLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  historyMode?: HistoryMode;
}): BeliefSessionInvitationRuntime | null {
  const decision = evaluateBeliefSessionInvitationThreshold({
    graph: input.graph,
    emotionalState: input.emotionalState,
  });
  if (!decision.shouldInvite) return null;

  const now = input.now ?? new Date().toISOString();
  const anchorBelief = decision.triggeringBeliefs[0] ?? 'belief-pattern';
  const threadId = `agnes.belief-trigger.${sanitizeThreadToken(anchorBelief)}.${hashToken(decision.fingerprint)}`;
  const gate = OrchestrationActionGateService.evaluate({
    moduleId: 'agnes',
    actionType: 'suggest_agnes_session_invitation',
    payload: {
      requiresApproval: true,
      confidence: decision.confidence,
      rationale: decision.rationale,
      triggeringBeliefs: decision.triggeringBeliefs,
      thresholdFingerprint: decision.fingerprint,
    },
    autopilotLevel: input.autopilotLevel ?? 2,
    historyMode: input.historyMode ?? 'standard',
    isGuest: input.isGuest === true,
    activeThreadId: threadId,
    persistencePolicy: 'manual',
    now,
  });

  const approvalRequirement = { required: true as const, reason: 'explicit_gate' as const };
  const executionMode = 'manual' as const;
  const dispatchStatus = 'awaiting_approval' as const;
  const runtime = OrchestrationRuntimeService.buildRuntimeSemantics({
    autopilotLevel: input.autopilotLevel ?? 2,
    historyMode: input.historyMode ?? 'standard',
    dispatchStatus,
    highRisk: false,
  });

  const metadata: ActionOrchestrationMetadata = {
    ...gate.metadata,
    proposal: {
      ...gate.metadata.proposal,
      confidence: decision.confidence,
      intent: 'Invite Agnes support session',
      metadata: {
        ...gate.metadata.proposal.metadata,
        thresholdFingerprint: decision.fingerprint,
        rationale: decision.rationale,
        triggeringBeliefs: decision.triggeringBeliefs,
        metrics: decision.metrics,
      },
    },
    proposalCard: {
      ...gate.metadata.proposalCard,
      title: 'Invite Agnes support session',
      summary: decision.summary,
      status: 'pending_approval',
      approvalRequirement,
      executionMode,
    },
    approvalRequirement,
    executionMode,
    dispatchStatus,
    execution: {
      ...gate.metadata.execution,
      executionMode,
      status: 'deferred',
    },
    runtime,
  };

  const runtimeSummary = OrchestrationRuntimeService.buildTurnSummary({
    moduleId: 'agnes',
    autopilotLevel: input.autopilotLevel ?? 2,
    historyMode: input.historyMode ?? 'standard',
    activeThreadId: threadId,
    decisions: [metadata],
  });

  return {
    metadata,
    invitation: {
      id: metadata.proposal.id,
      status: 'pending',
      threadId,
      title: metadata.proposalCard.title,
      summary: metadata.proposalCard.summary,
      rationale: decision.rationale,
      fingerprint: decision.fingerprint,
      confidence: decision.confidence,
      triggeringBeliefs: decision.triggeringBeliefs,
      triggeredAt: now,
      runtimeSummary,
    },
  };
}

export function buildBeliefSessionInvitationSnapshot(
  invitation: BeliefSessionInvitation | null | undefined,
): MasterThreadShellSnapshot | null {
  if (!invitation || invitation.status !== 'pending') return null;
  return MasterThreadService.createNexusShellSnapshot({
    threadId: invitation.threadId,
    now: invitation.triggeredAt,
    pendingTargets: ['agnes'],
    lastTurnRuntime: invitation.runtimeSummary,
  });
}
