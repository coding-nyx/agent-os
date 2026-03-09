/**
 * AGNES Validation Framework - Type Definitions
 * Module-agnostic validation types and interfaces
 */

/**
 * Represents a validation error with detailed context
 */
export interface ValidationError {
  /** The field name that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code for programmatic handling */
  code: string;
  /** Optional metadata for additional context */
  metadata?: any;
}

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: ValidationError[];
  /** Optional warnings that don't fail validation */
  warnings?: string[];
}

/**
 * Function signature for validator functions
 * @param value - The value to validate
 * @param context - Optional contextual information (e.g., user profile, module state)
 * @returns ValidationResult or Promise<ValidationResult> for async validators
 */
export type ValidatorFunction = (
  value: any,
  context?: any
) => ValidationResult | Promise<ValidationResult>;

/**
 * Defines a validation rule with name, validator, and default message
 */
export interface ValidationRule {
  /** Unique name for this rule */
  name: string;
  /** The validator function to execute */
  validator: ValidatorFunction;
  /** Default error message if validation fails */
  message: string;
}

/**
 * Map of field names to their validation rules
 */
export interface FieldValidationRules {
  [fieldName: string]: ValidationRule[];
}

/**
 * Context object that can be passed to validators
 */
export interface ValidationContext {
  /** Current user profile if available */
  userProfile?: any;
  /** Module-specific context */
  moduleContext?: any;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Options for validation engine
 */
export interface ValidationOptions {
  /** Stop on first error */
  failFast?: boolean;
  /** Include warnings in result */
  includeWarnings?: boolean;
  /** Custom context for validation */
  context?: ValidationContext;
}
