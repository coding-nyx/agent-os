import React from 'react';
import { AlertTriangle, Clock, Plus, RefreshCcw } from 'lucide-react';
import type { GlobalProjection } from '@/lib/types';
import type { ScoutProfile } from '../services/scout-knowledge-service';
import type { ResearchSession } from '../types';
import { cn } from '@/lib/utils';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NeuralButton } from '@/core/components/NeuralButton';
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
  onStartSession?: () => void;
}

function formatSessionCountLabel(count: number) {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function InlineStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex min-w-[4.5rem] flex-col items-center gap-0.5 px-4 py-3">
      <span className={cn('text-2xl font-black tabular-nums tracking-tight',
        accent ? 'text-[var(--module-color-400)]' : 'text-white')}>
        {value}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35">
        {label}
      </span>
    </div>
  );
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
  onStartSession,
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
    <div className="mx-auto flex w-full min-w-0 max-w-[var(--shell-content-max,80rem)] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">

      {/* Inquiry hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] px-6 py-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--module-accent-glow)] blur-3xl" />

        <p className="text-chip-soft text-[var(--module-color-400)]">Scout · Knowledge Node</p>

        {activeSessionsCount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-section-heading text-white">
              {activeSessionsCount} active inquir{activeSessionsCount !== 1 ? 'ies' : 'y'} in progress
            </h1>
            <NeuralButton type="button" onClick={onStartSession} themeColor="lime" className="min-h-10 shrink-0">
              <Plus size={15} />
              <span>New inquiry</span>
            </NeuralButton>
          </div>
        ) : sessions.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-section-heading text-white">Pick up where you left off</h1>
              <p className="mt-1 text-body-secondary text-white/45">
                {sessions.length} prior session{sessions.length !== 1 ? 's' : ''} available
              </p>
            </div>
            <NeuralButton type="button" onClick={onStartSession} themeColor="lime" className="min-h-10 shrink-0">
              <Plus size={15} />
              <span>New inquiry</span>
            </NeuralButton>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-section-heading text-white">Start your first inquiry</h1>
              <p className="mt-1 text-body-secondary text-white/45">
                Research, synthesize evidence, and track knowledge across any topic.
              </p>
            </div>
            <NeuralButton type="button" onClick={onStartSession} themeColor="lime" size="lg" className="min-h-11 shrink-0">
              <Plus size={16} />
              <span>Begin research</span>
            </NeuralButton>
          </div>
        )}
      </section>

      {/* Compact inline stats strip */}
      <div className="flex items-stretch divide-x divide-white/8 overflow-x-auto scrollbar-none rounded-2xl border border-white/8 bg-white/[0.02]">
        <InlineStat label="Nodes"    value={nodes.length} accent />
        <InlineStat label="Verified" value={verified} />
        <InlineStat label="Topics"   value={interests.length} />
        <InlineStat label="Active"   value={activeSessionsCount} />
        {onRefreshNews && (
          <div className="ml-auto flex items-center px-4">
              <NeuralButton
                type="button"
                onClick={onRefreshNews}
                loading={isRefreshingNews}
                variant="ghost"
                themeColor="lime"
                size="sm"
                aria-label={isRefreshingNews ? 'Refreshing briefs' : 'Refresh briefs'}
                className="shrink-0"
              >
              <RefreshCcw
                className={cn('h-3.5 w-3.5', isRefreshingNews && 'animate-spin')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{isRefreshingNews ? 'Refreshing…' : 'Refresh briefs'}</span>
            </NeuralButton>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)] xl:items-start">
        <div className="space-y-4 sm:space-y-6">
          <section className="surface-foundation flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-label="Research sessions">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-[var(--module-color-300)]" aria-hidden="true" />
                <h2 className="text-panel-heading text-white">Research sessions</h2>
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
