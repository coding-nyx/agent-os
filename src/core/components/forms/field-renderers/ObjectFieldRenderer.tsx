/**
 * Object Field Renderer
 * Renders nested OBJECT type fields recursively
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import { TextFieldRenderer } from './TextFieldRenderer';
import { TextAreaFieldRenderer } from './TextAreaFieldRenderer';
import { NumberFieldRenderer } from './NumberFieldRenderer';
import { RangeFieldRenderer } from './RangeFieldRenderer';
import { BooleanFieldRenderer } from './BooleanFieldRenderer';
import { DateFieldRenderer } from './DateFieldRenderer';
import { SelectFieldRenderer } from './SelectFieldRenderer';
import { MultiSelectFieldRenderer } from './MultiSelectFieldRenderer';
import { FormFieldWrapper } from '../FormFieldWrapper';

export interface ObjectFieldRendererProps {
  field: FieldDefinition;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

export function ObjectFieldRenderer({
  field,
  value,
  onChange,
  errors = {},
  disabled = false,
}: ObjectFieldRendererProps) {
  const properties = field.properties || {};
  const objectValue = value || {};

  const handleNestedChange = (nestedFieldId: string, nestedValue: any) => {
    onChange({
      ...objectValue,
      [nestedFieldId]: nestedValue,
    });
  };

  const renderNestedField = (nestedField: FieldDefinition) => {
    const nestedValue = objectValue[nestedField.id];
    const nestedError = errors[`${field.id}.${nestedField.id}`];

    // Recursive render - if nested field is also an object
    if (nestedField.type === FieldType.OBJECT) {
      return (
        <ObjectFieldRenderer
          key={nestedField.id}
          field={nestedField}
          value={nestedValue}
          onChange={(val) => handleNestedChange(nestedField.id, val)}
          errors={errors}
          disabled={disabled}
        />
      );
    }

    // Render appropriate field type
    let fieldComponent: React.ReactNode = null;

    switch (nestedField.type) {
      case FieldType.TEXT:
        fieldComponent = (
          <TextFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.TEXTAREA:
        fieldComponent = (
          <TextAreaFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.NUMBER:
        fieldComponent = (
          <NumberFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.RANGE:
        fieldComponent = (
          <RangeFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.BOOLEAN:
        fieldComponent = (
          <BooleanFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.DATE:
        fieldComponent = (
          <DateFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.SELECT:
        fieldComponent = (
          <SelectFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      case FieldType.MULTI_SELECT:
        fieldComponent = (
          <MultiSelectFieldRenderer
            field={nestedField}
            value={nestedValue}
            onChange={(val) => handleNestedChange(nestedField.id, val)}
            error={nestedError}
            disabled={disabled}
          />
        );
        break;

      default:
        fieldComponent = (
          <div className="text-xs text-red-400">
            Unsupported field type: {nestedField.type}
          </div>
        );
    }

    return (
      <FormFieldWrapper
        key={nestedField.id}
        fieldId={`${field.id}.${nestedField.id}`}
        label={nestedField.name}
        description={nestedField.description}
        required={nestedField.required}
        error={nestedError}
        disabled={disabled}
      >
        {fieldComponent}
      </FormFieldWrapper>
    );
  };

  return (
    <div
      className={cn(
        'space-y-4 p-5 bg-white/[0.02] border border-white/5 rounded-2xl'
      )}
    >
      {/* Object header */}
      <div className="mb-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
          {field.name}
        </h4>
        {field.description && (
          <p className="text-xs text-white/40 mt-1 italic">
            {field.description}
          </p>
        )}
      </div>

      {/* Nested fields */}
      <div className="space-y-4">
        {Object.values(properties).map((nestedField) =>
          renderNestedField(nestedField)
        )}
      </div>

      {Object.keys(properties).length === 0 && (
        <p className="text-xs text-white/40 italic text-center py-4">
          No properties defined
        </p>
      )}
    </div>
  );
}
