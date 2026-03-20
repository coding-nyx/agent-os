
import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type NeuralButtonThemeColor = 'indigo' | 'orange' | 'cyan' | 'lime' | 'rose' | 'amber' | 'emerald' | 'white' | 'module';

interface NeuralButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  themeColor?: NeuralButtonThemeColor;
  loading?: boolean;
  as?: 'button' | 'div' | 'span';
  iconOnly?: boolean;
  allowOverflow?: boolean;
}

const THEME_STYLES: Record<NeuralButtonThemeColor, string> = {
  indigo: 'bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-400/20 focus-visible:ring-indigo-400',
  orange: 'bg-orange-600 text-white hover:bg-orange-500 border-orange-400/20 focus-visible:ring-orange-400',
  cyan: 'bg-cyan-600 text-white hover:bg-cyan-500 border-cyan-400/20 focus-visible:ring-cyan-400',
  lime: 'bg-lime-600 text-white hover:bg-lime-500 border-lime-400/20 focus-visible:ring-lime-400',
  rose: 'bg-rose-600 text-white hover:bg-rose-500 border-rose-400/20 focus-visible:ring-rose-500',
  amber: 'bg-amber-600 text-white hover:bg-amber-500 border-amber-400/20 focus-visible:ring-amber-400',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-400/20 focus-visible:ring-emerald-400',
  white: 'bg-white text-black hover:bg-white/90 border-white/20 focus-visible:ring-white',
  module: 'bg-[var(--module-accent)] text-white hover:bg-[var(--module-accent-hover)] border-[var(--module-accent-border)] focus-visible:ring-[var(--module-accent-ring)]',
};

export function NeuralButton({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  themeColor = 'module',
  loading, 
  disabled,
  as = 'button',
  iconOnly = false,
  allowOverflow = false,
  ...props 
}: NeuralButtonProps) {
  const variants: Record<NonNullable<NeuralButtonProps['variant']>, string> = {
    primary: THEME_STYLES[themeColor],
    secondary: 'bg-white/5 text-white hover:bg-white/10 border-white/10 focus-visible:ring-white',
    ghost: 'bg-transparent text-white/60 hover:bg-white/5 border-transparent',
    danger: THEME_STYLES.rose,
  };

  const sizes = {
    sm: 'h-9 px-4.5 text-[11px]',
    md: 'h-10 px-6 text-sm',
    lg: 'h-12 px-8 text-base',
    xl: 'h-13 px-10 text-base'
  };
  const iconOnlySize = 'h-11 w-11 p-0';

  const Component = as === 'div' ? motion.div : as === 'span' ? motion.span : motion.button;
  const isDisabled = Boolean(disabled || loading);
  const motionScaleProps: HTMLMotionProps<'button'> | {} =
    !isDisabled ? { whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 } } : {};
  const overflowClass = allowOverflow ? 'overflow-visible' : 'overflow-hidden';

  return (
    <Component
      className={cn(
        'relative font-medium tracking-[0.04em] rounded-button border transition-all duration-300 flex items-center justify-center gap-1.5 md:gap-2 group disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none whitespace-nowrap',
        overflowClass,
        variants[variant],
        iconOnly ? iconOnlySize : sizes[size],
        className
      )}
      {...(motionScaleProps as any)}
      disabled={as === 'button' ? isDisabled : undefined}
      aria-busy={as === 'button' ? (loading ? true : undefined) : undefined}
      aria-disabled={as === 'button' ? (disabled ? true : undefined) : undefined}
      {...(props as any)}
    >
      {/* Toplight sheen (decorative) */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      />

      {loading ? (
        <>
          <span className="sr-only">Loading</span>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </>
      ) : (
        children as React.ReactNode
      )}
    </Component>
  );
}
