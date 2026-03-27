/**
 * TextArea Field Renderer
 * Renders TEXTAREA type fields with Neural styling
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface TextAreaFieldRendererProps {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function TextAreaFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: TextAreaFieldRendererProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const rows = field.metadata?.rows || 4;

  return (
    <textarea
      id={field.id}
      value={value || ''}
      onChange={handleChange}
      placeholder={field.metadata?.placeholder || field.name}
      disabled={disabled}
      rows={rows}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${field.id}-error` : undefined}
      className={cn(
        'w-full bg-slate-900/70 border border-white/[0.12] rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/40',
        'focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
        'transition-all duration-300 resize-y',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error && 'border-red-500/50'
      )}
    />
  );
}
