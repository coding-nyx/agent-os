/**
 * Form State Management Hook
 * Manages form values, validation state, and submission
 */

import { useState, useCallback, useMemo } from 'react';
import type { FieldSchema } from '@/lib/field-system/types';
import { useFormValidation } from './useFormValidation';

export interface FormStateOptions {
  /** Initial form values */
  initialValues: Record<string, any>;
  /** Field schema for validation */
  schema: FieldSchema;
  /** Called when form is submitted and valid */
  onSubmit?: (values: Record<string, any>) => void | Promise<void>;
  /** Enable real-time validation (default: false) */
  validateOnChange?: boolean;
}

export interface FormState {
  /** Current form values */
  values: Record<string, any>;
  /** Validation errors by field ID */
  errors: Record<string, string>;
  /** Whether form has been modified */
  isDirty: boolean;
  /** Whether form is currently valid */
  isValid: boolean;
  /** Whether form is submitting */
  isSubmitting: boolean;
  /** Update a single field value */
  setFieldValue: (fieldId: string, value: any) => void;
  /** Update multiple field values */
  setValues: (values: Record<string, any>) => void;
  /** Reset form to initial values */
  reset: () => void;
  /** Submit the form */
  submit: () => Promise<void>;
  /** Manually trigger validation */
  validate: () => boolean;
  /** Clear all errors */
  clearErrors: () => void;
}

export function useFormState({
  initialValues,
  schema,
  onSubmit,
  validateOnChange = false,
}: FormStateOptions): FormState {
  const [values, setValuesState] = useState<Record<string, any>>(initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Use validation hook
  const { errors, isValid, validateField, validateAll } = useFormValidation(
    schema,
    values
  );

  // Memoize filtered errors (only show for touched fields or after submit attempt)
  const visibleErrors = useMemo(() => {
    const filtered: Record<string, string> = {};
    Object.keys(errors).forEach((fieldId) => {
      if (touched.has(fieldId) || isSubmitting) {
        filtered[fieldId] = errors[fieldId];
      }
    });
    return filtered;
  }, [errors, touched, isSubmitting]);

  const setFieldValue = useCallback(
    (fieldId: string, value: any) => {
      setValuesState((prev) => {
        const newValues = { ...prev, [fieldId]: value };
        
        // Mark as dirty
        if (!isDirty) {
          setIsDirty(true);
        }

        // Mark field as touched
        setTouched((prevTouched) => new Set([...prevTouched, fieldId]));

        // Validate on change if enabled
        if (validateOnChange) {
          validateField(fieldId, value);
        }

        return newValues;
      });
    },
    [isDirty, validateOnChange, validateField]
  );

  const setValues = useCallback(
    (newValues: Record<string, any>) => {
      setValuesState(newValues);
      if (!isDirty) {
        setIsDirty(true);
      }
    },
    [isDirty]
  );

  const reset = useCallback(() => {
    setValuesState(initialValues);
    setIsDirty(false);
    setIsSubmitting(false);
    setTouched(new Set());
  }, [initialValues]);

  const validate = useCallback(() => {
    // Mark all fields as touched
    const allFieldIds = [
      ...schema.coreFields.map((f) => f.id),
      ...schema.extensionFields.map((f) => f.id),
    ];
    setTouched(new Set(allFieldIds));

    // Run validation
    const validationResult = validateAll();
    return validationResult;
  }, [schema, validateAll]);

  const submit = useCallback(async () => {
    setIsSubmitting(true);

    // Validate all fields
    const isFormValid = validate();

    if (!isFormValid) {
      setIsSubmitting(false);
      return;
    }

    // Call onSubmit if provided
    if (onSubmit) {
      try {
        await onSubmit(values);
      } catch (error) {
        console.error('Form submission error:', error);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(false);
    }
  }, [validate, values, onSubmit]);

  const clearErrors = useCallback(() => {
    setTouched(new Set());
  }, []);

  return {
    values,
    errors: visibleErrors,
    isDirty,
    isValid,
    isSubmitting,
    setFieldValue,
    setValues,
    reset,
    submit,
    validate,
    clearErrors,
  };
}
