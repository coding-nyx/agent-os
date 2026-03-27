import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  GitBranch,
  PencilLine,
  Sparkles,
  X,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { MasterThreadStatusCard } from '@/core/components/MasterThreadStatusCard';
import { cn } from '@/lib/utils';
import type { MasterThreadShellSnapshot } from '@/lib/services/master-thread-service';
import type { BeliefGraph } from '../services/belief-graph-service';
import type {
  BeliefGraphProposal,
  BeliefGraphWorkflow,
} from '../services/belief-graph-workflow-service';
import { BeliefGraphCanvas } from './BeliefGraphCanvas';

interface AgnesBeliefWorkflowPanelProps {
  graph: BeliefGraph | null;
  workflow: BeliefGraphWorkflow | null;
  invitationSnapshot?: MasterThreadShellSnapshot | null;
  busy?: boolean;
  onConfirmProposal: (proposalId: string, editedGraph: BeliefGraph) => Promise<void>;
  onDismissProposal: (proposalId: string) => Promise<void>;
  onAcceptInvitation: () => Promise<void>;
  onDismissInvitation: () => Promise<void>;
}

type ProposalDraftMap = Record<string, BeliefGraph>;

const SOURCE_LABELS: Record<BeliefGraphProposal['source'], string> = {
  journal_entry: 'Journal',
  agnes_session: 'Agnes',
  manual: 'Manual',
  import: 'Import',
};

function formatConfidence(confidence: number | null): string {
  if (typeof confidence !== 'number') return 'review';
  return `${Math.round(confidence * 100)}% confidence`;
}

export function AgnesBeliefWorkflowPanel({
  graph,
  workflow,
  invitationSnapshot = null,
  busy = false,
  onConfirmProposal,
  onDismissProposal,
  onAcceptInvitation,
  onDismissInvitation,
}: AgnesBeliefWorkflowPanelProps) {
  const pendingProposals = useMemo(
    () => workflow?.proposals.filter((proposal) => proposal.status === 'pending') ?? [],
    [workflow?.proposals],
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(pendingProposals[0]?.id ?? null);
  const [drafts, setDrafts] = useState<ProposalDraftMap>({});
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const invitation = workflow?.invitation?.status === 'pending' ? workflow.invitation : null;

  useEffect(() => {
    setDrafts((current) => {
      const next: ProposalDraftMap = {};
      for (const proposal of pendingProposals) {
        next[proposal.id] = current[proposal.id] ?? proposal.graph;
      }
      return next;
    });
  }, [pendingProposals]);

  useEffect(() => {
    if (pendingProposals.length === 0) {
      setSelectedProposalId(null);
      return;
    }
    if (!selectedProposalId || !pendingProposals.some((proposal) => proposal.id === selectedProposalId)) {
      setSelectedProposalId(pendingProposals[0].id);
    }
  }, [pendingProposals, selectedProposalId]);

  const selectedProposal = pendingProposals.find((proposal) => proposal.id === selectedProposalId) ?? null;
  const selectedDraft = selectedProposal ? drafts[selectedProposal.id] ?? selectedProposal.graph : null;

  const updateDraft = (proposalId: string, updater: (draft: BeliefGraph) => BeliefGraph) => {
    setDrafts((current) => {
      const base = current[proposalId] ?? pendingProposals.find((proposal) => proposal.id === proposalId)?.graph;
      if (!base) return current;
      return {
        ...current,
        [proposalId]: updater(base),
      };
    });
  };

  return (
    <section className="w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-2">
          <Brain className="h-4 w-4 text-indigo-300" />
          <span className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-100/80">
            Belief Review Workflow
          </span>
        </div>
        <p className="text-xs text-white/38">
          Nothing is written to Agnes&apos; belief graph until you confirm or edit it here.
        </p>
      </div>

      {invitation ? (
        <div className="space-y-3 rounded-[2rem] border border-amber-400/20 bg-amber-500/[0.08] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/90">
                  Session invitation ready
                </span>
              </div>
              <p className="text-sm font-semibold text-white/88">{invitation.title}</p>
              <p className="max-w-2xl text-sm leading-relaxed text-white/62">{invitation.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NeuralButton
                size="sm"
                themeColor="module"
                className="!rounded-full !px-4"
                disabled={busy}
                onClick={async () => {
                  setBusyProposalId('invitation.accept');
                  try {
                    await onAcceptInvitation();
                  } finally {
                    setBusyProposalId(null);
                  }
                }}
                loading={busyProposalId === 'invitation.accept'}
              >
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Start session
              </NeuralButton>
              <NeuralButton
                size="sm"
                variant="ghost"
                className="!rounded-full !px-4 text-white/55"
                disabled={busy}
                onClick={async () => {
                  setBusyProposalId('invitation.dismiss');
                  try {
                    await onDismissInvitation();
                  } finally {
                    setBusyProposalId(null);
                  }
                }}
                loading={busyProposalId === 'invitation.dismiss'}
              >
                Dismiss
              </NeuralButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {invitation.rationale.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62"
              >
                {reason}
              </span>
            ))}
          </div>

          {invitationSnapshot ? (
            <MasterThreadStatusCard
              thread={invitationSnapshot.thread}
              proposalCard={invitationSnapshot.proposalCard}
              proposalEntries={invitationSnapshot.proposals}
              runtimeSummary={invitationSnapshot.runtimeSummary}
              compact
              className="bg-black/15"
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.95fr]">
        <div className="space-y-3 rounded-[2rem] border border-white/[0.12] bg-slate-900/60 p-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-300" />
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">
              Confirmed belief map
            </span>
          </div>
          <BeliefGraphCanvas
            graph={graph}
            highlightLabels={invitation?.triggeringBeliefs}
            emptyMessage="Confirmed beliefs will cluster here after you approve them."
          />
        </div>

        <div className="space-y-3 rounded-[2rem] border border-white/[0.12] bg-slate-900/60 p-4">
          <div className="flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-indigo-300" />
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">
              Pending suggestions
            </span>
          </div>

          {pendingProposals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.045] px-4 py-6 text-sm text-white/35">
              Agnes session insights and journal extractions will appear here for review before they touch the durable graph.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {pendingProposals.map((proposal) => (
                  <button
                    key={proposal.id}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] transition',
                      proposal.id === selectedProposalId
                        ? 'border-indigo-400/30 bg-indigo-500/12 text-indigo-100'
                        : 'border-white/[0.12] bg-white/[0.045] text-white/50 hover:text-white/70',
                    )}
                    onClick={() => setSelectedProposalId(proposal.id)}
                  >
                    {proposal.title}
                  </button>
                ))}
              </div>

              {selectedProposal && selectedDraft ? (
                <div className="space-y-3 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white/88">{selectedProposal.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-white/42">
                        <span>{SOURCE_LABELS[selectedProposal.source]}</span>
                        <span>·</span>
                        <span>{formatConfidence(selectedProposal.confidence)}</span>
                        <span>·</span>
                        <span>{selectedDraft.nodes.length} beliefs</span>
                      </div>
                    </div>
                    <NeuralButton
                      size="sm"
                      variant="ghost"
                      className="!rounded-full text-white/50"
                      disabled={busy}
                      onClick={async () => {
                        setBusyProposalId(`${selectedProposal.id}.dismiss`);
                        try {
                          await onDismissProposal(selectedProposal.id);
                        } finally {
                          setBusyProposalId(null);
                        }
                      }}
                      loading={busyProposalId === `${selectedProposal.id}.dismiss`}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Dismiss
                    </NeuralButton>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                      Summary
                    </span>
                    <textarea
                      value={selectedDraft.summary}
                      onChange={(event) =>
                        updateDraft(selectedProposal.id, (draft) => ({
                          ...draft,
                          summary: event.target.value,
                          updatedAt: new Date().toISOString(),
                        }))
                      }
                      className="min-h-[88px] w-full rounded-2xl border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-indigo-400/30"
                    />
                  </label>

                  <div className="space-y-3">
                    {selectedDraft.nodes.map((node, index) => (
                      <div
                        key={node.id}
                        className="grid gap-3 rounded-2xl border border-white/[0.09] bg-slate-900/50 p-3 sm:grid-cols-[1.2fr_0.75fr_0.7fr]"
                      >
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                            Belief
                          </span>
                          <input
                            value={node.label}
                            onChange={(event) =>
                              updateDraft(selectedProposal.id, (draft) => ({
                                ...draft,
                                nodes: draft.nodes.map((entry, nodeIndex) =>
                                  nodeIndex === index
                                    ? {
                                        ...entry,
                                        label: event.target.value,
                                      }
                                    : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            className="w-full rounded-xl border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white/82 outline-none transition focus:border-indigo-400/30"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                            Valence
                          </span>
                          <select
                            value={node.valence}
                            onChange={(event) =>
                              updateDraft(selectedProposal.id, (draft) => ({
                                ...draft,
                                nodes: draft.nodes.map((entry, nodeIndex) =>
                                  nodeIndex === index
                                    ? {
                                        ...entry,
                                        valence: event.target.value as typeof entry.valence,
                                      }
                                    : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            className="w-full rounded-xl border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white/82 outline-none transition focus:border-indigo-400/30"
                          >
                            <option value="negative">Negative</option>
                            <option value="neutral">Neutral</option>
                            <option value="positive">Positive</option>
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                            Intensity
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={node.intensity}
                            onChange={(event) =>
                              updateDraft(selectedProposal.id, (draft) => ({
                                ...draft,
                                nodes: draft.nodes.map((entry, nodeIndex) =>
                                  nodeIndex === index
                                    ? {
                                        ...entry,
                                        intensity: Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                                      }
                                    : entry,
                                ),
                                updatedAt: new Date().toISOString(),
                              }))
                            }
                            className="w-full rounded-xl border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white/82 outline-none transition focus:border-indigo-400/30"
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  {selectedDraft.edges.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                        Relationships
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedDraft.edges.map((edge, index) => (
                          <span
                            key={`${edge.from}-${edge.to}-${edge.relation}-${index}`}
                            className="rounded-full border border-white/[0.12] bg-white/[0.045] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/48"
                          >
                            {edge.relation}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <NeuralButton
                      size="sm"
                      themeColor="module"
                      className="!rounded-full !px-4"
                      disabled={busy}
                      onClick={async () => {
                        setBusyProposalId(`${selectedProposal.id}.confirm`);
                        try {
                          await onConfirmProposal(selectedProposal.id, selectedDraft);
                        } finally {
                          setBusyProposalId(null);
                        }
                      }}
                      loading={busyProposalId === `${selectedProposal.id}.confirm`}
                    >
                      <Check className="mr-2 h-3.5 w-3.5" />
                      Confirm belief update
                    </NeuralButton>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
