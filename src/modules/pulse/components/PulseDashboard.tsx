import React from 'react';
import { Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { PulseProfile } from '../services/pulse-profile-service';
import { PulseBubbleCanvas } from './PulseBubbleCanvas';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';

export function PulseDashboard({
  soul,
  profile,
  onRefreshNews,
  isRefreshingNews,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: PulseProfile | null;
  onRefreshNews?: () => void;
  isRefreshingNews?: boolean;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Pulse to view trend telemetry."
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
          title="Trend link pending"
          description="Track a topic to activate the pulse dashboard."
          size="lg"
        />
      </div>
    );
  }

  const interests = profile?.interests || [];
  const rising = interests.filter((item) => item.trend === 'rising').length;
  const cooling = interests.filter((item) => item.trend === 'cooling').length;
  const averageScore =
    interests.length > 0 ? Math.round(interests.reduce((sum, item) => sum + item.score, 0) / interests.length) : null;

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Discovery Domain"
        title="Pulse Trendboard"
        subtitle="Signal momentum across the topics shaping your current focus."
        accentClassName="text-fuchsia-400"
        action={
          onRefreshNews && (
            <button
              onClick={onRefreshNews}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20"
              disabled={isRefreshingNews}
            >
              {isRefreshingNews ? 'Refreshing...' : 'Refresh Briefs'}
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Tracked Topics" value={interests.length || null} isEmpty={!profile} accentClassName="text-fuchsia-300" />
        <StatCard label="Rising Topics" value={rising || null} isEmpty={!profile} accentClassName="text-rose-300" />
        <StatCard label="Cooling Topics" value={cooling || null} isEmpty={!profile} accentClassName="text-sky-300" />
        <StatCard
          label="Avg Momentum"
          value={averageScore}
          suffix="%"
          isEmpty={!profile}
          accentClassName={averageScore !== null && averageScore > 65 ? 'text-fuchsia-300' : 'text-amber-300'}
        />
      </div>

      <PulseBubbleCanvas interests={interests} />

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Topic Momentum</h4>
        {interests.slice(0, 8).map((interest) => (
          <div key={interest.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{interest.topic}</span>
              <span className="font-bold text-fuchsia-300">{interest.score}</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-white/45">{interest.trend}</div>
          </div>
        ))}
        {interests.length === 0 && (
          <EmptyState
            size="sm"
            title="No interests tracked yet"
            description="Add topics in chat to initialize momentum map."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Trend Briefs</h4>
        {(profile?.trendBriefs || []).slice(0, 4).map((brief, index) => (
          <div key={index} className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-xs text-fuchsia-100/80">
            {brief}
          </div>
        ))}
        {(profile?.newsBriefs || []).slice(0, 4).map((brief, index) => (
          <div key={`news-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70 space-y-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-200">{brief.topic}</div>
            <div className="text-[11px] text-white/60">{brief.summary}</div>
            {brief.source && <div className="text-[9px] text-white/50 truncate">{brief.source}</div>}
          </div>
        ))}
        {!profile?.trendBriefs?.length && !profile?.newsBriefs?.length && (
          <EmptyState
            size="sm"
            title="No briefs generated yet"
            description="Run a refresh to synthesize trend briefings."
            className="bg-transparent border-white/10"
          />
        )}
      </section>
    </div>
  );
}
