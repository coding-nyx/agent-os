import type React from 'react';
import { BookOpen, FileText, History, Loader2, Search, Sparkles, Zap } from 'lucide-react';
import { getActionLabel } from '@/lib/actions/action-labels';
import { ChatInterface } from '@/core/components/ChatInterface';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { GuestQuota, Message } from '@/lib/types';
import type { AddSourceInput } from '../services/scout-sources-service';
import type { ResearchSession, ScoutKnowledgeNode, SourceEntry } from '../types';

interface ActiveResearchWorkspaceProps {
  session: ResearchSession;
  encryptionKey: CryptoKey | null;
  onStartDeepResearch: (query: string) => void;
  onSendMessage: (text: string) => void;
  onUpdateSession: (id: string, patch: Partial<ResearchSession>) => Promise<void>;
  onAddSource: (input: AddSourceInput) => Promise<any>;
  knowledgeNodes: ScoutKnowledgeNode[];
  sources: SourceEntry[];
  messages: Message[];
  isProcessing: boolean;
  aiState?: {
    isThinking: boolean;
    isActing: boolean;
    currentActionType: string | null;
  };
  streamingText: string;
  error: string | null;
  quota: GuestQuota | null;
  artifactsMode?: 'hidden' | 'sheet' | 'docked';
  artifactsPanel?: React.ReactNode;
  onToggleArtifacts?: () => void;
}

const ACTIVE_SESSION_STATUSES = new Set<ResearchSession['status']>([
  'decomposing',
  'searching',
  'synthesizing',
]);

export function ActiveResearchWorkspace({
  session,
  onStartDeepResearch,
  onSendMessage,
  knowledgeNodes,
  sources,
  messages,
  isProcessing,
  aiState,
  streamingText,
  error,
  quota,
  artifactsMode = 'hidden',
  artifactsPanel,
  onToggleArtifacts,
}: ActiveResearchWorkspaceProps) {
  const visibleStreamingText = (streamingText || '').trim();
  const hasVisibleStream = visibleStreamingText.length > 0;
  const transientStreamMessage = hasVisibleStream
    ? [{ role: 'assistant' as const, content: visibleStreamingText }]
    : [];
  const renderedMessages = [...(messages || []), ...transientStreamMessage];

  const msgArray = messages || [];
  const isInitialThinking =
    (msgArray.length === 0 || msgArray[msgArray.length - 1]?.role === 'user') && !hasVisibleStream;
  const isActuallyThinking = isProcessing && (isInitialThinking || !!aiState?.isActing);
  const isSyncing = isProcessing && !hasVisibleStream && !isActuallyThinking;
  const isArtifactsVisible = artifactsMode !== 'hidden';
  const isSessionActive = ACTIVE_SESSION_STATUSES.has(session.status);
  const statusLabel = session.status === 'complete' ? 'Synthesized' : isSessionActive ? 'In progress' : 'Ready';
  const sessionNodes = knowledgeNodes.filter((node) => node.parentSessionId === session.id);
  const sessionSources = sources.filter((source) =>
    source.citingNodeIds?.some((id) => sessionNodes.some((node) => node.id === id))
  );
  const completedSubQuestions = session.subQuestions.filter((question) => question.status === 'completed').length;
  const inFlightSubQuestions = session.subQuestions.filter((question) =>
    ['searching', 'approved', 'pending'].includes(question.status)
  ).length;
  const artifactsCount = sessionNodes.length + sessionSources.length;
  const artifactsLabel = isArtifactsVisible ? 'Hide artifacts' : 'Show artifacts';

  const activity = (() => {
    if (hasVisibleStream) {
      return {
        label: 'Drafting response',
        detail: 'Scout is turning the latest research into a shareable answer.',
        tone: 'violet' as const,
        isWorking: true,
      };
    }

    if (aiState?.isActing) {
      return {
        label: getActionLabel(aiState.currentActionType || 'action'),
        detail: 'Scout is actively working through the current research task.',
        tone: 'lime' as const,
        isWorking: true,
      };
    }

    switch (session.status) {
      case 'decomposing':
        return {
          label: 'Planning research',
          detail: 'Breaking the topic into focused threads before searching.',
          tone: 'lime' as const,
          isWorking: isProcessing,
        };
      case 'searching':
        return {
          label: 'Searching sources',
          detail: 'Gathering evidence and comparing external material.',
          tone: 'lime' as const,
          isWorking: isProcessing,
        };
      case 'synthesizing':
        return {
          label: 'Synthesizing findings',
          detail: 'Connecting evidence into a clearer conclusion.',
          tone: 'violet' as const,
          isWorking: isProcessing,
        };
      case 'awaiting_review':
        return {
          label: 'Awaiting review',
          detail: 'Scout paused on a checkpoint and is ready for your direction.',
          tone: 'amber' as const,
          isWorking: false,
        };
      case 'complete':
        return {
          label: 'Workspace ready',
          detail: 'Research is synthesized and ready for follow-up questions.',
          tone: 'emerald' as const,
          isWorking: false,
        };
      case 'error':
        return {
          label: 'Research interrupted',
          detail: 'Review the thread and retry when you are ready.',
          tone: 'rose' as const,
          isWorking: false,
        };
      default:
        return {
          label: 'Ready for the next step',
          detail: 'Use the thread below to steer Scout or launch deeper research.',
          tone: 'slate' as const,
          isWorking: false,
        };
    }
  })();

  const activityToneClasses = {
    lime: 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
    violet: 'border-violet-500/20 bg-violet-500/[0.12] text-violet-200',
    amber: 'border-amber-500/20 bg-amber-500/[0.12] text-amber-200',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.12] text-emerald-200',
    rose: 'border-rose-500/20 bg-rose-500/[0.12] text-rose-200',
    slate: 'border-white/[0.09] bg-white/[0.045] text-white/80',
  } satisfies Record<typeof activity.tone, string>;

  const artifactsModeLabel =
    artifactsMode === 'docked'
      ? 'Docked beside the workspace'
      : artifactsMode === 'sheet'
        ? 'Opened as a mobile sheet'
        : 'Hidden until you need them';

  return (
    <section className="surface-foundation-raised flex h-full min-h-[32rem] min-w-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/[0.09] bg-white/[0.045] px-4 py-4 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)] shadow-[0_0_30px_var(--module-accent-faint)]">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-panel-heading truncate text-white">{session.topic}</h2>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                      session.status === 'complete'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        : 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)]'
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-body-secondary">
                  Keep the active inquiry, evidence trail, and follow-up prompts in one clear workspace.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-white/45">
              <span>
                Updated{' '}
                {new Date(session.updatedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              <span>
                {session.subQuestions.length} sub-question{session.subQuestions.length === 1 ? '' : 's'} tracked
              </span>
              <span className="flex items-center gap-1.5 text-white/55">
                <Sparkles className="h-3.5 w-3.5 text-[var(--module-color-300)]" aria-hidden="true" />
                {activity.label}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 xl:max-w-[20rem] xl:justify-end">
            {onToggleArtifacts && (
              <NeuralButton
                type="button"
                onClick={onToggleArtifacts}
                variant={isArtifactsVisible ? 'secondary' : 'ghost'}
                size="sm"
                className="min-h-11"
                aria-pressed={isArtifactsVisible}
              >
                <History className="h-4 w-4" aria-hidden="true" />
                <span>{artifactsLabel}</span>
              </NeuralButton>
            )}
            <NeuralButton
              type="button"
              onClick={() => onStartDeepResearch(session.topic)}
              themeColor="indigo"
              size="sm"
              className="min-h-11 bg-indigo-500/10 border-indigo-500/20 text-indigo-200 hover:bg-indigo-500/20"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              <span>Deep research</span>
            </NeuralButton>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-3 sm:p-4 lg:p-5">
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
          <article
            className={cn(
              'min-w-[min(16rem,80vw)] snap-start rounded-3xl border p-4 lg:min-w-0',
              activityToneClasses[activity.tone],
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-current/15 bg-black/10">
                {activity.isWorking ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : activity.tone === 'emerald' ? (
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                ) : activity.tone === 'violet' ? (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                ) : activity.tone === 'lime' ? (
                  <Search className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <History className="h-4 w-4" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-chip-soft text-current/75">Current activity</p>
                <h3 className="mt-1 text-[14px] font-semibold text-white">{activity.label}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-white/70">{activity.detail}</p>
              </div>
            </div>
          </article>

          <article className="min-w-[16rem] snap-start rounded-3xl border border-white/[0.09] bg-white/[0.045] p-4 lg:min-w-0">
            <p className="text-chip-soft text-white/45">Research map</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[24px] font-semibold tracking-tight text-white">{session.subQuestions.length}</p>
                <p className="text-[12px] text-white/55">Tracked paths in this session</p>
              </div>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                {completedSubQuestions} complete
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/[0.09] bg-slate-900/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">In flight</p>
                <p className="mt-1 text-[16px] font-semibold text-white">{inFlightSubQuestions}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.09] bg-slate-900/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Ready</p>
                <p className="mt-1 text-[16px] font-semibold text-white">
                  {Math.max(session.subQuestions.length - inFlightSubQuestions, 0)}
                </p>
              </div>
            </div>
          </article>

          <article className="min-w-[16rem] snap-start rounded-3xl border border-white/[0.09] bg-white/[0.045] p-4 lg:min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-chip-soft text-white/45">Artifacts</p>
                <h3 className="mt-1 text-[14px] font-semibold text-white">{artifactsCount} linked items</h3>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.12] bg-slate-900/50 text-white/65">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-white/60">{artifactsModeLabel}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
              <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 py-1">
                {sessionNodes.length} findings
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 py-1">
                {sessionSources.length} sources
              </span>
            </div>
          </article>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-white/[0.015] lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {(error || isSyncing || (isSessionActive && !hasVisibleStream)) && (
              <div
                className={cn(
                  'shrink-0 border-b px-4 py-3 text-[12px] sm:px-5',
                  error
                    ? 'border-rose-500/15 bg-rose-500/[0.08] text-rose-200'
                    : 'border-white/[0.09] bg-white/[0.045] text-white/65',
                )}
                aria-live="polite"
              >
                <div className="flex items-center gap-2">
                  {error ? (
                    <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--module-color-300)]" aria-hidden="true" />
                  )}
                  <span>
                    {error
                      ? error
                      : isSyncing
                        ? 'Scout is syncing the current thread before the next visible update.'
                        : activity.detail}
                  </span>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden bg-white/[0.045]">
              <ChatInterface
                messages={renderedMessages}
                onSendMessage={onSendMessage}
                isLoading={isActuallyThinking}
                isSyncing={isSyncing}
                isProcessing={isProcessing}
                aiState={aiState}
                themeColor="lime"
                agentName="Scout"
                placeholder="Direct Scout's attention..."
                error={error}
                quota={quota ?? undefined}
                moduleId="scout"
                showInternalSignals={false}
              />
            </div>
          </div>

          {artifactsMode === 'docked' && artifactsPanel && (
            <aside className="min-h-0 w-full shrink-0 border-t border-white/[0.09] bg-white/[0.045] lg:w-[22rem] lg:border-l lg:border-t-0 xl:w-[24rem]">
              <div className="h-full min-h-[22rem] p-3 sm:p-4">{artifactsPanel}</div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
