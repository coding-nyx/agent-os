/**
 * Range Field Renderer
 * Renders RANGE type fields with a slider control
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface RangeFieldRendererProps {
  field: FieldDefinition;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  disabled?: boolean;
}

export function RangeFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: RangeFieldRendererProps) {
  const min = field.validation?.minimum || 0;
  const max = field.validation?.maximum || 100;
  const step = field.validation?.multipleOf || 1;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  // Calculate percentage for gradient
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-3">
      {/* Value display */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/40">{min}</span>
        <div
          className={cn(
            'px-4 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20',
            'text-sm font-bold text-indigo-300'
          )}
        >
          {value ?? min}
        </div>
        <span className="text-xs text-white/40">{max}</span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          id={field.id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${field.id}-error` : undefined}
          className={cn(
            'w-full h-2 rounded-full appearance-none cursor-pointer',
            'bg-white/10',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-5',
            '[&::-webkit-slider-thumb]:h-5',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-gradient-to-r',
            '[&::-webkit-slider-thumb]:from-indigo-400',
            '[&::-webkit-slider-thumb]:to-purple-400',
            '[&::-webkit-slider-thumb]:shadow-lg',
            '[&::-webkit-slider-thumb]:shadow-indigo-500/50',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:transition-transform',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            '[&::-moz-range-thumb]:appearance-none',
            '[&::-moz-range-thumb]:w-5',
            '[&::-moz-range-thumb]:h-5',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-gradient-to-r',
            '[&::-moz-range-thumb]:from-indigo-400',
            '[&::-moz-range-thumb]:to-purple-400',
            '[&::-moz-range-thumb]:border-0',
            '[&::-moz-range-thumb]:shadow-lg',
            '[&::-moz-range-thumb]:shadow-indigo-500/50',
            '[&::-moz-range-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:transition-transform',
            '[&::-moz-range-thumb]:hover:scale-110'
          )}
          style={{
            background: `linear-gradient(to right, rgba(99,102,241,0.6) 0%, rgba(99,102,241,0.6) ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
