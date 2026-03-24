import { Ghost, History, Layers3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrchestrationAutopilotControl } from '@/lib/hooks/use-orchestration-autopilot-control';

interface OrchestrationStatusChipProps {
  compact?: boolean;
  variant?: 'default' | 'minimal';
}

export function OrchestrationStatusChip({
  compact = false,
  variant = 'default',
}: OrchestrationStatusChipProps) {
  const {
    autopilotLevel,
    historyMode,
    isGhost,
    isPersisting,
    levelLabel,
    lowerAutopilotLevel,
    raiseAutopilotLevel,
  } = useOrchestrationAutopilotControl();
  const isMinimal = variant === 'minimal';

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 border text-[10px] text-white/70',
        isMinimal
          ? 'rounded-full border-cyan-400/20 bg-cyan-400/[0.08] px-2 py-1'
          : 'rounded-2xl border-white/10 bg-white/[0.04] p-1',
        compact && !isMinimal && 'gap-1 rounded-xl',
      )}
      role="status"
      aria-label="Orchestration status"
    >
      <div className={cn(
        'inline-flex items-center gap-1',
        isMinimal
          ? 'rounded-full border border-cyan-400/20 bg-black/20 px-1.5 py-1'
          : 'rounded-xl border border-white/10 bg-black/20 px-1.5 py-1',
      )}>
        <Layers3 className="h-3.5 w-3.5 text-cyan-300/70" aria-hidden />
        <button
          type="button"
          onClick={() => void lowerAutopilotLevel()}
          className={cn(
            'rounded border px-1.5 py-0.5 text-[9px] transition hover:text-white/80',
            isMinimal ? 'border-cyan-400/20 text-cyan-100/70' : 'border-white/10 text-white/45',
          )}
          aria-label="Lower autopilot level"
          disabled={isPersisting}
        >
          –
        </button>
        <span className="font-semibold uppercase tracking-[0.16em]">
          {levelLabel}
        </span>
        <button
          type="button"
          onClick={() => void raiseAutopilotLevel()}
          className={cn(
            'rounded border px-1.5 py-0.5 text-[9px] transition hover:text-white/80',
            isMinimal ? 'border-cyan-400/20 text-cyan-100/70' : 'border-white/10 text-white/45',
          )}
          aria-label="Raise autopilot level"
          disabled={isPersisting}
        >
          +
        </button>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-1 border px-1.5 py-1',
          isMinimal ? 'rounded-full' : 'rounded-xl',
          isGhost
            ? 'border-violet-500/20 bg-violet-500/15 text-violet-300'
            : isMinimal
              ? 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100/70'
              : 'border-white/10 bg-white/[0.05] text-white/55',
        )}
      >
        <Ghost className="h-3 w-3" aria-hidden />
        {isGhost ? 'Ghost' : 'Visible'}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1 border px-1.5 py-1',
          isMinimal ? 'rounded-full' : 'rounded-xl',
          historyMode === 'silent'
            ? 'border-amber-500/20 bg-amber-500/15 text-amber-300'
            : isMinimal
              ? 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100/70'
              : 'border-white/10 bg-white/[0.05] text-white/55',
        )}
      >
        <History className="h-3 w-3" aria-hidden />
        {historyMode === 'silent' ? 'Silent' : 'Standard'}
      </span>
    </div>
  );
}
