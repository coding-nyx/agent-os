import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SNOOZE_KEY = 'ara_clearance_snooze';
const SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours

function isSnoozed(): boolean {
  try {
    const val = localStorage.getItem(SNOOZE_KEY);
    if (!val) return false;
    return Date.now() < parseInt(val, 10);
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch { /* noop */ }
}

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
  const [snoozed, setSnoozed] = useState(() => isSnoozed());

  // Clear snooze when status resolves
  useEffect(() => {
    if (status && status !== 'pending') {
      try { localStorage.removeItem(SNOOZE_KEY); } catch { /* noop */ }
      setSnoozed(false);
    }
  }, [status]);

  if ((!status || status === 'granted') && activeDebtCount === 0 && !enforcementMessage) return null;
  // Pending-only snooze — denied/conditional always show
  if (snoozed && status === 'pending' && activeDebtCount === 0) return null;

  const isDenied = status === 'denied' || activeDebtCount > 0;
  const isPending = status === 'pending' && activeDebtCount === 0;

  const message = activeDebtCount > 0
    ? enforcementMessage ?? 'Soma veto override recorded — Titan remains in debt repayment until clearance is restored.'
    : isDenied
      ? 'Medical clearance denied — review in Soma before training'
      : status === 'conditional'
        ? 'Conditional clearance — reduce intensity and review guidance in Soma'
        : '3 steps needed in Soma to unlock full training →';

  return (
    <div className={cn(
      'w-full flex items-center rounded-xl border text-left overflow-hidden',
      isDenied
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        : 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]',
      className
    )}>
      <button
        onClick={() => navigate('/soma?tab=clearance')}
        className="flex-1 flex items-center gap-2 px-3 sm:px-4 py-3 min-h-[2.75rem] sm:min-h-[3rem] text-left"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] sm:text-xs font-bold leading-snug flex-1">
          {message}
        </span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      </button>

      {/* Snooze — pending only */}
      {isPending && (
        <button
          onClick={e => { e.stopPropagation(); snooze(); setSnoozed(true); }}
          className="px-3 py-3 self-stretch flex items-center border-l border-[var(--module-accent-border)] text-[var(--module-color-300)]/50 hover:text-[var(--module-color-300)] transition-colors"
          title="Remind me in 24 hours"
          aria-label="Snooze clearance alert for 24 hours"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
