/**
 * Multi-Select Field Renderer
 * Renders MULTI_SELECT type fields with checkbox list
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface MultiSelectFieldRendererProps {
  field: FieldDefinition;
  value: any[];
  onChange: (value: any[]) => void;
  error?: string;
  disabled?: boolean;
}

export function MultiSelectFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: MultiSelectFieldRendererProps) {
  const options = field.options || [];
  const selectedValues = value || [];

  const toggleOption = (optionValue: any) => {
    const isSelected = selectedValues.some(
      (v) => String(v) === String(optionValue)
    );

    if (isSelected) {
      // Remove from selection
      onChange(
        selectedValues.filter((v) => String(v) !== String(optionValue))
      );
    } else {
      // Add to selection
      onChange([...selectedValues, optionValue]);
    }
  };

  return (
    <div
      className={cn(
        'space-y-2 p-4 bg-black/20 border border-white/5 rounded-2xl',
        error && 'border-red-500/30'
      )}
      role="group"
      aria-labelledby={field.id}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${field.id}-error` : undefined}
    >
      {options.map((option, index) => {
        const isChecked = selectedValues.some(
          (v) => String(v) === String(option.value)
        );
        const optionId = `${field.id}-option-${index}`;

        return (
          <label
            key={String(option.value)}
            htmlFor={optionId}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl cursor-pointer',
              'transition-colors',
              'hover:bg-white/5',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {/* Custom checkbox */}
            <div className="relative flex-shrink-0">
              <input
                id={optionId}
                type="checkbox"
                checked={isChecked}
                onChange={() => !disabled && toggleOption(option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-5 h-5 rounded-md border-2 transition-all',
                  'flex items-center justify-center',
                  isChecked
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 border-transparent'
                    : 'border-white/20 bg-black/20'
                )}
              >
                {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>

            {/* Option label */}
            <span className="text-sm text-white/80">{option.label}</span>
          </label>
        );
      })}

      {options.length === 0 && (
        <p className="text-xs text-white/40 italic text-center py-2">
          No options available
        </p>
      )}
    </div>
  );
}
