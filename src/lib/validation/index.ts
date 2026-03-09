/**
 * AGNES Validation Framework
 * Module-agnostic field validation system
 * 
 * @module validation
 * 
 * This framework provides:
 * - Type-safe validation interfaces
 * - Reusable core validators
 * - Sync and async validation engine
 * - Module-specific validation registry
 * - JSON Schema validation support
 * 
 * @example Basic validation
 * ```typescript
 * import { validate, required, email } from '@/lib/validation';
 * 
 * const result = validate(userEmail, [required(), email()], 'email');
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 * 
 * @example Object validation
 * ```typescript
 * import { validateObject, required, minLength } from '@/lib/validation';
 * 
 * const result = validateObject(formData, {
 *   name: [required(), minLength(2)],
 *   email: [required(), email()],
 * });
 * ```
 * 
 * @example Module-specific validation
 * ```typescript
 * import { validateModuleField } from '@/lib/validation';
 * 
 * const result = await validateModuleField('agnes', 'struggles', value);
 * ```
 * 
 * @example JSON Schema validation
 * ```typescript
 * import { validateJsonSchema } from '@/lib/validation';
 * 
 * const schema = {
 *   type: 'object',
 *   required: ['name'],
 *   properties: {
 *     name: { type: 'string', minLength: 1 },
 *     age: { type: 'number', minimum: 0 }
 *   }
 * };
 * 
 * const result = validateJsonSchema(data, schema);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  ValidationError,
  ValidationResult,
  ValidatorFunction,
  ValidationRule,
  FieldValidationRules,
  ValidationContext,
  ValidationOptions,
} from './types';

// ============================================================================
// Core Validators
// ============================================================================

export {
  required,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  email,
  url,
  oneOf,
  custom,
  range,
  integer,
} from './validators';

// ============================================================================
// Validation Engine
// ============================================================================

export {
  validate,
  validateAsync,
  validateObject,
  validateObjectAsync,
  combineResults,
  hasErrors,
  getErrorMessages,
  getFieldErrors,
  createValidResult,
  createInvalidResult,
} from './validation-engine';

// ============================================================================
// Module Validators
// ============================================================================

export type {
  ModuleValidator,
} from './module-validators';

export {
  registerModuleValidator,
  getModuleValidator,
  validateModuleField,
  validateModuleProfile,
  hasModuleValidator,
  getRegisteredModules,
  moduleValidatorRegistry,
  // Built-in validators
  agnesValidator,
  titanValidator,
  ledgerValidator,
  somaValidator,
  atlasValidator,
} from './module-validators';

// ============================================================================
// JSON Schema Validation
// ============================================================================

export type {
  JsonSchema,
} from './json-schema-validator';

export {
  validateJsonSchema,
  createSchema,
} from './json-schema-validator';

// ============================================================================
// Convenience Re-exports
// ============================================================================

import * as validators from './validators';
import * as engine from './validation-engine';

/**
 * Common validation patterns for quick access
 */
export const commonValidators = {
  required: validators.required,
  email: validators.email,
  url: validators.url,
  minLength: validators.minLength,
  maxLength: validators.maxLength,
  min: validators.min,
  max: validators.max,
  range: validators.range,
  integer: validators.integer,
  pattern: validators.pattern,
  oneOf: validators.oneOf,
  custom: validators.custom,
};

/**
 * Validation utilities
 */
export const validationUtils = {
  validate: engine.validate,
  validateAsync: engine.validateAsync,
  validateObject: engine.validateObject,
  validateObjectAsync: engine.validateObjectAsync,
  combineResults: engine.combineResults,
  hasErrors: engine.hasErrors,
  getErrorMessages: engine.getErrorMessages,
  getFieldErrors: engine.getFieldErrors,
  createValidResult: engine.createValidResult,
  createInvalidResult: engine.createInvalidResult,
};
