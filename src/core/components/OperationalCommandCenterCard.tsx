import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Archive, ChevronDown, ChevronUp, Radar, ShieldAlert } from 'lucide-react';
import type { OrchestrationTurnRuntimeSummary, SilentHistoryEntry } from '@/lib/contracts/orchestration';
import type { NexusDataLayer } from '@/lib/data-layer';
import { ModuleIcon } from '@/core/components/ModuleIcon';
import { cn } from '@/lib/utils';
import { OrchestrationExecutionService } from '@/lib/services/orchestration-execution-service';
import { OrchestrationCommandCenterService, type CommandCenterQueueItem } from '@/lib/services/orchestration-command-center-service';
import { OrchestrationOperatingModeService } from '@/lib/services/orchestration-operating-mode-service';
import type { PersistedExecutionFailureRecord } from '@/lib/services/orchestration-persistence-service';

const QUEUE_STYLES = {
  approval: {
    icon: ArrowRightLeft,
    frame: 'border-amber-500/20 bg-amber-500/[0.08]',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    text: 'text-amber-200',
    empty: 'No approvals waiting',
  },
  incident: {
    icon: ShieldAlert,
    frame: 'border-rose-500/20 bg-rose-500/[0.08]',
    badge: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
    text: 'text-rose-200',
    empty: 'No incidents detected',
  },
  debt: {
    icon: AlertTriangle,
    frame: 'border-violet-500/20 bg-violet-500/[0.08]',
    badge: 'border-violet-500/20 bg-violet-500/10 text-violet-200',
    text: 'text-violet-200',
    empty: 'No retry debt',
  },
  audit: {
    icon: Archive,
    frame: 'border-cyan-500/20 bg-cyan-500/[0.08]',
    badge: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
    text: 'text-cyan-200',
    empty: 'No silent audit items',
  },
} as const;

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Pending';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function QueueColumn({
  label,
  count,
  items,
  kind,
}: {
  label: string;
  count: number;
  items: CommandCenterQueueItem[];
  kind: keyof typeof QUEUE_STYLES;
}) {
  const config = QUEUE_STYLES[kind];
  const Icon = config.icon;

  return (
    <section className={cn('rounded-2xl border p-3', config.frame)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl border', config.badge)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
            <p className={cn('text-sm font-semibold', config.text)}>{count}</p>
          </div>
        </div>
        <span className={cn('rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]', config.badge)}>
          Queue
        </span>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/[0.09] bg-slate-900/50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2.5">
                  <ModuleIcon source={item.source as Parameters<typeof ModuleIcon>[0]['source']} withBackground className="mt-0.5 h-7 w-7 rounded-lg" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-white/52">{item.summary}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {item.emphasis ? (
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', config.text)}>{item.emphasis}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-white/35">{formatTimestamp(item.timestamp)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.045] px-3 py-4 text-[11px] text-white/38">
          {config.empty}
        </div>
      )}
    </section>
  );
}

interface OperationalCommandCenterCardProps {
  runtimeSummary?: OrchestrationTurnRuntimeSummary | null;
  silentHistoryEntries?: SilentHistoryEntry[];
  userId?: string;
  isGuest?: boolean;
  dataLayer: NexusDataLayer;
  active?: boolean;
  className?: string;
}

export function OperationalCommandCenterCard({
  runtimeSummary = null,
  silentHistoryEntries = [],
  userId,
  isGuest = false,
  dataLayer,
  active = true,
  className,
}: OperationalCommandCenterCardProps) {
  const [failures, setFailures] = useState<PersistedExecutionFailureRecord[]>([]);
  const [isLoadingFailures, setIsLoadingFailures] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!active || !userId || isGuest) {
      setFailures([]);
      setIsLoadingFailures(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingFailures(true);
    void OrchestrationExecutionService.listFailures(userId, { limit: 18 }, dataLayer)
      .then((records) => {
        if (!cancelled) {
          setFailures(records);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[OperationalCommandCenterCard] Failed to load orchestration failures:', error);
          setFailures([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFailures(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, dataLayer, isGuest, userId]);

  const snapshot = useMemo(() => OrchestrationCommandCenterService.buildSnapshot({
    runtimeSummary,
    silentHistoryEntries,
    failures,
    queueLimit: 3,
  }), [failures, runtimeSummary, silentHistoryEntries]);
  const modeSemantics = useMemo(() => OrchestrationOperatingModeService.derive({
    autopilotLevel: runtimeSummary?.autopilotLevel ?? null,
    historyMode: runtimeSummary?.historyMode ?? null,
    autonomy: runtimeSummary?.actions[0]?.runtime.autonomy ?? null,
    isGuest,
    awaitingApprovalCount: snapshot.approvals.count,
    failedCount: snapshot.incidents.count,
    escalatedCount: failures.filter((failure) => failure.status === 'escalated').length,
  }), [failures, isGuest, runtimeSummary, snapshot.approvals.count, snapshot.incidents.count]);

  return (
    <section
      className={cn(
        'rounded-[24px] border border-white/[0.12] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_28%),linear-gradient(180deg,rgba(7,10,18,0.95),rgba(2,4,8,0.92))] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.32)]',
        className,
      )}
      aria-label="Operational command center"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-200">
              <Radar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200/80">Operational command center</p>
              <p className="truncate text-[11px] text-white/48">{modeSemantics.summaryLabel} · {snapshot.attentionCount} active attention points</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.045] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.07]"
          aria-label={isExpanded ? 'Collapse command center queues' : 'Expand command center queues'}
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Collapse queues' : 'Expand queues'}
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1 text-[11px] text-white/70">
          {modeSemantics.levelLabel}
        </span>
        {modeSemantics.chips.slice(1).map((chip) => (
          <span key={chip.id} className={cn('rounded-full border px-2 py-1 text-[11px]', chip.tone)}>
            {chip.label}
          </span>
        ))}
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {snapshot.approvals.count} approvals
        </span>
        <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
          {snapshot.incidents.count} incidents
        </span>
        <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200">
          {snapshot.debt.count} debt
        </span>
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
          {snapshot.audit.count} audit
        </span>
      </div>

      {isLoadingFailures ? (
        <div className="mt-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] px-3 py-2 text-[11px] text-cyan-100/80">
          Syncing failure queues and retry debt…
        </div>
      ) : null}

      {isExpanded ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          <QueueColumn label="Approval queue" count={snapshot.approvals.count} items={snapshot.approvals.items} kind="approval" />
          <QueueColumn label="Incident queue" count={snapshot.incidents.count} items={snapshot.incidents.items} kind="incident" />
          <QueueColumn label="System debt" count={snapshot.debt.count} items={snapshot.debt.items} kind="debt" />
          <QueueColumn label="Silent audit" count={snapshot.audit.count} items={snapshot.audit.items} kind="audit" />
        </div>
      ) : null}
    </section>
  );
}
