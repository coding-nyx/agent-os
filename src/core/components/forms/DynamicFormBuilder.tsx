/**
 * Dynamic Form Builder Component
 * Generates forms dynamically from FieldSchema using existing Shadcn/Neural components
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { FieldSchema, FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import { FormFieldWrapper } from './FormFieldWrapper';
import { FormSection } from './FormSection';
import {
  TextFieldRenderer,
  TextAreaFieldRenderer,
  NumberFieldRenderer,
  RangeFieldRenderer,
  BooleanFieldRenderer,
  DateFieldRenderer,
  SelectFieldRenderer,
  MultiSelectFieldRenderer,
  ObjectFieldRenderer,
} from './field-renderers';
import { NeuralButton } from '@/core/components/NeuralButton';

export interface DynamicFormBuilderProps {
  /** Field schema to generate form from */
  schema: FieldSchema;
  /** Current form values */
  values: Record<string, any>;
  /** Called when a field value changes */
  onChange: (fieldId: string, value: any) => void;
  /** Optional submit handler */
  onSubmit?: (values: Record<string, any>) => void;
  /** Validation errors by field ID */
  errors?: Record<string, string>;
  /** Whether form is disabled */
  disabled?: boolean;
  /** Whether to show submit button */
  showSubmit?: boolean;
  /** Submit button label */
  submitLabel?: string;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function DynamicFormBuilder({
  schema,
  values,
  onChange,
  onSubmit,
  errors = {},
  disabled = false,
  showSubmit = true,
  submitLabel = 'Submit',
  isSubmitting = false,
  className,
}: DynamicFormBuilderProps) {
  // Combine core and extension fields
  const allFields = [...schema.coreFields, ...schema.extensionFields];

  // Group fields by category
  const fieldsByCategory = React.useMemo(() => {
    const grouped = new Map<string, FieldDefinition[]>();

    allFields.forEach((field) => {
      const category = field.metadata?.category || 'General';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(field);
    });

    // Sort fields within each category by order
    grouped.forEach((fields) => {
      fields.sort((a, b) => {
        const orderA = a.metadata?.order ?? 999;
        const orderB = b.metadata?.order ?? 999;
        return orderA - orderB;
      });
    });

    return grouped;
  }, [allFields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit && !disabled && !isSubmitting) {
      onSubmit(values);
    }
  };

  const renderField = (field: FieldDefinition) => {
    const value = values[field.id];
    const error = errors[field.id];

    // Object fields handle their own wrapper
    if (field.type === FieldType.OBJECT) {
      return (
        <ObjectFieldRenderer
          key={field.id}
          field={field}
          value={value}
          onChange={(val) => onChange(field.id, val)}
          errors={errors}
          disabled={disabled}
        />
      );
    }

    let fieldComponent: React.ReactNode = null;

    switch (field.type) {
      case FieldType.TEXT:
        fieldComponent = (
          <TextFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.TEXTAREA:
        fieldComponent = (
          <TextAreaFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.NUMBER:
        fieldComponent = (
          <NumberFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.RANGE:
        fieldComponent = (
          <RangeFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.BOOLEAN:
        fieldComponent = (
          <BooleanFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.DATE:
        fieldComponent = (
          <DateFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.SELECT:
        fieldComponent = (
          <SelectFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      case FieldType.MULTI_SELECT:
        fieldComponent = (
          <MultiSelectFieldRenderer
            field={field}
            value={value}
            onChange={(val) => onChange(field.id, val)}
            error={error}
            disabled={disabled}
          />
        );
        break;

      default:
        fieldComponent = (
          <div className="text-xs text-red-400">
            Unsupported field type: {field.type}
          </div>
        );
    }

    return (
      <FormFieldWrapper
        key={field.id}
        fieldId={field.id}
        label={field.name}
        description={field.description}
        required={field.required}
        error={error}
        disabled={disabled}
      >
        {fieldComponent}
      </FormFieldWrapper>
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-6', className)}
      noValidate
    >
      {/* Render fields grouped by category */}
      {Array.from(fieldsByCategory.entries()).map(([category, fields]) => (
        <FormSection
          key={category}
          title={category}
          collapsible={fieldsByCategory.size > 1}
          defaultCollapsed={false}
        >
          <div className="space-y-6">
            {fields.map((field) => renderField(field))}
          </div>
        </FormSection>
      ))}

      {/* Submit button */}
      {showSubmit && onSubmit && (
        <div className="flex justify-end pt-4">
          <NeuralButton
            type="submit"
            disabled={disabled || isSubmitting}
            className="min-w-[140px]"
          >
            {isSubmitting ? 'Submitting...' : submitLabel}
          </NeuralButton>
        </div>
      )}

      {/* Show message if no fields */}
      {allFields.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-white/40 italic">No fields defined</p>
        </div>
      )}
    </form>
  );
}
