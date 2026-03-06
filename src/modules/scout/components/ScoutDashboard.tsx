import React from 'react';
import { AlertTriangle, Lock, Search } from 'lucide-react';
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
  const researchFocus = profile?.researchFocus || [];
  const verified = nodes.filter((node) => node.status === 'verified').length;
  const contested = nodes.filter((node) => node.status === 'contested').length;
  const avgConfidence =
    nodes.length > 0 ? Math.round((nodes.reduce((acc, node) => acc + node.confidence, 0) / nodes.length) * 100) : null;

  const hasNodes = nodes.length > 0;
  const hasQueue = queue.length > 0;
  const hasFocus = researchFocus.length > 0;
  const hasAnyData = hasNodes || hasQueue || hasFocus;

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

      {!hasAnyData ? (
        <EmptyState
          title="Knowledge grid is empty"
          description="Ask Scout to research a topic or verify a claim to build your first knowledge nodes."
          size="lg"
          icon={Search}
        />
      ) : (
        <>
          {hasNodes && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Knowledge Nodes" value={nodes.length} accentClassName="text-lime-300" />
              {verified > 0 && (
                <StatCard label="Verified" value={verified} accentClassName="text-emerald-300" />
              )}
              {hasQueue && (
                <StatCard label="Queue" value={queue.length} accentClassName="text-amber-300" />
              )}
              {avgConfidence !== null && (
                <StatCard
                  label="Avg Confidence"
                  value={avgConfidence}
                  suffix="%"
                  accentClassName={avgConfidence < 50 ? 'text-red-400' : 'text-lime-300'}
                />
              )}
            </div>
          )}

          <section className="space-y-3" aria-label="Research focus tracks">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Focus Tracks</h4>
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
                title="No research focus configured"
                description="Add focus tracks in chat."
                className="bg-transparent border-white/10"
              />
            )}
          </section>

          <section className="space-y-3" aria-label="Verification queue snapshot">
            <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Queue Snapshot</h4>
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
                title="Verification queue is empty"
                description="Run a claim check to populate the queue."
                className="bg-transparent border-white/10"
              />
            )}
          </section>

          {riskFlags.length > 0 && (
            <section className="space-y-3" aria-label="Risk flags and warnings">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Risk Flags</h4>
              {riskFlags.map((flag, index) => (
                <div key={index} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3" role="alert">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-amber-100/80 leading-relaxed">{flag}</p>
                </div>
              ))}
            </section>
          )}

          {riskFlags.length === 0 && hasNodes && (
            <section className="space-y-3" aria-label="Risk flags and warnings">
              <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic">Risk Flags</h4>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
                Verification pipeline is stable.
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
