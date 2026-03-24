import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClearanceBannerProps {
  status?: 'granted' | 'pending' | 'conditional' | 'denied' | null;
  className?: string;
  activeDebtCount?: number;
  enforcementMessage?: string | null;
}

export function ClearanceBanner({
  status,
  className,
  activeDebtCount = 0,
  enforcementMessage = null,
}: ClearanceBannerProps) {
  const navigate = useNavigate();
  if ((!status || status === 'granted') && activeDebtCount === 0 && !enforcementMessage) return null;

  const isDenied = status === 'denied' || activeDebtCount > 0;
  const message = activeDebtCount > 0
    ? enforcementMessage ?? 'Soma veto override recorded — Titan remains in debt repayment until clearance is restored.'
    : isDenied
      ? 'Medical clearance denied — review in Soma before training'
      : status === 'conditional'
        ? 'Conditional clearance — reduce intensity and review guidance in Soma'
        : 'Clearance pending — submit review in Soma';

  return (
    <button
      onClick={() => navigate('/soma?tab=clearance')}
      className={cn(
        'w-full flex items-center justify-between px-3 sm:px-4 py-3 min-h-[2.75rem] sm:min-h-[3rem] rounded-xl border text-left',
        isDenied
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]',
        className
      )}
    >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] sm:text-xs font-bold leading-snug">
            {message}
          </span>
        </div>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}
