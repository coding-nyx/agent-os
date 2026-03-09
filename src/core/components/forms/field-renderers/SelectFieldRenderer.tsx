/**
 * Select Field Renderer
 * Renders SELECT type fields using Radix UI Select
 */

import React from 'react';
import * as Select from '@radix-ui/react-select';
import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface SelectFieldRendererProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

export function SelectFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: SelectFieldRendererProps) {
  const options = field.options || [];

  return (
    <Select.Root
      value={value ? String(value) : undefined}
      onValueChange={(val) => {
        // Try to preserve original type
        const option = options.find((opt) => String(opt.value) === val);
        onChange(option ? option.value : val);
      }}
      disabled={disabled}
    >
      <Select.Trigger
        id={field.id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field.id}-error` : undefined}
        className={cn(
          'w-full bg-black/40 border border-white/10 rounded-2xl h-12 px-4 text-sm text-white',
          'flex items-center justify-between gap-2',
          'focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20',
          'transition-all duration-300',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'data-[placeholder]:text-white/40',
          error && 'border-red-500/50'
        )}
      >
        <Select.Value placeholder={field.metadata?.placeholder || 'Select...'} />
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-white/40" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className={cn(
            'overflow-hidden',
            'bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl',
            'shadow-2xl shadow-black/50'
          )}
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="p-2">
            {options.map((option) => (
              <Select.Item
                key={String(option.value)}
                value={String(option.value)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 rounded-xl',
                  'text-sm text-white/80 cursor-pointer',
                  'outline-none',
                  'hover:bg-white/10 hover:text-white',
                  'focus:bg-indigo-500/20 focus:text-white',
                  'data-[state=checked]:bg-indigo-500/30 data-[state=checked]:text-white',
                  'transition-colors'
                )}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <Check className="w-4 h-4 text-indigo-400" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
