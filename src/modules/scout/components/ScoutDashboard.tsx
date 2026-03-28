import React, { useMemo } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Database, FileSearch, Plus, RefreshCcw, Zap } from 'lucide-react';
import type { GlobalProjection } from '@/lib/types';
import type { ScoutProfile } from '../services/scout-knowledge-service';
import type { ResearchSession } from '../types';
import { cn } from '@/lib/utils';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { NeuralButton } from '@/core/components/NeuralButton';
import { ScoutSessionList } from './ScoutSessionList';
import { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { ScoutKnowledgeNode, SourceEntry } from '../types';

interface ScoutDashboardProps {
  soul: GlobalProjection | null;
  profile: ScoutProfile | null;
  knowledgeNodes?: ScoutKnowledgeNode[];
  sources?: SourceEntry[];
  sessions?: ResearchSession[];
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  activeSessionId?: string;
  onRefreshNews?: () => void;
  isRefreshingNews?: boolean;
  isLocked?: boolean;
  onStartSession?: () => void;
  onGenerateDigest?: () => void;
}

function formatSessionCountLabel(count: number) {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function normalizeKnowledgeNodes(
  rawNodes: unknown[],
  fallbackUpdatedAt?: string
): ScoutKnowledgeNode[] {
  return rawNodes.map((rawNode, index) => {
    const node = (rawNode ?? {}) as Partial<ScoutKnowledgeNode> & {
      title?: string;
      topic?: string;
      summary?: string;
    };

    const derivedClaimCandidates = [
      node.claim,
      node.title,
      node.topic,
      node.summary,
    ];

    const claim =
      derivedClaimCandidates.find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      ) || `Knowledge node ${index + 1}`;

    return {
      id:
        typeof node.id === 'string' && node.id.trim().length > 0
          ? node.id
          : `legacy-node-${index + 1}`,
      claim,
      confidence: typeof node.confidence === 'number' ? node.confidence : 0,
      evidence: Array.isArray(node.evidence)
        ? node.evidence.filter((value): value is string => typeof value === 'string')
        : [],
      status:
        node.status === 'verified' || node.status === 'pending' || node.status === 'contested'
          ? node.status
          : 'pending',
      updatedAt:
        typeof node.updatedAt === 'string' && node.updatedAt.length > 0
          ? node.updatedAt
          : fallbackUpdatedAt || new Date(0).toISOString(),
      highlights: Array.isArray(node.highlights)
        ? node.highlights.filter((value): value is string => typeof value === 'string')
        : undefined,
      embedding: Array.isArray(node.embedding)
        ? node.embedding.filter((value): value is number => typeof value === 'number')
        : undefined,
      source: typeof node.source === 'string' ? node.source : undefined,
      sources: Array.isArray(node.sources)
        ? node.sources.filter((value): value is string => typeof value === 'string')
        : undefined,
      parentSessionId:
        typeof node.parentSessionId === 'string' ? node.parentSessionId : undefined,
    };
  });
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
}

function MetricCard({ label, value, icon, accent }: MetricCardProps) {
  return (
    <div className="flex min-w-[4.5rem] flex-col items-center gap-0.5 px-4 py-3">
      <span className={cn('text-2xl font-black tabular-nums tracking-tight',
        accent ? 'text-[var(--module-color-400)]' : 'text-white')}>
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/35">
        {label}
      </span>
    </div>
  );
}

export function ScoutDashboard({
  soul: _soul,
  profile,
  knowledgeNodes = [],
  sources = [],
  sessions = [],
  onSelectSession,
  onDeleteSession,
  activeSessionId,
  onRefreshNews,
  isRefreshingNews,
  isLocked = false,
  onStartSession,
  onGenerateDigest,
}: ScoutDashboardProps) {
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Scout"
        moduleDescription="Secure external data exploration and evidence research."
      />
    );
  }

  const rawNodes =
    knowledgeNodes.length > 0 ? knowledgeNodes : Array.isArray(profile?.knowledgeNodes) ? profile.knowledgeNodes : [];
  const nodes = normalizeKnowledgeNodes(rawNodes, profile?.updatedAt);
  const interests = profile?.interests || [];
  const newsBriefs = profile?.newsBriefs || [];
  const verifiedCount = nodes.filter((node) => node.status === 'verified').length;
  const verifiedPct = nodes.length > 0 ? `${Math.round((verifiedCount / nodes.length) * 100)}%` : '—';
  const avgConfidence =
    nodes.length > 0
      ? Math.round((nodes.reduce((acc, node) => acc + (node.confidence || 0), 0) / nodes.length) * 100)
      : null;
  const activeSessionsCount = sessions.filter((session) =>
    ['decomposing', 'searching', 'synthesizing'].includes(session.status)
  ).length;

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [sessions],
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[var(--shell-content-max,80rem)] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">

      {/* Inquiry hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-white/[0.045] px-6 py-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--module-accent-glow)] blur-3xl" />

        <p className="text-chip-soft text-[var(--module-color-400)]">Scout · Knowledge Cartographer</p>

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
      <div className="relative">
        <div className="flex items-stretch divide-x divide-white/8 overflow-x-auto scrollbar-none rounded-2xl border border-white/[0.09] bg-white/[0.045]">
        <InlineStat label="Nodes"    value={nodes.length} accent />
        <InlineStat label="Sources"  value={sources.length} />
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
              <span>{isRefreshingNews ? 'Refreshing…' : 'Refresh News'}</span>
            </NeuralButton>
          )}
        </div>
      </section>

      {/* Trending interests */}
      <section aria-label="Trending interests">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--module-color-400)]">
            Tracked interests
          </p>
          <h2 className="mt-1 text-panel-heading text-white">Trending topics</h2>

          {interests.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span
                  key={interest.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
                    interest.trend === 'rising'
                      ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)]'
                      : interest.trend === 'cooling'
                        ? 'border-white/10 bg-white/[0.03] text-white/45'
                        : 'border-white/10 bg-white/[0.05] text-white/70'
                  )}
                >
                  {interest.trend === 'rising' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--module-color-400)]" aria-hidden="true" />
                  )}
                  {interest.topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-body-secondary text-white/45">
              Add interests in your profile to see trending topics here.
            </p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)] xl:items-start">
        <div className="space-y-4 sm:space-y-6">
          {/* Knowledge Cartography Section */}
          <section className="surface-foundation overflow-hidden p-0 aspect-[4/3] sm:aspect-video lg:aspect-[16/10] xl:aspect-video relative" aria-label="Knowledge Graph">
            <KnowledgeGraph nodes={nodes} sources={sources} className="w-full h-full" />
          </section>

          <section className="surface-foundation flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-label="Research sessions">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.09] pb-4">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-[var(--module-color-300)]" aria-hidden="true" />
                <h2 className="text-panel-heading text-white">Recent activity</h2>
              </div>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 py-1 text-[11px] font-semibold text-white/60">
                {formatSessionCountLabel(sessions.length)}
              </span>
            </div>

            <ScoutSessionList
              sessions={recentSessions}
              onSelect={onSelectSession || (() => {})}
              onDelete={onDeleteSession || (() => {})}
              activeSessionId={activeSessionId}
            />
          </section>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <section className="surface-foundation min-w-0 p-4 sm:p-5" aria-label="Briefings and insights">
            <div className="border-b border-white/[0.09] pb-4">
              <p className="text-chip-soft text-fuchsia-300">Briefings</p>
              <h2 className="mt-1 text-panel-heading text-white">Trend briefings</h2>
            </div>

            <div className="mt-4 space-y-3">
              {newsBriefs.slice(0, 5).map((brief, index) => (
                <article
                  key={`news-${index}`}
                  className="rounded-3xl border border-white/[0.09] bg-white/[0.045] p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/90">
                    {brief.topic}
                  </p>
                  <p className="mt-2 break-words text-body-secondary text-white/70">{brief.summary}</p>
                  {brief.source && (
                    <a
                      href={brief.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-[11px] text-[var(--module-color-400)] underline-offset-2 hover:underline"
                    >
                      {brief.source}
                    </a>
                  )}
                  <p className="mt-1.5 text-[10px] text-white/35">
                    Updated {formatRelativeTime(brief.updatedAt)}
                  </p>
                </article>
              ))}

              {newsBriefs.length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/[0.12] px-4 py-6 text-center">
                  <p className="text-item-title text-white/65">No trend briefings yet</p>
                  <p className="mt-1 text-body-secondary text-white/45">
                    No news briefs yet — click Refresh News above to surface new developments.
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
