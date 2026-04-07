import { Check, CornerDownRight, Eye, Ghost, GitBranch, Layers3, MessagesSquare, PencilLine, RotateCcw, ScrollText, Sparkles, Users, X } from 'lucide-react';
import type { ProposalCard, SilentHistoryEntry, ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import { resolveConversationalActorIdentity } from '@/lib/agent-identity';
import type {
  MasterThreadProposalLifecycle,
  MasterThreadProposalSurface,
  MasterThreadState,
} from '@/lib/services/master-thread-service';
import type { MasterThreadMessage, OrchestrationTurnRuntimeSummary } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { cn } from '@/lib/utils';
import { SilentAuditDetailModal } from './SilentAuditDetailModal';
import { AgentIcon } from './AgentIcon';
import { useMasterThreadDerivedData } from './hooks/useMasterThreadDerivedData';
import { useMasterThreadProposals } from './hooks/useMasterThreadProposals';
import type { MasterThreadProposalActionHandlers } from './hooks/useMasterThreadProposals';

const RESOLUTION_STYLES: Record<MasterThreadState['resolution']['status'], string> = {
  open: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  awaiting_approval: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  executed: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/20',
  deferred: 'bg-white/10 text-white/60 ring-white/10',
  blocked: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
};

const PROPOSAL_STYLES: Record<MasterThreadProposalLifecycle, string> = {
  draft: 'bg-white/10 text-white/70 ring-white/10',
  pending_approval: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  approved: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/20',
  auto_approved: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  deferred: 'bg-white/10 text-white/60 ring-white/10',
  analysis_only: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
  ghost_executed: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
  blocked: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
};

const PARTICIPANT_ROLE_STYLES = {
  primary: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
  secondary: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100',
  observer: 'border-white/[0.12] bg-white/[0.045] text-white/70',
} as const;

const PARTICIPANT_STATE_LABELS = {
  invited: 'Invited',
  joined: 'Joined',
  active: 'Active',
  waiting: 'Waiting',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  left: 'Left',
} as const;

const PARTICIPANT_STATE_STYLES = {
  invited: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  joined: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
  active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  waiting: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  resolved: 'border-white/[0.12] bg-white/[0.06] text-white/70',
  dismissed: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
  left: 'border-white/[0.12] bg-white/[0.045] text-white/55',
} as const;

const PARTICIPANT_PRESENCE_LABELS = {
  online: 'Online',
  idle: 'Idle',
  offline: 'Offline',
} as const;

const PARTICIPANT_REASON_LABELS = {
  mentioned: 'Mentioned',
  consulted: 'Consulted',
  delegated: 'Delegated',
  runtime: 'Runtime',
} as const;

const PARTICIPANT_REASON_STYLES = {
  mentioned: 'border-violet-500/20 bg-violet-500/10 text-violet-200',
  consulted: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
  delegated: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  runtime: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
} as const;

const PARTICIPANT_PRESENCE_DOT = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-300',
  offline: 'bg-white/25',
} as const;

const LIFECYCLE_LABELS: Record<MasterThreadProposalLifecycle, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  auto_approved: 'Auto-approved',
  deferred: 'Deferred',
  analysis_only: 'Analysis-only',
  ghost_executed: 'Ghost-executed',
  blocked: 'Blocked',
};

const DISPOSITION_LABELS: Record<MasterThreadProposalSurface['runtimeDisposition'], string> = {
  transient: 'Shell draft',
  manual_review: 'Manual review',
  proposal_review: 'Proposal review',
  high_risk_review: 'High-risk review',
  incident_review: 'Incident review',
  analysis_only: 'Analysis-only runtime',
  visible_execution: 'Visible execution',
  silent_execution: 'Silent execution',
  ephemeral_preview: 'Ephemeral preview',
};

function titleCaseStatus(value: string): string {
  return value.replace(/_/g, ' ');
}

function getModuleLabel(moduleId: keyof typeof MODULE_MANIFEST | 'nexus'): string {
  return MODULE_MANIFEST[moduleId]?.alias ?? 'Nyx';
}

function getAuthorLabel(
  author: MasterThreadMessage['author'],
  actor?: MasterThreadMessage['actor'],
  actorIdentityEnabled = true,
): string {
  if (actorIdentityEnabled && actor?.actorLabel) return actor.actorLabel;
  if (author === 'system') return 'System';
  if (author === 'user') return 'User';
  return getModuleLabel(author);
}

function describeReplyTarget(
  message: MasterThreadMessage,
  messageMap: Map<string, MasterThreadMessage>,
  actorIdentityEnabled = true,
): string | null {
  if (!message.replyToMessageId) return null;
  const parent = messageMap.get(message.replyToMessageId);
  if (!parent) return 'Reply';
  return `Reply to ${getAuthorLabel(parent.author, parent.actor, actorIdentityEnabled)}`;
}

function formatReviewTimestamp(value: string): string {
  if (!value.includes('T')) return value;
  return value.slice(0, 16).replace('T', ' ');
}

function formatCompactTimestamp(value: string): string {
  if (!value.includes('T')) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatReviewTimestamp(value).slice(-5);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function describeSilentHistoryEntry(entry: SilentHistoryEntry): string {
  const hiddenMessages = Array.isArray(entry.metadata?.hiddenMessages) ? entry.metadata.hiddenMessages : [];
  const firstMessage = hiddenMessages.find((message): message is string => typeof message === 'string' && message.trim().length > 0);
  return firstMessage ?? entry.summary;
}

interface AgentIdentityProps {
  source: MasterThreadMessage['author'] | MasterThreadState['participants'][number]['moduleId'];
  actorId?: string;
  actorLabel?: string;
  actorShortLabel?: string;
  actorIdentityEnabled?: boolean;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}

function AgentIdentity({
  source,
  actorId,
  actorLabel,
  actorShortLabel,
  actorIdentityEnabled = true,
  subtitle,
  className,
  compact = false,
}: AgentIdentityProps) {
  const effectiveActorId = actorIdentityEnabled ? actorId : undefined;
  const effectiveActorLabel = actorIdentityEnabled ? actorLabel : undefined;
  const effectiveActorShortLabel = actorIdentityEnabled ? actorShortLabel : undefined;
  const identity = resolveConversationalActorIdentity({
    source: source === 'user' || source === 'system' || source === 'nexus' ? source : source,
    actorId: effectiveActorId,
    actorLabel: effectiveActorLabel,
    actorShortLabel: effectiveActorShortLabel,
  });

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
        <AgentIcon
          source={source === 'user' || source === 'system' || source === 'nexus' ? source : undefined}
          moduleId={source !== 'user' && source !== 'system' ? source : undefined}
          actorId={effectiveActorId}
          actorLabel={effectiveActorLabel}
          actorShortLabel={effectiveActorShortLabel}
          withBackground
        className={cn(
          'rounded-xl border',
          compact ? 'h-7 w-7' : 'h-8 w-8',
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
          {identity.label}
        </p>
        {subtitle ? <p className="truncate text-[11px] text-white/42">{subtitle}</p> : null}
      </div>
    </div>
  );
}

interface MasterThreadStatusCardProps {
  thread: MasterThreadState;
  proposalCard?: ProposalCard | null;
  proposalEntries?: MasterThreadProposalSurface[];
  runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
  silentHistoryEntries?: SilentHistoryEntry[];
  compact?: boolean;
  className?: string;
  onProposalLifecycleChange?: (
    proposalId: string,
    nextLifecycle: Extract<MasterThreadProposalLifecycle, 'draft' | 'deferred'>,
  ) => void;
  proposalActions?: MasterThreadProposalActionHandlers;
  onRetryExecution?: (artifact: ThreadExecutionArtifact) => void;
}

export function MasterThreadStatusCard({
  thread,
  proposalCard = null,
  proposalEntries,
  runtimeSummary = null,
  silentHistoryEntries = [],
  compact = false,
  className,
  onProposalLifecycleChange,
  proposalActions,
  onRetryExecution,
}: MasterThreadStatusCardProps) {
  const chatActorIdentityEnabled = AutonomyFeatureFlags.isEnabled('chatActorIdentity');

  const derived = useMasterThreadDerivedData(thread, runtimeSummary, silentHistoryEntries);
  const proposalState = useMasterThreadProposals({
    proposalCard,
    proposalEntries,
    onProposalLifecycleChange,
    proposalActions,
    silentHistoryEntries,
  });

  const {
    threadParticipants,
    threadTurns,
    threadMessages,
    threadMessageMap,
    recentThreadMessages,
    recentSilentHistoryEntries,
    recentTurns,
    ghostActions,
    activeParticipantCount,
    waitingParticipantCount,
    inactiveParticipantCount,
  } = derived;

  const {
    proposals,
    selectedProposal,
    setSelectedProposalId,
    canMutateSelectedProposal,
    canApproveSelectedProposal,
    canDismissSelectedProposal,
    canEditSelectedProposal,
    canRerouteSelectedProposal,
    isEditingSelectedProposal,
    setIsEditingSelectedProposal,
    editTargetModuleId,
    setEditTargetModuleId,
    editReason,
    setEditReason,
    editableTargetModules,
    selectedSilentHistoryEntry,
    setSelectedSilentHistoryId,
    handleApprove,
    handleDismiss,
    handleLifecycleToggle,
    handleEditSave,
    handleEditCancel,
  } = proposalState;

  return (
    <section
      className={cn(
        'rounded-2xl border border-white/[0.12] bg-white/[0.035] text-white/80',
        compact ? 'space-y-3 p-3' : 'space-y-4 p-4',
        className,
      )}
      aria-label="Master Thread status"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
              <GitBranch className="h-4 w-4 text-violet-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
                Master Thread
              </p>
              <p className="text-xs text-white/45">Thread {thread.threadId}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-white/55">
            <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
              {threadTurns.length} turn{threadTurns.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
              {threadMessages.length} message{threadMessages.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
              {threadParticipants.length} participant{threadParticipants.length === 1 ? '' : 's'}
            </span>
            {selectedProposal ? (
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-200">
                Focus proposal: {LIFECYCLE_LABELS[selectedProposal.lifecycle]}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ring-1',
            RESOLUTION_STYLES[thread.resolution.status],
          )}
          data-testid="master-thread-resolution"
        >
          {titleCaseStatus(thread.resolution.status)}
        </span>
      </header>

      {runtimeSummary ? (
        <div
          className="grid gap-2 rounded-xl border border-white/[0.12] bg-slate-900/50 p-3 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="master-thread-runtime-summary"
        >
          <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-2.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">
              <Layers3 className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
              Runtime
            </div>
            <p className="mt-2 text-sm font-semibold text-white/90">L{runtimeSummary.autopilotLevel}</p>
            <p className="text-[11px] text-white/52">{runtimeSummary.historyMode} history</p>
          </div>
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/75">Awaiting approval</p>
            <p className="mt-2 text-sm font-semibold text-amber-200">{runtimeSummary.counts.awaitingApproval}</p>
            <p className="text-[11px] text-amber-200/70">
              {runtimeSummary.counts.awaitingApproval} pending approval
            </p>
          </div>
          <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/75">Ghost / silent</p>
            <p className="mt-2 text-sm font-semibold text-violet-200">{runtimeSummary.counts.silentExecutions}</p>
            <p className="text-[11px] text-violet-200/70">
              {runtimeSummary.counts.silentExecutions} ghost/silent
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Exceptions</p>
            <p className="mt-2 text-sm font-semibold text-white/88">
              {(runtimeSummary.counts.analysisOnly ?? 0) + (runtimeSummary.counts.blocked ?? 0) + (runtimeSummary.counts.failed ?? 0)}
            </p>
            <p className="text-[11px] text-white/52">
              {runtimeSummary.counts.analysisOnly ?? 0} analysis-only • {runtimeSummary.counts.blocked ?? 0} blocked • {runtimeSummary.counts.failed ?? 0} failed
              {(runtimeSummary.counts.escalated ?? 0) > 0 ? ` • ${runtimeSummary.counts.escalated ?? 0} escalated` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <div className="space-y-3">
          {recentThreadMessages.length > 0 ? (
            <div className="space-y-2" data-testid="master-thread-activity">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <MessagesSquare className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
                Thread activity
              </div>
              <div className="rounded-xl border border-white/[0.12] bg-slate-900/50 p-3">
                <div className="space-y-3">
                  {recentThreadMessages.map((message, index) => {
                    const replyLabel = describeReplyTarget(message, threadMessageMap, chatActorIdentityEnabled);
                    const isReply = Boolean(message.replyToMessageId);
                    const showConnector = index < recentThreadMessages.length - 1;
                    return (
                      <article
                        key={message.id}
                        className="relative flex gap-3"
                        data-testid={`master-thread-message-${message.id}`}
                      >
                        <div className="relative flex w-9 shrink-0 justify-center">
                          {showConnector ? (
                            <span
                              className="absolute top-9 bottom-[-14px] left-1/2 w-px -translate-x-1/2 bg-white/10"
                              aria-hidden
                            />
                          ) : null}
                          <AgentIcon
                            source={message.author === 'user' || message.author === 'system' || message.author === 'nexus' ? message.author : undefined}
                            moduleId={message.author !== 'user' && message.author !== 'system' ? message.author : undefined}
                            actorId={chatActorIdentityEnabled ? message.actor?.actorId : undefined}
                            actorLabel={chatActorIdentityEnabled ? message.actor?.actorLabel : undefined}
                            actorShortLabel={chatActorIdentityEnabled ? message.actor?.actorShortLabel : undefined}
                            withBackground
                            className={cn(
                              'h-8 w-8 rounded-xl',
                              isReply ? 'ring-1 ring-cyan-500/20' : undefined,
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            'min-w-0 flex-1 rounded-xl border px-3 py-2.5',
                            isReply
                              ? 'border-cyan-500/15 bg-cyan-500/[0.04]'
                              : 'border-white/[0.12] bg-white/[0.045]',
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <AgentIdentity
                              source={message.author}
                              actorId={message.actor?.actorId}
                              actorLabel={message.actor?.actorLabel}
                              actorShortLabel={message.actor?.actorShortLabel}
                              actorIdentityEnabled={chatActorIdentityEnabled}
                              subtitle={replyLabel ?? 'Direct thread message'}
                              compact
                              className="flex-1"
                            />
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/42">
                              {message.execution?.retryAttempt || message.execution?.retryable ? (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
                                  {message.execution.retryAttempt ? `Retry ${message.execution.retryAttempt}` : 'Retryable'}
                                </span>
                              ) : null}
                              {typeof message.turnSequence === 'number' ? (
                                <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-1.5 py-0.5">
                                  T{message.turnSequence}
                                </span>
                              ) : null}
                              <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-1.5 py-0.5">
                                {formatCompactTimestamp(message.createdAt)}
                              </span>
                            </div>
                          </div>
                          {replyLabel ? (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-cyan-500/15 bg-cyan-500/[0.05] px-2 py-1 text-[11px] text-cyan-200/75">
                              <CornerDownRight className="h-3 w-3" aria-hidden />
                              {replyLabel}
                            </div>
                          ) : null}
                          <p className="mt-2 text-xs leading-relaxed text-white/65">{message.body}</p>
                          {message.kind === 'execution_failure' && message.execution?.retryable && message.execution.retryPrompt && onRetryExecution ? (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => onRetryExecution(message.execution!)}
                                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/15"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                {message.execution.retryAttempt ? `Retry failed steps · Attempt ${message.execution.retryAttempt}` : 'Retry failed steps'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {recentSilentHistoryEntries.length > 0 || ghostActions.length > 0 || recentTurns.length > 0 ? (
            <div className="space-y-2" data-testid="master-thread-review-surfaces">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <ScrollText className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
                Review surfaces
              </div>
              <div className="grid gap-2 rounded-xl border border-white/[0.12] bg-slate-900/50 p-3">
                {recentSilentHistoryEntries.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Silent History</p>
                      <span className="text-[11px] text-amber-200/60">
                        {recentSilentHistoryEntries.length} item{recentSilentHistoryEntries.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {recentSilentHistoryEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="w-full rounded-lg border border-amber-500/15 bg-slate-900/50 px-2.5 py-2 text-left transition hover:bg-amber-500/[0.08]"
                          onClick={() => setSelectedSilentHistoryId(entry.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <AgentIdentity
                              source={entry.source}
                              subtitle={formatReviewTimestamp(entry.timestamp)}
                              compact
                            />
                            <span className="text-[11px] text-amber-200/70">{formatCompactTimestamp(entry.timestamp)}</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/65">{describeSilentHistoryEntry(entry)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {ghostActions.length > 0 ? (
                  <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">Ghost trace</p>
                      <span className="text-[11px] text-violet-200/60">
                        {ghostActions.length} trace{ghostActions.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ghostActions.slice(0, 3).map((action) => (
                        <div
                          key={`${action.proposalId}.${action.executedAt ?? action.label}`}
                          className="rounded-lg border border-violet-500/15 bg-slate-900/50 px-2.5 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Ghost className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                            <AgentIdentity source={action.source} subtitle={action.label} compact className="flex-1" />
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/65">
                            {action.summary} ({action.historyMode === 'silent' ? 'silent audit' : 'minimal history'})
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {recentTurns.length > 0 ? (
                  <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Playback timeline</p>
                      <span className="text-[11px] text-white/42">
                        {recentTurns.length} turn{recentTurns.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {recentTurns.map((turn) => (
                        <div key={turn.id} className="rounded-lg border border-white/[0.12] bg-slate-900/50 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <AgentIdentity
                              source={turn.startedBy}
                              subtitle={`T${turn.sequence} • ${turn.messageIds.length} msg`}
                              compact
                            />
                            <span className="text-[11px] text-white/42">
                              {turn.replyToTurnId ? 'reply chain' : 'direct'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/60">
                            {turn.participantIds.map((participantId) => getModuleLabel(participantId)).join(', ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              <Users className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
              Participants
            </div>
            <div className="rounded-xl border border-white/[0.12] bg-slate-900/50 p-3">
              <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-white/55">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  {activeParticipantCount} active
                </span>
                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-sky-200">
                  {waitingParticipantCount} pending
                </span>
                {inactiveParticipantCount > 0 ? (
                  <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
                    {inactiveParticipantCount} inactive
                  </span>
                ) : null}
              </div>
              <div className="grid gap-2" data-testid="master-thread-participants">
                {threadParticipants.map((participant) => (
                  <div
                    key={participant.moduleId}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2',
                      PARTICIPANT_ROLE_STYLES[participant.role],
                    )}
                    data-testid={`master-thread-participant-${participant.moduleId}`}
                  >
                    <AgentIdentity
                      source={participant.moduleId}
                      actorId={participant.actorId}
                      actorLabel={participant.actorLabel}
                      actorShortLabel={participant.actorShortLabel}
                      actorIdentityEnabled={chatActorIdentityEnabled}
                      subtitle={participant.role}
                      compact
                      className="flex-1"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-slate-900/50 px-2 py-1 font-semibold uppercase tracking-[0.14em] opacity-80',
                        )}
                      >
                        <span
                          className={cn('h-1.5 w-1.5 rounded-full', PARTICIPANT_PRESENCE_DOT[participant.presence])}
                          aria-hidden
                        />
                        {PARTICIPANT_PRESENCE_LABELS[participant.presence]}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-1 font-semibold uppercase tracking-[0.14em]',
                          PARTICIPANT_STATE_STYLES[participant.state],
                        )}
                      >
                        {PARTICIPANT_STATE_LABELS[participant.state]}
                      </span>
                      {(participant.inclusionReasons ?? []).map((reason) => (
                        <span
                          key={`${participant.moduleId}-${reason}`}
                          data-testid={`master-thread-participant-${participant.moduleId}-reason-${reason}`}
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-1 font-semibold uppercase tracking-[0.14em]',
                            PARTICIPANT_REASON_STYLES[reason],
                          )}
                        >
                          {PARTICIPANT_REASON_LABELS[reason]}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
                Proposal focus
              </div>
              {proposals.length > 1 ? (
                <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1 text-[11px] text-white/45">
                  {proposals.length} lifecycle items
                </span>
              ) : null}
            </div>

            {selectedProposal ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-white/[0.12] bg-slate-900/50 p-3" data-testid="master-thread-proposal">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AgentIcon
                          moduleId={selectedProposal.source === 'nexus' ? 'nexus' : selectedProposal.source}
                          withBackground
                          className="h-8 w-8 rounded-xl"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/90">{selectedProposal.title}</p>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/42">
                            {getModuleLabel(selectedProposal.source)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-white/58">{selectedProposal.summary}</p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ring-1',
                        PROPOSAL_STYLES[selectedProposal.lifecycle],
                      )}
                    >
                      {LIFECYCLE_LABELS[selectedProposal.lifecycle]}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] px-2.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Execution</p>
                      <p className="mt-1 text-xs text-white/70">{titleCaseStatus(selectedProposal.executionMode)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] px-2.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">History</p>
                      <p className="mt-1 text-xs text-white/70">{titleCaseStatus(selectedProposal.historyMode)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.12] bg-white/[0.045] px-2.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Disposition</p>
                      <p className="mt-1 text-xs text-white/70">{DISPOSITION_LABELS[selectedProposal.runtimeDisposition]}</p>
                    </div>
                    <div
                      className={cn(
                        'rounded-xl border px-2.5 py-2',
                        selectedProposal.approvalRequirement.required
                          ? 'border-amber-500/20 bg-amber-500/[0.06]'
                          : 'border-white/[0.12] bg-white/[0.045]',
                      )}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Approval</p>
                      <p className={cn(
                        'mt-1 text-xs',
                        selectedProposal.approvalRequirement.required ? 'text-amber-300' : 'text-white/70',
                      )}>
                        {selectedProposal.approvalRequirement.required
                          ? `Approval: ${titleCaseStatus(selectedProposal.approvalRequirement.reason)}`
                          : 'No additional approval gate'}
                      </p>
                    </div>
                  </div>

                  {isEditingSelectedProposal && selectedProposal && canEditSelectedProposal ? (
                    <div className="mt-3 space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3" data-testid="master-thread-inline-edit">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/75">
                        <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        Inline edit
                      </div>
                      {selectedProposal.editableFields.includes('target') ? (
                        <label className="block space-y-1 text-[11px] text-white/65">
                          <span className="font-semibold uppercase tracking-[0.14em] text-white/45">Target module</span>
                          <select
                            className="w-full rounded-lg border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/40"
                            value={editTargetModuleId}
                            onChange={(event) => setEditTargetModuleId(event.target.value as ModuleId)}
                            aria-label="Target module"
                          >
                            <option value="" disabled>
                              Select a module
                            </option>
                            {editableTargetModules.map((moduleId) => (
                              <option key={moduleId} value={moduleId}>
                                {getModuleLabel(moduleId)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {selectedProposal.editableFields.includes('reason') ? (
                        <label className="block space-y-1 text-[11px] text-white/65">
                          <span className="font-semibold uppercase tracking-[0.14em] text-white/45">Routing reason</span>
                          <textarea
                            className="min-h-[76px] w-full rounded-lg border border-white/[0.12] bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/40"
                            value={editReason}
                            onChange={(event) => setEditReason(event.target.value)}
                            aria-label="Routing reason"
                          />
                        </label>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.08]"
                          onClick={handleEditCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/15"
                          onClick={handleEditSave}
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-1.5 text-[11px] text-white/45">
                      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
                      <span>
                        {selectedProposal.origin === 'runtime'
                          ? 'Runtime proposals reflect execution history and remain inspect-only in the Master Thread.'
                          : selectedProposal.kind === 'routing_suggestion'
                            ? 'Routing suggestions can be approved, deferred, dismissed, or edited inline.'
                            : 'Shell-owned drafts stay synchronized with the current thread state.'}
                      </span>
                    </div>
                    {(canApproveSelectedProposal || canMutateSelectedProposal || canDismissSelectedProposal || canEditSelectedProposal || canRerouteSelectedProposal) ? (
                      <div className="flex flex-wrap gap-2" data-testid="master-thread-proposal-controls">
                        {canApproveSelectedProposal ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-500/15"
                            onClick={handleApprove}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            Approve
                          </button>
                        ) : null}
                        {canMutateSelectedProposal && selectedProposal ? (
                          <button
                            type="button"
                            className="rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.08]"
                            onClick={handleLifecycleToggle}
                          >
                            {selectedProposal.lifecycle === 'draft' ? 'Defer' : 'Restore'}
                          </button>
                        ) : null}
                        {canRerouteSelectedProposal ? (
                          <button
                            type="button"
                            className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/[0.12]"
                            onClick={() => setIsEditingSelectedProposal(true)}
                          >
                            Reroute
                          </button>
                        ) : null}
                        {canEditSelectedProposal ? (
                          <button
                            type="button"
                            className="rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.08]"
                            onClick={() => setIsEditingSelectedProposal(true)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDismissSelectedProposal ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-500/15"
                            onClick={handleDismiss}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Dismiss
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                {proposals.length > 1 ? (
                  <div className="space-y-2" data-testid="master-thread-proposal-list">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Lifecycle queue
                    </p>
                    <div className="grid gap-2">
                      {proposals.map((proposal) => {
                        const isSelected = proposal.id === selectedProposal.id;
                        return (
                          <button
                            key={proposal.id}
                            type="button"
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                              isSelected
                                ? 'border-cyan-500/30 bg-cyan-500/10'
                                : 'border-white/[0.12] bg-white/[0.045] hover:bg-white/[0.05]',
                            )}
                            onClick={() => setSelectedProposalId(proposal.id)}
                          >
                            <AgentIcon
                              moduleId={proposal.source === 'nexus' ? 'nexus' : proposal.source}
                              withBackground
                              className={cn(
                                'h-8 w-8 rounded-xl',
                                isSelected ? 'border-cyan-400/25' : undefined,
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-semibold text-white/85">{proposal.title}</p>
                                <span className="text-[11px] text-white/40">{getModuleLabel(proposal.source)}</span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-white/45">{proposal.summary}</p>
                            </div>
                            <span
                              className={cn(
                                'ml-1 inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ring-1',
                                PROPOSAL_STYLES[proposal.lifecycle],
                              )}
                            >
                              {LIFECYCLE_LABELS[proposal.lifecycle]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.045] px-3 py-3 text-xs text-white/45"
                data-testid="master-thread-no-proposal"
              >
                No active proposal in the thread.
              </div>
            )}
          </div>
        </div>
      </div>

      <SilentAuditDetailModal
        entry={selectedSilentHistoryEntry}
        open={selectedSilentHistoryEntry !== null}
        onClose={() => setSelectedSilentHistoryId(null)}
      />
    </section>
  );
}
