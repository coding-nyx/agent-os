import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClearanceBannerProps {
  status?: 'granted' | 'pending' | 'denied' | null;
  className?: string;
}

export function ClearanceBanner({ status, className }: ClearanceBannerProps) {
  const navigate = useNavigate();
  if (!status || status === 'granted') return null;

  const isDenied = status === 'denied';

  return (
    <button
      onClick={() => navigate('/soma?tab=clearance')}
      className={cn(
        'w-full flex items-center justify-between px-3 sm:px-4 py-3 min-h-[2.75rem] sm:min-h-[3rem] rounded-xl border text-left',
        isDenied
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] sm:text-xs font-bold leading-snug">
          {isDenied ? 'Medical clearance denied — review in Soma before training' : 'Clearance pending — submit review in Soma'}
        </span>
      </div>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}
