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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeBeliefLabel(node: BeliefNode): string {
  return node.label.trim().toLowerCase();
}

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

export function evaluateBeliefSessionInvitationThreshold(input: {
  graph: BeliefGraph | null;
  emotionalState?: EmotionalContext;
}): BeliefInvitationDecision {
  const nodes = input.graph?.nodes ?? [];
  const negativeNodes = nodes.filter((node) => node.valence === 'negative');
  const highIntensityNegativeNodes = negativeNodes.filter((node) => node.intensity >= 7);
  const severeNegativeNodes = negativeNodes.filter((node) => node.intensity >= 9);
  const resilience =
    typeof input.emotionalState?.emotionalResilience === 'number'
      ? input.emotionalState.emotionalResilience
      : null;
  const stressLoad =
    typeof input.emotionalState?.stressLoad === 'number'
      ? input.emotionalState.stressLoad
      : null;
  const averageNegativeIntensity =
    negativeNodes.length > 0
      ? round1(negativeNodes.reduce((sum, node) => sum + node.intensity, 0) / negativeNodes.length)
      : 0;

  const rationale: string[] = [];

  if (highIntensityNegativeNodes.length >= 2) {
    rationale.push(
      `${highIntensityNegativeNodes.length} high-intensity negative beliefs are active in the graph.`,
    );
  }

  if (negativeNodes.length >= 3 && averageNegativeIntensity >= 6.5) {
    rationale.push(
      `Negative belief density is elevated (${negativeNodes.length} beliefs averaging ${averageNegativeIntensity}/10).`,
    );
  }

  if (severeNegativeNodes.length >= 1 && (stressLoad ?? 0) >= 7) {
    rationale.push('A severe negative belief is paired with a high stress signal.');
  }

  if (severeNegativeNodes.length >= 1 && (resilience ?? 10) <= 4) {
    rationale.push('A severe negative belief is paired with low emotional resilience.');
  }

  const triggeringBeliefs = [...highIntensityNegativeNodes, ...severeNegativeNodes]
    .map((node) => node.label.trim())
    .filter((label, index, all) => label !== '' && all.indexOf(label) === index)
    .slice(0, 4);

  const uniqueReasonKeys = rationale.map((reason) => reason.toLowerCase());
  const fingerprint = [
    uniqueReasonKeys.join('|') || 'none',
    ...triggeringBeliefs.map((label) => label.toLowerCase()),
    `stress:${stressLoad ?? 'na'}`,
    `resilience:${resilience ?? 'na'}`,
  ].join('::');

  const shouldInvite = rationale.length > 0;
  const confidence = clampConfidence(
    0.68 +
      Math.min(0.18, highIntensityNegativeNodes.length * 0.06) +
      (stressLoad !== null && stressLoad >= 7 ? 0.08 : 0) +
      (resilience !== null && resilience <= 4 ? 0.08 : 0),
  );

  return {
    shouldInvite,
    summary: shouldInvite
      ? 'Agnes can help unpack this pattern before it hardens into the next session gap.'
      : 'Belief graph does not currently meet invitation thresholds.',
    rationale,
    fingerprint,
    confidence,
    triggeringBeliefs,
    metrics: {
      totalNodes: nodes.length,
      negativeCount: negativeNodes.length,
      highIntensityNegativeCount: highIntensityNegativeNodes.length,
      severeNegativeCount: severeNegativeNodes.length,
      averageNegativeIntensity,
      resilience,
      stressLoad,
    },
  };
}

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

export function getTriggeringBeliefNodes(graph: BeliefGraph | null, invitation: BeliefSessionInvitation | null): BeliefNode[] {
  if (!graph || !invitation) return [];
  const labels = new Set(invitation.triggeringBeliefs.map((belief) => belief.trim().toLowerCase()));
  return graph.nodes.filter((node) => labels.has(normalizeBeliefLabel(node)));
}
