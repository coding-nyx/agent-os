/**
 * Number Field Renderer
 * Renders NUMBER type fields with spinner controls
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Plus, Minus } from 'lucide-react';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface NumberFieldRendererProps {
  field: FieldDefinition;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  disabled?: boolean;
}

export function NumberFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: NumberFieldRendererProps) {
  const min = field.validation?.minimum;
  const max = field.validation?.maximum;
  const step = field.validation?.multipleOf || 1;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value === '' ? 0 : Number(e.target.value);
    onChange(newValue);
  };

  const increment = () => {
    const newValue = (value || 0) + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  const decrement = () => {
    const newValue = (value || 0) - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  return (
    <div className="relative group">
      <input
        id={field.id}
        type="number"
        value={value ?? ''}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        placeholder={field.metadata?.placeholder || '0'}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field.id}-error` : undefined}
        className={cn(
          'w-full bg-black/40 border border-white/10 rounded-2xl h-12 px-4 pr-20 text-sm text-white placeholder:text-white/40',
          'focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
          'transition-all duration-300',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          error && 'border-red-500/50'
        )}
      />

      {/* Custom spinner controls */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || (min !== undefined && (value || 0) <= min)}
          className={cn(
            'w-8 h-8 rounded-xl bg-white/5 border border-white/10',
            'flex items-center justify-center',
            'hover:bg-white/10 hover:border-indigo-500/30 transition-colors',
            'disabled:opacity-30 disabled:cursor-not-allowed'
          )}
          aria-label="Decrement"
        >
          <Minus className="w-3.5 h-3.5 text-white/60" />
        </button>
        <button
          type="button"
          onClick={increment}
          disabled={disabled || (max !== undefined && (value || 0) >= max)}
          className={cn(
            'w-8 h-8 rounded-xl bg-white/5 border border-white/10',
            'flex items-center justify-center',
            'hover:bg-white/10 hover:border-indigo-500/30 transition-colors',
            'disabled:opacity-30 disabled:cursor-not-allowed'
          )}
          aria-label="Increment"
        >
          <Plus className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>
    </div>
  );
}
