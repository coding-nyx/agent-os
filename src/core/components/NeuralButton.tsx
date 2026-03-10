
import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type NeuralButtonThemeColor = 'indigo' | 'orange' | 'cyan' | 'lime' | 'rose' | 'amber' | 'emerald' | 'white';

interface NeuralButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  themeColor?: NeuralButtonThemeColor;
  loading?: boolean;
  as?: 'button' | 'div' | 'span';
}

const THEME_STYLES: Record<NeuralButtonThemeColor, string> = {
  indigo: 'bg-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] border-indigo-400/20 focus-visible:ring-indigo-400',
  orange: 'bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:bg-orange-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] border-orange-400/20 focus-visible:ring-orange-400',
  cyan: 'bg-cyan-600 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:bg-cyan-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] border-cyan-400/20 focus-visible:ring-cyan-400',
  lime: 'bg-lime-600 shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:bg-lime-500 hover:shadow-[0_0_30px_rgba(132,204,22,0.5)] border-lime-400/20 focus-visible:ring-lime-400',
  rose: 'bg-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:bg-rose-500 hover:shadow-[0_0_30px_rgba(244,63,94,0.5)] border-rose-400/20 focus-visible:ring-rose-400',
  amber: 'bg-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:bg-amber-500 hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] border-amber-400/20 focus-visible:ring-amber-400',
  emerald: 'bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] border-emerald-400/20 focus-visible:ring-emerald-400',
  white: 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-white/90 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] border-white/20 focus-visible:ring-white',
};

export function NeuralButton({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  themeColor = 'indigo',
  loading, 
  disabled,
  as = 'button',
  ...props 
}: NeuralButtonProps) {
  
  const variants = {
    primary: THEME_STYLES[themeColor],
    secondary: 'bg-white/5 text-white hover:bg-white/10 border-white/10',
    ghost: 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border-transparent',
    danger: 'bg-red-950/20 text-red-400 border-red-500/20 hover:bg-red-900/30'
  };

  const sizes = {
    sm: 'h-9 px-4.5 text-[11px]',
    md: 'h-10 px-6 text-sm',
    lg: 'h-12 px-8 text-base',
    xl: 'h-13 px-10 text-base'
  };

  const Component = as === 'div' ? motion.div : as === 'span' ? motion.span : motion.button;

  return (
    <Component
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative font-bold uppercase tracking-[0.15em] rounded-button border transition-all duration-300 flex items-center justify-center gap-1.5 md:gap-2 overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={as === 'button' ? (disabled || loading) : undefined}
      {...(props as any)}
    >
      {/* Glossy Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (children as React.ReactNode)}
    </Component>
  );
}

