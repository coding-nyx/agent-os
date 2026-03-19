import React from 'react';
import { AlertTriangle, Clock, RefreshCcw } from 'lucide-react';
import type { GlobalProjection } from '@/lib/types';
import type { ScoutProfile } from '../services/scout-knowledge-service';
import type { ResearchSession } from '../types';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { ScoutSessionList } from './ScoutSessionList';
import { SignalBubbleCanvas } from './SignalBubbleCanvas';

interface ScoutDashboardProps {
  soul: GlobalProjection | null;
  profile: ScoutProfile | null;
  sessions?: ResearchSession[];
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  activeSessionId?: string;
  onRefreshNews?: () => void;
  isRefreshingNews?: boolean;
  isLocked?: boolean;
}

function formatSessionCountLabel(count: number) {
  return `${count} session${count === 1 ? '' : 's'}`;
}

export function ScoutDashboard({
  soul: _soul,
  profile,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  activeSessionId,
  onRefreshNews,
  isRefreshingNews,
  isLocked = false,
}: ScoutDashboardProps) {
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Scout"
        moduleDescription="Secure external data exploration and evidence research."
      />
    );
  }

  const nodes = profile?.knowledgeNodes || [];
  const interests = profile?.interests || [];
  const newsBriefs = profile?.newsBriefs || [];
  const verified = nodes.filter((node) => node.status === 'verified').length;
  const avgConfidence =
    nodes.length > 0
      ? Math.round((nodes.reduce((acc, node) => acc + node.confidence, 0) / nodes.length) * 100)
      : null;
  const activeSessionsCount = sessions.filter((session) =>
    ['decomposing', 'searching', 'synthesizing'].includes(session.status)
  ).length;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[var(--shell-content-max,80rem)] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
      <section className="surface-foundation-raised overflow-hidden p-5 sm:p-6">
        <SectionHeader
          className="flex-col gap-4 sm:flex-row sm:items-start"
          label="Research domain"
          title="Knowledge Node"
          subtitle="Research assistant and fact-checking engine with verified knowledge graphs, active investigations, and current trend briefings."
          accentClassName="text-lime-400"
          action={
            onRefreshNews ? (
              <div className="w-full sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={onRefreshNews}
                  disabled={isRefreshingNews}
                  className={cn(
                    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-[12px] font-semibold transition-colors sm:w-auto',
                    'border-lime-500/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/18 disabled:cursor-not-allowed disabled:opacity-70'
                  )}
                >
                  <RefreshCcw
                    className={cn('h-4 w-4', isRefreshingNews && 'animate-spin')}
                    aria-hidden="true"
                  />
                  <span>{isRefreshingNews ? 'Refreshing briefs…' : 'Refresh briefs'}</span>
                </button>
              </div>
            ) : null
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Knowledge Nodes"
          value={nodes.length}
          accentClassName="text-lime-300"
          className="h-full min-w-0"
        />
        <StatCard
          label="Verified"
          value={verified}
          accentClassName="text-emerald-300"
          className="h-full min-w-0"
        />
        <StatCard
          label="Tracked Topics"
          value={interests.length}
          accentClassName="text-fuchsia-300"
          className="h-full min-w-0"
        />
        <StatCard
          label="Active Sessions"
          value={activeSessionsCount}
          accentClassName="text-sky-300"
          className="h-full min-w-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)] xl:items-start">
        <div className="space-y-4 sm:space-y-6">
          <section className="surface-foundation flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-label="Research sessions">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-chip-soft text-lime-300">
                  <Clock size={13} aria-hidden="true" />
                  <span>Scout sessions</span>
                </div>
                <h2 className="text-panel-heading text-white">Research sessions</h2>
                <p className="max-w-2xl text-body-secondary text-white/55">
                  Continue active investigations, reopen prior inquiries, or jump back into evidence review without losing context.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/60">
                {formatSessionCountLabel(sessions.length)}
              </span>
            </div>

            <ScoutSessionList
              sessions={sessions}
              onSelect={onSelectSession || (() => {})}
              onDelete={onDeleteSession || (() => {})}
              activeSessionId={activeSessionId}
            />
          </section>

          {interests.length > 0 && (
            <section className="surface-foundation overflow-hidden p-4 sm:p-5" aria-label="Interest momentum map">
              <div className="mb-4 space-y-1">
                <p className="text-chip-soft text-white/45">Signal map</p>
                <h2 className="text-panel-heading text-white">Momentum map</h2>
                <p className="text-body-secondary text-white/55">
                  Review which tracked topics are rising, steady, or cooling before you start a new research pass.
                </p>
              </div>
              <SignalBubbleCanvas interests={interests} />
            </section>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          <section className="surface-foundation min-w-0 p-4 sm:p-5" aria-label="Briefings and insights">
            <div className="border-b border-white/8 pb-4">
              <p className="text-chip-soft text-fuchsia-300">Briefings</p>
              <h2 className="mt-1 text-panel-heading text-white">Trend briefings</h2>
              <p className="mt-1 text-body-secondary text-white/55">
                Short summaries from Scout&apos;s recent monitoring so you can scan developments on any screen size.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {newsBriefs.slice(0, 5).map((brief, index) => (
                <article
                  key={`news-${index}`}
                  className="rounded-3xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/90">
                    {brief.topic}
                  </p>
                  <p className="mt-2 break-words text-body-secondary text-white/70">{brief.summary}</p>
                </article>
              ))}

              {newsBriefs.length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/10 px-4 py-6 text-center">
                  <p className="text-item-title text-white/65">No trend briefings yet</p>
                  <p className="mt-1 text-body-secondary text-white/45">
                    Start researching topics and refresh briefs when you want Scout to surface new developments.
                  </p>
                </div>
              )}
            </div>
          </section>

          {avgConfidence !== null && avgConfidence < 60 && (
            <div className="rounded-[var(--foundation-radius-card)] border border-amber-500/20 bg-amber-500/8 p-4 sm:p-5" role="alert">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-chip-soft text-amber-200">Epistemic risk</p>
                  <p className="text-body text-amber-50/90">
                    Average confidence across your knowledge grid is {avgConfidence}%.
                  </p>
                  <p className="text-body-secondary text-amber-100/70">
                    Consider running deep research on key claims to improve evidence quality and close unresolved gaps.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
