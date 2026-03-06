
import React from 'react';
import { cn } from '@/lib/utils';

interface NeuralInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export function NeuralInput({ 
  label, 
  icon, 
  className, 
  ...props 
}: NeuralInputProps) {
  return (
    <div className="space-y-2 w-full">
      {label && (
        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-4 italic">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-indigo-400 transition-colors">
            {icon}
          </div>
        )}
        <input
          className={cn(
            'w-full bg-black/40 border border-white/10 rounded-2xl h-12 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300',
            icon && 'pl-12',
            className
          )}
          {...props}
        />
      </div>
    </div>
  );
}
