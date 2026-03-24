import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Command, Search, Sparkles, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DocumentPipelineStage } from '@/lib/services/document-pipeline';
import type { ModuleId } from '@/lib/module-manifest';
import type { NexusDataLayer } from '@/lib/data-layer';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import type { UnifiedMemoryResult } from '@/lib/types';
import type { MasterThreadShellSnapshot } from '@/lib/services/master-thread-service';
import type { SilentHistoryEntry, ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import type { AliveEntityRuntimeContext, AliveEntityRuntimeReference } from '@/lib/contracts/orchestration';
import type { ThreadPlanningSuggestionDraft, ThreadRoutingSuggestionDraft } from '@/lib/stores/orchestration-store';
import { SynthesisPanel } from './SynthesisPanel';
import { MemorySearchResults } from './MemorySearchResults';
import { AliveEntityInputPanel } from './AliveEntityInputPanel';
import { NexusErrorBoundary } from './NexusErrorBoundary';
import { OperationalCommandCenterCard } from '@/core/components/OperationalCommandCenterCard';
import { MasterThreadStatusCard } from '@/core/components/MasterThreadStatusCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NexusAgentPresenceStack } from '@/core/components/NexusAgentPresenceStack';
import { OrchestrationStatusChip } from '@/core/components/OrchestrationStatusChip';
import { openNexusCommandPalette } from '../hooks/useCommandPalette';

function OpsSection({
  title,
  description,
  badge,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  description: string;
  badge?: string | null;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0b0f16]/88 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/82">{title}</p>
            {badge ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/52">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-white/45">{description}</p>
        </div>
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/55">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
      {isOpen ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

interface NexusOperationsWorkspaceProps {
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: GuestQuota | null;
    handleSendMessage: (
      content: MessageContent,
      onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent }
    ) => Promise<void>;
    clearSession: () => Promise<void>;
  };
  currentThreadId: string;
  isGuest: boolean;
  userId?: string;
  dataLayer: NexusDataLayer;
  isNexusBusy: boolean;
  busyLabel: string;
  threadMonitorVisible: boolean;
  setThreadMonitorVisible: (updater: (visible: boolean) => boolean) => void;
  masterThreadSnapshot: MasterThreadShellSnapshot;
  silentHistoryEntries: SilentHistoryEntry[];
  routingSuggestion: ThreadRoutingSuggestionDraft | null;
  planningSuggestion: ThreadPlanningSuggestionDraft | null;
  routineProposalLabel?: string | null;
  pendingTargets: string[];
  memorySearchState: {
    query: string;
    results: UnifiedMemoryResult[];
    isSearching: boolean;
  } | null;
  aliveEntityState: {
    context: AliveEntityRuntimeContext | null;
    isLoading: boolean;
  };
  refreshGlobalSoul: () => void;
  handleInjectChat: (text: string) => void;
  handleConsultModule: (moduleId: string, question?: string) => void;
  handleMemoryResultClick: (result: UnifiedMemoryResult) => void;
  handleDismissMemoryResults: () => void;
  handleAliveEntitySelect: (entity: AliveEntityRuntimeReference) => void;
  handleThreadProposalLifecycleChange: (proposalId: string, nextLifecycle: 'draft' | 'deferred') => void;
  handleRouteConfirm: (proposalKind?: string, proposalId?: string) => void;
  handleRouteDismiss: (proposalKind?: string, proposalId?: string) => void;
  handleThreadProposalEdit: (draft: { targetModuleId?: ModuleId; reason?: string }) => void;
  handleExecutionRetry: (artifact: ThreadExecutionArtifact) => void;
}

export function NexusOperationsWorkspace({
  ai,
  currentThreadId,
  isGuest,
  userId,
  dataLayer,
  isNexusBusy,
  busyLabel,
  threadMonitorVisible,
  setThreadMonitorVisible,
  masterThreadSnapshot,
  silentHistoryEntries,
  routingSuggestion,
  planningSuggestion,
  routineProposalLabel = null,
  pendingTargets,
  memorySearchState,
  aliveEntityState,
  refreshGlobalSoul,
  handleInjectChat,
  handleConsultModule,
  handleMemoryResultClick,
  handleDismissMemoryResults,
  handleAliveEntitySelect,
  handleThreadProposalLifecycleChange,
  handleRouteConfirm,
  handleRouteDismiss,
  handleThreadProposalEdit,
  handleExecutionRetry,
}: NexusOperationsWorkspaceProps) {
  const navigate = useNavigate();
  const participantCount = masterThreadSnapshot.thread.participants.length;
  const proposalCount = masterThreadSnapshot.proposals.length;
  const pendingCount = pendingTargets.length;
  const activeSuggestionCount = Number(Boolean(routingSuggestion)) + Number(Boolean(planningSuggestion)) + Number(Boolean(routineProposalLabel));
  const hasMemoryResults = Boolean(memorySearchState);
  const statusLabel = isNexusBusy ? busyLabel : 'Utilities, review flows, and diagnostics';
  const topStats = useMemo(
    () => [
      { label: 'Thread', value: currentThreadId.split('.').slice(-1)[0] || currentThreadId },
      { label: 'Participants', value: String(participantCount) },
      { label: 'Pending', value: String(pendingCount) },
      { label: 'Proposals', value: String(proposalCount) },
      { label: 'Signals', value: String(activeSuggestionCount) },
    ],
    [activeSuggestionCount, currentThreadId, participantCount, pendingCount, proposalCount],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-8 pt-3 sm:px-5 sm:pt-5"
        data-testid="nexus-ops-scroll-region"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="rounded-[24px] border border-white/10 bg-[#0b0f16]/92 px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.2)] sm:px-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Nexus operations</p>
                  <p className="mt-2 max-w-2xl text-sm text-white/55">
                    Thread review, memory utilities, alive inputs, and execution queues.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <NeuralButton
                    type="button"
                    variant="ghost"
                    onClick={() => navigate('/nexus')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-white/78 hover:bg-white/[0.08] h-auto"
                    aria-label="Return to Nexus chat"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="font-semibold uppercase tracking-[0.16em]">Back to chat</span>
                  </NeuralButton>
                  <NeuralButton
                    type="button"
                    variant="ghost"
                    onClick={() => openNexusCommandPalette()}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[11px] text-cyan-100 hover:bg-cyan-300/14 h-auto"
                    aria-label="Open Nexus command palette"
                  >
                    <Command className="h-4 w-4" />
                    <span className="font-semibold uppercase tracking-[0.16em]">Command</span>
                  </NeuralButton>
                  <NeuralButton
                    type="button"
                    variant="ghost"
                    onClick={() => ai.clearSession()}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-white/70 hover:bg-white/[0.08] h-auto"
                    aria-label="Clear Nexus chat"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="font-semibold uppercase tracking-[0.16em]">Clear chat</span>
                  </NeuralButton>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <NexusAgentPresenceStack participants={masterThreadSnapshot.thread.participants} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <OrchestrationStatusChip compact variant="minimal" />
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    isNexusBusy
                      ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                  }`}>
                    {statusLabel}
                  </span>
                  {topStats.map((item) => (
                    <span
                      key={item.label}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60"
                    >
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <OpsSection
            title="Thread review"
            description="Participant timeline, active proposals, and execution context."
            badge={threadMonitorVisible ? 'Expanded' : 'Hidden in shell'}
            defaultOpen
            actions={(
              <NeuralButton
                type="button"
                variant="ghost"
                onClick={() => setThreadMonitorVisible((visible) => !visible)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-white/68 hover:bg-white/[0.08] h-auto"
              >
                <Workflow className="h-4 w-4" />
                <span className="font-semibold uppercase tracking-[0.16em]">
                  {threadMonitorVisible ? 'Hide thread monitor' : 'Show thread monitor'}
                </span>
              </NeuralButton>
            )}
          >
            {threadMonitorVisible ? (
              <MasterThreadStatusCard
                thread={masterThreadSnapshot.thread}
                proposalCard={masterThreadSnapshot.proposalCard}
                proposalEntries={masterThreadSnapshot.proposals}
                runtimeSummary={masterThreadSnapshot.runtimeSummary}
                silentHistoryEntries={silentHistoryEntries}
                onProposalLifecycleChange={handleThreadProposalLifecycleChange}
                proposalActions={{
                  onApprove: (proposal) => handleRouteConfirm(proposal.kind, proposal.proposalId),
                  onDismiss: (proposal) => handleRouteDismiss(proposal.kind, proposal.proposalId),
                  onEdit: (_, draft) => handleThreadProposalEdit(draft),
                }}
                onRetryExecution={handleExecutionRetry}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/45">
                Thread review is currently hidden in the shell state. Re-open it from command if you need the full thread monitor.
              </div>
            )}
          </OpsSection>

          <OpsSection
            title="Cross-domain analysis"
            description="Synthesis actions and module-level investigative prompts."
            badge={activeSuggestionCount > 0 ? `${activeSuggestionCount} active signals` : null}
            defaultOpen={false}
            actions={(
              <NeuralButton
                type="button"
                variant="ghost"
                onClick={() => refreshGlobalSoul()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.05] text-[11px] text-white/68 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors h-auto"
                aria-label="Refresh synthesis"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="font-semibold uppercase tracking-[0.16em]">Refresh synthesis</span>
              </NeuralButton>
            )}
          >
            <NexusErrorBoundary name="SynthesisPanel">
              <SynthesisPanel
                onInjectChat={handleInjectChat}
                onConsultModule={handleConsultModule}
                onNavigate={(path) => navigate(path)}
              />
            </NexusErrorBoundary>
          </OpsSection>

          <OpsSection
            title="Memory search"
            description="Search results injected from command palette queries."
            badge={hasMemoryResults ? `${memorySearchState?.results.length ?? 0} results` : 'Awaiting query'}
            defaultOpen
          >
            {memorySearchState ? (
              <MemorySearchResults
                query={memorySearchState.query}
                results={memorySearchState.results}
                isSearching={memorySearchState.isSearching}
                onResultClick={handleMemoryResultClick}
                onDismiss={handleDismissMemoryResults}
              />
            ) : (
              <button
                type="button"
                onClick={() => openNexusCommandPalette('Search my memory: ')}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-left transition-colors hover:border-cyan-400/20 hover:bg-cyan-400/[0.04]"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">No memory search active</p>
                  <p className="mt-1 text-sm text-white/42">Open the command palette and run a memory query to populate this section.</p>
                </div>
                <Search className="h-4 w-4 shrink-0 text-white/35" />
              </button>
            )}
          </OpsSection>

          <OpsSection
            title="Alive inputs"
            description="Structured context you can inject back into Nexus chat."
            badge={aliveEntityState.isLoading ? 'Loading' : 'Ready'}
            defaultOpen
          >
            <AliveEntityInputPanel
              context={aliveEntityState.context}
              isLoading={aliveEntityState.isLoading}
              onEntitySelected={handleAliveEntitySelect}
            />
          </OpsSection>

          <OpsSection
            title="Execution queues"
            description="Approvals, incidents, retry debt, and silent audit traces."
            badge={silentHistoryEntries.length > 0 ? `${silentHistoryEntries.length} audit entries` : null}
            defaultOpen={false}
          >
            <OperationalCommandCenterCard
              runtimeSummary={masterThreadSnapshot.runtimeSummary}
              silentHistoryEntries={silentHistoryEntries}
              userId={userId}
              isGuest={isGuest}
              dataLayer={dataLayer}
            />
          </OpsSection>
        </div>
      </div>
    </div>
  );
}
