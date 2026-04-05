import * as Dialog from '@radix-ui/react-dialog';
import { Ghost, ScrollText, X } from 'lucide-react';
import type { SilentHistoryEntry } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { cn } from '@/lib/utils';

interface SilentAuditDetailModalProps {
  entry: SilentHistoryEntry | null;
  open: boolean;
  onClose: () => void;
}

function getModuleLabel(source: SilentHistoryEntry['source']): string {
  return MODULE_MANIFEST[source]?.alias ?? 'Nyx';
}

function formatTimestamp(value: string): string {
  if (!value.includes('T')) return value;
  return value.slice(0, 16).replace('T', ' ');
}

function getMetadataString(entry: SilentHistoryEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getMetadataNumber(entry: SilentHistoryEntry, key: string): number | null {
  const value = entry.metadata?.[key];
  return typeof value === 'number' ? value : null;
}

function getMetadataBooleanLabel(
  entry: SilentHistoryEntry,
  key: string,
  labels: { true: string; false: string },
): string | null {
  const value = entry.metadata?.[key];
  if (typeof value !== 'boolean') return null;
  return value ? labels.true : labels.false;
}

function getHiddenMessages(entry: SilentHistoryEntry): string[] {
  const hiddenMessages = entry.metadata?.hiddenMessages;
  return Array.isArray(hiddenMessages)
    ? hiddenMessages.filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
    : [];
}

function titleCaseStatus(value: string): string {
  return value.replace(/_/g, ' ');
}

const EXECUTION_MODE_LABELS: Record<string, string> = {
  manual: 'Manual mode',
  assisted: 'Assisted mode',
  autonomous: 'Autonomous mode',
  ghost: 'Ghost mode',
  analysis_only: 'Analysis-only mode',
};

const DISPOSITION_LABELS: Record<string, string> = {
  manual_review: 'Manual review',
  proposal_review: 'Proposal review',
  high_risk_review: 'High-risk review',
  analysis_only: 'Analysis-only',
  visible_execution: 'Visible execution',
  silent_execution: 'Silent execution',
  ephemeral_preview: 'Ephemeral preview',
};

export function SilentAuditDetailModal({ entry, open, onClose }: SilentAuditDetailModalProps) {
  const hiddenMessages = entry ? getHiddenMessages(entry) : [];
  const autonomyExplanation = entry ? getMetadataString(entry, 'autonomyExplanation') : null;
  const executionMode = entry ? getMetadataString(entry, 'executionMode') : null;
  const runtimeDisposition = entry ? getMetadataString(entry, 'runtimeDisposition') : null;
  const detailBadges = entry
    ? [
        executionMode
          ? `Mode: ${EXECUTION_MODE_LABELS[executionMode] ?? titleCaseStatus(executionMode)}`
          : null,
        getMetadataString(entry, 'historyMode')
          ? `History: ${titleCaseStatus(getMetadataString(entry, 'historyMode')!)}`
          : null,
        getMetadataString(entry, 'dispatchStatus')
          ? `Dispatch: ${titleCaseStatus(getMetadataString(entry, 'dispatchStatus')!)}`
          : null,
        getMetadataNumber(entry, 'autopilotLevel') !== null
          ? `Autopilot L${getMetadataNumber(entry, 'autopilotLevel')}`
          : null,
        getMetadataBooleanLabel(entry, 'highRisk', { true: 'High risk', false: 'Low risk' }),
      ].filter((value): value is string => Boolean(value))
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal forceMount>
        {open && entry ? (
          <>
            <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/70 backdrop-blur-sm" />
            <Dialog.Content
              className={cn(
                'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2',
                'max-h-[85vh] overflow-y-auto rounded-2xl border border-amber-500/20 bg-slate-900/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-xl',
              )}
              aria-describedby="silent-audit-detail-description"
              data-testid="silent-audit-detail-modal"
            >
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white/70"
                  aria-label="Close silent audit detail"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </Dialog.Close>

              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                  <ScrollText className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-base font-semibold text-white/90">Silent audit detail</Dialog.Title>
                  <Dialog.Description
                    id="silent-audit-detail-description"
                    className="mt-1 text-sm leading-relaxed text-white/55"
                  >
                    Review the suppressed ghost trace, execution context, and thread audit metadata for this entry.
                  </Dialog.Description>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-200/80">
                  <span className="font-semibold uppercase tracking-[0.14em]">{getModuleLabel(entry.source)}</span>
                  <span>{formatTimestamp(entry.timestamp)}</span>
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                    {entry.patientScope}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{entry.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
                  <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
                    Execution: {entry.executionId}
                  </span>
                  <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
                    Proposal: {entry.proposalId}
                  </span>
                  {detailBadges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <section className="space-y-2 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4">
                  {autonomyExplanation ? (
                    <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
                        Autonomy receipt
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-white/80">{autonomyExplanation}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
                        {executionMode ? (
                          <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
                            Autonomy: {EXECUTION_MODE_LABELS[executionMode] ?? titleCaseStatus(executionMode)}
                          </span>
                        ) : null}
                        {runtimeDisposition ? (
                          <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2 py-1">
                            Disposition: {DISPOSITION_LABELS[runtimeDisposition] ?? titleCaseStatus(runtimeDisposition)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    <Ghost className="h-3.5 w-3.5 text-violet-300/80" aria-hidden />
                    Suppressed trace
                  </div>
                  {hiddenMessages.length > 0 ? (
                    <div className="space-y-2" data-testid="silent-audit-hidden-messages">
                      {hiddenMessages.map((message, index) => (
                        <div
                          key={`${entry.id}.hidden.${index}`}
                          className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] px-3 py-2 text-sm leading-relaxed text-white/75"
                        >
                          {message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/50">No suppressed assistant messages were captured for this execution.</p>
                  )}
                </section>

                <section className="space-y-2 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Audit context</div>
                  <dl className="space-y-2 text-sm">
                    {[
                      ['Source module', getMetadataString(entry, 'moduleId')],
                      ['Action type', getMetadataString(entry, 'actionType')],
                      ['Thread', getMetadataString(entry, 'activeThreadId')],
                      ['Runtime autonomy', getMetadataString(entry, 'runtimeAutonomy')],
                      ['Disposition', getMetadataString(entry, 'runtimeDisposition')],
                      ['History destination', getMetadataString(entry, 'historyDestination')],
                      [
                        'Notifications',
                        getMetadataBooleanLabel(entry, 'shouldNotifyUser', {
                          true: 'User-facing notification allowed',
                          false: 'No user-facing notification',
                        }),
                      ],
                      [
                        'History persistence',
                        getMetadataBooleanLabel(entry, 'willPersistHistory', {
                          true: 'Standard history persisted',
                          false: 'Standard history suppressed',
                        }),
                      ],
                    ]
                      .filter(([, value]) => Boolean(value))
                      .map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/[0.12] bg-slate-900/50 px-3 py-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</dt>
                          <dd className="mt-1 text-white/75">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              </div>
            </Dialog.Content>
          </>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
