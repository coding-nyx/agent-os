import React from 'react';
import { Code, Mail, FileText, ListChecks, Scroll, Calendar, LucideIcon } from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { ForgeArtifact, ForgeProfile } from '../services/forge-session-service';
import { SectionHeader } from '@/core/components/SectionHeader';
import { StatCard } from '@/core/components/StatCard';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { cn } from '@/lib/utils';

// ── Mode intro cards shown on first-run (no sessions yet) ────────────────────

const MODE_CARDS: {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
  accent: string;
  border: string;
  bg: string;
}[] = [
  {
    id: 'code',
    label: 'CODE',
    description: 'Generate, debug, and refactor code',
    icon: Code,
    prompt: 'I need to write some code.',
    accent: 'text-rose-300',
    border: 'border-rose-500/20',
    bg: 'bg-rose-500/10 hover:bg-rose-500/15'
  },
  {
    id: 'comms',
    label: 'COMMS',
    description: 'Draft emails, messages, and replies',
    icon: Mail,
    prompt: 'I need to draft an email.',
    accent: 'text-amber-300',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/10 hover:bg-amber-500/15'
  },
  {
    id: 'docs',
    label: 'DOCS',
    description: 'Create documents, reports, and structured text',
    icon: FileText,
    prompt: 'I need to create a document.',
    accent: 'text-sky-300',
    border: 'border-sky-500/20',
    bg: 'bg-sky-500/10 hover:bg-sky-500/15'
  },
  {
    id: 'life',
    label: 'LIFE',
    description: 'Plan trips, build checklists, budget events',
    icon: ListChecks,
    prompt: 'Help me plan something.',
    accent: 'text-emerald-300',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/15'
  }
];

function artifactTypeIcon(type: ForgeArtifact['type']): LucideIcon {
  switch (type) {
    case 'code': return Code;
    case 'email': return Mail;
    case 'document': return FileText;
    case 'checklist': return ListChecks;
    case 'plan': return Calendar;
    default: return Scroll;
  }
}

export function ForgeDashboard({
  soul,
  profile,
  isLocked = false,
  onModeSelect
}: {
  soul: GlobalProjection | null;
  profile: ForgeProfile | null;
  isLocked?: boolean;
  onModeSelect?: (prompt: string) => void;
}) {
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Forge"
        moduleDescription="Runtime operations and habit implementation."
      />
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
  const artifacts = profile?.artifacts || [];
  const successful = sessions.filter((session) => session.result === 'success').length;
  const failed = sessions.filter((session) => (session.errorLog?.length || 0) > 0).length;
  const queueDepth = profile?.commandQueue.length ?? null;

  const showModeCards = sessions.length === 0;

  return (
    <div className="p-8 space-y-8">
      <section className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-rose-300">Forge is in progress</p>
        <p className="text-sm text-white/60 mt-1">
          Runtime operations are being finalized. Attempts to write sensitive soul state may be safely ignored.
        </p>
      </section>

      <SectionHeader
        label="Technical Domain"
        title="Forge Runtime"
        subtitle="Sandboxed execution with queued scripts, telemetry, and safety gates."
        accentClassName="text-rose-400"
      />

      {showModeCards ? (
        // ── First-run: Mode Introduction Cards ──────────────────────────────
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">
            What would you like to do?
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {MODE_CARDS.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => onModeSelect?.(mode.prompt)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer',
                    mode.border,
                    mode.bg
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('w-4 h-4', mode.accent)} />
                    <span className={cn('text-[11px] font-black uppercase tracking-[0.25em]', mode.accent)}>
                      {mode.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        // ── Active runtime: Stat cards ───────────────────────────────────────
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
      )}

      <section className="space-y-3">
        <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">Execution Mode</h4>
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

      {!showModeCards && (
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">Recent Sessions</h4>
          {sessions.slice(0, 5).map((session) => (
            <div key={session.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-xs">
              <div className="text-white/80">{session.command}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-rose-300">{session.result}</div>
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
      )}

      {/* ── Artifacts Section ─────────────────────────────────────────────── */}
      {artifacts.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-[0.12em] font-display">
            Recent Artifacts
          </h4>
          {artifacts.slice(0, 6).map((artifact: ForgeArtifact) => {
            const Icon = artifactTypeIcon(artifact.type);
            const date = new Date(artifact.createdAt);
            const dateLabel = isNaN(date.getTime())
              ? ''
              : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <div
                key={artifact.id}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 flex items-start gap-3"
              >
                <Icon className="w-3.5 h-3.5 text-rose-300 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/80 truncate">{artifact.title}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wider text-white/40">
                    {artifact.type}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
