
import React from 'react';
import { cn } from '@/lib/utils';

type NeuralInputIcon = React.ReactNode | React.ComponentType<{ className?: string }>;

interface NeuralInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: NeuralInputIcon;
  /** Inline error message displayed below the field */
  error?: string;
  /** Helper text shown below the field (hidden when error is shown) */
  helper?: string;
}

export const NeuralInput = React.forwardRef<HTMLInputElement, NeuralInputProps>(
  ({
    label,
    icon,
    error,
    helper,
    className,
    id: externalId,
    ...props
  }, ref) => {
    const autoId = React.useId();
    const id = externalId ?? autoId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.09em] text-white/65 ml-0.5"
          >
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-[var(--module-accent)] transition-colors duration-200 pointer-events-none">
              {React.isValidElement(icon)
                ? icon
                : typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in (icon as object))
                  ? React.createElement(icon as React.ComponentType<{ className?: string }>, { className: 'w-4 h-4' })
                  : icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            aria-label={!label ? (props.placeholder ?? props.name) : undefined}
            aria-describedby={hasError ? errorId : helper ? helperId : undefined}
            aria-invalid={hasError ? true : undefined}
            className={cn(
              // Base
              'w-full bg-slate-900/70 border rounded-xl text-[0.9375rem] text-white/95',
              // Sizing: min-h ensures 44px touch target; iOS zoom prevention via 1rem (set globally in CSS)
              'min-h-[44px] h-12 px-4',
              // Placeholder
              'placeholder:text-white/35',
              // Transitions
              'transition-all duration-200',
              // Normal border state
              !hasError && 'border-white/[0.12] focus:border-[var(--module-accent-border)]',
              // Focus ring — solid 2px, offset from border
              'focus:outline-none focus:ring-2 focus:ring-[var(--module-accent-ring)] focus:ring-offset-0',
              // Error state
              hasError && 'border-[var(--color-error-border)] focus:border-[var(--color-error-border)] focus:ring-[rgba(239,68,68,0.30)]',
              // Disabled
              'disabled:opacity-40 disabled:cursor-not-allowed',
              // Icon padding
              icon && 'pl-12',
              className
            )}
            {...props}
          />
        </div>
        {hasError && (
          <p id={errorId} role="alert" className="text-[12px] text-[var(--color-error-text)] mt-1 ml-0.5 leading-tight">
            {error}
          </p>
        )}
        {!hasError && helper && (
          <p id={helperId} className="text-[12px] text-white/45 mt-1 ml-0.5 leading-tight">
            {helper}
          </p>
        )}
      </div>
    );
  }
);
NeuralInput.displayName = 'NeuralInput';
