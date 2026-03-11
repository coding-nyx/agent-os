import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, ExternalLink, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SomaSnapshotWidgetProps {
  clearanceStatus?: 'granted' | 'pending' | 'denied' | null;
  lastBiomarkerDate?: string | null;
  className?: string;
}

export function SomaSnapshotWidget({ clearanceStatus, lastBiomarkerDate, className }: SomaSnapshotWidgetProps) {
  const navigate = useNavigate();

  const statusConfig = {
    granted: { icon: ShieldCheck, color: 'emerald', label: 'Cleared for Training', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    pending: { icon: AlertTriangle, color: 'amber', label: 'Clearance Pending', bg: 'bg-amber-500/10 border-amber-500/20' },
    denied: { icon: AlertTriangle, color: 'rose', label: 'Clearance Denied', bg: 'bg-rose-500/10 border-rose-500/20' },
  };

  const config = clearanceStatus ? statusConfig[clearanceStatus] : null;

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/soma')}
      className={cn(
        'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-left transition-all hover:brightness-110',
        config ? config.bg : 'bg-white/5 border-white/10',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        {config ? (
          <config.icon className={cn('w-4 h-4', `text-${config.color}-400`)} />
        ) : (
          <Activity className="w-4 h-4 text-white/40" />
        )}
        <div>
          <p className="text-xs font-bold text-white/80">{config?.label ?? 'Soma Health'}</p>
          {lastBiomarkerDate && (
            <p className="text-[10px] text-white/40">
              Last check: {new Date(lastBiomarkerDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-white/30">
        <span>View Soma</span>
        <ExternalLink className="w-3 h-3" />
      </div>
    </motion.button>
  );
}
