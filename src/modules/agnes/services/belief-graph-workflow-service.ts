import { BeliefGraphServiceJs } from '@cortex-logic';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import type { NexusRecord } from '@/lib/data-layer';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { HistoryMode } from '@/lib/contracts/orchestration';
import type { NeuralStateVector } from '@/lib/types';
import {
  loadBeliefGraph,
  normalizeBeliefGraph,
  saveBeliefGraph,
  type BeliefGraph,
  type BeliefGraphLoadContext,
} from './belief-graph-service';
import {
  createBeliefSessionInvitationRuntime,
  type BeliefSessionInvitation,
} from './belief-trigger-service';
import { OrchestrationPersistenceService } from '@/lib/services/orchestration-persistence-service';

const BELIEF_GRAPH_WORKFLOW_COLLECTION = 'belief_graph_workflows';
const VAULT_SALT_MARKER = 'vault_salt_used';

let _service: InstanceType<typeof BeliefGraphServiceJs> | null = null;
function getService() {
  if (!_service) _service = new BeliefGraphServiceJs() as InstanceType<typeof BeliefGraphServiceJs>;
  return _service;
}

export interface BeliefGraphProposal {
  id: string;
  source: 'journal_entry' | 'agnes_session' | 'manual' | 'import';
  title: string;
  summary: string;
  confidence: number | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  graph: BeliefGraph;
  createdAt: string;
  updatedAt: string;
}

export interface BeliefGraphWorkflow {
  proposals: BeliefGraphProposal[];
  invitation: BeliefSessionInvitation | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposeBeliefGraphCandidateInput {
  source: BeliefGraphProposal['source'];
  title?: string;
  summary?: string;
  confidence?: number | null;
  graph: BeliefGraph;
  createdAt?: string;
}

function clampConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function createEmptyWorkflow(now = new Date().toISOString()): BeliefGraphWorkflow {
  return {
    proposals: [],
    invitation: null,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeInvitation(raw: unknown): BeliefSessionInvitation | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.status !== 'pending' && candidate.status !== 'accepted' && candidate.status !== 'dismissed') {
    return null;
  }
  if (typeof candidate.threadId !== 'string' || typeof candidate.title !== 'string' || typeof candidate.summary !== 'string') {
    return null;
  }
  if (!candidate.runtimeSummary || typeof candidate.runtimeSummary !== 'object') {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' ? candidate.id : `belief-invitation.${crypto.randomUUID()}`,
    status: candidate.status,
    threadId: candidate.threadId,
    title: candidate.title,
    summary: candidate.summary,
    rationale: Array.isArray(candidate.rationale)
      ? candidate.rationale.filter((reason): reason is string => typeof reason === 'string')
      : [],
    fingerprint: typeof candidate.fingerprint === 'string' ? candidate.fingerprint : '',
    confidence: typeof candidate.confidence === 'number' ? Math.max(0, Math.min(1, candidate.confidence)) : 0.75,
    triggeringBeliefs: Array.isArray(candidate.triggeringBeliefs)
      ? candidate.triggeringBeliefs.filter((belief): belief is string => typeof belief === 'string')
      : [],
    triggeredAt: typeof candidate.triggeredAt === 'string' ? candidate.triggeredAt : new Date().toISOString(),
    runtimeSummary: candidate.runtimeSummary as BeliefSessionInvitation['runtimeSummary'],
  };
}

function normalizeProposal(raw: unknown, index: number): BeliefGraphProposal {
  const now = new Date().toISOString();
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const graph = normalizeBeliefGraph(candidate.graph);
  const summary = typeof candidate.summary === 'string' ? candidate.summary : graph.summary;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : `belief-proposal.${index}`,
    source:
      candidate.source === 'journal_entry' ||
      candidate.source === 'agnes_session' ||
      candidate.source === 'manual' ||
      candidate.source === 'import'
        ? candidate.source
        : 'manual',
    title: typeof candidate.title === 'string' ? candidate.title : 'Review belief suggestion',
    summary,
    confidence: clampConfidence(candidate.confidence),
    status:
      candidate.status === 'confirmed' || candidate.status === 'dismissed' || candidate.status === 'pending'
        ? candidate.status
        : 'pending',
    graph: {
      ...graph,
      summary,
    },
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  };
}

function normalizeWorkflow(raw: unknown): BeliefGraphWorkflow {
  const now = new Date().toISOString();
  if (!raw || typeof raw !== 'object') return createEmptyWorkflow(now);
  const candidate = raw as Record<string, unknown>;
  return {
    proposals: Array.isArray(candidate.proposals)
      ? candidate.proposals.map((proposal, index) => normalizeProposal(proposal, index))
      : [],
    invitation: normalizeInvitation(candidate.invitation),
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  };
}

export function mergeBeliefGraphs(current: BeliefGraph | null, proposalGraph: BeliefGraph): BeliefGraph {
  const currentJson = current ? JSON.stringify(current) : '';
  const proposalJson = JSON.stringify(proposalGraph);
  const resultJson = getService().mergeGraphs(currentJson, proposalJson);
  return JSON.parse(resultJson) as BeliefGraph;
}

async function saveBeliefGraphWorkflowDocument(
  workflow: BeliefGraphWorkflow,
  { userId, encryptionKey }: BeliefGraphLoadContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;
  const normalized = normalizeWorkflow(workflow);
  const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
  await getNexusDataLayer().setDocument(BELIEF_GRAPH_WORKFLOW_COLLECTION, userId, {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    salt: VAULT_SALT_MARKER,
    metadata: {
      pendingProposals: normalized.proposals.filter((proposal) => proposal.status === 'pending').length,
      hasInvitation: normalized.invitation?.status === 'pending',
      lastActive: new Date().toISOString(),
    },
  });
}

export async function loadBeliefGraphWorkflow(
  { userId, encryptionKey }: BeliefGraphLoadContext,
): Promise<BeliefGraphWorkflow | null> {
  if (!userId || !encryptionKey) return null;
  const record = await getNexusDataLayer().getDocument<{ encryptedData?: string; iv?: string }>(
    BELIEF_GRAPH_WORKFLOW_COLLECTION,
    userId,
  );
  if (!record?.encryptedData || !record.iv) return null;

  try {
    const decrypted = await decryptWithKey({ ciphertext: record.encryptedData, iv: record.iv }, encryptionKey);
    return normalizeWorkflow(JSON.parse(decrypted));
  } catch (error) {
    console.error('[BeliefGraphWorkflowService] Failed to decrypt workflow:', error);
    return null;
  }
}

export function subscribeBeliefGraphWorkflow(
  { userId, encryptionKey }: BeliefGraphLoadContext,
  onUpdate: (workflow: BeliefGraphWorkflow | null) => void,
): () => void {
  if (!userId || !encryptionKey) {
    onUpdate(null);
    return () => {};
  }

  return getNexusDataLayer().subscribeToDocument<{ encryptedData?: string; iv?: string }>(
    BELIEF_GRAPH_WORKFLOW_COLLECTION,
    userId,
    async (record: NexusRecord<{ encryptedData?: string; iv?: string }> | null) => {
      if (!record?.encryptedData || !record.iv) {
        onUpdate(null);
        return;
      }

      try {
        const decrypted = await decryptWithKey({ ciphertext: record.encryptedData, iv: record.iv }, encryptionKey);
        onUpdate(normalizeWorkflow(JSON.parse(decrypted)));
      } catch (error) {
        console.error('[BeliefGraphWorkflowService] Failed to decrypt workflow:', error);
        onUpdate(null);
      }
    },
  );
}

function defaultProposalTitle(source: BeliefGraphProposal['source']): string {
  switch (source) {
    case 'journal_entry':
      return 'Review journal belief extraction';
    case 'agnes_session':
      return 'Review Agnes belief suggestion';
    case 'import':
      return 'Review imported belief suggestion';
    default:
      return 'Review belief suggestion';
  }
}

export async function proposeBeliefGraphCandidate(
  input: ProposeBeliefGraphCandidateInput,
  context: BeliefGraphLoadContext,
): Promise<BeliefGraphProposal | null> {
  const { userId, encryptionKey } = context;
  if (!userId || !encryptionKey) return null;

  const now = input.createdAt ?? new Date().toISOString();
  const graph = normalizeBeliefGraph({
    ...input.graph,
    summary: input.summary ?? input.graph.summary,
    updatedAt: now,
  });

  const currentWorkflow = (await loadBeliefGraphWorkflow(context)) ?? createEmptyWorkflow(now);
  const proposal: BeliefGraphProposal = {
    id: `belief-proposal.${crypto.randomUUID()}`,
    source: input.source,
    title: input.title ?? defaultProposalTitle(input.source),
    summary: input.summary ?? graph.summary,
    confidence: clampConfidence(input.confidence),
    status: 'pending',
    graph,
    createdAt: now,
    updatedAt: now,
  };

  await saveBeliefGraphWorkflowDocument(
    {
      ...currentWorkflow,
      proposals: [proposal, ...currentWorkflow.proposals.filter((entry) => entry.status === 'pending')],
      updatedAt: now,
    },
    context,
  );

  return proposal;
}

export async function confirmBeliefGraphProposal(input: {
  proposalId: string;
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
  editedGraph?: BeliefGraph | null;
  emotionalState?: NeuralStateVector['emotional'] | null;
  autopilotLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  historyMode?: HistoryMode;
  isGuest?: boolean;
}): Promise<{
  graph: BeliefGraph | null;
  workflow: BeliefGraphWorkflow | null;
  invitation: BeliefSessionInvitation | null;
}> {
  const context = { userId: input.userId, encryptionKey: input.encryptionKey };
  if (!input.userId || !input.encryptionKey) {
    return { graph: null, workflow: null, invitation: null };
  }

  const now = new Date().toISOString();
  const currentWorkflow = (await loadBeliefGraphWorkflow(context)) ?? createEmptyWorkflow(now);
  const proposal = currentWorkflow.proposals.find((entry) => entry.id === input.proposalId && entry.status === 'pending');

  if (!proposal) {
    return {
      graph: await loadBeliefGraph(context),
      workflow: currentWorkflow,
      invitation: currentWorkflow.invitation,
    };
  }

  const mergedGraph = mergeBeliefGraphs(
    await loadBeliefGraph(context),
    normalizeBeliefGraph(input.editedGraph ?? proposal.graph),
  );
  await saveBeliefGraph(mergedGraph, context);

  let invitation = currentWorkflow.invitation;
  const invitationRuntime = createBeliefSessionInvitationRuntime({
    graph: mergedGraph,
    emotionalState: input.emotionalState,
    now,
    isGuest: input.isGuest,
    autopilotLevel: input.autopilotLevel,
    historyMode: input.historyMode,
  });

  if (
    invitationRuntime &&
    (!invitation || invitation.fingerprint !== invitationRuntime.invitation.fingerprint)
  ) {
    invitation = invitationRuntime.invitation;
    await OrchestrationPersistenceService.persistRuntimeArtifacts(input.userId, {
      moduleId: 'agnes',
      decisions: [invitationRuntime.metadata],
      runtimeSummary: invitationRuntime.invitation.runtimeSummary,
      threadId: invitationRuntime.invitation.threadId,
      now,
    });
  }

  const nextWorkflow = normalizeWorkflow({
    ...currentWorkflow,
    proposals: currentWorkflow.proposals.filter((entry) => entry.id !== input.proposalId),
    invitation,
    updatedAt: now,
  });
  await saveBeliefGraphWorkflowDocument(nextWorkflow, context);

  return {
    graph: mergedGraph,
    workflow: nextWorkflow,
    invitation: nextWorkflow.invitation,
  };
}

export async function dismissBeliefGraphProposal(input: {
  proposalId: string;
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
}): Promise<BeliefGraphWorkflow | null> {
  const context = { userId: input.userId, encryptionKey: input.encryptionKey };
  if (!input.userId || !input.encryptionKey) return null;
  const now = new Date().toISOString();
  const workflow = (await loadBeliefGraphWorkflow(context)) ?? createEmptyWorkflow(now);
  const nextWorkflow = {
    ...workflow,
    proposals: workflow.proposals.filter((proposal) => proposal.id !== input.proposalId),
    updatedAt: now,
  };
  await saveBeliefGraphWorkflowDocument(nextWorkflow, context);
  return nextWorkflow;
}

export async function updateBeliefSessionInvitationStatus(input: {
  status: 'accepted' | 'dismissed';
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
}): Promise<BeliefGraphWorkflow | null> {
  const context = { userId: input.userId, encryptionKey: input.encryptionKey };
  if (!input.userId || !input.encryptionKey) return null;
  const now = new Date().toISOString();
  const workflow = (await loadBeliefGraphWorkflow(context)) ?? createEmptyWorkflow(now);
  if (!workflow.invitation) return workflow;

  const nextWorkflow = {
    ...workflow,
    invitation: {
      ...workflow.invitation,
      status: input.status,
      triggeredAt: workflow.invitation.triggeredAt || now,
    },
    updatedAt: now,
  };
  await saveBeliefGraphWorkflowDocument(nextWorkflow, context);
  return nextWorkflow;
}
