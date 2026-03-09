/**
 * Unified Dynamic Field System for AGNES
 * 
 * This module provides the foundation for all dynamic field functionality,
 * enabling extensible data structures across modules.
 * 
 * @module field-system
 * 
 * @example Basic Usage
 * ```ts
 * import { 
 *   FieldType, 
 *   createFieldDefinition, 
 *   validateFieldValue 
 * } from '@/lib/field-system';
 * 
 * // Create a field definition
 * const emailField = createFieldDefinition({
 *   id: 'email',
 *   name: 'Email Address',
 *   type: FieldType.TEXT,
 *   required: true,
 *   validation: {
 *     pattern: '^[^@]+@[^@]+\\.[^@]+$'
 *   }
 * });
 * 
 * // Validate a value
 * const result = validateFieldValue(emailField, 'user@example.com');
 * if (result.isValid) {
 *   console.log('Valid email!');
 * }
 * ```
 * 
 * @example Schema Management
 * ```ts
 * import {
 *   createEmptySchema,
 *   addFieldToSchema,
 *   compareFieldSchemas
 * } from '@/lib/field-system';
 * 
 * // Create a schema
 * let schema = createEmptySchema('1.0.0');
 * 
 * // Add fields
 * schema = addFieldToSchema(schema, emailField, true);
 * schema = addFieldToSchema(schema, nameField, true);
 * 
 * // Compare with another schema
 * const diff = compareFieldSchemas(oldSchema, schema);
 * console.log('Added fields:', diff.added);
 * ```
 * 
 * @example JSON Schema Conversion
 * ```ts
 * import {
 *   fieldToJsonSchema,
 *   validateAgainstSchema
 * } from '@/lib/field-system';
 * 
 * // Convert to JSON Schema
 * const jsonSchema = fieldToJsonSchema(emailField);
 * 
 * // Validate using JSON Schema
 * const result = validateAgainstSchema(data, jsonSchema);
 * ```
 */

// Export all types
export type {
  FieldDefinition,
  FieldValue,
  FieldSchema,
  FieldExtensionRequest,
  FieldMetadata,
  ValidationRules,
  ValidationResult,
  ValidationOptions,
  SchemaComparison,
  FieldValueSource,
} from './types';

export { FieldType } from './types';

// Export core field system functions
export {
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
  compareFieldSchemas,
  createFieldValue,
  createEmptySchema,
  addFieldToSchema,
  removeFieldFromSchema,
  getFieldFromSchema,
} from './field-system';

export type { CreateFieldParams } from './field-system';

// Export JSON Schema utilities
export {
  fieldToJsonSchema,
  jsonSchemaToField,
  mergeSchemas,
  validateAgainstSchema,
  fieldSchemaToJsonSchema,
} from './json-schema-utils';

export type { JSONSchema } from './json-schema-utils';
