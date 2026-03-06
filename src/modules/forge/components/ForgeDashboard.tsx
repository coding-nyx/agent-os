import React from 'react';
import { Lock } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { ForgeProfile } from '../services/forge-session-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';

export function ForgeDashboard({
  soul,
  profile,
  isLocked = false
}: {
  soul: GlobalProjection | null;
  profile: ForgeProfile | null;
  isLocked?: boolean;
}) {
  if (isLocked) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="Vault locked"
          description="Unlock Forge to view runtime telemetry."
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
          title="Execution link pending"
          description="Initialize a Forge session to activate the runtime dashboard."
          size="lg"
        />
      </div>
    );
  }

  const sessions = profile?.sessions || [];
  const successful = sessions.filter((session) => session.result === 'success').length;
  const failed = sessions.filter((session) => (session.errorLog?.length || 0) > 0).length;
  const queueDepth = profile?.commandQueue.length ?? null;

  return (
    <div className="p-8 space-y-8">
      <SectionHeader
        label="Technical Domain"
        title="Forge Runtime"
        subtitle="Sandboxed execution with queued scripts, telemetry, and safety gates."
        accentClassName="text-rose-400"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Sessions" value={sessions.length || null} isEmpty={!profile} accentClassName="text-rose-300" />
        <StatCard label="Successful" value={successful || null} isEmpty={!profile} accentClassName="text-emerald-300" />
        <StatCard label="Queue Depth" value={queueDepth} isEmpty={!profile} accentClassName="text-amber-300" />
        <StatCard
          label="Failures"
          value={failed || null}
          isEmpty={!profile}
          accentClassName={failed > 0 ? 'text-red-400' : 'text-rose-300'}
        />
      </div>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Execution Mode</h4>
        {profile ? (
          <SurfaceCard className="p-4 text-xs text-rose-100/80">
            Environment: <span className="text-rose-300 font-bold">{(profile.environment || 'cloud').toUpperCase()}</span>
            <br />
            Safety Mode: <span className="text-rose-300 font-bold">{(profile.safetyMode || 'strict').toUpperCase()}</span>
          </SurfaceCard>
        ) : (
          <EmptyState
            size="sm"
            title="No execution profile yet"
            description="Initialize Forge to load runtime settings."
            className="bg-transparent border-white/10"
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-[9px] font-black text-white/50 uppercase tracking-widest italic">Recent Sessions</h4>
        {sessions.slice(0, 5).map((session) => (
          <div key={session.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
            <div className="text-white/80">{session.command}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-rose-300">{session.result}</div>
          </div>
        ))}
        {sessions.length === 0 && (
          <EmptyState
            size="sm"
            title="No forge sessions yet"
            description="Queue a command in chat to initialize runtime state."
            className="bg-transparent border-white/10"
          />
        )}
      </section>
    </div>
  );
}
