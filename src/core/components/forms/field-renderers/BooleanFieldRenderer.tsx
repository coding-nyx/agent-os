/**
 * Boolean Field Renderer
 * Renders BOOLEAN type fields using Radix UI Switch
 */

import React from 'react';
import * as Switch from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface BooleanFieldRendererProps {
  field: FieldDefinition;
  value: boolean;
  onChange: (value: boolean) => void;
  error?: string;
  disabled?: boolean;
}

export function BooleanFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: BooleanFieldRendererProps) {
  return (
    <div className="flex items-center space-x-3 h-12">
      <Switch.Root
        id={field.id}
        checked={value || false}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field.id}-error` : undefined}
        className={cn(
          'relative w-12 h-6 rounded-full transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-black/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          value
            ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
            : 'bg-white/10',
          error && 'ring-2 ring-red-500/50'
        )}
      >
        <Switch.Thumb
          className={cn(
            'block w-5 h-5 rounded-full bg-white shadow-lg',
            'transition-transform duration-200',
            'translate-x-0.5',
            value && 'translate-x-[26px]'
          )}
        />
      </Switch.Root>

      {/* Optional label next to switch */}
      {field.metadata?.switchLabel && (
        <span className="text-sm text-white/60">
          {field.metadata.switchLabel}
        </span>
      )}
    </div>
  );
}
