/**
 * Form Validation Hook
 * Integrates with AGNES validation framework for real-time validation
 */

import { useState, useCallback, useMemo } from 'react';
import type { FieldSchema, FieldDefinition, ValidationRules } from '@/lib/field-system/types';
import { required, minLength, maxLength, pattern, min, max } from '@/lib/validation/validators';
import { validate } from '@/lib/validation/validation-engine';
import type { ValidationRule } from '@/lib/validation/types';

/**
 * Convert field validation rules to ValidationRule array
 */
function buildValidationRules(field: FieldDefinition): ValidationRule[] {
  const rules: ValidationRule[] = [];

  // Required validation
  if (field.required) {
    rules.push(required(field.metadata?.customMessages?.required));
  }

  // Type-specific validation
  if (field.validation) {
    const v = field.validation;

    // String length validation
    if (v.minLength !== undefined) {
      rules.push(minLength(v.minLength));
    }
    if (v.maxLength !== undefined) {
      rules.push(maxLength(v.maxLength));
    }

    // Number range validation
    if (v.minimum !== undefined) {
      rules.push(min(v.minimum));
    }
    if (v.maximum !== undefined) {
      rules.push(max(v.maximum));
    }

    // Pattern validation
    if (v.pattern) {
      rules.push(pattern(new RegExp(v.pattern)));
    }
  }

  return rules;
}

export interface ValidationHookResult {
  /** Validation errors by field ID */
  errors: Record<string, string>;
  /** Whether the form is valid */
  isValid: boolean;
  /** Validate a single field */
  validateField: (fieldId: string, value: any) => boolean;
  /** Validate all fields */
  validateAll: () => boolean;
}

export function useFormValidation(
  schema: FieldSchema,
  values: Record<string, any>
): ValidationHookResult {
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Build field lookup map
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    schema.coreFields.forEach((field) => map.set(field.id, field));
    schema.extensionFields.forEach((field) => map.set(field.id, field));
    return map;
  }, [schema]);

  // Validate a single field
  const validateField = useCallback(
    (fieldId: string, value: any): boolean => {
      const field = fieldMap.get(fieldId);
      if (!field) {
        return true; // Field not found, consider valid
      }

      const rules = buildValidationRules(field);
      if (rules.length === 0) {
        // No validation rules, clear any existing error
        setErrors((prev) => {
          const next = { ...prev };
          delete next[fieldId];
          return next;
        });
        return true;
      }

      const result = validate(value, rules, fieldId);

      if (result.valid) {
        // Clear error for this field
        setErrors((prev) => {
          const next = { ...prev };
          delete next[fieldId];
          return next;
        });
        return true;
      } else {
        // Set error for this field
        const errorMessage = result.errors[0]?.message || 'Invalid value';
        setErrors((prev) => ({
          ...prev,
          [fieldId]: errorMessage,
        }));
        return false;
      }
    },
    [fieldMap]
  );

  // Validate all fields
  const validateAll = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let isFormValid = true;

    fieldMap.forEach((field, fieldId) => {
      const value = values[fieldId];
      const rules = buildValidationRules(field);

      if (rules.length === 0) {
        return; // No validation needed
      }

      const result = validate(value, rules, fieldId);

      if (!result.valid) {
        const errorMessage = result.errors[0]?.message || 'Invalid value';
        newErrors[fieldId] = errorMessage;
        isFormValid = false;
      }
    });

    setErrors(newErrors);
    return isFormValid;
  }, [fieldMap, values]);

  // Check if form is currently valid
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);

  return {
    errors,
    isValid,
    validateField,
    validateAll,
  };
}
