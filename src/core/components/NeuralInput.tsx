
import React from 'react';
import { cn } from '@/lib/utils';

interface NeuralInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const NeuralInput = React.forwardRef<HTMLInputElement, NeuralInputProps>(
  ({ 
    label, 
    icon, 
    className,
    id: externalId,
    ...props 
  }, ref) => {
    const autoId = React.useId();
    const id = externalId ?? autoId;

    return (
      <div className="space-y-2 w-full">
        {label && (
          <label htmlFor={id} className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[var(--module-accent)] transition-colors">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            aria-label={!label ? props.placeholder ?? props.name : undefined}
            className={cn(
              'w-full bg-black/40 border border-white/10 rounded-2xl min-h-[44px] h-12 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--module-accent-border)] focus:ring-1 focus:ring-[var(--module-accent-ring)] transition-all duration-300',
              icon && 'pl-12',
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);
NeuralInput.displayName = 'NeuralInput';
