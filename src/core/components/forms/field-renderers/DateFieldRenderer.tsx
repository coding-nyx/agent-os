/**
 * Date Field Renderer
 * Renders DATE type fields with a native date picker styled to match Neural theme
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface DateFieldRendererProps {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function DateFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: DateFieldRendererProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const min = field.validation?.minimum
    ? new Date(field.validation.minimum).toISOString().split('T')[0]
    : undefined;
  const max = field.validation?.maximum
    ? new Date(field.validation.maximum).toISOString().split('T')[0]
    : undefined;

  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-indigo-400 transition-colors pointer-events-none">
        <Calendar className="w-4 h-4" />
      </div>
      <input
        id={field.id}
        type="date"
        value={value || ''}
        onChange={handleChange}
        min={min}
        max={max}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field.id}-error` : undefined}
        className={cn(
          'w-full bg-slate-900/70 border border-white/[0.12] rounded-2xl h-12 pl-12 pr-4 text-sm text-white',
          'focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
          'transition-all duration-300',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Style the calendar icon
          '[&::-webkit-calendar-picker-indicator]:opacity-50',
          '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
          '[&::-webkit-calendar-picker-indicator]:hover:opacity-100',
          '[&::-webkit-calendar-picker-indicator]:transition-opacity',
          error && 'border-red-500/50'
        )}
      />
    </div>
  );
}
