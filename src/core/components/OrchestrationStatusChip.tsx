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
        'inline-flex items-center gap-1 border text-[11px] text-white/70',
        isMinimal
          ? 'rounded-md border-cyan-400/20 bg-cyan-400/[0.08] px-1.5 py-0.5'
          : 'rounded-xl border-white/[0.12] bg-white/[0.045] p-1',
        compact && !isMinimal && 'gap-1 rounded-lg',
      )}
      role="status"
      aria-label="Orchestration status"
    >
      {/* Automation level control */}
      <div className={cn(
        'inline-flex items-center gap-1',
        isMinimal
          ? 'rounded border border-cyan-400/20 bg-slate-900/50 px-1 py-0.5'
          : 'rounded-lg border border-white/[0.12] bg-slate-900/50 px-1.5 py-1',
      )}>
        <Layers3 className="h-3 w-3 text-cyan-300/70" aria-hidden />
        <button
          type="button"
          onClick={() => void lowerAutopilotLevel()}
          className={cn(
            'rounded border px-1 py-0.5 text-[11px] font-bold transition hover:text-white/80 min-h-[20px] min-w-[16px]',
            isMinimal ? 'border-cyan-400/20 text-cyan-100/70' : 'border-white/[0.12] text-white/45',
          )}
          aria-label="Lower autopilot level"
          disabled={isPersisting}
        >
          –
        </button>
        <span className="font-semibold uppercase tracking-[0.12em] text-[11px] min-w-[28px] text-center">
          {levelLabel}
        </span>
        <button
          type="button"
          onClick={() => void raiseAutopilotLevel()}
          className={cn(
            'rounded border px-1 py-0.5 text-[11px] font-bold transition hover:text-white/80 min-h-[20px] min-w-[16px]',
            isMinimal ? 'border-cyan-400/20 text-cyan-100/70' : 'border-white/[0.12] text-white/45',
          )}
          aria-label="Raise autopilot level"
          disabled={isPersisting}
        >
          +
        </button>
      </div>

      {/* Ghost badge — icon only on minimal */}
      <span
        className={cn(
          'inline-flex items-center gap-1 border px-1.5 py-0.5',
          isMinimal ? 'rounded' : 'rounded-lg',
          isGhost
            ? 'border-violet-500/20 bg-violet-500/15 text-violet-300'
            : isMinimal
              ? 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100/70'
              : 'border-white/[0.12] bg-white/[0.05] text-white/55',
        )}
        title={isGhost ? 'Ghost mode' : 'Visible mode'}
      >
        <Ghost className="h-3 w-3" aria-hidden />
        {!isMinimal && (isGhost ? 'Ghost' : 'Visible')}
      </span>

      {/* History badge — icon only on minimal */}
      <span
        className={cn(
          'inline-flex items-center gap-1 border px-1.5 py-0.5',
          isMinimal ? 'rounded' : 'rounded-lg',
          historyMode === 'silent'
            ? 'border-amber-500/20 bg-amber-500/15 text-amber-300'
            : isMinimal
              ? 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100/70'
              : 'border-white/[0.12] bg-white/[0.05] text-white/55',
        )}
        title={historyMode === 'silent' ? 'Silent mode' : 'Standard mode'}
      >
        <History className="h-3 w-3" aria-hidden />
        {!isMinimal && (historyMode === 'silent' ? 'Silent' : 'Standard')}
      </span>
    </div>
  );
}
