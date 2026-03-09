/**
 * AGNES Validation Framework - Core Validators
 * Reusable validation functions for common field types
 */

import type { ValidationRule, ValidationResult } from './types';

/**
 * Helper to create a successful validation result
 */
function createSuccessResult(): ValidationResult {
  return { valid: true, errors: [] };
}

/**
 * Helper to create a failed validation result
 */
function createErrorResult(field: string, message: string, code: string, metadata?: any): ValidationResult {
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

/**
 * Validates that a field has a value (not null, undefined, or empty string)
 * @param message - Custom error message
 */
export function required(message?: string): ValidationRule {
  return {
    name: 'required',
    validator: (value: any) => {
      const isEmpty = value === null || 
                     value === undefined || 
                     (typeof value === 'string' && value.trim() === '');
      
      if (isEmpty) {
        return createErrorResult(
          'field',
          message || 'This field is required',
          'REQUIRED',
        );
      }
      return createSuccessResult();
    },
    message: message || 'This field is required',
  };
}

/**
 * Validates minimum string length
 * @param min - Minimum length
 * @param message - Custom error message
 */
export function minLength(min: number, message?: string): ValidationRule {
  return {
    name: 'minLength',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult(); // Don't validate null/undefined (use required for that)
      }
      
      const strValue = String(value);
      if (strValue.length < min) {
        return createErrorResult(
          'field',
          message || `Must be at least ${min} characters`,
          'MIN_LENGTH',
          { min, actual: strValue.length },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be at least ${min} characters`,
  };
}

/**
 * Validates maximum string length
 * @param max - Maximum length
 * @param message - Custom error message
 */
export function maxLength(max: number, message?: string): ValidationRule {
  return {
    name: 'maxLength',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const strValue = String(value);
      if (strValue.length > max) {
        return createErrorResult(
          'field',
          message || `Must be at most ${max} characters`,
          'MAX_LENGTH',
          { max, actual: strValue.length },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be at most ${max} characters`,
  };
}

/**
 * Validates minimum numeric value
 * @param minValue - Minimum value
 * @param message - Custom error message
 */
export function min(minValue: number, message?: string): ValidationRule {
  return {
    name: 'min',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < minValue) {
        return createErrorResult(
          'field',
          message || `Must be at least ${minValue}`,
          'MIN_VALUE',
          { min: minValue, actual: numValue },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be at least ${minValue}`,
  };
}

/**
 * Validates maximum numeric value
 * @param maxValue - Maximum value
 * @param message - Custom error message
 */
export function max(maxValue: number, message?: string): ValidationRule {
  return {
    name: 'max',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const numValue = Number(value);
      if (isNaN(numValue) || numValue > maxValue) {
        return createErrorResult(
          'field',
          message || `Must be at most ${maxValue}`,
          'MAX_VALUE',
          { max: maxValue, actual: numValue },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be at most ${maxValue}`,
  };
}

/**
 * Validates that a value matches a regular expression
 * @param regex - Regular expression to match
 * @param message - Custom error message
 */
export function pattern(regex: RegExp, message?: string): ValidationRule {
  return {
    name: 'pattern',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const strValue = String(value);
      if (!regex.test(strValue)) {
        return createErrorResult(
          'field',
          message || 'Invalid format',
          'PATTERN_MISMATCH',
          { pattern: regex.toString() },
        );
      }
      return createSuccessResult();
    },
    message: message || 'Invalid format',
  };
}

/**
 * Validates email format
 * @param message - Custom error message
 */
export function email(message?: string): ValidationRule {
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return {
    name: 'email',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const strValue = String(value).trim();
      if (!emailRegex.test(strValue)) {
        return createErrorResult(
          'field',
          message || 'Invalid email address',
          'INVALID_EMAIL',
        );
      }
      return createSuccessResult();
    },
    message: message || 'Invalid email address',
  };
}

/**
 * Validates URL format
 * @param message - Custom error message
 */
export function url(message?: string): ValidationRule {
  return {
    name: 'url',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const strValue = String(value).trim();
      try {
        new URL(strValue);
        return createSuccessResult();
      } catch {
        return createErrorResult(
          'field',
          message || 'Invalid URL',
          'INVALID_URL',
        );
      }
    },
    message: message || 'Invalid URL',
  };
}

/**
 * Validates that a value is in a list of allowed options
 * @param options - Array of allowed values
 * @param message - Custom error message
 */
export function oneOf<T>(options: T[], message?: string): ValidationRule {
  return {
    name: 'oneOf',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      if (!options.includes(value)) {
        return createErrorResult(
          'field',
          message || `Must be one of: ${options.join(', ')}`,
          'INVALID_OPTION',
          { options, actual: value },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be one of: ${options.join(', ')}`,
  };
}

/**
 * Creates a custom validator from a function
 * @param fn - Custom validation function that returns boolean or ValidationResult
 * @param message - Error message if validation fails
 */
export function custom(
  fn: (value: any, context?: any) => boolean | ValidationResult | Promise<boolean | ValidationResult>,
  message?: string
): ValidationRule {
  return {
    name: 'custom',
    validator: async (value: any, context?: any) => {
      const result = await fn(value, context);
      
      // If function returns boolean
      if (typeof result === 'boolean') {
        return result
          ? createSuccessResult()
          : createErrorResult('field', message || 'Validation failed', 'CUSTOM_VALIDATION_FAILED');
      }
      
      // If function returns ValidationResult
      return result;
    },
    message: message || 'Validation failed',
  };
}

/**
 * Validates a numeric range (combines min and max)
 * @param minValue - Minimum value
 * @param maxValue - Maximum value
 * @param message - Custom error message
 */
export function range(minValue: number, maxValue: number, message?: string): ValidationRule {
  return {
    name: 'range',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < minValue || numValue > maxValue) {
        return createErrorResult(
          'field',
          message || `Must be between ${minValue} and ${maxValue}`,
          'OUT_OF_RANGE',
          { min: minValue, max: maxValue, actual: numValue },
        );
      }
      return createSuccessResult();
    },
    message: message || `Must be between ${minValue} and ${maxValue}`,
  };
}

/**
 * Validates that a value is a valid integer
 * @param message - Custom error message
 */
export function integer(message?: string): ValidationRule {
  return {
    name: 'integer',
    validator: (value: any) => {
      if (value === null || value === undefined) {
        return createSuccessResult();
      }
      
      const numValue = Number(value);
      if (isNaN(numValue) || !Number.isInteger(numValue)) {
        return createErrorResult(
          'field',
          message || 'Must be an integer',
          'NOT_INTEGER',
        );
      }
      return createSuccessResult();
    },
    message: message || 'Must be an integer',
  };
}
