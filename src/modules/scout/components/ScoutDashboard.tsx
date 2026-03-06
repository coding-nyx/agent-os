import React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { ScoutProfile } from '../services/scout-knowledge-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';

export function ScoutDashboard({
  soul,
  profile,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: ScoutProfile | null;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Scout to view research telemetry."
          size="lg"
          icon={Lock}
        />
      </div>
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
  const verified = nodes.filter((node) => node.status === 'verified').length;
  const contested = nodes.filter((node) => node.status === 'contested').length;
  const avgConfidence =
    nodes.length > 0 ? Math.round((nodes.reduce((acc, node) => acc + node.confidence, 0) / nodes.length) * 100) : null;

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
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Knowledge Nodes" value={nodes.length || null} isEmpty={!profile} accentClassName="text-lime-300" />
        <StatCard label="Verified" value={verified || null} isEmpty={!profile} accentClassName="text-emerald-300" />
        <StatCard label="Queue" value={queue.length || null} isEmpty={!profile} accentClassName="text-amber-300" />
        <StatCard
          label="Avg Confidence"
          value={avgConfidence}
          suffix="%"
          isEmpty={!profile}
          accentClassName={avgConfidence !== null && avgConfidence < 50 ? 'text-red-400' : 'text-lime-300'}
        />
      </div>

      <section className="space-y-3" aria-label="Research focus tracks">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Focus Tracks</h4>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Active research topics">
          {(profile?.researchFocus || []).slice(0, 8).map((topic) => (
            <span key={topic} role="listitem" className="px-3 py-1 rounded-full border border-lime-500/20 bg-lime-500/10 text-xs text-lime-300">
              {topic}
            </span>
          ))}
        </div>
        {!profile?.researchFocus.length && (
          <EmptyState
            size="sm"
            title="No research focus configured"
            description="Add focus tracks in chat."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3" aria-label="Verification queue snapshot">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Queue Snapshot</h4>
        {queue.slice(0, 4).map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-white/75">{item.claim}</p>
            <p className="text-xs text-lime-300 mt-1 uppercase tracking-wider">{item.status}</p>
          </div>
        ))}
        {queue.length === 0 && (
          <EmptyState
            size="sm"
            title="Verification queue is empty"
            description="Run a claim check to populate the queue."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3" aria-label="Risk flags and warnings">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Risk Flags</h4>
        {riskFlags.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
            Verification pipeline is stable.
          </div>
        ) : (
          riskFlags.map((flag, index) => (
            <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3" role="alert">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-100/80 leading-relaxed">{flag}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
