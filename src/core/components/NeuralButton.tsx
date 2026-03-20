
import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type NeuralButtonThemeColor =
  | 'indigo'
  | 'orange'
  | 'cyan'
  | 'lime'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'white'
  | 'module'
  | 'red'
  | 'fuchsia';

type NeuralButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline'
  | 'indigo'
  | 'orange'
  | 'cyan'
  | 'lime'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'white'
  | 'module'
  | 'red'
  | 'fuchsia';

interface NeuralButtonProps extends Omit<HTMLMotionProps<'button'>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: NeuralButtonVariant;
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
  red: 'bg-red-600 text-white hover:bg-red-500 border-red-400/20 focus-visible:ring-red-400',
  fuchsia: 'bg-fuchsia-600 text-white hover:bg-fuchsia-500 border-fuchsia-400/20 focus-visible:ring-fuchsia-400',
};

const OUTLINE_THEME_STYLES: Record<NeuralButtonThemeColor, string> = {
  indigo: 'bg-transparent text-indigo-300 hover:bg-indigo-500/10 border-indigo-400/25 focus-visible:ring-indigo-400',
  orange: 'bg-transparent text-orange-300 hover:bg-orange-500/10 border-orange-400/25 focus-visible:ring-orange-400',
  cyan: 'bg-transparent text-cyan-300 hover:bg-cyan-500/10 border-cyan-400/25 focus-visible:ring-cyan-400',
  lime: 'bg-transparent text-lime-300 hover:bg-lime-500/10 border-lime-400/25 focus-visible:ring-lime-400',
  rose: 'bg-transparent text-rose-300 hover:bg-rose-500/10 border-rose-400/25 focus-visible:ring-rose-400',
  amber: 'bg-transparent text-amber-300 hover:bg-amber-500/10 border-amber-400/25 focus-visible:ring-amber-400',
  emerald: 'bg-transparent text-emerald-300 hover:bg-emerald-500/10 border-emerald-400/25 focus-visible:ring-emerald-400',
  white: 'bg-transparent text-white/80 hover:bg-white/8 border-white/20 focus-visible:ring-white',
  module: 'bg-transparent text-[var(--module-accent)] hover:bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] focus-visible:ring-[var(--module-accent-ring)]',
  red: 'bg-transparent text-red-300 hover:bg-red-500/10 border-red-400/25 focus-visible:ring-red-400',
  fuchsia: 'bg-transparent text-fuchsia-300 hover:bg-fuchsia-500/10 border-fuchsia-400/25 focus-visible:ring-fuchsia-400',
};

const NeuralButtonImpl = React.forwardRef<any, NeuralButtonProps>(function NeuralButton({
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
}: NeuralButtonProps, ref) {
  const variants: Record<NeuralButtonVariant, string> = {
    primary: THEME_STYLES[themeColor],
    secondary: 'bg-white/5 text-white hover:bg-white/10 border-white/10 focus-visible:ring-white',
    ghost: 'bg-transparent text-white/60 hover:bg-white/5 border-transparent',
    danger: THEME_STYLES.rose,
    outline: OUTLINE_THEME_STYLES[themeColor],
    indigo: THEME_STYLES.indigo,
    orange: THEME_STYLES.orange,
    cyan: THEME_STYLES.cyan,
    lime: THEME_STYLES.lime,
    rose: THEME_STYLES.rose,
    amber: THEME_STYLES.amber,
    emerald: THEME_STYLES.emerald,
    white: THEME_STYLES.white,
    module: THEME_STYLES.module,
    red: THEME_STYLES.red,
    fuchsia: THEME_STYLES.fuchsia,
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
      ref={ref}
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
});
const NeuralButton = NeuralButtonImpl
NeuralButton.displayName = 'NeuralButton';

export { NeuralButton };
export default NeuralButton;
