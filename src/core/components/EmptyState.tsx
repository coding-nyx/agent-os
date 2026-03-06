import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = AlertCircle,
  action,
  size = 'md',
  className
}: EmptyStateProps) {
  const sizeClass =
    size === 'sm' ? 'p-4 gap-2 text-xs' : size === 'lg' ? 'p-8 gap-4 text-sm' : 'p-6 gap-3 text-[13px]';

  return (
    <div
      className={cn(
        'surface-card border-dashed border-white/15 text-white/60 flex flex-col items-center text-center',
        sizeClass,
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-white/40" />
      </div>
      <div className="space-y-1">
        <p className="text-white/80 font-semibold tracking-tight">{title}</p>
        {description && <p className="text-white/40 leading-relaxed">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
