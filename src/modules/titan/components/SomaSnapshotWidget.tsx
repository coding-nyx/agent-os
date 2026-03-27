import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, ExternalLink, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SomaSnapshotWidgetProps {
  clearanceStatus?: 'granted' | 'pending' | 'conditional' | 'denied' | null;
  lastBiomarkerDate?: string | null;
  className?: string;
  activeDebtCount?: number;
}

export function SomaSnapshotWidget({
  clearanceStatus,
  lastBiomarkerDate,
  className,
  activeDebtCount = 0,
}: SomaSnapshotWidgetProps) {
  const navigate = useNavigate();

  const statusConfig = {
    granted: { icon: ShieldCheck, color: 'emerald', label: 'Cleared for Training', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    pending: { icon: AlertTriangle, color: 'orange', label: 'Clearance Pending', bg: 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)]' },
    conditional: { icon: AlertTriangle, color: 'amber', label: 'Conditional Clearance', bg: 'bg-amber-500/10 border-amber-500/20' },
    denied: { icon: AlertTriangle, color: 'rose', label: 'Clearance Denied', bg: 'bg-rose-500/10 border-rose-500/20' },
  };

  const debtConfig = activeDebtCount > 0
    ? { icon: AlertTriangle, color: 'rose', label: activeDebtCount > 1 ? 'Override Debt Active' : 'Override Debt Active', bg: 'bg-rose-500/10 border-rose-500/20' }
    : null;
  const config = clearanceStatus ? statusConfig[clearanceStatus] : null;
  const displayConfig = debtConfig ?? config;

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/soma')}
      className={cn(
        'w-full flex items-center justify-between px-3 sm:px-4 py-3 min-h-[2.75rem] sm:min-h-[3rem] rounded-xl border text-left transition-all hover:brightness-110',
        displayConfig ? displayConfig.bg : 'bg-white/[0.045] border-white/10',
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {displayConfig ? (
          <displayConfig.icon className={cn('w-4 h-4 shrink-0', `text-${displayConfig.color}-400`)} />
        ) : (
          <Activity className="w-4 h-4 shrink-0 text-white/40" />
        )}
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-bold text-white/80 truncate">
            {displayConfig?.label ?? 'Soma Health'}
          </p>
          {activeDebtCount > 0 && (
            <p className="text-[11px] text-rose-200/80 truncate">
              Titan is carrying override debt until Soma clears training again.
            </p>
          )}
          {lastBiomarkerDate && (
            <p className="text-[11px] text-white/40 truncate">
              Last check: {new Date(lastBiomarkerDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-white/30 shrink-0">
        <span>View Soma</span>
        <ExternalLink className="w-3 h-3" />
      </div>
    </motion.button>
  );
}
