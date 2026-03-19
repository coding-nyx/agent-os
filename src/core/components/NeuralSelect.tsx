import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NeuralSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export const NeuralSelect = React.forwardRef<HTMLSelectElement, NeuralSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-xl border border-white/10 bg-black/40 text-white/90',
            'px-4 py-2.5 pr-10 text-sm leading-relaxed',
            'focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-colors duration-200 backdrop-blur-sm cursor-pointer',
            '[&>option]:bg-[#0a0a0f] [&>option]:text-white',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
      </div>
    );
  }
);
NeuralSelect.displayName = 'NeuralSelect';
