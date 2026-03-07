import React, { useState, useEffect } from 'react';
import { Lock, Activity } from 'lucide-react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { BeliefGraph, subscribeBeliefGraph } from '../services/belief-graph-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NSV_DERIVED_METRICS, isMetricStale } from '@/lib/services/nsv-ownership';

export function AgnesDashboard({
  profile,
  encryptionKey
}: {
  profile: unknown;
  encryptionKey: CryptoKey | null;
}) {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('agnes');
  const [graph, setGraph] = useState<BeliefGraph | null>(null);

  useEffect(() => {
    if (!user || isGuest || !encryptionKey) {
      setGraph(null);
      return;
    }
    return subscribeBeliefGraph({ userId: user.uid, encryptionKey }, setGraph);
  }, [user?.uid, isGuest, encryptionKey]);

  const soul = globalSoul;
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Agnes to view emotional telemetry."
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
          title="Emotional link pending"
          description="Complete intake to activate the agnes signalboard."
          size="lg"
        />
      </div>
    );
  }

  const emotional = soul.crossFunctionalState.emotional;
  const lastUpdated = soul.crossFunctionalState.lastUpdated || {};

  const hasResilience = typeof emotional.emotionalResilience === 'number';
  const hasStress = typeof emotional.stressLoad === 'number';
  const hasTrauma = Array.isArray(emotional.traumaMarkers) && emotional.traumaMarkers.length > 0;
  const hasBeliefGraph = (graph?.nodes?.length ?? 0) > 0;
  const hasAnyMetrics = hasResilience || hasStress || hasTrauma || hasBeliefGraph;

  // Nothing to display yet — show a minimal note instead of empty cards
  if (!hasAnyMetrics) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Signalboard calibrating"
          description="Emotional telemetry will appear naturally as agnes sessions progress."
          size="lg"
          icon={Activity}
        />
      </div>
    );
  }

  const toneWhenBelow = (value: number | null | undefined, threshold: number, lowClass: string, highClass: string) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value < threshold ? lowClass : highClass;
  };
  const toneWhenAbove = (value: number | null | undefined, threshold: number, highClass: string, lowClass: string) => {
    if (typeof value !== 'number') return 'text-white/40';
    return value > threshold ? highClass : lowClass;
  };

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Emotional Domain"
        title="Agnes Signalboard"
        subtitle="Tracked resilience, stress load, and belief graph coherence."
        accentClassName="text-indigo-400"
      />

      {(hasResilience || hasStress || hasTrauma) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {hasResilience && (
            <StatCard
              label="Resilience"
              value={emotional.emotionalResilience!}
              isEmpty={false}
              accentClassName={toneWhenBelow(emotional.emotionalResilience, 4, 'text-rose-300', 'text-indigo-300')}
              isDerived={
                NSV_DERIVED_METRICS.includes('emotional.emotionalResilience') ||
                isMetricStale(lastUpdated['emotional.emotionalResilience'], 7)
              }
            />
          )}
          {hasStress && (
            <StatCard
              label="Stress Load"
              value={emotional.stressLoad!}
              isEmpty={false}
              accentClassName={toneWhenAbove(emotional.stressLoad, 6, 'text-rose-300', 'text-indigo-300')}
              isDerived={
                NSV_DERIVED_METRICS.includes('emotional.stressLoad') ||
                isMetricStale(lastUpdated['emotional.stressLoad'], 7)
              }
            />
          )}
          {hasTrauma && (
            <StatCard
              label="Trauma Markers"
              value={emotional.traumaMarkers!.length}
              isEmpty={false}
              accentClassName="text-indigo-300"
              isDerived={
                NSV_DERIVED_METRICS.includes('emotional.traumaMarkers') ||
                isMetricStale(lastUpdated['emotional.traumaMarkers'], 7)
              }
            />
          )}
          {hasBeliefGraph && (
            <StatCard
              label="Belief Links"
              value={graph!.edges.length}
              isEmpty={false}
              accentClassName="text-indigo-300"
            />
          )}
        </div>
      )}

      {hasBeliefGraph && (
        <section className="space-y-3">
          <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Belief Graph</h4>
          {graph!.nodes.slice(0, 6).map((node) => (
            <div key={node.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>{node.label}</span>
                <span className="text-indigo-300 font-bold">{node.intensity}/10</span>
              </div>
              <div className="mt-1 text-[10px] text-white/45 uppercase tracking-[0.2em]">{node.valence}</div>
            </div>
          ))}
        </section>
      )}

      {graph?.summary && (
        <section className="space-y-3">
          <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Graph Summary</h4>
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-100/80">
            {graph.summary}
          </div>
        </section>
      )}
    </div>
  );
}
