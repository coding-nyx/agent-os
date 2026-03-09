/**
 * ValidationPreview Component
 * Preview field validation with sample data
 */

import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldDefinition, FieldType } from '@/lib/field-system/types';
import { DynamicFormBuilder } from '../forms/DynamicFormBuilder';

export interface ValidationPreviewProps {
  field: FieldDefinition;
  className?: string;
}

export function ValidationPreview({ field, className }: ValidationPreviewProps) {
  const [testValue, setTestValue] = useState<any>('');
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
  } | null>(null);

  // Build a minimal schema for the preview
  const previewSchema = {
    version: '1.0.0',
    coreFields: [],
    extensionFields: [field],
  };

  const handleValueChange = (fieldId: string, value: any) => {
    setTestValue(value);
    validateValue(value);
  };

  const validateValue = (value: any) => {
    const errors: string[] = [];

    // Required validation
    if (field.required && (value === null || value === undefined || value === '')) {
      errors.push('This field is required');
    }

    // Type-specific validation
    if (value !== null && value !== undefined && value !== '') {
      switch (field.type) {
        case FieldType.TEXT:
        case FieldType.TEXTAREA:
          if (typeof value === 'string') {
            if (field.validation?.minLength && value.length < field.validation.minLength) {
              errors.push(
                `Minimum length is ${field.validation.minLength} characters`
              );
            }
            if (field.validation?.maxLength && value.length > field.validation.maxLength) {
              errors.push(
                `Maximum length is ${field.validation.maxLength} characters`
              );
            }
            if (field.validation?.pattern) {
              const regex = new RegExp(field.validation.pattern);
              if (!regex.test(value)) {
                errors.push(`Value does not match required pattern`);
              }
            }
          }
          break;

        case FieldType.NUMBER:
        case FieldType.RANGE:
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            errors.push('Value must be a valid number');
          } else {
            if (
              field.validation?.minimum !== undefined &&
              numValue < field.validation.minimum
            ) {
              errors.push(`Minimum value is ${field.validation.minimum}`);
            }
            if (
              field.validation?.maximum !== undefined &&
              numValue > field.validation.maximum
            ) {
              errors.push(`Maximum value is ${field.validation.maximum}`);
            }
          }
          break;

        case FieldType.SELECT:
          if (field.options) {
            const validValues = field.options.map((opt) => opt.value);
            if (!validValues.includes(value)) {
              errors.push('Value must be one of the available options');
            }
          }
          break;

        case FieldType.MULTI_SELECT:
          if (Array.isArray(value) && field.options) {
            const validValues = field.options.map((opt) => opt.value);
            const invalidValues = value.filter((v) => !validValues.includes(v));
            if (invalidValues.length > 0) {
              errors.push('Some selected values are not valid options');
            }
          }
          break;
      }
    }

    setValidationResult({
      isValid: errors.length === 0,
      errors,
    });
  };

  const getStatusColor = () => {
    if (!validationResult) return 'text-white/40';
    return validationResult.isValid ? 'text-emerald-400' : 'text-red-400';
  };

  const getStatusIcon = () => {
    if (!validationResult) return AlertCircle;
    return validationResult.isValid ? CheckCircle2 : XCircle;
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">
            Validation Preview
          </p>
          {validationResult && (
            <div className="flex items-center gap-1">
              <StatusIcon className={cn('w-3 h-3', getStatusColor())} />
              <span className={cn('text-[10px] font-bold uppercase', getStatusColor())}>
                {validationResult.isValid ? 'Valid' : 'Invalid'}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-white/40">
          Test the field with sample data to see how validation works
        </p>
      </div>

      {/* Field Preview */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <DynamicFormBuilder
          schema={previewSchema}
          values={{ [field.id]: testValue }}
          onChange={handleValueChange}
          showSubmit={false}
        />
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div
          className={cn(
            'rounded-xl border p-4',
            validationResult.isValid
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-red-500/20 bg-red-500/5'
          )}
        >
          <div className="flex items-start gap-3">
            <StatusIcon
              className={cn('w-5 h-5 flex-shrink-0 mt-0.5', getStatusColor())}
            />
            <div className="flex-1">
              <p className={cn('text-sm font-bold', getStatusColor())}>
                {validationResult.isValid ? 'Validation Passed' : 'Validation Failed'}
              </p>
              {validationResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {validationResult.errors.map((error, index) => (
                    <li key={index} className="text-xs text-white/60 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Validation Rules Summary */}
      {field.validation && Object.keys(field.validation).length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">
            Active Validation Rules
          </p>
          <div className="space-y-2">
            {field.required && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>Field is required</span>
              </div>
            )}
            {field.validation.minLength && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>Minimum length: {field.validation.minLength}</span>
              </div>
            )}
            {field.validation.maxLength && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>Maximum length: {field.validation.maxLength}</span>
              </div>
            )}
            {field.validation.minimum !== undefined && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>Minimum value: {field.validation.minimum}</span>
              </div>
            )}
            {field.validation.maximum !== undefined && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>Maximum value: {field.validation.maximum}</span>
              </div>
            )}
            {field.validation.pattern && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span className="font-mono">Pattern: {field.validation.pattern}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Field Type Info */}
      <div className="text-xs text-white/40">
        <p>
          <strong>Field Type:</strong> {field.type}
        </p>
        {field.options && field.options.length > 0 && (
          <p className="mt-1">
            <strong>Options:</strong> {field.options.length} available
          </p>
        )}
      </div>
    </div>
  );
}
