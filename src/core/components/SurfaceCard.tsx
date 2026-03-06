import React from 'react';
import { cn } from '@/lib/utils';

type SurfaceVariant = 'base' | 'strong' | 'inset';

interface SurfaceCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: SurfaceVariant;
  glow?: boolean;
  glowColor?: string;
}

export function SurfaceCard({
  children,
  className,
  variant = 'base',
  glow = false,
  glowColor = 'rgba(255,255,255,0.08)'
}: SurfaceCardProps) {
  const variantClass = {
    base: 'surface-card',
    strong: 'surface-card-strong',
    inset: 'surface-inset'
  }[variant];

  return (
    <div
      className={cn('relative overflow-hidden', variantClass, glow && 'shadow-2xl', className)}
      style={glow ? { boxShadow: `0 0 50px ${glowColor}` } : undefined}
    >
      <div className="absolute inset-0 surface-grid pointer-events-none" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
