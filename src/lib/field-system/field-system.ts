/**
 * Unified Dynamic Field System - Core Implementation
 * 
 * Provides factory functions and utilities for creating, validating,
 * and managing dynamic fields.
 */

import type {
  FieldDefinition,
  FieldType,
  FieldValue,
  FieldSchema,
  ValidationResult,
  ValidationOptions,
  SchemaComparison,
  FieldMetadata,
  ValidationRules,
} from './types';
import { fieldToJsonSchema, validateAgainstSchema } from './json-schema-utils';

/**
 * Parameters for creating a field definition
 */
export interface CreateFieldParams {
  id: string;
  name: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  validation?: ValidationRules;
  metadata?: FieldMetadata;
  properties?: Record<string, FieldDefinition>;
  options?: Array<{ value: any; label: string }>;
}

/**
 * Creates a validated FieldDefinition
 * 
 * @param params - Field creation parameters
 * @returns FieldDefinition
 * @throws Error if parameters are invalid
 * 
 * @example
 * ```ts
 * const field = createFieldDefinition({
 *   id: 'email',
 *   name: 'Email Address',
 *   type: FieldType.TEXT,
 *   required: true,
 *   validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
 * });
 * ```
 */
export function createFieldDefinition(params: CreateFieldParams): FieldDefinition {
  // Validate required parameters
  if (!params.id || typeof params.id !== 'string' || params.id.trim() === '') {
    throw new Error('Field ID is required and must be a non-empty string');
  }

  if (!params.name || typeof params.name !== 'string' || params.name.trim() === '') {
    throw new Error('Field name is required and must be a non-empty string');
  }

  if (!params.type) {
    throw new Error('Field type is required');
  }

  // Validate ID format (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
    throw new Error('Field ID must contain only alphanumeric characters, underscores, and hyphens');
  }

  const field: FieldDefinition = {
    id: params.id.trim(),
    name: params.name.trim(),
    type: params.type,
  };

  // Add optional properties
  if (params.description) {
    field.description = params.description;
  }

  if (params.required !== undefined) {
    field.required = params.required;
  }

  if (params.defaultValue !== undefined) {
    field.defaultValue = params.defaultValue;
  }

  if (params.validation) {
    field.validation = params.validation;
  }

  if (params.metadata) {
    field.metadata = params.metadata;
  }

  if (params.properties) {
    field.properties = params.properties;
  }

  if (params.options && params.options.length > 0) {
    field.options = params.options;
  }

  // Validate field consistency
  validateFieldDefinitionConsistency(field);

  return field;
}

/**
 * Validates that a field definition is internally consistent
 */
function validateFieldDefinitionConsistency(field: FieldDefinition): void {
  const { type } = field;

  // Check for type-specific requirements
  if (type === 'select' || type === 'multiSelect') {
    if (!field.options || field.options.length === 0) {
      throw new Error(`Field type ${type} requires options to be defined`);
    }
  }

  if (type === 'object') {
    if (!field.properties || Object.keys(field.properties).length === 0) {
      throw new Error('Field type object requires properties to be defined');
    }
  }

  // Validate default value against type
  if (field.defaultValue !== undefined) {
    const result = validateFieldValue(field, field.defaultValue);
    if (!result.isValid) {
      throw new Error(
        `Default value is invalid: ${result.errors.map(e => e.message).join(', ')}`
      );
    }
  }
}

/**
 * Validates a value against a field definition
 * 
 * @param field - The field definition
 * @param value - The value to validate
 * @param options - Validation options
 * @returns ValidationResult
 * 
 * @example
 * ```ts
 * const result = validateFieldValue(field, 'test@example.com');
 * if (!result.isValid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export function validateFieldValue(
  field: FieldDefinition,
  value: any,
  options?: ValidationOptions
): ValidationResult {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  // Check required
  if (field.required && (value === null || value === undefined || value === '')) {
    errors.push({
      field: field.id,
      message: `${field.name} is required`,
      code: 'REQUIRED',
    });
    return { isValid: false, errors, value };
  }

  // Allow undefined/null for non-required fields
  if (value === null || value === undefined) {
    return { isValid: true, errors: [], value };
  }

  // Use JSON Schema validation for comprehensive checks
  const schema = fieldToJsonSchema(field);
  const result = validateAgainstSchema(value, schema);

  // Map errors to include field name
  if (!result.isValid) {
    result.errors.forEach(error => {
      errors.push({
        field: field.id,
        message: error.message,
        code: error.code,
      });
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: result.value,
  };
}

/**
 * Serializes a field value for storage
 * 
 * @param field - The field definition
 * @param value - The value to serialize
 * @returns Serialized value (JSON-compatible)
 * 
 * @example
 * ```ts
 * const serialized = serializeFieldValue(dateField, new Date());
 * // Returns ISO string: "2024-01-01T00:00:00.000Z"
 * ```
 */
export function serializeFieldValue(field: FieldDefinition, value: any): any {
  if (value === null || value === undefined) {
    return null;
  }

  switch (field.type) {
    case 'date':
      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;

    case 'object':
      // Recursively serialize nested fields
      if (field.properties && typeof value === 'object') {
        const serialized: Record<string, any> = {};
        Object.entries(field.properties).forEach(([key, nestedField]) => {
          if (key in value) {
            serialized[key] = serializeFieldValue(nestedField, value[key]);
          }
        });
        return serialized;
      }
      return value;

    case 'multiSelect':
      // Ensure array format
      if (Array.isArray(value)) {
        return value;
      }
      return [value];

    case 'number':
    case 'range':
      // Ensure numeric type
      if (typeof value === 'string') {
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      }
      return value;

    case 'boolean':
      // Ensure boolean type
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return Boolean(value);

    default:
      // For text, textarea, select - return as-is
      return value;
  }
}

/**
 * Deserializes a field value from storage
 * 
 * @param field - The field definition
 * @param rawValue - The raw stored value
 * @returns Deserialized value
 * 
 * @example
 * ```ts
 * const date = deserializeFieldValue(dateField, "2024-01-01T00:00:00.000Z");
 * // Returns Date object
 * ```
 */
export function deserializeFieldValue(field: FieldDefinition, rawValue: any): any {
  if (rawValue === null || rawValue === undefined) {
    return field.defaultValue !== undefined ? field.defaultValue : null;
  }

  switch (field.type) {
    case 'date':
      // Convert ISO strings to Date objects
      if (typeof rawValue === 'string') {
        const date = new Date(rawValue);
        return isNaN(date.getTime()) ? null : date;
      }
      return rawValue;

    case 'object':
      // Recursively deserialize nested fields
      if (field.properties && typeof rawValue === 'object') {
        const deserialized: Record<string, any> = {};
        Object.entries(field.properties).forEach(([key, nestedField]) => {
          if (key in rawValue) {
            deserialized[key] = deserializeFieldValue(nestedField, rawValue[key]);
          }
        });
        return deserialized;
      }
      return rawValue;

    case 'number':
    case 'range':
      // Ensure numeric type
      if (typeof rawValue === 'string') {
        const num = parseFloat(rawValue);
        return isNaN(num) ? null : num;
      }
      return rawValue;

    case 'boolean':
      // Ensure boolean type
      if (typeof rawValue === 'string') {
        return rawValue.toLowerCase() === 'true';
      }
      return Boolean(rawValue);

    case 'multiSelect':
      // Ensure array format
      if (!Array.isArray(rawValue)) {
        return [rawValue];
      }
      return rawValue;

    default:
      return rawValue;
  }
}

/**
 * Compares two field schemas and returns differences
 * 
 * @param schema1 - First schema
 * @param schema2 - Second schema
 * @returns Schema comparison result
 * 
 * @example
 * ```ts
 * const diff = compareFieldSchemas(oldSchema, newSchema);
 * console.log('Added fields:', diff.added);
 * console.log('Removed fields:', diff.removed);
 * ```
 */
export function compareFieldSchemas(
  schema1: FieldSchema,
  schema2: FieldSchema
): SchemaComparison {
  const comparison: SchemaComparison = {
    isIdentical: true,
    added: [],
    removed: [],
    modified: [],
  };

  // Check version change
  if (schema1.version !== schema2.version) {
    comparison.isIdentical = false;
    comparison.versionChange = {
      from: schema1.version,
      to: schema2.version,
    };
  }

  // Get all field IDs from both schemas
  const allFields1 = [
    ...schema1.coreFields,
    ...schema1.extensionFields,
  ];
  const allFields2 = [
    ...schema2.coreFields,
    ...schema2.extensionFields,
  ];

  const fieldMap1 = new Map(allFields1.map(f => [f.id, f]));
  const fieldMap2 = new Map(allFields2.map(f => [f.id, f]));

  // Find added fields
  fieldMap2.forEach((field, id) => {
    if (!fieldMap1.has(id)) {
      comparison.added.push(id);
      comparison.isIdentical = false;
    }
  });

  // Find removed and modified fields
  fieldMap1.forEach((field1, id) => {
    const field2 = fieldMap2.get(id);
    
    if (!field2) {
      comparison.removed.push(id);
      comparison.isIdentical = false;
    } else {
      // Check for modifications
      const changes = compareFields(field1, field2);
      if (changes.length > 0) {
        comparison.modified.push({ fieldId: id, changes });
        comparison.isIdentical = false;
      }
    }
  });

  return comparison;
}

/**
 * Compares two field definitions and returns list of changes
 */
function compareFields(field1: FieldDefinition, field2: FieldDefinition): string[] {
  const changes: string[] = [];

  if (field1.name !== field2.name) {
    changes.push(`name: "${field1.name}" → "${field2.name}"`);
  }

  if (field1.type !== field2.type) {
    changes.push(`type: ${field1.type} → ${field2.type}`);
  }

  if (field1.required !== field2.required) {
    changes.push(`required: ${field1.required} → ${field2.required}`);
  }

  if (JSON.stringify(field1.defaultValue) !== JSON.stringify(field2.defaultValue)) {
    changes.push('defaultValue changed');
  }

  if (JSON.stringify(field1.validation) !== JSON.stringify(field2.validation)) {
    changes.push('validation rules changed');
  }

  if (JSON.stringify(field1.options) !== JSON.stringify(field2.options)) {
    changes.push('options changed');
  }

  return changes;
}

/**
 * Creates a FieldValue instance
 * 
 * @param fieldId - Field identifier
 * @param value - The value
 * @param source - Source of the value
 * @returns FieldValue
 * 
 * @example
 * ```ts
 * const fieldValue = createFieldValue('email', 'user@example.com', 'user');
 * ```
 */
export function createFieldValue(
  fieldId: string,
  value: any,
  source: 'user' | 'ai' = 'user'
): FieldValue {
  return {
    fieldId,
    value,
    timestamp: Date.now(),
    source,
  };
}

/**
 * Creates an empty FieldSchema
 * 
 * @param version - Schema version
 * @returns Empty FieldSchema
 */
export function createEmptySchema(version: string = '1.0.0'): FieldSchema {
  return {
    version,
    coreFields: [],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
    },
  };
}

/**
 * Adds a field to a schema
 * 
 * @param schema - The schema to modify
 * @param field - The field to add
 * @param isCore - Whether this is a core field
 * @returns Updated schema
 */
export function addFieldToSchema(
  schema: FieldSchema,
  field: FieldDefinition,
  isCore: boolean = false
): FieldSchema {
  const updatedSchema = { ...schema };
  
  if (isCore) {
    updatedSchema.coreFields = [...schema.coreFields, field];
  } else {
    updatedSchema.extensionFields = [...schema.extensionFields, field];
  }

  if (!updatedSchema.metadata) {
    updatedSchema.metadata = {};
  }
  updatedSchema.metadata.updatedAt = Date.now();

  return updatedSchema;
}

/**
 * Removes a field from a schema
 * 
 * @param schema - The schema to modify
 * @param fieldId - ID of the field to remove
 * @returns Updated schema
 */
export function removeFieldFromSchema(
  schema: FieldSchema,
  fieldId: string
): FieldSchema {
  return {
    ...schema,
    coreFields: schema.coreFields.filter(f => f.id !== fieldId),
    extensionFields: schema.extensionFields.filter(f => f.id !== fieldId),
    metadata: {
      ...schema.metadata,
      updatedAt: Date.now(),
    },
  };
}

/**
 * Gets a field definition from a schema by ID
 * 
 * @param schema - The schema
 * @param fieldId - Field ID
 * @returns Field definition or undefined
 */
export function getFieldFromSchema(
  schema: FieldSchema,
  fieldId: string
): FieldDefinition | undefined {
  const allFields = [...schema.coreFields, ...schema.extensionFields];
  return allFields.find(f => f.id === fieldId);
}
