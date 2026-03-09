/**
 * Text Field Renderer
 * Renders TEXT type fields using NeuralInput
 */

import React from 'react';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { FieldDefinition } from '@/lib/field-system/types';

export interface TextFieldRendererProps {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function TextFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: TextFieldRendererProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <NeuralInput
      id={field.id}
      type="text"
      value={value || ''}
      onChange={handleChange}
      placeholder={field.metadata?.placeholder || field.name}
      disabled={disabled}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${field.id}-error` : undefined}
      className={error ? 'border-red-500/50' : undefined}
    />
  );
}
