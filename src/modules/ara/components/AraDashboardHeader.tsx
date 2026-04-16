import React from 'react';
import type { ThreadParticipant } from '@/lib/contracts/orchestration';
import { OrchestrationStatusChip } from '@/core/components/OrchestrationStatusChip';
import { AraAgentPresenceStack } from '@/core/components/AraAgentPresenceStack';
import { SlidersHorizontal, Trash2 } from 'lucide-react';

interface AraDashboardHeaderProps {
  welcomeGreeting: string;
  welcomeName: string | undefined;
  participants: ThreadParticipant[];
  onOpenOperations: () => void;
  onClearChat: () => void;
}

export const AraDashboardHeader = React.memo(function AraDashboardHeader({
  welcomeGreeting,
  welcomeName,
  participants,
  onOpenOperations,
  onClearChat,
}: AraDashboardHeaderProps) {
  return (
    <div className="shrink-0 px-3 pt-2 sm:px-4 sm:pt-3">
      {/* ── Mobile header (< sm): flat minimal bar ── */}
      <div className="flex sm:hidden items-center gap-2 py-1">
        {/* Status dot */}
        <div className="shrink-0 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
        {/* Greeting */}
        <div className="flex-1 min-w-0">
          <p className="text-[0.8125rem] font-semibold text-white truncate leading-tight">
            {welcomeGreeting}{welcomeName ? `, ${welcomeName}` : ''}
          </p>
        </div>
        {/* Icon-only actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            data-testid="ara-open-ops"
            onClick={onOpenOperations}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-cyan-400/70 hover:text-cyan-300 hover:bg-cyan-400/[0.08] active:scale-90 transition-all"
            aria-label="Open operations"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="ara-clear-chat"
            onClick={onClearChat}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] active:scale-90 transition-all"
            aria-label="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Desktop header (≥ sm): full row with status ── */}
      <div className="hidden sm:block rounded-2xl border border-cyan-500/20 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.10)_0%,transparent_60%),linear-gradient(160deg,rgba(10,18,30,0.98)_0%,rgba(5,8,14,0.99)_100%)] px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(34,211,238,0.10)]">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.15)]">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight tracking-tight text-white font-display truncate">
              {welcomeGreeting}{welcomeName ? `, ${welcomeName}` : ''}
            </h1>
            <p className="text-[11px] text-cyan-400/55 font-medium leading-tight mt-0.5">Ara · Orchestrator</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <OrchestrationStatusChip compact variant="minimal" />
            <AraAgentPresenceStack participants={participants} />
            <div className="w-px h-4 bg-white/10" />
            <button
              type="button"
              data-testid="ara-open-ops"
              onClick={onOpenOperations}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-cyan-300 transition-all hover:border-cyan-300/45 hover:bg-cyan-300/[0.12] active:scale-95 min-h-[32px]"
            >
              Ops
            </button>
            <button
              type="button"
              data-testid="ara-clear-chat"
              onClick={onClearChat}
              className="inline-flex items-center rounded-lg border border-white/[0.09] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-white/50 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white/80 active:scale-95 min-h-[32px]"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
