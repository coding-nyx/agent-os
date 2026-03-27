
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
  | 'fuchsia'
  | 'violet';

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
  | 'fuchsia'
  | 'violet';

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
  orange: 'bg-[var(--nb-orange-bg,#f97316)] text-[var(--nb-orange-text,#ffffff)] hover:bg-[var(--nb-orange-hover,#fb923c)] border-[var(--nb-orange-border,rgba(251,146,60,0.2))] focus-visible:ring-[var(--nb-orange-ring,#fb923c)] shadow-[var(--nb-orange-shadow,0_0_0_0)]',
  cyan: 'bg-cyan-600 text-white hover:bg-cyan-500 border-cyan-400/20 focus-visible:ring-cyan-400',
  lime: 'bg-lime-600 text-white hover:bg-lime-500 border-lime-400/20 focus-visible:ring-lime-400',
  rose: 'bg-rose-600 text-white hover:bg-rose-500 border-rose-400/20 focus-visible:ring-rose-500',
  amber: 'bg-amber-600 text-white hover:bg-amber-500 border-amber-400/20 focus-visible:ring-amber-400',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-400/20 focus-visible:ring-emerald-400',
  white: 'bg-white text-black hover:bg-white/90 border-white/20 focus-visible:ring-white',
  module: 'bg-[var(--module-accent)] text-[var(--module-accent-text,#fff)] hover:bg-[var(--module-accent-hover)] border-[var(--module-accent-border)] focus-visible:ring-[var(--module-accent-ring)] shadow-[var(--module-accent-shadow,0_0_0_0)]',
  red: 'bg-red-600 text-white hover:bg-red-500 border-red-400/20 focus-visible:ring-red-400',
  fuchsia: 'bg-fuchsia-600 text-white hover:bg-fuchsia-500 border-fuchsia-400/20 focus-visible:ring-fuchsia-400',
  violet: 'bg-violet-600 text-white hover:bg-violet-500 border-violet-400/20 focus-visible:ring-violet-400',
};

const OUTLINE_THEME_STYLES: Record<NeuralButtonThemeColor, string> = {
  indigo: 'bg-transparent text-indigo-300 hover:bg-indigo-500/10 border-indigo-400/25 focus-visible:ring-indigo-400',
  orange: 'bg-transparent text-[var(--nb-orange-outline-text,#fdba74)] hover:bg-[var(--nb-orange-outline-hover,rgba(249,115,22,0.1))] border-[var(--nb-orange-outline-border,rgba(251,146,60,0.25))] focus-visible:ring-[var(--nb-orange-ring,#fb923c)]',
  cyan: 'bg-transparent text-cyan-300 hover:bg-cyan-500/10 border-cyan-400/25 focus-visible:ring-cyan-400',
  lime: 'bg-transparent text-lime-300 hover:bg-lime-500/10 border-lime-400/25 focus-visible:ring-lime-400',
  rose: 'bg-transparent text-rose-300 hover:bg-rose-500/10 border-rose-400/25 focus-visible:ring-rose-400',
  amber: 'bg-transparent text-amber-300 hover:bg-amber-500/10 border-amber-400/25 focus-visible:ring-amber-400',
  emerald: 'bg-transparent text-emerald-300 hover:bg-emerald-500/10 border-emerald-400/25 focus-visible:ring-emerald-400',
  white: 'bg-transparent text-white/80 hover:bg-white/8 border-white/20 focus-visible:ring-white',
  module: 'bg-transparent text-[var(--module-accent)] hover:bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] focus-visible:ring-[var(--module-accent-ring)]',
  red: 'bg-transparent text-red-300 hover:bg-red-500/10 border-red-400/25 focus-visible:ring-red-400',
  fuchsia: 'bg-transparent text-fuchsia-300 hover:bg-fuchsia-500/10 border-fuchsia-400/25 focus-visible:ring-fuchsia-400',
  violet: 'bg-transparent text-violet-300 hover:bg-violet-500/10 border-violet-400/25 focus-visible:ring-violet-400',
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
    violet: THEME_STYLES.violet,
  };

  const sizes = {
    sm: 'h-9 min-h-[44px] px-4 text-[12px] tracking-[0.03em]',
    md: 'h-10 min-h-[44px] px-5 text-sm',
    lg: 'h-12 min-h-[44px] px-8 text-base',
    xl: 'h-13 min-h-[48px] px-10 text-base'
  };
  const iconOnlySize = 'h-11 w-11 min-h-[44px] min-w-[44px] p-0';
  const resolvedSizes = sizes;

  const Component = as === 'div' ? motion.div : as === 'span' ? motion.span : motion.button;
  const isDisabled = Boolean(disabled || loading);
  const motionScaleProps: HTMLMotionProps<'button'> | {} =
    !isDisabled ? {
      whileHover: { scale: 1.015 },
      whileTap: { scale: 0.97 },
      transition: { type: 'spring', stiffness: 500, damping: 30 }
    } : {};
  const overflowClass = iconOnly || allowOverflow ? 'overflow-visible' : 'overflow-hidden';
  const resolvedChildren = React.Children.map(children as React.ReactNode, (child) => {
    if (typeof child === 'function') {
      const Child = child as React.ComponentType<any>;
      return <Child />;
    }
    if (React.isValidElement(child)) {
      // Only inject icon props on component elements (e.g. Lucide icons),
      // skip native DOM elements (div, span, p) which don't accept SVG props.
      if (typeof child.type === 'string') return child;
      const props = child.props as Record<string, unknown>;
      const nextProps: Record<string, unknown> = { ...props };
      const needsSize = nextProps.size == null && nextProps.width == null && nextProps.height == null;
      if (nextProps.color == null) nextProps.color = 'currentColor';
      if (nextProps.strokeWidth == null) nextProps.strokeWidth = 2;
      if (needsSize) nextProps.size = 18;
      return React.cloneElement(child, nextProps);
    }
    return child;
  });

  return (
    <Component
      ref={ref}
      className={cn(
        'relative isolate font-medium tracking-[0.04em] rounded-button border transition-all duration-200 flex items-center justify-center group disabled:opacity-35 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none whitespace-nowrap cursor-pointer',
        overflowClass,
        variants[variant],
        iconOnly ? iconOnlySize : resolvedSizes[size],
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
        className="absolute inset-0 z-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      />

      <span className="relative z-10 inline-flex items-center gap-1.5 md:gap-2 [&_svg]:block [&_svg]:opacity-100 [&_svg]:stroke-current [&_svg]:text-current [&_svg]:fill-none">
        {loading ? (
          <>
            <span className="sr-only">Loading</span>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </>
        ) : (
          resolvedChildren as React.ReactNode
        )}
      </span>
    </Component>
  );
});
const NeuralButton = NeuralButtonImpl;
NeuralButton.displayName = 'NeuralButton';

interface NeuralIconButtonProps extends Omit<NeuralButtonProps, 'children'> {
  icon: React.ReactElement;
  iconProps?: Omit<React.SVGProps<SVGElement>, 'children'> & {
    className?: string;
    size?: number | string;
  };
}

const NeuralIconButton = React.forwardRef<any, NeuralIconButtonProps>(function NeuralIconButton(
  { icon, iconProps, ...rest }: NeuralIconButtonProps,
  ref
) {
  const iconBaseProps = icon.props as React.SVGProps<SVGElement> & { size?: number | string };
  const { className: iconClassName, ...restIconProps } = iconProps ?? {};
  const mergedIconProps = {
    ...iconBaseProps,
    ...restIconProps,
    color: restIconProps.color ?? iconBaseProps.color ?? 'currentColor',
    strokeWidth: restIconProps.strokeWidth ?? iconBaseProps.strokeWidth ?? 2,
    size: restIconProps.size ?? iconBaseProps.size ?? 18,
    className: cn(iconBaseProps.className, iconClassName),
  };
  const renderedIcon = React.cloneElement(icon, mergedIconProps);

  return (
    <NeuralButton ref={ref} iconOnly allowOverflow {...rest}>
      {renderedIcon}
    </NeuralButton>
  );
});
NeuralIconButton.displayName = 'NeuralIconButton';

export { NeuralButton, NeuralIconButton };
export default NeuralButton;
