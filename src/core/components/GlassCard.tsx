
import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  glowColor?: string;
}

export function GlassCard({ 
  children, 
  className, 
  glow = false,
  glowColor = 'rgba(99,102,241,0.2)' 
}: GlassCardProps) {
  return (
    <div className={cn(
    'relative bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-card overflow-hidden',
      glow && 'shadow-2xl',
      className
    )}
    style={glow ? { boxShadow: `0 0 40px ${glowColor}` } : {}}
    >
      {/* Internal Grid Sub-layer */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  );
}
