import React from 'react';
import { AlertTriangle, Lock, Search, Zap } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { ScoutProfile } from '../services/scout-knowledge-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { ScoutEvidenceSources } from './ScoutEvidenceSources';
import { SignalBubbleCanvas } from './SignalBubbleCanvas';

export function ScoutDashboard({
  soul,
  profile,
  onRefreshNews,
  isRefreshingNews,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: ScoutProfile | null;
  onRefreshNews?: () => void;
  isRefreshingNews?: boolean;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Scout"
        moduleDescription="Secure external data exploration and evidence research."
      />
    );
  }

  if (!soul) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Research link pending"
          description="Start a research session to populate the knowledge grid."
          size="lg"
        />
      </div>
    );
  }

  const nodes = profile?.knowledgeNodes || [];
  const queue = profile?.verificationQueue || [];
  const researchFocus = profile?.researchFocus || [];
  const interests = profile?.interests || [];
  const verified = nodes.filter((node) => node.status === 'verified').length;
  const contested = nodes.filter((node) => node.status === 'contested').length;
  const avgConfidence =
    nodes.length > 0 ? Math.round((nodes.reduce((acc, node) => acc + node.confidence, 0) / nodes.length) * 100) : null;

  const rising = interests.filter((item) => item.trend === 'rising').length;
  const averageInterestScore =
    interests.length > 0 ? Math.round(interests.reduce((sum, item) => sum + item.score, 0) / interests.length) : null;

  const hasNodes = nodes.length > 0;
  const hasQueue = queue.length > 0;
  const hasFocus = researchFocus.length > 0;
  const hasInterests = interests.length > 0;
  const hasAnyData = hasNodes || hasQueue || hasFocus || hasInterests;

  const riskFlags: string[] = [];
  if (queue.length > 6) riskFlags.push('Verification queue is overloaded. Prioritize high-impact claims first.');
  if (contested > 0) riskFlags.push(`${contested} contested node(s) require source-level resolution.`);
  if (avgConfidence !== null && avgConfidence < 50) riskFlags.push('Average confidence is low. Increase source quality threshold.');

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Research Domain"
        title="Knowledge Node"
        subtitle="Research assistant and fact-checking engine with verified knowledge graphs."
        accentClassName="text-lime-400"
        action={
          onRefreshNews && (
            <button
              onClick={onRefreshNews}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-lime-500/30 bg-lime-500/10 text-lime-200 hover:bg-lime-500/20"
              disabled={isRefreshingNews}
            >
              {isRefreshingNews ? 'Refreshing...' : 'Refresh Briefs'}
            </button>
          )
        }
      />

      {!hasAnyData ? (
        <EmptyState
          title="Knowledge grid is empty"
          description="Ask Scout to research a topic or verify a claim to build your first knowledge nodes."
          size="lg"
          icon={Search}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Knowledge Nodes" value={nodes.length} accentClassName="text-lime-300" />
            <StatCard label="Verified" value={verified} accentClassName="text-emerald-300" />
            <StatCard label="Tracked Topics" value={interests.length} accentClassName="text-fuchsia-300" />
            {rising > 0 ? (
              <StatCard label="Rising Signal" value={rising} accentClassName="text-rose-400" />
            ) : (
              <StatCard
                label="Avg Momentum"
                value={averageInterestScore}
                suffix="%"
                accentClassName="text-sky-300"
              />
            )}
          </div>

          {hasInterests && (
            <section className="space-y-3" aria-label="Interest momentum map">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display text-center">Interest Momentum Map</h4>
              <SignalBubbleCanvas interests={interests} />
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <section className="space-y-3" aria-label="Research focus tracks">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">Focus Tracks</h4>
                {hasFocus ? (
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Active research topics">
                    {researchFocus.slice(0, 8).map((topic) => (
                      <span key={topic} role="listitem" className="px-3 py-1 rounded-full border border-lime-500/20 bg-lime-500/10 text-xs text-lime-300">
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    size="sm"
                    title="No research focus"
                    description="Add focus tracks in chat."
                    className="bg-transparent border-white/10"
                  />
                )}
              </section>

              <section className="space-y-3" aria-label="Verification queue snapshot">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">Queue Snapshot</h4>
                {hasQueue ? (
                  queue.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-white/75">{item.claim}</p>
                      <p className="text-xs text-lime-300 mt-1 uppercase tracking-wider">{item.status}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    size="sm"
                    title="Queue is empty"
                    description="Run a claim check to populate."
                    className="bg-transparent border-white/10"
                  />
                )}
              </section>
            </div>

            <div className="space-y-8">
              <section className="space-y-3" aria-label="Trend briefings">
                <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display text-fuchsia-400">Trend Briefings</h4>
                {(profile?.trendBriefs || []).slice(0, 3).map((brief, index) => (
                  <div key={index} className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-xs text-fuchsia-100/80">
                    {brief}
                  </div>
                ))}
                {(profile?.newsBriefs || []).slice(0, 3).map((brief, index) => (
                  brief.isPlaceholder ? (
                    <div
                      key={`news-${index}`}
                      className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs space-y-1"
                      role="status"
                      aria-label={`Placeholder briefing for ${brief.topic}`}
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">{brief.topic}</div>
                      <div className="text-[11px] text-white/40 italic">{brief.summary}</div>
                    </div>
                  ) : (
                    <div key={`news-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70 space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300">{brief.topic}</div>
                      <div className="text-[11px] text-white/60">{brief.summary}</div>
                    </div>
                  )
                ))}
                {!profile?.trendBriefs?.length && !profile?.newsBriefs?.length && (
                  <EmptyState
                    size="sm"
                    title="No briefs yet"
                    description="Add research topics to see briefings here."
                    className="bg-transparent border-white/10"
                  />
                )}
              </section>
            </div>
          </div>

          {riskFlags.length > 0 && (
            <section className="space-y-3" aria-label="Risk flags and warnings">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">Risk Flags</h4>
              {riskFlags.map((flag, index) => (
                <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3" role="alert">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-amber-100/80 leading-relaxed">{flag}</p>
                </div>
              ))}
            </section>
          )}

          <ScoutEvidenceSources knowledgeNodes={nodes} />
        </>
      )}
    </div>
  );
}
