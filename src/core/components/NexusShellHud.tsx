import { ActivitySquare, ArrowRightLeft, Bot, Gauge, ShieldAlert, Sparkles } from 'lucide-react';
import type { OrchestrationTurnRuntimeSummary, ThreadParticipant } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { OrchestrationOperatingModeService } from '@/lib/services/orchestration-operating-mode-service';
import type {
  ThreadPlanningSuggestionDraft,
  ThreadRoutingSuggestionDraft,
} from '@/lib/stores/orchestration-store';
import type { NexusShellQuickAction } from '@/modules/nexus/hooks/useCommandPalette';
import { cn } from '@/lib/utils';
import { ModuleIcon } from './ModuleIcon';
import { NexusAgentPresenceStack } from './NexusAgentPresenceStack';
import { OrchestrationStatusChip } from './OrchestrationStatusChip';

interface NexusShellHudProps {
  activeThreadId: string;
  runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
  participants?: ThreadParticipant[];
  routingSuggestion?: ThreadRoutingSuggestionDraft | null;
  planningSuggestion?: ThreadPlanningSuggestionDraft | null;
  routineProposalLabel?: string | null;
  pendingTargets?: string[];
  busyLabel?: string | null;
  isBusy?: boolean;
  isGuest?: boolean;
  quickActions?: NexusShellQuickAction[];
  className?: string;
}

interface NexusCommandRailProps {
  actions: NexusShellQuickAction[];
  className?: string;
}

function formatThreadLabel(threadId: string) {
  if (threadId === 'nexus.dashboard') return 'Primary shell';
  const normalized = threadId
    .split(/[./]/)
    .filter(Boolean)
    .slice(-2)
    .join(' · ');
  return normalized.replace(/[-_]/g, ' ') || threadId;
}

function getStateIndicator(props: Pick<
  NexusShellHudProps,
  'routingSuggestion' | 'planningSuggestion' | 'routineProposalLabel' | 'pendingTargets' | 'runtimeSummary' | 'isBusy' | 'busyLabel'
>) {
  if (props.routingSuggestion?.state === 'draft') {
    const targetLabel = MODULE_MANIFEST[props.routingSuggestion.target]?.alias ?? props.routingSuggestion.target;
    return {
      label: `Route · ${targetLabel}`,
      tone: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
    };
  }

  if (props.planningSuggestion?.state === 'draft') {
    const targetLabel = props.planningSuggestion.targetModuleId
      ? MODULE_MANIFEST[props.planningSuggestion.targetModuleId]?.alias ?? props.planningSuggestion.targetModuleId
      : 'Nexus';
    const stepLabel = props.planningSuggestion.nodeCount && props.planningSuggestion.nodeCount > 1
      ? `${props.planningSuggestion.nodeCount} steps`
      : 'prompt ready';
    return {
      label: `Plan · ${stepLabel} via ${targetLabel}`,
      tone: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
    };
  }

  if (props.routineProposalLabel) {
    return {
      label: props.routineProposalLabel,
      tone: 'border-violet-500/20 bg-violet-500/10 text-violet-200',
    };
  }

  if ((props.runtimeSummary?.counts.escalated ?? 0) > 0) {
    return {
      label: `${props.runtimeSummary?.counts.escalated ?? 0} escalated failure${(props.runtimeSummary?.counts.escalated ?? 0) === 1 ? '' : 's'}`,
      tone: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
    };
  }

  if ((props.runtimeSummary?.counts.failed ?? 0) > 0) {
    return {
      label: `${props.runtimeSummary?.counts.failed ?? 0} execution failure${(props.runtimeSummary?.counts.failed ?? 0) === 1 ? '' : 's'}`,
      tone: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
    };
  }

  if ((props.runtimeSummary?.counts.awaitingApproval ?? 0) > 0) {
    return {
      label: `${props.runtimeSummary?.counts.awaitingApproval ?? 0} awaiting approval`,
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    };
  }

  if ((props.pendingTargets?.length ?? 0) > 0) {
    return {
      label: `Waiting · ${props.pendingTargets?.slice(0, 2).join(', ')}`,
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    };
  }

  if (props.isBusy && props.busyLabel) {
    return {
      label: props.busyLabel,
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    };
  }

  return {
    label: 'Shell steady',
    tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  };
}

function getActiveParticipants(participants: ThreadParticipant[]) {
  return participants.filter((participant) =>
    participant.moduleId !== 'nexus' &&
    ['active', 'joined', 'waiting', 'invited'].includes(participant.state),
  );
}

export function NexusCommandRail({ actions, className }: NexusCommandRailProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className={cn('overflow-x-auto pb-1', className)}
      role="toolbar"
      aria-label="Nexus shell quick actions"
      data-testid="nexus-command-rail"
    >
      <div className="flex min-w-max items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.execute}
              disabled={action.isDisabled}
              aria-label={action.ariaLabel ?? action.label}
              aria-pressed={action.id === 'toggle_thread_panel' ? action.isActive : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-medium tracking-[0.08em] transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090e]',
                action.isDisabled
                  ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-white/20'
                  : action.isActive
                    ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                    : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-white/15 hover:bg-white/[0.07] hover:text-white/90',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap uppercase tracking-[0.14em]">{action.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NexusShellHud({
  activeThreadId,
  runtimeSummary = null,
  participants = [],
  routingSuggestion = null,
  planningSuggestion = null,
  routineProposalLabel = null,
  pendingTargets = [],
  busyLabel = null,
  isBusy = false,
  isGuest = false,
  quickActions = [],
  className,
}: NexusShellHudProps) {
  const stateIndicator = getStateIndicator({
    routingSuggestion,
    planningSuggestion,
    routineProposalLabel,
    pendingTargets,
    runtimeSummary,
    isBusy,
    busyLabel,
  });
  const activeParticipants = getActiveParticipants(participants);
  const counts = runtimeSummary?.counts;
  const modeSemantics = OrchestrationOperatingModeService.derive({
    autopilotLevel: runtimeSummary?.autopilotLevel ?? null,
    historyMode: runtimeSummary?.historyMode ?? null,
    autonomy: runtimeSummary?.actions[0]?.runtime.autonomy ?? null,
    isGuest,
    awaitingApprovalCount: counts?.awaitingApproval ?? 0,
    failedCount: counts?.failed ?? 0,
    escalatedCount: counts?.escalated ?? 0,
  });

  const metrics = [
    {
      key: 'visible',
      label: 'Visible',
      value: counts?.visibleExecutions ?? 0,
      tone: 'text-cyan-200',
    },
    {
      key: 'silent',
      label: 'Silent',
      value: counts?.silentExecutions ?? 0,
      tone: 'text-violet-200',
    },
    {
      key: 'awaiting',
      label: 'Awaiting',
      value: counts?.awaitingApproval ?? 0,
      tone: 'text-amber-200',
    },
    {
      key: 'blocked',
      label: 'Blocked',
      value: counts?.blocked ?? 0,
      tone: 'text-rose-200',
    },
  ];

  return (
    <section
      className={cn(
        'rounded-[22px] border border-white/10 bg-[#0a0c12]/90 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_34px_rgba(0,0,0,0.22)]',
        className,
      )}
      aria-label="Nexus shell telemetry"
      data-testid="nexus-shell-hud"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
                <Gauge className="h-3 w-3" aria-hidden />
                Shell HUD
              </span>
              <span className={cn('inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium', stateIndicator.tone)}>
                {stateIndicator.label}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-start gap-2">
              <div className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-2.5 py-2">
                <ModuleIcon
                  source="nexus"
                  withBackground
                  className="h-8 w-8 rounded-xl border-violet-500/20 bg-violet-500/10 text-violet-200"
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Active thread</p>
                  <p className="truncate text-[12px] font-semibold uppercase tracking-[0.14em] text-white/90">
                    {formatThreadLabel(activeThreadId)}
                  </p>
                  <p className="truncate font-mono text-[10px] text-white/38">{modeSemantics.levelLabel} · {activeThreadId}</p>
                </div>
              </div>

              <div className="inline-flex min-w-[170px] flex-1 items-start rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <NexusAgentPresenceStack participants={participants} />
              </div>

              <div className="inline-flex min-w-[150px] flex-1 items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 text-white/45" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Mode + scope</p>
                  <p className="text-[12px] font-semibold text-white/88">
                    {modeSemantics.summaryLabel}
                  </p>
                  <p className="truncate text-[10px] text-white/42">
                    {modeSemantics.scopeLabel} · {modeSemantics.historyLabel} · {modeSemantics.authorityLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <OrchestrationStatusChip compact />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
              data-testid={`nexus-shell-hud-metric-${metric.key}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{metric.label}</span>
                <Bot className="h-3 w-3 text-white/22" aria-hidden />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={cn('text-lg font-semibold leading-none', metric.tone)}>{metric.value}</span>
                <span className="text-[10px] text-white/36">
                  {metric.key === 'awaiting'
                    ? 'approval'
                    : metric.key === 'blocked'
                      ? 'gated'
                      : 'actions'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-white/55">
          <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.16em]">
            <ActivitySquare className="h-3.5 w-3.5 text-cyan-300/70" aria-hidden />
            Runtime
          </span>
          <span>{counts ? `${counts.total} actions last turn` : 'Awaiting runtime summary'}</span>
          {(counts?.analysisOnly ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-sky-200">
              <Sparkles className="h-3 w-3" aria-hidden />
              {counts?.analysisOnly} analysis-only
            </span>
          ) : null}
          {(counts?.ephemeral ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-white/70">
              {counts?.ephemeral} ephemeral
            </span>
          ) : null}
          {(counts?.failed ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {counts?.failed} failure{(counts?.failed ?? 0) === 1 ? '' : 's'}
            </span>
          ) : null}
          {(counts?.escalated ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/12 px-2 py-0.5 text-rose-100">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {counts?.escalated} escalated
            </span>
          ) : null}
          {routingSuggestion?.state === 'draft' || planningSuggestion?.state === 'draft' || routineProposalLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              Proposal attention available
            </span>
          ) : null}
          {modeSemantics.chips.map((chip) => (
            <span
              key={chip.id}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', chip.tone)}
            >
              {chip.label}
            </span>
          ))}
        </div>

        <NexusCommandRail actions={quickActions} />
      </div>
    </section>
  );
}
