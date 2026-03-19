import React from 'react';
import { cn } from '@/lib/utils';

interface NeuralTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'mono';
  className?: string;
}

export const NeuralTextarea = React.forwardRef<HTMLTextAreaElement, NeuralTextareaProps>(
  ({ variant = 'default', className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-white/10 bg-black/40 text-white/90 placeholder:text-white/20',
          'px-4 py-3 text-sm leading-relaxed resize-none',
          'focus:outline-none focus:border-[var(--module-accent-border)] focus:ring-1 focus:ring-[var(--module-accent-ring)]',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'transition-colors duration-200 backdrop-blur-sm',
          variant === 'mono' && 'font-mono text-xs',
          className
        )}
        {...props}
      />
    );
  }
);
NeuralTextarea.displayName = 'NeuralTextarea';
