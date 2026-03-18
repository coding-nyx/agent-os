import React from 'react';
import { AlertTriangle, Lock, Search, Zap, Clock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { ScoutProfile } from '../services/scout-knowledge-service';
import { ResearchSession } from '../types';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { ScoutSessionList } from './ScoutSessionList';
import { SignalBubbleCanvas } from './SignalBubbleCanvas';

export function ScoutDashboard({
  soul,
  profile,
  sessions = [],
  onSelectSession,
  onDeleteSession,
  activeSessionId,
  onRefreshNews,
  isRefreshingNews,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: ScoutProfile | null;
  sessions?: ResearchSession[];
  onSelectSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  activeSessionId?: string;
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

  const nodes = profile?.knowledgeNodes || [];
  const interests = profile?.interests || [];
  const verified = nodes.filter((node) => node.status === 'verified').length;
  const avgConfidence =
    nodes.length > 0 ? Math.round((nodes.reduce((acc, node) => acc + node.confidence, 0) / nodes.length) * 100) : null;

  const activeSessionsCount = sessions.filter(s => ['decomposing', 'searching', 'synthesizing'].includes(s.status)).length;

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Knowledge Nodes" value={nodes.length} accentClassName="text-lime-300" />
        <StatCard label="Verified" value={verified} accentClassName="text-emerald-300" />
        <StatCard label="Tracked Topics" value={interests.length} accentClassName="text-fuchsia-300" />
        <StatCard label="Active Sessions" value={activeSessionsCount} accentClassName="text-sky-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4" aria-label="Research sessions">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display flex items-center gap-2">
                <Clock size={14} className="text-lime-400" />
                Research Sessions
              </h4>
            </div>
            <ScoutSessionList 
              sessions={sessions} 
              onSelect={onSelectSession || (() => {})} 
              onDelete={onDeleteSession || (() => {})}
              activeSessionId={activeSessionId}
            />
          </section>

          {interests.length > 0 && (
            <section className="space-y-4" aria-label="Interest momentum map">
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display">Momentum Map</h4>
              <SignalBubbleCanvas interests={interests} />
            </section>
          )}
        </div>

        <div className="space-y-8">
          <section className="space-y-4" aria-label="Briefings and insights">
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display text-fuchsia-400">Briefings</h4>
            <div className="space-y-3">
              {(profile?.newsBriefs || []).slice(0, 5).map((brief, index) => (
                <div key={`news-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs transition-colors hover:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300 mb-1">{brief.topic}</div>
                  <div className="text-[11px] text-white/60 leading-relaxed">{brief.summary}</div>
                </div>
              ))}
              {!profile?.newsBriefs?.length && (
                <div className="p-4 rounded-2xl border border-dashed border-white/10 text-center">
                  <p className="text-[10px] text-white/30 italic">No trend briefings available. Start researching topics to generate insights.</p>
                </div>
              )}
            </div>
          </section>

          {avgConfidence !== null && avgConfidence < 60 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3" role="alert">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Epistemic Risk</p>
                <p className="text-xs text-amber-100/70 leading-relaxed">
                  Average confidence across your knowledge grid is low ({avgConfidence}%). 
                  Consider running deep research on key claims to improve evidence quality.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
