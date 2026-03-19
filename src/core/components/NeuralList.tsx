import React from 'react';
import { cn } from '@/lib/utils';

interface NeuralListProps {
  children: React.ReactNode;
  className?: string;
}

export function NeuralList({ children, className }: NeuralListProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden divide-y divide-white/5',
        className
      )}
    >
      {children}
    </div>
  );
}

interface NeuralListItemProps {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function NeuralListItem({
  icon,
  label,
  description,
  trailing,
  onClick,
  selected,
  className,
}: NeuralListItemProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150',
        selected
          ? 'bg-[var(--module-accent-faint)] border-l-2 border-[var(--module-accent)]'
          : 'border-l-2 border-transparent',
        onClick && !selected && 'hover:bg-white/[0.03] cursor-pointer',
        className
      )}
    >
      {icon && (
        <div className="shrink-0 text-white/40">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 truncate">{label}</div>
        {description && (
          <div className="text-xs text-white/40 mt-0.5 truncate">{description}</div>
        )}
      </div>
      {trailing && (
        <div className="shrink-0">{trailing}</div>
      )}
    </Tag>
  );
}
