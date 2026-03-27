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
          'w-full rounded-xl border border-white/[0.10] bg-slate-900/70 text-white/95 placeholder:text-white/30',
          'px-4 py-3 text-[0.9375rem] leading-relaxed resize-none',
          'focus:outline-none focus:border-[var(--module-accent-border)] focus:ring-2 focus:ring-[var(--module-accent-ring)]',
          'disabled:opacity-35 disabled:cursor-not-allowed',
          'transition-colors duration-200 backdrop-blur-sm',
          variant === 'mono' && 'font-mono text-[13px]',
          className
        )}
        {...props}
      />
    );
  }
);
NeuralTextarea.displayName = 'NeuralTextarea';
