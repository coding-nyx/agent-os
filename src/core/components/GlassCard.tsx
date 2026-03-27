
import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  glowColor?: string;
  /** Elevated variant — stronger background and heavier shadow */
  elevated?: boolean;
  /** Interactive — adds hover/press transitions */
  interactive?: boolean;
  as?: React.ElementType;
}

export function GlassCard({
  children,
  className,
  glow = false,
  glowColor = 'rgba(99,102,241,0.18)',
  elevated = false,
  interactive = false,
  as: Tag = 'div',
}: GlassCardProps) {
  const bgBorder = elevated
    ? 'bg-white/[0.072] border-white/[0.13]'
    : 'bg-white/[0.045] border-white/[0.09]';

  return React.createElement(
    Tag,
    {
      className: cn(
        'relative backdrop-blur-2xl border rounded-card overflow-hidden',
        'shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
        bgBorder,
        interactive && [
          'transition-all duration-200 cursor-pointer',
          'hover:bg-white/[0.062] hover:border-white/[0.14]',
          'hover:shadow-[0_4px_16px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.12)]',
          'active:scale-[0.995] active:bg-white/[0.038]',
        ],
        glow && 'shadow-2xl',
        className
      ),
      style: glow
        ? {
            boxShadow: `0 0 40px ${glowColor}, 0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)`,
          }
        : undefined,
    },
    <div className="relative z-10 h-full">
      {children}
    </div>
  );
}
