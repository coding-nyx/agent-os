/**
 * AGNES Validation Framework - Validation Engine
 * Core validation execution logic
 */

import type {
  ValidationResult,
  ValidationRule,
  FieldValidationRules,
  ValidationOptions,
} from './types';

/**
 * Validates a single value against an array of validation rules
 * @param value - The value to validate
 * @param rules - Array of validation rules to apply
 * @param fieldName - Optional field name for error messages
 * @param context - Optional validation context
 * @returns ValidationResult
 */
export function validate(
  value: any,
  rules: ValidationRule[],
  fieldName: string = 'field',
  context?: any
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    const result = rule.validator(value, context);
    
    // Handle synchronous validation only
    if (result instanceof Promise) {
      throw new Error(
        'Async validator detected in sync validate(). Use validateAsync() instead.'
      );
    }

    if (!result.valid) {
      // Map field name to actual field
      const mappedErrors = result.errors.map(err => ({
        ...err,
        field: err.field === 'field' ? fieldName : err.field,
      }));
      errors.push(...mappedErrors);
    }

    if (result.warnings) {
      warnings.push(...result.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validates a single value against an array of validation rules (async support)
 * @param value - The value to validate
 * @param rules - Array of validation rules to apply
 * @param fieldName - Optional field name for error messages
 * @param context - Optional validation context
 * @returns Promise<ValidationResult>
 */
export async function validateAsync(
  value: any,
  rules: ValidationRule[],
  fieldName: string = 'field',
  context?: any
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    const result = await rule.validator(value, context);

    if (!result.valid) {
      // Map field name to actual field
      const mappedErrors = result.errors.map(err => ({
        ...err,
        field: err.field === 'field' ? fieldName : err.field,
      }));
      errors.push(...mappedErrors);
    }

    if (result.warnings) {
      warnings.push(...result.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validates an object with field-specific validation rules
 * @param obj - The object to validate
 * @param fieldRules - Map of field names to their validation rules
 * @param options - Validation options
 * @returns ValidationResult
 */
export function validateObject(
  obj: Record<string, any>,
  fieldRules: FieldValidationRules,
  options?: ValidationOptions
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];
  const context = options?.context;

  for (const [fieldName, rules] of Object.entries(fieldRules)) {
    const value = obj[fieldName];
    const fieldResult = validate(value, rules, fieldName, context);

    if (!fieldResult.valid) {
      errors.push(...fieldResult.errors);
      
      // Fail fast if option is set
      if (options?.failFast) {
        break;
      }
    }

    if (options?.includeWarnings && fieldResult.warnings) {
      warnings.push(...fieldResult.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validates an object with field-specific validation rules (async support)
 * @param obj - The object to validate
 * @param fieldRules - Map of field names to their validation rules
 * @param options - Validation options
 * @returns Promise<ValidationResult>
 */
export async function validateObjectAsync(
  obj: Record<string, any>,
  fieldRules: FieldValidationRules,
  options?: ValidationOptions
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];
  const context = options?.context;

  for (const [fieldName, rules] of Object.entries(fieldRules)) {
    const value = obj[fieldName];
    const fieldResult = await validateAsync(value, rules, fieldName, context);

    if (!fieldResult.valid) {
      errors.push(...fieldResult.errors);
      
      // Fail fast if option is set
      if (options?.failFast) {
        break;
      }
    }

    if (options?.includeWarnings && fieldResult.warnings) {
      warnings.push(...fieldResult.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Combines multiple ValidationResults into a single result
 * @param results - Array of ValidationResults to combine
 * @returns Combined ValidationResult
 */
export function combineResults(results: ValidationResult[]): ValidationResult {
  const allErrors: ValidationResult['errors'] = [];
  const allWarnings: string[] = [];

  for (const result of results) {
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

/**
 * Helper to check if a ValidationResult has errors
 * @param result - ValidationResult to check
 * @returns true if there are errors
 */
export function hasErrors(result: ValidationResult): boolean {
  return !result.valid && result.errors.length > 0;
}

/**
 * Helper to get all error messages from a ValidationResult
 * @param result - ValidationResult to extract messages from
 * @returns Array of error messages
 */
export function getErrorMessages(result: ValidationResult): string[] {
  return result.errors.map(err => err.message);
}

/**
 * Helper to get errors for a specific field
 * @param result - ValidationResult to filter
 * @param fieldName - Field name to filter by
 * @returns Array of errors for the specified field
 */
export function getFieldErrors(
  result: ValidationResult,
  fieldName: string
): ValidationResult['errors'] {
  return result.errors.filter(err => err.field === fieldName);
}

/**
 * Creates a successful validation result
 */
export function createValidResult(): ValidationResult {
  return { valid: true, errors: [] };
}

/**
 * Creates a failed validation result with a single error
 * @param field - Field name
 * @param message - Error message
 * @param code - Error code
 * @param metadata - Optional metadata
 */
export function createInvalidResult(
  field: string,
  message: string,
  code: string,
  metadata?: any
): ValidationResult {
  return {
    valid: false,
    errors: [{
      field,
      message,
      code,
      metadata,
    }],
  };
}
